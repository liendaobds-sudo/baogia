import { Injectable, ConflictException, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus, SenderType, Conversation, ChannelType } from '../../entities';
import { ModuleRef } from '@nestjs/core';
import { ZaloPoolService } from '../zalo-personal/zalo-pool.service';
import { EventsGateway } from '../gateway/events.gateway';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
@Injectable()
export class MessagesService {
    private readonly logger = new Logger(MessagesService.name);

    constructor(
        @InjectRepository(Message)
        private messagesRepo: Repository<Message>,
        @InjectRepository(Conversation)
        private convRepo: Repository<Conversation>,
        private moduleRef: ModuleRef,
        private eventsGateway: EventsGateway,
        @InjectQueue('outbound_messages') private outboundQueue: Queue,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) { }

    /**
     * CHỐT CÔ LẬP TENANT cho mọi thao tác nhận `conversationId` từ client (audit 2026-07-25).
     *
     * Trước đây các hàm dưới chỉ lọc theo `{ id, conversationId }` ⇒ user của tenant B biết
     * UUID hội thoại của tenant A là đọc/react/thu hồi/ghim/xoá được (IDOR chéo tenant), vì
     * RLS chưa flip và controller không kiểm tenant.
     *
     * Cùng quy ước với `ConversationsService.applyTenantFilter`: chấp nhận `tenant_id IS NULL`
     * (dữ liệu di sản trước Pha A) và không chặn khi ngoài tenant context / đường bypass —
     * để không đổi hành vi job nền và môi trường chưa bật multi-tenant.
     *
     * @throws NotFoundException khi hội thoại không tồn tại hoặc thuộc tenant khác
     *         (dùng 404 thay 403 để không tiết lộ sự tồn tại của hội thoại tenant khác).
     */
    /** Tenant của hội thoại (nguồn chính xác để stamp tin nhắn); null nếu không tra được. */
    private async resolveConversationTenantId(conversationId: string): Promise<number | null> {
        if (!conversationId) return null;
        try {
            const conv = await this.convRepo.findOne({
                where: { id: conversationId },
                select: { id: true, tenantId: true },
            });
            return conv?.tenantId ?? null;
        } catch (e) {
            this.logger.warn(
                `Không tra được tenant của hội thoại ${conversationId}: ${e instanceof Error ? e.message : e}`,
            );
            return null;
        }
    }

    private async assertConversationInTenant(conversationId: string): Promise<void> {
        const ctx = this.tenantCtx?.get?.();
        if (!ctx || ctx.bypass || ctx.tenantId == null) return;

        const conv = await this.convRepo.findOne({
            where: { id: conversationId },
            select: { id: true, tenantId: true },
        });
        if (!conv || (conv.tenantId != null && conv.tenantId !== ctx.tenantId)) {
            throw new NotFoundException(`Conversation not found: ${conversationId}`);
        }
    }

    async findByConversation(conversationId: string, before?: string, limit = 50) {
        await this.assertConversationInTenant(conversationId);
        const qb = this.messagesRepo
            .createQueryBuilder('msg')
            .where('msg.conversation_id = :conversationId', { conversationId })
            .andWhere('msg.is_local_deleted = false')
            .orderBy('msg.created_at', 'DESC')
            .take(Math.min(limit, 100));

        if (before) {
            qb.andWhere('msg.created_at < :before', { before });
        }

        const messages = await qb.getMany();
        return {
            data: messages.reverse(),
            hasMore: messages.length === limit,
        };
    }

