import { ForbiddenException, Injectable, Logger, Inject, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { runInTransaction } from 'typeorm-transactional';
import { Cron } from '@nestjs/schedule';
import * as path from 'path';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { forEachTenant } from '../../common/tenant/tenant-background';
import { AppScopeService } from '../../common/app-scope/app-scope.service';
import { Contact, Conversation, Message, Channel } from '../../entities';
import { ConversationStatus, ConversationPriority } from '../../entities/conversation.entity';
import { SenderType, ContentType, MessageStatus } from '../../entities/message.entity';
import { EventsGateway } from '../gateway/events.gateway';
import { getChannelAdapter } from '../channels/adapters/adapter-factory';
import { ParsedMessage, MessageContent, SendResult } from '../channels/adapters/channel-adapter.interface';
import { AiSuggestService } from '../suggestions/ai-suggest.service';
import { FollowUpService } from '../conversations/follow-up.service';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ChannelType } from '../../entities/channel.entity';
import { ZaloPoolService } from '../zalo-personal/zalo-pool.service';
import {
    loadInternalChatAttachment,
    PreparedOutboundAttachment,
} from './outbound-attachment.helper';
import { safeErrorMetadata } from '../../common/logging/safe-log-metadata';

/**
 * Read image dimensions from buffer header (PNG, JPEG, WebP, GIF)
 * No external dependency needed — just reads binary headers.
 */
function getImageDimensions(buf: Buffer): { width: number; height: number } | null {
    try {
        // PNG: bytes 16-23 contain width (4 bytes BE) and height (4 bytes BE)
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
            return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
        }
        // JPEG: scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker
        if (buf[0] === 0xFF && buf[1] === 0xD8) {
            let offset = 2;
            while (offset < buf.length - 9) {
                if (buf[offset] !== 0xFF) { offset++; continue; }
                const marker = buf[offset + 1];
                if (marker === 0xC0 || marker === 0xC2) {
                    return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
                }
                const blockLen = buf.readUInt16BE(offset + 2);
                offset += 2 + blockLen;
            }
        }
        // WebP: RIFF header, 'WEBP' at offset 8, VP8 dimensions
        if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
            const chunk = buf.toString('ascii', 12, 16);
            if (chunk === 'VP8 ' && buf.length > 29) {
                return { width: buf.readUInt16LE(26) & 0x3FFF, height: buf.readUInt16LE(28) & 0x3FFF };
            }
            if (chunk === 'VP8L' && buf.length > 25) {
                const bits = buf.readUInt32LE(21);
                return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
            }
        }
        // GIF: width at offset 6, height at offset 8 (LE)
        if (buf.toString('ascii', 0, 3) === 'GIF') {
            return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
        }
    } catch (e) {}
    return null;
}

@Injectable()
export class MessageProcessorService {
    private readonly logger = new Logger(MessageProcessorService.name);

    /**
     * Serialize xử lý inbound theo từng khóa (channel + người gửi). Hai tin của CÙNG
     * một liên hệ đến sát nhau (vd text + ảnh) sẽ chạy TUẦN TỰ thay vì song song →
     * hết race tạo trùng Contact (ném UNIQUE, nuốt lỗi, mất tin) và trùng Conversation.
     * Tin của các liên hệ KHÁC nhau vẫn xử lý song song bình thường.
     * Chỉ dùng trong 1 tiến trình (mô hình deploy hiện tại).
     */
    private inboundChains = new Map<string, Promise<unknown>>();

