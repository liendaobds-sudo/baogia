import { Injectable, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus, SenderType, Conversation, ChannelType } from '../../entities';
import { ModuleRef } from '@nestjs/core';
import { ZaloPoolService } from '../zalo-personal/zalo-pool.service';
import { EventsGateway } from '../gateway/events.gateway';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
    ) { }

    async findByConversation(conversationId: string, before?: string, limit = 50) {
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
        });

        const saved = await this.messagesRepo.save(message);

        // Enqueue to BullMQ for asynchronous processing
        await this.outboundQueue.add('send_message', 
            {
                messageId: saved.id,
                conversationId: data.conversationId,
            }, 
            {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000,
                },
                removeOnComplete: true,
            }
        );

        return { messageId: saved.id, status: saved.status };
    }

    async reactToMessage(conversationId: string, messageId: string, icon: string): Promise<Message> {
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
            savedMessage.reactions
        );

        return savedMessage;
    }

    async recallMessage(conversationId: string, messageId: string): Promise<Message> {
        this.logger.log(`🔄 recallMessage called: convId=${conversationId}, msgId=${messageId}`);
        
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
        this.eventsGateway.server.to(`conversation:${conversationId}`).emit('messageRecalled', {
            conversationId,
            messageId: savedMessage.id,
            status: savedMessage.status,
            externalMsgId: savedMessage.externalMsgId,
        });

        this.logger.log(`✅ Message recalled: ${savedMessage.id}`);
        return savedMessage;
    }

    async togglePinMessage(conversationId: string, messageId: string): Promise<Message> {
        const message = await this.messagesRepo.findOne({
            where: { id: messageId, conversationId },
        });

        if (!message) {
            throw new NotFoundException(`Message not found: ${messageId}`);
        }

        message.isPinned = !message.isPinned;
        const savedMessage = await this.messagesRepo.save(message);

        this.eventsGateway.server.to(`conversation:${conversationId}`).emit('messagePinned', {
            conversationId,
            messageId: savedMessage.id,
            isPinned: savedMessage.isPinned,
        });

        return savedMessage;
    }

    async toggleStarMessage(conversationId: string, messageId: string): Promise<Message> {
        const message = await this.messagesRepo.findOne({
            where: { id: messageId, conversationId },
        });

        if (!message) {
            throw new NotFoundException(`Message not found: ${messageId}`);
        }

        message.isStarred = !message.isStarred;
        const savedMessage = await this.messagesRepo.save(message);

        this.eventsGateway.server.to(`conversation:${conversationId}`).emit('messageStarred', {
            conversationId,
            messageId: savedMessage.id,
            isStarred: savedMessage.isStarred,
        });

        return savedMessage;
    }

    async deleteMessageLocal(conversationId: string, messageId: string): Promise<void> {
        const message = await this.messagesRepo.findOne({
            where: { id: messageId, conversationId },
        });

        if (!message) {
            throw new NotFoundException(`Message not found: ${messageId}`);
        }

        message.isLocalDeleted = true;
        await this.messagesRepo.save(message);

        this.eventsGateway.server.to(`conversation:${conversationId}`).emit('messageLocalDeleted', {
            conversationId,
            messageId: message.id,
        });
    }

    /** Full-text search within a conversation */
    async searchMessages(conversationId: string, query: string, limit = 30) {
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