    async send(data: {
        conversationId: string;
        content: string;
        contentType?: string;
        senderId: string;
        idempotencyKey?: string;
        suggestionId?: string;
        suggestionAction?: string;
    }) {
        await this.assertConversationInTenant(data.conversationId);
        // Idempotency check
        if (data.idempotencyKey) {
            const existing = await this.messagesRepo.findOne({
                where: { idempotencyKey: data.idempotencyKey },
            });
            if (existing) {
                throw new ConflictException({
                    statusCode: 409,
                    message: 'Tin nhắn đã được gửi trước đó',
                    existingMessageId: existing.id,
                });
            }
        }

        // Tenant cho tin nhắn outbound (audit 2026-08-29): trước đây `create()` KHÔNG
        // gắn tenantId ⇒ mọi tin agent gửi đều là hàng `tenant_id NULL` mới, và quy ước
        // `OR tenant_id IS NULL` ở search/report làm NỘI DUNG tin nhắn đó hiện ra cho
        // MỌI tenant. Ưu tiên tenant của hội thoại (nguồn chính xác), fallback context.
        const convTenantId = await this.resolveConversationTenantId(data.conversationId);
        const messageTenantId = convTenantId ?? this.tenantCtx?.currentTenantId() ?? null;

        const message = this.messagesRepo.create({
            conversationId: data.conversationId,
            content: data.content,
            contentType: (data.contentType as any) || 'text',
            senderType: SenderType.AGENT,
            senderId: data.senderId,
            status: MessageStatus.SENDING,
            idempotencyKey: data.idempotencyKey,
            suggestionId: data.suggestionId,
            suggestionAction: data.suggestionAction as any,
            ...(messageTenantId != null ? { tenantId: messageTenantId } : {}),
        });

        const saved = await this.messagesRepo.save(message);

        // Enqueue to BullMQ for asynchronous processing.
        // `tenantId` BẮT BUỘC trong payload: processor không phải suy lại bằng query
        // ngoài transaction (query đó trả 0 hàng sau khi FORCE RLS bật ⇒ job chết).
        await this.outboundQueue.add('send_message', 
            {
                messageId: saved.id,
                conversationId: data.conversationId,
                ...(messageTenantId != null ? { tenantId: messageTenantId } : {}),
            }, 
            {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: true,
                // Audit 2026-07-25: trước đây KHÔNG có `removeOnFail` ⇒ job lỗi nằm lại Redis
                // vĩnh viễn (memory phình dần, không ai dọn). Giữ lại 500 job lỗi gần nhất để
                // chẩn đoán rồi tự cắt — đủ làm "dead-letter" nhẹ mà không rò rỉ bộ nhớ.
                removeOnFail: { count: 500 },
            }
        );

        return { messageId: saved.id, status: saved.status };
    }

    async reactToMessage(conversationId: string, messageId: string, icon: string): Promise<Message> {
        await this.assertConversationInTenant(conversationId);
        const message = await this.messagesRepo.findOne({
            where: { id: messageId, conversationId },
        });

        if (!message) {
            throw new NotFoundException(`Message not found: ${messageId}`);
        }

        // On Zalo: 1 person = 1 reaction per message.
        // If agent already reacted with same icon → skip (don't double-count, don't re-send to Zalo)
        const currentReactions = message.reactions || {};
        if (icon !== 'remove' && currentReactions[icon] && currentReactions[icon] > 0) {
            this.logger.log(`🎭 Agent already reacted ${icon} on msg ${messageId}, skipping`);
            return message;
        }

        const conversation = await this.convRepo.findOne({
            where: { id: conversationId },
            relations: ['channel', 'contact'],
        });

        if (!conversation) {
            throw new NotFoundException(`Conversation not found: ${conversationId}`);
        }

        // 1. Send reaction to Zalo if supported channel
        this.logger.log(`🎭 reactToMessage: channelType=${conversation.channel.type}, externalMsgId=${message.externalMsgId}, icon=${icon}`);
        if (conversation.channel.type === ChannelType.ZALO_PERSONAL && message.externalMsgId) {
            const poolService = this.moduleRef.get(ZaloPoolService, { strict: false });
            if (!poolService) throw new Error('ZaloPoolService could not be resolved');
            
            try {
                const targetUid = conversation.contact.externalUserId;
                const accountId = conversation.channel.accessTokenEnc;
                this.logger.log(`🎭 Calling poolService.sendReaction: accountId=${accountId}, targetUid=${targetUid}, msgId=${message.externalMsgId}, icon=${icon}`);
                if (accountId && targetUid) {
                     const result = await poolService.sendReaction(accountId, targetUid, message.externalMsgId, icon);
                     this.logger.log(`🎭 Reaction result: ${JSON.stringify(result)}`);
                } else {
                    this.logger.warn(`🎭 Missing accountId(${accountId}) or targetUid(${targetUid})`);
                }
            } catch (err) {
                this.logger.error(`Failed to send Zalo reaction: ${err.message}`, err.stack);
            }
        } else {
            this.logger.warn(`🎭 Skipping Zalo reaction: type=${conversation.channel.type}, externalMsgId=${message.externalMsgId}`);
        }

        // 2. Update DB
        if (icon === 'remove') {
            message.reactions = {};
        } else {
            // Agent adds 1 reaction (not increment — Zalo: 1 person = 1 reaction)
            currentReactions[icon] = 1;
            message.reactions = currentReactions;
        }
        
        const savedMessage = await this.messagesRepo.save(message);

        // 3. Emit via socket so all active clients see it immediately
        this.eventsGateway.emitMessageReacted(
            conversationId,
            messageId,
            savedMessage.reactions,
            savedMessage.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
        );

        return savedMessage;
    }