    private runSerialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const prev = this.inboundChains.get(key) ?? Promise.resolve();
        const next = prev.catch(() => undefined).then(fn);
        // Lưu mắt xích mới; dọn khi nó là mắt xích cuối để Map không phình vô hạn.
        this.inboundChains.set(key, next);
        next.catch(() => undefined).finally(() => {
            if (this.inboundChains.get(key) === next) this.inboundChains.delete(key);
        });
        return next;
    }

    constructor(
        @InjectRepository(Contact) private contactRepo: Repository<Contact>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private messageRepo: Repository<Message>,
        @InjectRepository(Channel) private channelRepo: Repository<Channel>,
        private eventsGateway: EventsGateway,
        private moduleRef: ModuleRef,
        private configService: ConfigService,
        @Optional() @Inject('AiSuggestService') private aiSuggestService?: AiSuggestService,
        @Optional() private followUpService?: FollowUpService,
        @Optional() private tenantCtx?: TenantContextService,
        @Optional() private appScope?: AppScopeService,
    ) { }

    /**
     * Cập nhật tên/avatar liên hệ ở NỀN (sau khi tin đã hiển thị) — phục vụ tăng tốc nhận tin.
     * Chỉ ghi khi có thay đổi, rồi emit conversation_updated để FE đổi tên/avatar.
     */
    async updateContactProfile(
        channelId: string,
        externalUserId: string,
        data: { displayName?: string; avatarUrl?: string },
    ): Promise<void> {
        try {
            const contact = await this.contactRepo.findOne({
                where: { externalUserId, channel: { id: channelId } },
            });
            if (!contact) return;
            let updated = false;
            if (data.displayName && data.displayName !== contact.displayName) {
                contact.displayName = data.displayName; updated = true;
            }
            if (data.avatarUrl && data.avatarUrl !== contact.avatarUrl) {
                contact.avatarUrl = data.avatarUrl; updated = true;
            }
            if (!updated) return;
            await this.contactRepo.save(contact);

            const conv = await this.convRepo.findOne({
                where: { contact: { id: contact.id }, channel: { id: channelId } },
                order: { lastMessageAt: 'DESC' },
            });
            if (conv) {
                this.eventsGateway.emitConversationUpdated({
                    id: conv.id,
                    contactName: contact.displayName,
                    contactAvatar: contact.avatarUrl,
                }, conv.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined);
            }
        } catch (e: any) {
            this.logger.warn(`updateContactProfile failed: ${e.message}`);
        }
    }

    /**
     * Process inbound message from webhook
     */
    /**
     * Process inbound message from webhook.
     * Khi RLS bật (TENANT_RLS_ENABLED): phân giải tenant của channel rồi bọc
     * withTenant + runInTransaction để insert nền (tin Zalo) gắn đúng tenant_id +
     * qua connection có biến phiên (RLS). Khi tắt: chạy thẳng như cũ (không overhead).
     */
    async processInbound(channelId: string, parsedMessage: ParsedMessage): Promise<boolean> {
        // Serialize theo (channel + người gửi) để tin cùng liên hệ không race tạo trùng
        // Contact/Conversation. Khóa dùng externalUserId (nhóm đã có prefix 'g_').
        const chainKey = `${channelId}:${parsedMessage.externalUserId}`;
        return this.runSerialized(chainKey, () => this.processInboundDispatch(channelId, parsedMessage));
    }

    private async processInboundDispatch(channelId: string, parsedMessage: ParsedMessage): Promise<boolean> {
        if (process.env.TENANT_RLS_ENABLED !== 'true' || !this.tenantCtx) {
            return this.processInboundCore(channelId, parsedMessage);
        }
        // Fail-loud (Req 2.3): KHÔNG mặc định tenant 1. Ghi tin nhắn của xưởng khác vào
        // tenant 1 là rò dữ liệu chéo tenant — tệ hơn việc bỏ lỡ một tin (đã log rõ).
        const rows = await this.channelRepo.manager.query(
            'SELECT tenant_id FROM channels WHERE id = $1 LIMIT 1', [channelId]);
        const tenantId = rows?.[0]?.tenant_id ? Number(rows[0].tenant_id) : 0;
        if (!tenantId) {
            throw new Error(
                `Không phân giải được tenant cho channel ${channelId} — từ chối xử lý inbound (msg ${parsedMessage.externalMessageId})`,
            );
        }
        return this.tenantCtx.withTenant(tenantId, () =>
            runInTransaction(async () => {
                await this.channelRepo.manager.query(
                    `SELECT set_config('app.current_tenant', $1, true)`, [String(tenantId)]);
                return this.processInboundCore(channelId, parsedMessage);
            }),
        ) as Promise<boolean>;
    }

    private async processInboundCore(channelId: string, parsedMessage: ParsedMessage): Promise<boolean> {
        try {
        this.logger.log(
            `📩 Processing inbound via channel ${channelId} ` +
            `(sender=${parsedMessage.isSelf ? 'self' : 'customer'}, ` +
            `textChars=${parsedMessage.text?.length || 0}, attachmentCount=${parsedMessage.attachments?.length || 0})`,
        );

        const channel = await this.channelRepo.findOne({ where: { id: channelId } });
        if (!channel) {
            this.logger.error(`Channel not found: ${channelId}`);
            return false;
        }
        const channelTenantId = Number(channel.tenantId ?? this.tenantCtx?.currentTenantId());
        if (!Number.isSafeInteger(channelTenantId) || channelTenantId <= 0) {
            throw new Error(`Channel ${channelId} thiếu tenant hợp lệ — từ chối xử lý inbound.`);
        }

        // Gate Trục CSKH theo tenant: nếu tenant tắt CSKH → bỏ qua inbound an toàn (Req 4.6, 9.3).
        // Dùng tenant từ context (RLS on) hoặc query channels.tenant_id (RLS off). Không xác
        // định được tenant → fail-open (không chặn). Baseline bật CSKH → 0 thay đổi hành vi.
        if (this.appScope) {
            let tid = this.tenantCtx?.currentTenantId() ?? null;
            if (tid == null) {
                try {
                    const rows = await this.channelRepo.manager.query(
                        'SELECT tenant_id FROM channels WHERE id = $1 LIMIT 1', [channelId]);
                    if (rows?.[0]?.tenant_id) tid = Number(rows[0].tenant_id);
                } catch { /* fail-open */ }
            }
            if (tid != null && !(await this.appScope.isCskhEnabledForTenant(tid))) {
                this.logger.debug(`[cskh-scope] tenant ${tid} tắt CSKH — bỏ qua inbound`);
                return false;
            }
        }

        // Idempotency check
        const existingMsg = await this.messageRepo.findOne({
            where: { idempotencyKey: `inbound_${parsedMessage.externalMessageId}`, tenantId: channelTenantId },
        });
        if (existingMsg) {
            this.logger.warn(`Duplicate message, skipping: ${parsedMessage.externalMessageId}`);
            return false;
        }

        // Upsert Contact
        let contact = await this.contactRepo.findOne({
            where: {
                externalUserId: parsedMessage.externalUserId,
                channel: { id: channelId },
            },
        });

        if (!contact) {
            const draft = this.contactRepo.create({
                externalUserId: parsedMessage.externalUserId,
                displayName: parsedMessage.contactName || (parsedMessage.isSelf ? 'Khách Zalo' : parsedMessage.senderName),
                avatarUrl: parsedMessage.senderAvatar || '',
                channel,
                tenantId: channelTenantId,
            });
            try {
                contact = await this.contactRepo.save(draft);
                this.logger.log(`👤 New contact created: ${contact.id}`);
            } catch (err: any) {
                // Lưới an toàn race: nếu một luồng khác vừa tạo cùng contact (vi phạm
                // @Unique(['channel','externalUserId'])) → refetch thay vì để lỗi làm mất tin.
                const existing = await this.contactRepo.findOne({
                    where: { externalUserId: parsedMessage.externalUserId, channel: { id: channelId } },
                });
                if (!existing) throw err;
                contact = existing;
                this.logger.warn(`👤 Contact race resolved via refetch: ${contact.id}`);
            }
        } else {
            let updated = false;
            if (contact.tenantId == null) {
                contact.tenantId = channelTenantId;
                updated = true;
            } else if (contact.tenantId !== channelTenantId) {
                throw new Error(`Contact ${contact.id} không thuộc tenant của channel ${channelId}.`);
            }
            
            if (parsedMessage.contactName && parsedMessage.contactName !== contact.displayName) {
                // Update group name
                contact.displayName = parsedMessage.contactName;
                updated = true;
            } else if (!parsedMessage.contactName && parsedMessage.senderName && parsedMessage.senderName !== contact.displayName && !parsedMessage.isSelf) {
                // Update individual contact name (skip if it's self-message to 'Bạn')
                contact.displayName = parsedMessage.senderName;
                updated = true;
            }

            // Update avatar if missing or changed
            if (parsedMessage.senderAvatar && parsedMessage.senderAvatar !== contact.avatarUrl) {
                contact.avatarUrl = parsedMessage.senderAvatar;
                updated = true;
            }

            if (updated) {
                contact = await this.contactRepo.save(contact);
            }
        }

        // Find or create conversation
        let conversation = await this.convRepo.findOne({
            where: {
                contact: { id: contact.id },
                channel: { id: channelId },
            },
            order: { lastMessageAt: 'DESC' },
        });

        const now = new Date();
        // Feature 6: Configurable SLA (via env, default 10 min)
        const slaMinutes = this.configService.get<number>('SLA_MINUTES', 10);
        const slaDeadline = new Date(now.getTime() + slaMinutes * 60 * 1000);

        if (!conversation) {
            conversation = this.convRepo.create({
                contact,
                channel,
                status: ConversationStatus.NEW,
                priority: ConversationPriority.NORMAL,
                lastMessageAt: now,
                slaDeadline,
                unreadCount: parsedMessage.isSelf ? 0 : 1,
                tenantId: channelTenantId,
            });
            conversation = await this.convRepo.save(conversation);
            this.logger.log(`💬 New conversation created: ${conversation.id}`);

            // Send welcome message with Quick Reply product buttons.
            // Guard giống auto-reply: KHÔNG gửi cho tin do chính mình gửi (isSelf) và
            // KHÔNG gửi vào chat nhóm (prefix 'g_') — tránh chào nhầm nhóm / echo chính mình.
            const isGroupChat = (parsedMessage.externalUserId || '').startsWith('g_');
            if (!parsedMessage.isSelf && !isGroupChat) {
                this.sendWelcomeWithQuickReplies(channel, contact.externalUserId)
                    .catch(err => this.logger.warn(`⚠️ Welcome message failed: ${err.message}`));
            }
        } else {
            if (conversation.tenantId == null) conversation.tenantId = channelTenantId;
            else if (conversation.tenantId !== channelTenantId) {
                throw new Error(`Conversation ${conversation.id} không thuộc tenant của channel ${channelId}.`);
            }
            if (conversation.status === ConversationStatus.CLOSED) {
                conversation.status = ConversationStatus.NEW;
            }
            conversation.lastMessageAt = now;
            conversation.slaDeadline = slaDeadline;
            conversation.slaBreached = false;
            // Increment unread count ONLY if no one is viewing the conversation in Zeplao
            if (!parsedMessage.isSelf) {
                const viewerCount = this.eventsGateway.getConversationRoomSize(conversation.id, channelTenantId);
                if (viewerCount === 0) {
                    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
                }
            } else {
                // If the agent replied (from Zalo app or Zeplao), they obviously read the messages
                conversation.unreadCount = 0;
            }
            conversation = await this.convRepo.save(conversation);
        }

        // Feature 6: Schedule SLA warning 5 min before deadline
        // (Bỏ qua khi backfill — tin cũ không cần cảnh báo SLA)
        if (!parsedMessage.isBackfill) {
            const warningMinutes = Math.max(slaMinutes - 5, 1);
            // Bắt tenantId TRƯỚC khi vào setTimeout (callback chạy ngoài AsyncLocalStorage scope).
            const slaTenantId = conversation.tenantId ?? channelTenantId;
            setTimeout(() => {
                this.eventsGateway.emitSlaWarning(conversation!.id, 5, slaTenantId);
                this.logger.log(`⏳ SLA warning emitted for conversation ${conversation!.id}`);
            }, warningMinutes * 60 * 1000);
        }

        // Create message
        const message = this.messageRepo.create({
            conversation,
            tenantId: channelTenantId,
            senderType: parsedMessage.isSelf ? SenderType.AGENT : SenderType.CUSTOMER,
            senderName: parsedMessage.senderName, // <== Save sender's real name here
            senderAvatarUrl: parsedMessage.senderAvatar, // <== Save sender's actual avatar URL
            contentType: parsedMessage.attachments?.length ? ContentType.IMAGE : ContentType.TEXT,
            content: parsedMessage.text || '',
            attachments: parsedMessage.attachments || [],
            externalMsgId: parsedMessage.externalMessageId,
            quoteData: parsedMessage.rawPayload?.data || null, // <== Save raw payload for native replies
            status: MessageStatus.DELIVERED,
            idempotencyKey: `inbound_${parsedMessage.externalMessageId}`,
        });
        const savedMessage = await this.messageRepo.save(message);
        this.logger.log(`✅ Message saved: ${savedMessage.id}`);

        // Feature 3: Cancel pending follow-ups when customer replies
        if (this.followUpService) {
            this.followUpService.cancelPending(conversation.id)
                .catch(err => this.logger.warn(`⚠️ Follow-up cancel failed: ${err.message}`));
        }

        // Emit WebSocket events
        // (Bỏ qua TOÀN BỘ khi backfill — tránh flood frontend ~3 sự kiện/tin × hàng trăm tin)
        if (!parsedMessage.isBackfill) {
            this.eventsGateway.emitNewMessage(conversation.id, {
                id: savedMessage.id,
                senderType: savedMessage.senderType,
                content: savedMessage.content,
                contentType: savedMessage.contentType,
                createdAt: savedMessage.createdAt,
                senderName: parsedMessage.senderName,
                senderAvatarUrl: savedMessage.senderAvatarUrl, // <== Propagate avatar to frontend
                attachments: savedMessage.attachments,
                quoteData: savedMessage.quoteData,
            }, channelTenantId);

            this.eventsGateway.emitConversationUpdated({
                id: conversation.id,
                status: conversation.status,
                lastMessageAt: conversation.lastMessageAt,
                contactName: contact.displayName,
                lastMessagePreview: (parsedMessage.text || '(attachment)').substring(0, 80),
                slaDeadline: conversation.slaDeadline,
            }, channelTenantId);

            // Emit Dashboard update
            this.eventsGateway.emitDashboardUpdate({
                event: 'new_message',
                conversationId: conversation.id,
                timestamp: now.toISOString(),
            }, channelTenantId);
        }

        // Trigger AI suggestion (async — don't block inbound, and do not trigger if message is sent by Agent/Self)
        if (this.aiSuggestService && !parsedMessage.isSelf && !parsedMessage.isBackfill) {
            // Nhánh AI chạy fire-and-forget SAU khi transaction nhận-tin đã commit/đóng.
            // Bọc lại trong withTenant ở MỌI chế độ để các service app-level (KB/cache/learning)
            // vẫn lọc tenant ngay cả khi PostgreSQL RLS đang tắt. Không phụ thuộc context của
            // transaction nhận-tin đã đóng.
            const aiTenantId = conversation.tenantId ?? this.tenantCtx?.currentTenantId() ?? null;
            const fireAiSuggestion = () =>
                this.aiSuggestService!.generateSuggestion(conversation!.id, savedMessage.id)
                .then(s => {
                    if (!s) return;
                    this.logger.log(`💡 AI suggestion generated: ${s.id}`);
                    // Feature 1: Auto-reply if eligible
                    // KHÔNG auto-gửi vào CHAT NHÓM (externalUserId prefix 'g_') — tránh AI tự
                    // nhảy vào trả lời trong nhóm. Vẫn giữ gợi ý cho nhân viên tự gửi nếu muốn.
                    const isGroupChat = (parsedMessage.externalUserId || '').startsWith('g_');
                    if (s.autoReplyEligible && s.replies?.[0]?.text && !isGroupChat) {
                        // Strip markdown for clean text to customer
                        const cleanText = s.replies[0].text
                            .replace(/^#{1,4}\s+(.+)$/gm, '📌 $1')
                            .replace(/\*\*(.+?)\*\*/g, '$1')
                            .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
                            .replace(/^\s*[-•]\s+/gm, '  ✦ ')
                            .replace(/\n{3,}/g, '\n\n')
                            .trim();
                        this.processOutbound(
                            conversation!.id,
                            { text: cleanText },
                            'ai-auto',
                            undefined,
                            aiTenantId ?? undefined,
                        )
                            .then(() => {
                                this.logger.log(`🤖 Auto-reply sent for conversation ${conversation!.id} (intent: ${s.intent})`);
                                this.eventsGateway.emitAutoReply(conversation!.id, { text: cleanText }, aiTenantId ?? undefined);
                                // Đánh dấu đã auto-gửi → đếm rate-limit thật + FE ẩn nút "Gửi" (chống gửi 2 lần)
                                this.aiSuggestService?.markAutoSent(s.id, conversation!.id)
                                    .catch(err => this.logger.warn(`⚠️ markAutoSent failed: ${err.message}`));
                            })
                            .catch(err => this.logger.warn(`⚠️ Auto-reply failed: ${err.message}`));
                    }
                })
                .catch(err => this.logger.warn(`⚠️ AI suggestion failed (${safeErrorMetadata(err)})`));

            if (this.tenantCtx && aiTenantId != null) {
                // withTenant trả promise nhưng cố ý KHÔNG await (fire-and-forget) — chỉ để
                // thiết lập AsyncLocalStorage scope cho toàn bộ chuỗi async của nhánh AI.
                void this.tenantCtx.withTenant(aiTenantId, fireAiSuggestion);
            } else {
                void fireAiSuggestion();
            }
        }

        return true;
        } catch (error: any) {
            this.logger.error(`Error in processInbound: ${error.message}`, error.stack);
            return false;
        }
    }

    /**
     * Process outbound message (agent sends to customer)
     */
    async processOutbound(
        conversationId: string,
        content: MessageContent,
        userId: string,
        idempotencyKey?: string,
        requestTenantId?: number,
    ): Promise<Message> {
        this.logger.log(`📤 Processing outbound for conversation ${conversationId}`);

        const explicitTenantId = Number.isSafeInteger(requestTenantId) && Number(requestTenantId) > 0
            ? Number(requestTenantId)
            : undefined;
        const backgroundTenantId = this.tenantCtx?.currentTenantId();
        const tenantId = explicitTenantId ?? (
            userId === 'ai-auto' && Number.isSafeInteger(backgroundTenantId) && Number(backgroundTenantId) > 0
                ? Number(backgroundTenantId)
                : undefined
        );

        // Mọi đường gửi, kể cả auto-reply nền, phải mang tenant tường minh. Không
        // fallback truy vấn chỉ theo UUID khi AsyncLocalStorage không propagate.
        if (tenantId == null) {
            throw new ForbiddenException('Không xác định được đơn vị gửi tin nhắn.');
        }

        const conversation = await this.convRepo.findOne({
            where: { id: conversationId, tenantId },
            relations: ['channel', 'contact'],
        });

        if (!conversation) {
            // 404 tránh làm lộ UUID hội thoại của tenant khác.
            throw new NotFoundException(`Conversation not found: ${conversationId}`);
        }

        // Scope theo tenant ở tầng app để không trả nhầm message của tenant khác khi RLS tắt.
        // Unique constraint hiện vẫn toàn cục; đổi constraint cần migration riêng ngoài Wave 1.
        if (idempotencyKey) {
            const existing = await this.messageRepo.findOne({
                where: { idempotencyKey, tenantId },
            });
            if (existing) return existing;
        }

        // Luôn xác minh tenant của hội thoại TRƯỚC khi realpath/stat/read tệp đính kèm.
        let preparedAttachment: PreparedOutboundAttachment | undefined;
        if (content.attachmentUrl) {
            if (tenantId == null) {
                throw new ForbiddenException('Không xác định được đơn vị sở hữu tệp đính kèm.');
            }
            const configuredBaseUrl = this.configService.get<string>('API_BASE_URL')?.trim();
            const fallbackBaseUrl = `http://localhost:${this.configService.get<number>('PORT', 4000)}`;
            preparedAttachment = await loadInternalChatAttachment(content.attachmentUrl, {
                storageRoot: path.resolve(process.cwd(), 'uploads', 'chat'),
                allowedBaseUrls: [configuredBaseUrl || fallbackBaseUrl],
            });
        }

        // Save message with status 'sending'
        const isImage = content.attachmentType === 'image' || (content.attachmentUrl && !content.attachmentType);
        const isFile = content.attachmentType === 'file';
        let msgContentType = ContentType.TEXT;
        if (isImage) msgContentType = ContentType.IMAGE;
        else if (isFile) msgContentType = ContentType.FILE;

        const message = this.messageRepo.create({
            conversation,
            tenantId: conversation.tenantId ?? tenantId ?? null,
            senderType: SenderType.AGENT,
            contentType: msgContentType,
            content: content.text || (isImage ? '[Hình ảnh]' : ''),
            attachments: content.attachmentUrl ? [{ url: content.attachmentUrl, type: content.attachmentType || 'image' }] : [],
            status: MessageStatus.SENDING,
            senderId: userId,
            quoteId: content.replyToId,
            idempotencyKey: idempotencyKey || `out_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        });
        const savedMessage = await this.messageRepo.save(message);

        // Emit optimistic message
        this.eventsGateway.emitNewMessage(conversationId, {
            id: savedMessage.id,
            senderType: savedMessage.senderType,
            content: savedMessage.content,
            contentType: savedMessage.contentType,
            attachments: savedMessage.attachments,
            status: savedMessage.status,
            createdAt: savedMessage.createdAt,
            quoteId: savedMessage.quoteId,
        }, tenantId);

        // Send via adapter in the background
        this.executeBackgroundSend(conversation, savedMessage, content, userId, preparedAttachment).catch(err => {
            this.logger.error(`Background send failed for msg ${savedMessage.id}: ${err.message}`);
        });

        return savedMessage;
    }

    private async executeBackgroundSend(
        conversation: Conversation,
        savedMessage: Message,
        content: MessageContent,
        userId: string,
        preparedAttachment?: PreparedOutboundAttachment,
    ) {
        let lastError = '';
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                let result: SendResult;

                if (conversation.channel.type === ChannelType.ZALO_PERSONAL) {
                    // Dynamically retrieve ZaloPoolService using ModuleRef to avoid Circular Dependency
                    const poolService = this.moduleRef.get(ZaloPoolService, { strict: false });
                    if (!poolService) throw new Error('ZaloPoolService could not be resolved');
                    // accountId is saved in Channel.accessTokenEnc
                    let payload: any = { msg: content.text || '' };

                    if (content.replyToId) {
                        try {
                            const originalMsg = await this.messageRepo.findOne({ where: { id: content.replyToId } });
                            if (originalMsg) {
                                if (originalMsg.quoteData) {
                                    payload.quote = originalMsg.quoteData;
                                } else {
                                    // Synthesize a generic TMessage-like payload for quotes so zca-js understands it
                                    payload.quote = {
                                        uidFrom: originalMsg.senderType === SenderType.AGENT ? "0" : (originalMsg.senderId || conversation.contact.externalUserId),
                                        msgId: originalMsg.externalMsgId || '0',
                                        cliMsgId: originalMsg.externalCliMsgId || Date.now().toString(),
                                        msgType: originalMsg.contentType === 'image' ? 'chat.photo' : 'chat.text',
                                        ts: new Date(originalMsg.createdAt).getTime().toString(),
                                        content: originalMsg.content || '[Hình ảnh]'
                                    };
                                }
                            }
                        } catch(e) {}
                    }

                    if (content.attachmentUrl) {
                        if (!preparedAttachment) {
                            throw new Error('Tệp đính kèm chưa được xác thực trước khi gửi.');
                        }

                        let imgWidth = 800;
                        let imgHeight = 800;
                        const dims = getImageDimensions(preparedAttachment.data);
                        if (dims) {
                            imgWidth = dims.width;
                            imgHeight = dims.height;
                        }

                        let sanitizedMsg = content.text || '';
                        if (sanitizedMsg.trim() === '[Hình ảnh]' || sanitizedMsg.trim() === '[Hình ảnh đính kèm]' || sanitizedMsg.trim() === '[Sticker Zalo]') {
                            sanitizedMsg = '';
                        }

                        payload.msg = sanitizedMsg;
                        payload.attachments = [{
                            data: preparedAttachment.data,
                            filename: preparedAttachment.filename,
                            metadata: { width: imgWidth, height: imgHeight, totalSize: preparedAttachment.size }
                        }];
                    }
                    
                    const sendRes = await poolService.sendMessage(
                        conversation.channel.accessTokenEnc || '',
                        conversation.contact.externalUserId,
                        payload
                    );
                    result = {
                        success: sendRes.success,
                        externalMessageId: sendRes.messageId || `zalo_p_${Date.now()}`,
                        externalCliMsgId: sendRes.cliMsgId,
                        error: sendRes.error,
                    };
                } else {
                    const adapter = getChannelAdapter(conversation.channel.type);
                    result = await adapter.sendMessage(
                        conversation.channel.accessTokenEnc || 'mock-token',
                        conversation.contact.externalUserId,
                        content,
                    );
                }

                if (result.success) {
                    savedMessage.status = MessageStatus.SENT;
                    savedMessage.externalMsgId = result.externalMessageId || '';
                    if (result.externalCliMsgId) savedMessage.externalCliMsgId = result.externalCliMsgId;
                    await this.messageRepo.save(savedMessage);

                    conversation.lastMessageAt = new Date();
                    conversation.status = ConversationStatus.IN_PROGRESS;
                    await this.convRepo.save(conversation);

                    this.eventsGateway.emitMessageStatus(
                        conversation.id,
                        savedMessage.id,
                        'sent',
                        conversation.tenantId ?? undefined,
                    );
                    this.logger.log(`✅ Outbound sent: ${savedMessage.id}`);

                    // Feature 3: Schedule follow-up after agent sends (not for auto-replies)
                    if (this.followUpService && userId !== 'ai-auto') {
                        this.followUpService.scheduleFollowUp(conversation.id)
                            .catch(err => this.logger.warn(`⚠️ Follow-up schedule failed: ${err.message}`));
                    }

                    return;
                }

                lastError = result.error || 'Unknown error';
            } catch (err: any) {
                lastError = err.message;
                this.logger.error(`Outbound attempt ${attempt} failed: ${err.message}`);
            }

            // Chống GỬI TRÙNG: khi lỗi là TIMEOUT, Zalo có thể ĐÃ nhận tin nhưng phản hồi
            // chậm >30s. Retry mù sẽ khiến khách nhận 2 tin. Dừng retry, đánh dấu FAILED để
            // nhân viên tự kiểm tra + gửi lại nếu cần. Lỗi khác (network refused) vẫn retry.
            if (/timeout/i.test(lastError)) {
                this.logger.warn(`⏱️ Outbound timeout — dừng retry để tránh gửi trùng (tin có thể đã tới). Msg ${savedMessage.id}`);
                break;
            }

            if (attempt < 3) {
                await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
            }
        }

        this.logger.error(`❌ Outbound failed completely after 3 attempts. Last error: ${lastError}`);
        savedMessage.status = MessageStatus.FAILED;
        savedMessage.errorDetail = lastError;
        await this.messageRepo.save(savedMessage);
        this.eventsGateway.emitMessageStatus(
            conversation.id,
            savedMessage.id,
            'failed',
            conversation.tenantId ?? undefined,
        );
    }

    /**
     * Reconcile message kẹt SENDING (audit 2026-08-13): đường gửi outbound chạy
     * in-process (executeBackgroundSend) — backend restart giữa chừng làm message
     * giữ trạng thái SENDING vĩnh viễn, sale nhìn "đang gửi" mãi mà không biết hỏng.
     * Đánh FAILED sau 10 phút để UI hiện trạng thái thật + cho gửi lại thủ công.
     * KHÔNG auto-resend: Zalo có thể ĐÃ nhận trước khi crash — resend là gửi trùng.
     * RLS bật → lặp từng tenant qua forEachTenant (cùng pattern các cron khác).
     */
    @Cron('30 */5 * * * *')
    async reconcileStuckOutbound(): Promise<void> {
        await forEachTenant(this.tenantCtx, this.messageRepo.manager, () => this.reconcileStuckOutboundCore());
    }

    private async reconcileStuckOutboundCore(): Promise<void> {
        const cutoff = new Date(Date.now() - 10 * 60_000);
        const stuck = await this.messageRepo.find({
            where: { status: MessageStatus.SENDING, senderType: SenderType.AGENT, createdAt: LessThan(cutoff) },
            select: ['id', 'conversationId', 'tenantId'],
            take: 200,
        });
        if (stuck.length === 0) return;

        await this.messageRepo.update(
            { id: In(stuck.map(m => m.id)) },
            {
                status: MessageStatus.FAILED,
                errorDetail: 'Kẹt ở trạng thái "đang gửi" quá 10 phút (khả năng backend khởi động lại giữa chừng). Vui lòng gửi lại nếu khách chưa nhận.',
            },
        );
        for (const m of stuck) {
            this.eventsGateway.emitMessageStatus(m.conversationId, m.id, 'failed', m.tenantId ?? undefined);
        }
        this.logger.warn(`♻️ Reconcile outbound: ${stuck.length} message kẹt SENDING > 10 phút → FAILED`);
    }

    /**
     * Send welcome message with Quick Reply product buttons to new customer
     * Buttons are configurable via WELCOME_PRODUCTS env var
     */
    private async sendWelcomeWithQuickReplies(channel: Channel, recipientId: string): Promise<void> {
        const adapter = getChannelAdapter(channel.type);

        // Default product buttons — override via env WELCOME_PRODUCTS="In tem,Name Card,Brochure,Hỏi giá,Tư vấn"
        const defaultProducts = ['📋 In tem/decal', '💳 Name Card', '📖 Brochure', '💰 Hỏi giá', '💬 Tư vấn'];
        const products = this.configService.get<string>('WELCOME_PRODUCTS', '').split(',').filter(Boolean);
        const buttonLabels = products.length > 0 ? products : defaultProducts;

        const buttons = buttonLabels.map(label => ({
            title: label.trim(),
            payload: label.trim(),
        }));

        const result = await adapter.sendMessage(
            channel.accessTokenEnc || 'mock-token',
            recipientId,
            {
                text: 'Chào bạn! 👋 Bên mình chuyên in ấn chất lượng cao. Bạn cần tư vấn sản phẩm nào ạ?',
                buttons,
            },
        );

        if (result.success) {
            this.logger.log(`👋 Welcome message sent with ${buttons.length} Quick Reply buttons`);
        } else {
            this.logger.warn(`⚠️ Welcome message failed: ${result.error}`);
        }
    }

    /**
     * Handle incoming seen event (Read Receipt)
     */
    async processSeenEvent(channelId: string, extUserId: string, highestMsgId?: string, isSelf?: boolean): Promise<void> {
        let contact = await this.contactRepo.findOne({
            where: { externalUserId: extUserId, channel: { id: channelId } }
        });
        if (!contact) return;

        let conversation = await this.convRepo.findOne({
            where: { contact: { id: contact.id }, channel: { id: channelId } },
            order: { lastMessageAt: 'DESC' }
        });
        if (!conversation) return;

        if (isSelf) {
            // We read the message on Zalo app. Clear unreadCount!
            conversation.unreadCount = 0;
            await this.convRepo.save(conversation);
            this.eventsGateway.emitConversationUpdated(
                { id: conversation.id, unreadCount: 0 },
                conversation.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
            );
            this.logger.log(`👁️ Agent read message on Zalo. Cleared unreadCount for conv ${conversation.id}`);
        } else {
            // Customer read our message. Update message statuses.
            await this.messageRepo.update(
                { conversation: { id: conversation.id }, senderType: SenderType.AGENT, status: MessageStatus.SENT },
                { status: MessageStatus.READ }
            );
            await this.messageRepo.update(
                { conversation: { id: conversation.id }, senderType: SenderType.AGENT, status: MessageStatus.DELIVERED },
                { status: MessageStatus.READ }
            );
            
            // Broadcast the update so frontend gets latest status
            this.eventsGateway.emitMessageStatus(
                conversation.id,
                highestMsgId || 'all',
                'read',
                conversation.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
            );
            this.logger.log(`👁️ Customer read messages in conv ${conversation.id}`);
        }
    }

    /**
     * Handle incoming typing event
     */
    async processTypingEvent(channelId: string, extUserId: string, isTyping: boolean): Promise<void> {
        let contact = await this.contactRepo.findOne({
            where: { externalUserId: extUserId, channel: { id: channelId } }
        });
        if (!contact) return;

        let conversation = await this.convRepo.findOne({
            where: { contact: { id: contact.id }, channel: { id: channelId } },
            order: { lastMessageAt: 'DESC' }
        });
        if (!conversation) return;

        this.eventsGateway.emitTyping(
            conversation.id,
            extUserId,
            isTyping,
            conversation.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
        );
    }

    /**
     * Handle incoming undo event (when remote contact unsends a message)
     */
    async processUndoEvent(channelId: string, extMsgId: string): Promise<void> {
        this.logger.log(`⏪ Processing undo event: channelId=${channelId}, extMsgId=${extMsgId}`);
        
        // Use QueryBuilder for SQLite compatibility (nested relation where doesn't work well)
        const message = await this.messageRepo
            .createQueryBuilder('msg')
            .leftJoinAndSelect('msg.conversation', 'conv')
            .leftJoin('conv.channel', 'ch')
            .where('msg.external_msg_id = :extMsgId', { extMsgId })
            .andWhere('ch.id = :channelId', { channelId })
            .getOne();

        if (!message) {
            this.logger.warn(`⏪ Undo: Message not found for extMsgId=${extMsgId} in channel=${channelId}`);
            return;
        }

        message.status = MessageStatus.RECALLED;
        message.content = '[Tin nhắn đã thu hồi]';
        message.attachments = [];
        await this.messageRepo.save(message);

        // Emit via socket
        this.eventsGateway.emitConversationScopedEvent(
            message.tenantId ?? message.conversation.tenantId ?? this.tenantCtx?.currentTenantId(),
            message.conversation.id,
            'messageRecalled',
            {
                conversationId: message.conversation.id,
                messageId: message.id,
                status: MessageStatus.RECALLED,
                externalMsgId: extMsgId,
            },
        );
        
        this.logger.log(`⏪ Handled undo for msg: ${extMsgId} → DB id: ${message.id}`);
    }

    /**
     * Handle incoming reaction event
     */

    // Mapping from ZCA-JS Reactions enum values → Unicode for display
    private readonly ZALO_TO_UNICODE: Record<string, string> = {
        '/-strong': '👍',
        '/-heart': '❤️',
        ':>': '😆',
        ':o': '😮',
        ':-((': '😢',
        ':-h': '😡',
        '/-weak': '👎',
        ':-*': '😘',
        ":')" : '😂',
        '/-shit': '💩',
        '/-rose': '🌹',
        '/-break': '💔',
    };

    async processReactionEvent(channelId: string, extMsgId: string, icon: string, senderId: string): Promise<void> {
        const message = await this.messageRepo
            .createQueryBuilder('msg')
            .leftJoinAndSelect('msg.conversation', 'conv')
            .leftJoin('conv.channel', 'ch')
            .where('msg.external_msg_id = :extMsgId', { extMsgId })
            .andWhere('ch.id = :channelId', { channelId })
            .getOne();

        if (!message) {
            this.logger.debug(`💬 Reaction: Message not found for extMsgId=${extMsgId}`);
            return;
        }

        // Convert Zalo reaction code → Unicode for consistent storage
        const unicodeIcon = this.ZALO_TO_UNICODE[icon] || icon;

        // Update reactions count — accumulate like Zalo (multiple people can react)
        const reactions = message.reactions || {};
        reactions[unicodeIcon] = (reactions[unicodeIcon] || 0) + 1;
        message.reactions = reactions;
        await this.messageRepo.save(message);

        // Broadcast to frontend
        this.eventsGateway.emitMessageReacted(
            message.conversation.id,
            message.id,
            reactions,
            message.tenantId ?? message.conversation.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
        );
        this.logger.log(`💬 Reaction ${icon} → ${unicodeIcon} saved on msg ${message.id}`);
    }

    /**
     * Handle incoming delivered event (message delivery receipt)
     */
    async processDeliveredEvent(channelId: string, extUserId: string): Promise<void> {
        const contact = await this.contactRepo.findOne({
            where: { externalUserId: extUserId, channel: { id: channelId } }
        });
        if (!contact) return;

        const conversation = await this.convRepo.findOne({
            where: { contact: { id: contact.id }, channel: { id: channelId } },
            order: { lastMessageAt: 'DESC' }
        });
        if (!conversation) return;

        // Mark SENT agent messages as DELIVERED
        const result = await this.messageRepo.update(
            { conversation: { id: conversation.id }, senderType: SenderType.AGENT, status: MessageStatus.SENT },
            { status: MessageStatus.DELIVERED }
        );

        if (result.affected && result.affected > 0) {
            this.eventsGateway.emitMessageStatus(
                conversation.id,
                'all',
                'delivered',
                conversation.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
            );
            this.logger.log(`📬 Marked ${result.affected} messages as delivered in conv ${conversation.id}`);
        }
    }

    /**
     * Sync unread marks from Zalo periodic polling
     */
    async syncUnreadMarks(channelId: string, unreadExtUserIds: string[]): Promise<void> {
        // HIỆU NĂNG (audit 2026-07-25): hàm này chạy mỗi 15s CHO MỖI account Zalo đang kết nối
        // (zalo-pool.startUnreadPolling). Trước đây nạp TOÀN BỘ conversation của channel kèm
        // relations rồi lọc `unreadCount > 0` bằng JS ⇒ hydrate hàng chục nghìn row 4 lần/phút.
        // Nay đẩy điều kiện xuống SQL (MoreThan(0)) và chỉ lấy cột cần dùng.
        const currentlyUnread = await this.convRepo.find({
            where: { channel: { id: channelId }, unreadCount: MoreThan(0) },
            relations: { contact: true },
            select: { id: true, tenantId: true, unreadCount: true, contact: { id: true, externalUserId: true } },
        });

        if (currentlyUnread.length === 0) return;

        // If a conversation is marked unread in Zeplao, but NOT in Zalo's unread list,
        // it means it was read on Zalo. We should clear the badge!
        const toClear = currentlyUnread.filter((conv) => {
            const extId = conv.contact?.externalUserId;
            if (!extId) return false;
            // Zalo Group IDs are sometimes prefixed with g_ or just numbers
            return !unreadExtUserIds.some(id => id === extId || id === `g_${extId}` || `g_${id}` === extId);
        });
        if (toClear.length === 0) return;

        // Một UPDATE gộp thay vì save() từng entity trong vòng lặp (tránh N round-trip mỗi 15s).
        // Dùng update() thay save() vì entity chỉ được select một phần cột.
        await this.convRepo.update({ id: In(toClear.map(c => c.id)) }, { unreadCount: 0 });

        for (const conv of toClear) {
            this.eventsGateway.emitConversationUpdated(
                { id: conv.id, unreadCount: 0 },
                conv.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
            );
        }
        // §11: 1 dòng tổng hợp thay vì logger.log mỗi conversation trong vòng lặp polling.
        this.logger.debug(`Sync unread: cleared ${toClear.length} conversation(s) read on Zalo (channel=${channelId})`);
    }
}

