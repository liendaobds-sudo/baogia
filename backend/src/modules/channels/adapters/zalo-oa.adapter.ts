import * as crypto from 'crypto';
import {
    IChannelAdapter,
    ParsedMessage,
    MessageContent,
    SendResult,
    TokenResult,
} from './channel-adapter.interface';

/**
 * Zalo OA Channel Adapter
 * Handles webhook verification, message parsing, sending, and token refresh
 *
 * For local dev: sendMessage returns mock success
 * For production: calls real Zalo OA API
 */
export class ZaloOaAdapter implements IChannelAdapter {
    verifyWebhook(body: any, signature: string, secret: string): boolean {
        if (!signature || !secret) return false;

        // Nhận raw body (Buffer/string) khi có — HMAC trên bytes gốc; object là fallback.
        const payload: Buffer = Buffer.isBuffer(body)
            ? body
            : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
        const computedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        // timingSafeEqual ném lỗi nếu độ dài lệch — chặn trước để trả false an toàn.
        const a = Buffer.from(signature);
        const b = Buffer.from(computedSignature);
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    parseInboundMessage(body: any): ParsedMessage | null {
        // Zalo OA webhook format
        // event_name: "user_send_text", "user_send_image", etc.
        const eventName = body.event_name;

        if (!eventName?.startsWith('user_send_')) {
            return null; // Not a user message event
        }

        const message = body.message;
        const sender = body.sender;

        if (!message || !sender) return null;

        const parsed: ParsedMessage = {
            externalMessageId: body.msg_id || message.msg_id || `zalo_${Date.now()}`,
            externalUserId: sender.id,
            senderName: sender.name || 'Zalo User',
            senderAvatar: sender.avatar,
            timestamp: new Date(body.timestamp || Date.now()),
            rawPayload: body,
        };

        // Parse text
        if (eventName === 'user_send_text') {
            parsed.text = message.text;
        }

        // Parse attachments
        if (eventName === 'user_send_image') {
            parsed.attachments = [{
                type: 'image',
                url: message.url || message.thumb,
                thumbnailUrl: message.thumb,
            }];
        }

        if (eventName === 'user_send_file') {
            parsed.attachments = [{
                type: 'file',
                url: message.url,
                name: message.name,
                size: message.size,
            }];
        }

        if (eventName === 'user_send_sticker') {
            parsed.attachments = [{
                type: 'sticker',
                url: message.url,
            }];
            parsed.text = '(sticker)';
        }

        return parsed;
    }

    async sendMessage(
        accessToken: string,
        recipientId: string,
        content: MessageContent,
    ): Promise<SendResult> {
        // In local dev mode, mock the API call
        if (!accessToken || accessToken === 'mock-token') {
            const { Logger } = require('@nestjs/common');
            const logger = new Logger('ZaloOaAdapter');
            logger.log(`[MOCK] Send to ${recipientId}: ${content.text}`);
            if (content.buttons?.length) {
                logger.log(`[MOCK] Buttons: ${content.buttons.map(b => b.title).join(', ')}`);
            }
            return {
                success: true,
                externalMessageId: `mock_sent_${Date.now()}`,
            };
        }

        // Production: call Zalo OA Send API v3.0
        try {
            // Build message payload — use template with buttons if provided
            let messagePayload: any;

            if (content.buttons?.length) {
                // Zalo OA list template with quick reply buttons
                messagePayload = {
                    attachment: {
                        type: 'template',
                        payload: {
                            template_type: 'request_user_info',
                            elements: [{
                                title: content.text || 'Chọn sản phẩm',
                                subtitle: 'Click vào nút bên dưới để bắt đầu',
                                image_url: '',
                            }],
                            buttons: content.buttons.map(btn => ({
                                title: btn.title,
                                type: 'oa.query.show',
                                payload: btn.payload,
                            })),
                        },
                    },
                };
            } else {
                messagePayload = { text: content.text };
            }

            const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'access_token': accessToken,
                },
                body: JSON.stringify({
                    recipient: { user_id: recipientId },
                    message: messagePayload,
                }),
            });

            const data = await response.json();

            if (data.error !== 0) {
                return {
                    success: false,
                    error: data.message || `Zalo API error: ${data.error}`,
                };
            }

            return {
                success: true,
                externalMessageId: data.data?.message_id,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Unknown Zalo API error',
            };
        }
    }

    async refreshToken(
        appId: string,
        appSecret: string,
        currentRefreshToken: string,
    ): Promise<TokenResult> {
        // Mock for local dev
        if (!appId || appId === 'mock') {
            return {
                accessToken: 'mock-token-refreshed',
                refreshToken: 'mock-refresh-token',
                expiresIn: 86400,
            };
        }

        const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'secret_key': appSecret,
            },
            body: new URLSearchParams({
                app_id: appId,
                grant_type: 'refresh_token',
                refresh_token: currentRefreshToken,
            }).toString(),
        });

        const data = await response.json();

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in || 86400,
        };
    }
}