    async recallMessage(conversationId: string, messageId: string): Promise<Message> {
        this.logger.log(`🔄 recallMessage called: convId=${conversationId}, msgId=${messageId}`);
        await this.assertConversationInTenant(conversationId);

        const message = await this.messagesRepo.findOne({
            where: { id: messageId, conversationId },
        });

        if (!message) {
            this.logger.error(`❌ Message not found: ${messageId} in conv ${conversationId}`);
            throw new NotFoundException(`Message not found: ${messageId}`);
        }

        this.logger.log(`📋 Message found: senderType=${message.senderType}, externalMsgId=${message.externalMsgId}, status=${message.status}`);

        if (message.senderType !== SenderType.AGENT) {
            throw new ConflictException(`Only agent messages can be recalled`);
        }

        const conversation = await this.convRepo.findOne({
            where: { id: conversationId },
            relations: ['channel', 'contact'],
        });

        if (!conversation) {
            throw new NotFoundException(`Conversation not found`);
        }

        this.logger.log(`📋 Conversation: channelType=${conversation.channel.type}, contactExtId=${conversation.contact.externalUserId}, hasAccessToken=${!!conversation.channel.accessTokenEnc}`);

        // 1. Zalo send undo if supported channel
        let zaloUndoFailed = false;
        let zaloError = '';
        if (conversation.channel.type === ChannelType.ZALO_PERSONAL && message.externalMsgId) {
            // Skip undo for fake externalMsgIds (fallback IDs that start with zalo_p_)
            if (message.externalMsgId.startsWith('zalo_p_')) {
                this.logger.warn(`⚠️ Skipping Zalo undo for fake externalMsgId: ${message.externalMsgId}`);
            } else {
                const poolService = this.moduleRef.get(ZaloPoolService, { strict: false });
                if (!poolService) throw new Error('ZaloPoolService could not be resolved');
                
                try {
                    const targetUid = conversation.contact.externalUserId;
                    const accountId = conversation.channel.accessTokenEnc;
                    const cliMsgId = message.externalCliMsgId || message.externalMsgId;
                    this.logger.log(`🔄 Calling undoMessage: accountId=${accountId}, targetUid=${targetUid}, externalMsgId=${message.externalMsgId}, cliMsgId=${cliMsgId}`);
                    if (accountId && targetUid) {
                         const res = await poolService.undoMessage(accountId, targetUid, message.externalMsgId, cliMsgId);
                         this.logger.log(`🔄 undoMessage result: ${JSON.stringify(res)}`);
                         if (!res.success) {
                             zaloUndoFailed = true;
                             zaloError = res.error || 'Unknown Zalo error';
                             this.logger.warn(`⚠️ Zalo undo failed (will still recall locally): ${zaloError}`);
                         }
                    }
                } catch (err) {
                    zaloUndoFailed = true;
                    zaloError = err.message;
                    this.logger.warn(`⚠️ Zalo undo exception (will still recall locally): ${err.message}`);
                }
            }
        } else {
            this.logger.warn(`⚠️ Skipping Zalo undo: channelType=${conversation.channel.type}, externalMsgId=${message.externalMsgId}`);
        }

        // 2. Update DB status to RECALLED (Soft delete). We keep the text for backend audit!
        message.status = MessageStatus.RECALLED;
        const savedMessage = await this.messagesRepo.save(message);

        // 3. Emit via socket to update frontend
        this.eventsGateway.emitConversationScopedEvent(
            savedMessage.tenantId ?? conversation.tenantId ?? this.tenantCtx?.currentTenantId(),
            conversationId,
            'messageRecalled',
            {
            conversationId,
            messageId: savedMessage.id,
            status: savedMessage.status,
            externalMsgId: savedMessage.externalMsgId,
            },
        );

        this.logger.log(`✅ Message recalled: ${savedMessage.id}`);
        return savedMessage;
    }

