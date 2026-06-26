import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
                });
            }
        } catch (e: any) {
            this.logger.warn(`updateContactProfile failed: ${e.message}`);
        }
    }

    /**
     * Process inbound message from webhook
     */
    async processInbound(channelId: string, parsedMessage: ParsedMessage): Promise<boolean> {
        try {
        this.logger.log(`📩 Processing inbound from ${parsedMessage.senderName} via channel ${channelId}`);

        const channel = await this.channelRepo.findOne({ where: { id: channelId } });
        if (!channel) {
            this.logger.error(`Channel not found: ${channelId}`);
            return false;
        }

        // Idempotency check
        const existingMsg = await this.messageRepo.findOne({
            where: { idempotencyKey: `inbound_${parsedMessage.externalMessageId}` },
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
            contact = this.contactRepo.create({
                externalUserId: parsedMessage.externalUserId,
                displayName: parsedMessage.contactName || (parsedMessage.isSelf ? 'Khách Zalo' : parsedMessage.senderName),
                avatarUrl: parsedMessage.senderAvatar || '',
                channel,
            });
            contact = await this.contactRepo.save(contact);
            this.logger.log(`👤 New contact created: ${contact.displayName}`);
        } else {
            let updated = false;
            
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
            });
            conversation = await this.convRepo.save(conversation);
            this.logger.log(`💬 New conversation created: ${conversation.id}`);

            // Send welcome message with Quick Reply product buttons
            this.sendWelcomeWithQuickReplies(channel, contact.externalUserId)
                .catch(err => this.logger.warn(`⚠️ Welcome message failed: ${err.message}`));
        } else {
            if (conversation.status === ConversationStatus.CLOSED) {
                conversation.status = ConversationStatus.NEW;
            }
            conversation.lastMessageAt = now;
            conversation.slaDeadline = slaDeadline;
            conversation.slaBreached = false;
            // Increment unread count ONLY if no one is viewing the conversation in Zeplao
            if (!parsedMessage.isSelf) {
                const viewerCount = this.eventsGateway.getConversationRoomSize(conversation.id);
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
            setTimeout(() => {
                this.eventsGateway.emitSlaWarning(conversation!.id, 5);
                this.logger.log(`⏳ SLA warning emitted for conversation ${conversation!.id}`);
            }, warningMinutes * 60 * 1000);
        }

        // Create message
        const message = this.messageRepo.create({
            conversation,
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
            });

            this.eventsGateway.emitConversationUpdated({
                id: conversation.id,
                status: conversation.status,
                lastMessageAt: conversation.lastMessageAt,
                contactName: contact.displayName,
                lastMessagePreview: (parsedMessage.text || '(attachment)').substring(0, 80),
                slaDeadline: conversation.slaDeadline,
            });

            // Emit Dashboard update
            this.eventsGateway.emitDashboardUpdate({
                event: 'new_message',
                conversationId: conversation.id,
                timestamp: now.toISOString(),
            });
        }

        // Trigger AI suggestion (async — don't block inbound, and do not trigger if message is sent by Agent/Self)
        if (this.aiSuggestService && !parsedMessage.isSelf && !parsedMessage.isBackfill) {
            this.aiSuggestService.generateSuggestion(conversation.id, savedMessage.id)
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
                        this.processOutbound(conversation!.id, { text: cleanText }, 'ai-auto')
                            .then(() => {
                                this.logger.log(`🤖 Auto-reply sent for conversation ${conversation!.id} (intent: ${s.intent})`);
                                this.eventsGateway.emitAutoReply(conversation!.id, { text: cleanText });
                                // Đánh dấu đã auto-gửi → đếm rate-limit thật + FE ẩn nút "Gửi" (chống gửi 2 lần)
                                this.aiSuggestService?.markAutoSent(s.id, conversation!.id)
                                    .catch(err => this.logger.warn(`⚠️ markAutoSent failed: ${err.message}`));
                            })
                            .catch(err => this.logger.warn(`⚠️ Auto-reply failed: ${err.message}`));
                    }
                })
                .catch(err => this.logger.warn(`⚠️ AI suggestion failed: ${err.message}`));
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
    ): Promise<Message> {
        this.logger.log(`📤 Processing outbound for conversation ${conversationId}`);

        const conversation = await this.convRepo.findOne({
            where: { id: conversationId },
            relations: ['channel', 'contact'],
        });

        if (!conversation) {
            throw new Error(`Conversation not found: ${conversationId}`);
        }

        // Idempotency check
        if (idempotencyKey) {
            const existing = await this.messageRepo.findOne({
                where: { idempotencyKey },
            });
            if (existing) return existing;
        }

        // Save message with status 'sending'
        const isImage = content.attachmentType === 'image' || (content.attachmentUrl && !content.attachmentType);
        const isFile = content.attachmentType === 'file';
        let msgContentType = ContentType.TEXT;
        if (isImage) msgContentType = ContentType.IMAGE;
        else if (isFile) msgContentType = ContentType.FILE;

        const message = this.messageRepo.create({
            conversation,
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
        });

        // Send via adapter in the background
        this.executeBackgroundSend(conversation, savedMessage, content, userId).catch(err => {
            this.logger.error(`Background send failed for msg ${savedMessage.id}: ${err.message}`);
        });

        return savedMessage;
    }

    private async executeBackgroundSend(conversation: Conversation, savedMessage: Message, content: MessageContent, userId: string) {
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
                        let localPath: string = content.attachmentUrl;
                        const parsedUrl = new URL(localPath, 'http://localhost');
                        const ext = parsedUrl.pathname.split('.').pop()?.toLowerCase() || 'jpg';
                        
                        if (localPath.includes('/uploads/chat/')) {
                            const filename = localPath.split('/uploads/chat/').pop()?.split('?')[0];
                            localPath = require('path').resolve(process.cwd(), 'uploads', 'chat', filename);
                        } else if (localPath.startsWith('http')) {
                            const filename = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
                            localPath = require('path').resolve(process.cwd(), 'uploads', 'chat', filename);
                            try {
                                const response = await require('axios').get(content.attachmentUrl, { responseType: 'arraybuffer' });
                                require('fs').writeFileSync(localPath, response.data);
                            } catch (e) {
                                this.logger.error("Failed to download attachment for Zalo", e);
                            }
                        }
                        
                        let size = 0;
                        let fileData = Buffer.from('');
                        let imgWidth = 800;
                        let imgHeight = 800;
                        try {
                            const fs = require('fs');
                            size = fs.statSync(localPath).size;
                            fileData = fs.readFileSync(localPath);
                            
                            // Read actual dimensions from image header
                            const dims = getImageDimensions(fileData);
                            if (dims) {
                                imgWidth = dims.width;
                                imgHeight = dims.height;
                            }
                        } catch(e) {}

                        let sanitizedMsg = content.text || '';
                        if (sanitizedMsg.trim() === '[Hình ảnh]' || sanitizedMsg.trim() === '[Hình ảnh đính kèm]' || sanitizedMsg.trim() === '[Sticker Zalo]') {
                            sanitizedMsg = '';
                        }

                        payload.msg = sanitizedMsg;
                        payload.attachments = [{
                            data: fileData,
                            filename: require('path').basename(localPath),
                            metadata: { width: imgWidth, height: imgHeight, totalSize: size }
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

                    this.eventsGateway.emitMessageStatus(conversation.id, savedMessage.id, 'sent');
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

            if (attempt < 3) {
                await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
            }
        }

        this.logger.error(`❌ Outbound failed completely after 3 attempts. Last error: ${lastError}`);
        savedMessage.status = MessageStatus.FAILED;
        savedMessage.errorDetail = lastError;
        await this.messageRepo.save(savedMessage);
        this.eventsGateway.emitMessageStatus(conversation.id, savedMessage.id, 'failed');
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
            this.eventsGateway.emitConversationUpdated({ id: conversation.id, unreadCount: 0 });
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
            this.eventsGateway.emitMessageStatus(conversation.id, highestMsgId || 'all', 'read');
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

        this.eventsGateway.emitTyping(conversation.id, extUserId, isTyping);
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
        this.eventsGateway.server.to(`conversation:${message.conversation.id}`).emit('messageRecalled', {
            conversationId: message.conversation.id,
            messageId: message.id,
            status: MessageStatus.RECALLED,
            externalMsgId: extMsgId
        });
        
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
        this.eventsGateway.emitMessageReacted(message.conversation.id, message.id, reactions);
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
            this.eventsGateway.emitMessageStatus(conversation.id, 'all', 'delivered');
            this.logger.log(`📬 Marked ${result.affected} messages as delivered in conv ${conversation.id}`);
        }
    }

    /**
     * Sync unread marks from Zalo periodic polling
     */
    async syncUnreadMarks(channelId: string, unreadExtUserIds: string[]): Promise<void> {
        // Find all conversations in this channel that currently have unreadCount > 0
        const unreadConvs = await this.convRepo.find({
            where: { channel: { id: channelId } },
            relations: ['contact']
        });

        const currentlyUnread = unreadConvs.filter(c => (c.unreadCount || 0) > 0);
        if (currentlyUnread.length === 0) return;

        // If a conversation is marked unread in Zeplao, but NOT in Zalo's unread list,
        // it means it was read on Zalo. We should clear the badge!
        for (const conv of currentlyUnread) {
            const extId = conv.contact.externalUserId;
            // Zalo Group IDs are sometimes prefixed with g_ or just numbers
            const isUnreadOnZalo = unreadExtUserIds.some(id => id === extId || id === `g_${extId}` || `g_${id}` === extId);
            
            if (!isUnreadOnZalo) {
                conv.unreadCount = 0;
                await this.convRepo.save(conv);
                this.eventsGateway.emitConversationUpdated({ id: conv.id, unreadCount: 0 });
                this.logger.log(`🔄 Sync: Cleared unreadCount for conv ${conv.id} because it was read on Zalo`);
            }
        }
    }
}

