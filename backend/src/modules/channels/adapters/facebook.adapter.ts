import * as crypto from 'crypto';
import {
    IChannelAdapter,
    ParsedMessage,
    ParsedAttachment,
    MessageContent,
    SendResult,
    TokenResult,
} from './channel-adapter.interface';

/**
 * Facebook Messenger (Page) Channel Adapter
 * Handles webhook verification, message parsing, sending, and token refresh
 *
 * For local dev: sendMessage returns mock success
 * For production: calls the Facebook Graph API
 *
 * Lưu ý khác Zalo:
 * - Facebook xác thực chữ ký bằng header `X-Hub-Signature-256` (sha256=<hmac>).
 * - Facebook yêu cầu GET verify challenge (hub.challenge) — xử lý ở WebhookController.
 * - Page token thường là long-lived; refreshToken là no-op trừ khi trao đổi mới.
 */
const GRAPH_API_VERSION = 'v19.0';

export class FacebookAdapter implements IChannelAdapter {
    /**
     * `body` nhận Buffer/string (raw body — ĐÚNG chuẩn X-Hub-Signature-256) hoặc object
     * (fallback JSON.stringify khi thiếu raw body, vd trong test). HMAC phải tính trên
     * bytes gốc: stringify object đã parse có thể lệch byte → từ chối webhook hợp lệ.
     */
    verifyWebhook(body: any, signature: string, secret: string): boolean {
        if (!signature || !secret) return false;

        // Facebook gửi dạng "sha256=<hex>"
        const expectedPrefix = 'sha256=';
        if (!signature.startsWith(expectedPrefix)) return false;
        const theirDigest = signature.slice(expectedPrefix.length);

        const payload: Buffer = Buffer.isBuffer(body)
            ? body
            : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
        const computed = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        // timingSafeEqual ném lỗi nếu độ dài lệch — chặn trước để trả false an toàn.
        const a = Buffer.from(theirDigest);
        const b = Buffer.from(computed);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    parseInboundMessage(body: any): ParsedMessage | null {
        // Tương thích interface cũ: trả event ĐẦU TIÊN. Đường webhook thật dùng
        // parseInboundMessages (batch) — Facebook gộp nhiều entry/messaging một lần gọi.
        const all = this.parseInboundMessages(body);
        return all.length > 0 ? all[0] : null;
    }

    /**
     * Messenger webhook: { object: 'page', entry: [{ messaging: [...] }, ...] }.
     * Facebook BATCH nhiều entry và nhiều messaging event trong MỘT lần gọi —
     * chỉ đọc entry[0].messaging[0] như bản cũ là rớt tin khi khách nhắn nhanh.
     */
    parseInboundMessages(body: any): ParsedMessage[] {
        if (body?.object !== 'page' || !Array.isArray(body.entry)) return [];

        const results: ParsedMessage[] = [];
        for (const entry of body.entry) {
            if (!Array.isArray(entry?.messaging)) continue;
            for (const event of entry.messaging) {
                const parsed = this.parseMessagingEvent(event, body);
                if (parsed) results.push(parsed);
            }
        }
        return results;
    }

    private parseMessagingEvent(event: any, rawBody: any): ParsedMessage | null {
        const sender = event?.sender;
        const message = event?.message;
        if (!sender?.id || !message) return null;

        // Bỏ qua echo (tin do chính Page gửi ra) — tránh tự xử lý lại tin của mình.
        if (message.is_echo) return null;

        const parsed: ParsedMessage = {
            externalMessageId: message.mid || `fb_${Date.now()}`,
            externalUserId: sender.id,
            senderName: 'Facebook User',
            timestamp: new Date(event.timestamp || Date.now()),
            rawPayload: rawBody,
        };

        if (message.text) {
            parsed.text = message.text;
        }

        if (Array.isArray(message.attachments) && message.attachments.length > 0) {
            parsed.attachments = message.attachments.map((att: any): ParsedAttachment => {
                const type = this.mapAttachmentType(att.type);
                return {
                    type,
                    url: att.payload?.url || '',
                    ...(att.payload?.sticker_id ? { name: 'sticker' } : {}),
                };
            });
        }

        // Không text, không attachment hợp lệ ⇒ không phải tin người dùng.
        if (!parsed.text && (!parsed.attachments || parsed.attachments.length === 0)) {
            return null;
        }

        return parsed;
    }

    private mapAttachmentType(fbType: string): ParsedAttachment['type'] {
        switch (fbType) {
            case 'image': return 'image';
            case 'video': return 'video';
            case 'audio': return 'audio';
            case 'file': return 'file';
            default: return 'file';
        }
    }

    async sendMessage(
        accessToken: string,
        recipientId: string,
        content: MessageContent,
    ): Promise<SendResult> {
        // Dev mode: mock giống ZaloOaAdapter.
        if (!accessToken || accessToken === 'mock-token') {
            const { Logger } = require('@nestjs/common');
            const logger = new Logger('FacebookAdapter');
            logger.log(`[MOCK] Send to ${recipientId}: ${content.text}`);
            if (content.buttons?.length) {
                logger.log(`[MOCK] Quick replies: ${content.buttons.map(b => b.title).join(', ')}`);
            }
            return {
                success: true,
                externalMessageId: `mock_sent_${Date.now()}`,
            };
        }

        try {
            let messagePayload: any;

            if (content.buttons?.length) {
                // Quick replies cho các nút chọn nhanh.
                messagePayload = {
                    text: content.text || 'Chọn một mục:',
                    quick_replies: content.buttons.map(btn => ({
                        content_type: 'text',
                        title: btn.title,
                        payload: btn.payload,
                    })),
                };
            } else {
                messagePayload = { text: content.text };
            }

            const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(accessToken)}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: recipientId },
                    message: messagePayload,
                    messaging_type: 'RESPONSE',
                }),
            });

            const data = await response.json();

            if (data.error) {
                return {
                    success: false,
                    error: data.error.message || `Facebook API error: ${data.error.code}`,
                };
            }

            return {
                success: true,
                externalMessageId: data.message_id,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Unknown Facebook API error',
            };
        }
    }

    async refreshToken(
        appId: string,
        appSecret: string,
        currentRefreshToken: string,
    ): Promise<TokenResult> {
        // Mock cho dev.
        if (!appId || appId === 'mock') {
            return {
                accessToken: 'mock-token-refreshed',
                expiresIn: 86400,
            };
        }

        // Đổi short-lived → long-lived page token qua Graph oauth.
        const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`
            + `?grant_type=fb_exchange_token`
            + `&client_id=${encodeURIComponent(appId)}`
            + `&client_secret=${encodeURIComponent(appSecret)}`
            + `&fb_exchange_token=${encodeURIComponent(currentRefreshToken)}`;

        const response = await fetch(url, { method: 'GET' });
        const data = await response.json();

        return {
            accessToken: data.access_token,
            expiresIn: data.expires_in || 86400 * 60,
        };
    }
}