    async togglePinMessage(conversationId: string, messageId: string): Promise<Message> {
        await this.assertConversationInTenant(conversationId);
        const message = await this.messagesRepo.findOne({
            where: { id: messageId, conversationId },
        });

        if (!message) {
            throw new NotFoundException(`Message not found: ${messageId}`);
        }

        message.isPinned = !message.isPinned;
        const savedMessage = await this.messagesRepo.save(message);

        this.eventsGateway.emitConversationScopedEvent(
            savedMessage.tenantId ?? this.tenantCtx?.currentTenantId(),
            conversationId,
            'messagePinned',
            {
            conversationId,
            messageId: savedMessage.id,
            isPinned: savedMessage.isPinned,
            },
        );

        return savedMessage;
    }

    async toggleStarMessage(conversationId: string, messageId: string): Promise<Message> {
        await this.assertConversationInTenant(conversationId);
        const message = await this.messagesRepo.findOne({
            where: { id: messageId, conversationId },
        });

        if (!message) {
            throw new NotFoundException(`Message not found: ${messageId}`);
        }

        message.isStarred = !message.isStarred;
        const savedMessage = await this.messagesRepo.save(message);

        this.eventsGateway.emitConversationScopedEvent(
            savedMessage.tenantId ?? this.tenantCtx?.currentTenantId(),
            conversationId,
            'messageStarred',
            {
            conversationId,
            messageId: savedMessage.id,
            isStarred: savedMessage.isStarred,
            },
        );

        return savedMessage;
    }

    async deleteMessageLocal(conversationId: string, messageId: string): Promise<void> {
        await this.assertConversationInTenant(conversationId);
        const message = await this.messagesRepo.findOne({
            where: { id: messageId, conversationId },
        });

        if (!message) {
            throw new NotFoundException(`Message not found: ${messageId}`);
        }

        message.isLocalDeleted = true;
        await this.messagesRepo.save(message);

        this.eventsGateway.emitConversationScopedEvent(
            message.tenantId ?? this.tenantCtx?.currentTenantId(),
            conversationId,
            'messageLocalDeleted',
            {
            conversationId,
            messageId: message.id,
            },
        );
    }

    /** Full-text search within a conversation */
    async searchMessages(conversationId: string, query: string, limit = 30) {
        await this.assertConversationInTenant(conversationId);
        if (!query || query.trim().length < 2) return [];
        const results = await this.messagesRepo
            .createQueryBuilder('msg')
            .where('msg.conversation_id = :conversationId', { conversationId })
            .andWhere('msg.is_local_deleted = false')
            .andWhere('LOWER(msg.content) LIKE :q', { q: `%${query.toLowerCase()}%` })
            .orderBy('msg.created_at', 'DESC')
            .take(Math.min(limit, 50))
            .getMany();
        return results;
    }
}
