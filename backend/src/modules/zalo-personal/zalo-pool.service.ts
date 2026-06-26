import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZaloAccount, ZaloAccountStatus } from '../../entities/zalo-account.entity';
import { ZaloRateLimiterService } from './zalo-rate-limiter.service';
import { ZaloMessageSender } from './zalo-message-sender.service';
import { ZaloCrmFeatures } from './zalo-crm-features.service';
import { parseZaloMessageContent, isZaloReactionCode } from './zalo-message-parser';
import { ModuleRef } from '@nestjs/core';
import { MessageProcessorService } from '../messages/message-processor.service';
import { EventsGateway } from '../gateway/events.gateway';

/**
 * ZaloPoolService — Singleton that manages live Zalo SDK (zca-js) instances.
 * Handles QR login, session reconnect, message listener lifecycle,
 * and credential persistence to the database.
 *
 * Ported from ZaloCRM's zalo-pool.ts + zalo-listener-factory.ts
 *
 * NOTE: zca-js must be installed separately (npm i zca-js).
 * This service gracefully degrades if zca-js is not available.
 */

interface ZaloInstance {
    zalo: any;
    api: any;
    status: 'connected' | 'disconnected' | 'qr_pending' | 'connecting';
    displayName?: string;
    zaloUid?: string;
    lastActivity: Date;
    recentEvents: any[];
}

@Injectable()
export class ZaloPoolService implements OnModuleInit {
    private readonly logger = new Logger(ZaloPoolService.name);
    private instances = new Map<string, ZaloInstance>();
    private ZaloSDK: any = null; // lazy-loaded zca-js
    private socketServer: any = null; // injected Socket.IO server

    // Debounce sync: chống chạy lại syncMissedMessages quá dày (mỗi reconnect lại sync
    // → dội API Zalo → bị ngắt phiên → reconnect → sync... vòng lặp làm sập circuit breaker).
    private lastSyncAt = new Map<string, number>();
    private static readonly SYNC_MIN_INTERVAL_MS = 2 * 60_000; // tối thiểu 2 phút giữa 2 lần sync


    // Circuit breaker: track disconnect timestamps per account
    private disconnectHistory = new Map<string, number[]>();
    
    // Echo cancellation for outbound messages sent from Zeplao Inbox
    private recentOutboundEchoes = new Set<string>();

    private avatarCache = new Map<string, string>(); // Cache avatar URLs
    private groupNameCache = new Map<string, string>(); // Cache real group names
    private userNameCache = new Map<string, string>(); // Cache real user names
    private unreadPollingIntervals = new Map<string, NodeJS.Timeout>(); // Periodic unread sync
    private readonly sender: ZaloMessageSender;
    private readonly crm: ZaloCrmFeatures;

    constructor(
        @InjectRepository(ZaloAccount)
        private readonly repo: Repository<ZaloAccount>,
        private readonly rateLimiter: ZaloRateLimiterService,
        private readonly moduleRef: ModuleRef,
        private readonly eventsGateway: EventsGateway,
    ) {
        this.sender = new ZaloMessageSender(rateLimiter, this.recentOutboundEchoes);
        this.crm = new ZaloCrmFeatures();
    }

    async onModuleInit(): Promise<void> {
        // Try to load zca-js — gracefully fail if not installed
        try {
            // @ts-ignore — zca-js is an optional peer dependency, may not be installed
            const zcaJs = await import('zca-js');
            this.ZaloSDK = zcaJs.Zalo || zcaJs.default?.Zalo;
            this.logger.log('✅ zca-js loaded — Zalo personal accounts ready');
            
            // Auto Resume existing connected sessions sequentially
            setTimeout(() => this.resumeAllSessions(), 3000);
        } catch {
            this.logger.warn('⚠️ zca-js not installed — Zalo personal account features disabled.');
        }
    }

    /** Set Socket.IO server for emitting events to frontends */
    setSocketServer(server: any): void {
        // No longer needed as we resolve dynamically
    }

    /** Check if zca-js is available */
    isAvailable(): boolean {
        return !!this.ZaloSDK;
    }
    
    // ═══════════════════════ AUTO RESUME ═══════════════════════
    
    private async resumeAllSessions(): Promise<void> {
        this.logger.log('🔄 Đang tự động khôi phục các phiên Zalo đã kết nối...');
        const accounts = await this.repo.find({ where: { status: ZaloAccountStatus.CONNECTED } });
        if (!accounts || accounts.length === 0) return;
        
        for (const account of accounts) {
            if (account.sessionData) {
                this.logger.log(`[zalo:${account.id}] Khôi phục bằng sessionData cũ...`);
                // FIX OOM: Await sequentially and add 2s delay between accounts
                await this.reconnect(account.id, account.sessionData).catch(err => {
                    this.logger.error(`[zalo:${account.id}] Lỗi khôi phục tự động: ${err.message}`);
                });
                await new Promise(r => setTimeout(r, 2000));
            } else {
                this.updateAccountDB(account.id, ZaloAccountStatus.DISCONNECTED, null);
            }
        }
    }

    // ═══════════════════════ LOGIN ENDPOINTS ═══════════════════════

    /**
     * Initiate QR-based login for a Zalo account.
     * Emits QR events to frontend via Socket.IO.
     */
    async loginQR(accountId: string): Promise<void> {
        if (!this.ZaloSDK) {
            throw new Error('zca-js chưa được cài đặt. Chạy: npm i zca-js');
        }

        const zalo = new this.ZaloSDK({ 
            logging: false, 
            selfListen: true,
            imageMetadataGetter: async (filePath: string) => {
                const fs = require('fs');
                let size = 0;
                try { size = fs.statSync(filePath).size; } catch(e) {}
                return { width: 800, height: 800, size };
            }
        });
        this.instances.set(accountId, {
            zalo,
            api: null,
            status: 'qr_pending',
            lastActivity: new Date(),
            recentEvents: [],
        });

        try {
            this.logger.log(`[zalo:${accountId}] Bắt đầu lấy QR...`);
            const api = await zalo.loginQR({}, (event: any) => {
                this.logger.log(`[zalo:${accountId}] Event QR: type=${event.type}`);
                switch (event.type) {
                    case 0: // QRCodeGenerated
                        this.logger.log(`[zalo:${accountId}] Phát sự kiện zalo:qr`);
                        this.emit(`account:${accountId}`, 'zalo:qr', {
                            accountId,
                            qrImage: event.data?.image,
                        });
                        break;
                    case 1: // QRCodeExpired
                        this.logger.log(`[zalo:${accountId}] Mã QR đã hết hạn`);
                        this.emit(`account:${accountId}`, 'zalo:qr-expired', { accountId });
                        event.actions?.retry();
                        break;
                    case 2: // QRCodeScanned
                        this.logger.log(`[zalo:${accountId}] Mã QR đã được quét`);
                        this.emit(`account:${accountId}`, 'zalo:scanned', {
                            accountId,
                            displayName: event.data?.display_name,
                            avatar: event.data?.avatar,
                        });
                        break;
                    case 4: // GotLoginInfo — save credentials
                        this.logger.log(`[zalo:${accountId}] Nhận info phiên đăng nhập`);
                        this.saveCredentials(accountId, {
                            cookie: event.data?.cookie,
                            imei: event.data?.imei,
                            userAgent: event.data?.userAgent,
                        });
                        break;
                }
            });

            const instance = this.instances.get(accountId)!;
            instance.api = api;
            instance.status = 'connected';
            instance.lastActivity = new Date();

            const ownId = await api.getOwnId();
            instance.zaloUid = ownId;

            // Fetch profile info
            await this.fetchAndSaveProfile(accountId, api, ownId);

            this.attachListener(accountId, api);
            this.emitBroadcast('zalo:connected', { accountId, zaloUid: ownId });
            await this.updateAccountDB(accountId, ZaloAccountStatus.CONNECTED, ownId);

            // Start periodic unread polling (every 60s) to sync read status from Zalo phone
            this.startUnreadPolling(accountId, api);

            this.logger.log(`✅ Zalo account ${accountId} connected as ${ownId}`);
        } catch (err) {
            const instance = this.instances.get(accountId);
            if (instance) instance.status = 'disconnected';
            this.emitBroadcast('zalo:error', { accountId, error: String(err) });
            throw err;
        }
    }

    // ═══════════════════════ RECONNECT ═══════════════════════

    /**
     * Reconnect using previously saved session credentials.
     */
    async reconnect(accountId: string, credentials: any): Promise<void> {
        if (!this.ZaloSDK) return;

        const zalo = new this.ZaloSDK({ 
            logging: false, 
            selfListen: true,
            imageMetadataGetter: async (filePath: string) => {
                const fs = require('fs');
                let size = 0;
                try { size = fs.statSync(filePath).size; } catch(e) {}
                return { width: 800, height: 800, size };
            }
        });
        this.instances.set(accountId, {
            zalo,
            api: null,
            status: 'connecting',
            lastActivity: new Date(),
            recentEvents: [],
        });

        try {
            const api = await zalo.login({
                cookie: credentials.cookie,
                imei: credentials.imei,
                userAgent: credentials.userAgent,
            });

            const instance = this.instances.get(accountId)!;
            instance.api = api;
            instance.status = 'connected';
            instance.lastActivity = new Date();

            const ownId = await api.getOwnId();
            instance.zaloUid = ownId;

            await this.fetchAndSaveProfile(accountId, api, ownId);
            this.attachListener(accountId, api);
            await this.updateAccountDB(accountId, ZaloAccountStatus.CONNECTED, ownId);
            this.emitBroadcast('zalo:connected', { accountId, zaloUid: ownId });

            this.logger.log(`✅ Zalo account ${accountId} reconnected`);

            // Non-blocking: Sync missed messages in background after reconnect.
            // Hoãn 8s để phiên WS ổn định trước khi gọi loạt API (tránh bị Zalo ngắt ngay).
            setTimeout(() => {
                this.syncMissedMessages(accountId, api, ownId).catch(err => {
                    this.logger.warn(`[zalo:${accountId}] syncMissedMessages failed: ${err.message}`);
                });
            }, 8000);

            // Start periodic unread polling (every 60s) to sync read status from Zalo phone
            this.startUnreadPolling(accountId, api);
        } catch (err) {
            const instance = this.instances.get(accountId);
            if (instance) instance.status = 'disconnected';
            await this.updateAccountDB(accountId, ZaloAccountStatus.QR_PENDING, null);
            this.emitBroadcast('zalo:reconnect-failed', {
                accountId,
                error: String(err),
            });
        }
    }

    // ═══════════════════════ UNDO (RECALL) — delegated ═══════════════════════

    async undoMessage(accountId: string, threadId: string, msgId: string, cliMsgId: string): Promise<{ success: boolean; error?: string }> {
        const instance = this.instances.get(accountId);
        return this.sender.undoMessage(instance?.api, accountId, threadId, msgId, cliMsgId);
    }

    // ═══════════════════════ REACTION — delegated ═══════════════════════

    async sendReaction(accountId: string, threadId: string, externalMsgId: string, unicodeIcon: string): Promise<any> {
        const api = this.getApi(accountId);
        return this.sender.sendReaction(api, accountId, threadId, externalMsgId, unicodeIcon);
    }

    // ═══════════════════════ LISTENER ═══════════════════════

    /**
     * Attach zca-js listener events for incoming messages.
     * Includes circuit breaker for unstable connections.
     */
    private attachListener(accountId: string, api: any): void {
        const listener = api.listener;

        listener.on('connected', () => {
            this.logger.log(`[zalo:${accountId}] Listener connected`);
        });

        listener.on('message', async (message: any) => {
            try {
                // Feature: Store raw message for debugging missing inbox UI
                const instance = this.instances.get(accountId);
                if (instance) {
                    instance.recentEvents.unshift({ event: 'message', time: new Date(), payload: message });
                    if (instance.recentEvents.length > 20) instance.recentEvents.pop();
                }

                // Ignore specific event types that are handled by dedicated listeners
                const msgType = message.data?.msgType;
                if (msgType === 'chat.reaction' || msgType === 'chat.undo') {
                    return; // Ignore, handled by 'reaction' and 'undo' listeners
                }

                const senderUid = String(message.data?.uidFrom || '');
                const senderName = message.data?.dName || '';
                const rawContent = message.data?.content;

                // Filter Zalo internal reaction/emoticon codes
                if (isZaloReactionCode(rawContent)) {
                    this.logger.debug(`[zalo:${accountId}] Filtered reaction code: "${String(rawContent).trim()}"`);
                    return;
                }

                // Parse content using extracted helper
                const parsed = parseZaloMessageContent(rawContent);
                let content = parsed.content;
                let parsedAttachments = parsed.attachments;

                // Async sticker URL resolution (can't be done in pure parser)
                if (typeof rawContent === 'object' && rawContent !== null && rawContent.id && typeof rawContent.catId !== 'undefined') {
                    try {
                        const apiRef = this.instances.get(accountId)?.api;
                        if (apiRef) {
                            const stickers = await apiRef.getStickersDetail(Number(rawContent.id));
                            if (stickers && stickers.length > 0) {
                                const st = stickers[0];
                                const sUrl = st.stickerUrl || st.stickerSpriteUrl || st.stickerWebpUrl || '';
                                if (sUrl) {
                                    parsedAttachments.push({ type: 'sticker', url: sUrl, name: 'Sticker' });
                                    this.logger.log(`🎭 Sticker resolved: id=${rawContent.id} → ${sUrl}`);
                                }
                            }
                        }
                    } catch (err) {
                        this.logger.error('Error fetching sticker URL:', err);
                    }
                }

                const ownZaloUid = instance?.zaloUid || '';
                
                // MẬT ĐỊCH: ZCA-JS có thể nhận uidFrom là "0" HOẶC là uid thật của chính chúng ta.
                const isSelf = message.isSelf || senderUid === "0" || senderUid === ownZaloUid;

                // 1. Emit to frontend via Socket.IO for basic raw monitoring
                this.emitBroadcast('zalo:message', {
                    accountId,
                    senderUid,
                    senderName,
                    content,
                    isSelf,
                    threadId: message.threadId || '',
                    msgId: String(message.data?.msgId || ''),
                    timestamp: parseInt(message.data?.ts || String(Date.now())),
                });

                // 2. Integration with Core AI/Inbox Pipeline
                const account = await this.repo.findOne({ where: { id: accountId } });
                if (account && account.channelId) {
                    // Echo Cancellation: If this is an agent's self-message but originated from Zeplao Inbox, skip it.
                    let shouldProcess = true;
                    if (isSelf) {
                        // FIX: targetUid must be used because senderUid is OUR id when isSelf=true
                        const targetUid = String(message.threadId || message.data?.groupId || message.data?.uidTo || '');
                        const msgId = String(message.data?.msgId || '');

                        const exactEchoKey = msgId ? `${accountId}_msg_${msgId}` : 'NO_ID_KEY';
                        const fallbackEchoKey = `${accountId}_${targetUid}_${content.substring(0, 50)}_${content.length}`;

                        if (this.recentOutboundEchoes.has(exactEchoKey) || this.recentOutboundEchoes.has(fallbackEchoKey)) {
                            shouldProcess = false;
                        }
                    }

                    if (shouldProcess) {
                        const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
                        const threadId = String(message.threadId || message.data?.groupId || '');
                        // Correctly identify group chats using zca-js message type (1 = GroupMessage)
                        const isGroupChat = message.type === 1 || message.constructor?.name === 'GroupMessage' || !!message.data?.groupId || threadId.startsWith('g_');
                        
                        let finalExternalUserId = senderUid;
                        if (isGroupChat) {
                            const groupId = message.data?.groupId || threadId;
                            finalExternalUserId = `g_${String(groupId).replace('g_', '')}`;
                        } else if (isSelf) {
                            // CỰC KỲ QUAN TRỌNG: Lấy đúng ID của người đối diện, không phải id của mình!
                            // Trong zca-js data, idTo / uidTo có thể chứa ID người nhận.
                            finalExternalUserId = String(message.data?.idTo || message.data?.uidTo || threadId);
                            // Cứu cánh: nếu threadId đang là id của chính mình do lỗi parser, thì sẽ sai lệch
                            if (finalExternalUserId === ownZaloUid || finalExternalUserId === "0") {
                                finalExternalUserId = threadId; // fallback
                            }
                        }

                        let finalSenderName = senderName || (isSelf ? 'Bạn' : 'Khách Zalo');
                        // CRITICAL: contactName drives the conversation display name.
                        // When isSelf=true, we must NOT set contactName to our own name,
                        // otherwise the contact's displayName gets overwritten with the owner's name.
                        let finalContactName = isSelf ? null : finalSenderName;
                        let finalText = content;
                        let finalSenderAvatar = this.avatarCache.get(senderUid) || '';

                        // Tên nhóm: CHỈ dùng cache (KHÔNG gọi mạng trên đường tới hạn → tránh trễ nhận tin).
                        if (isGroupChat) {
                            const groupIdRaw = finalExternalUserId.replace('g_', '');
                            const cachedGroupName = this.groupNameCache.get(groupIdRaw);
                            finalContactName = cachedGroupName || message.data?.groupName || message.groupName || 'Nhóm Zalo';
                            finalSenderName = senderName || 'Thành viên';
                        }

                        // Tên người gửi: dùng cache nếu có
                        const cachedUserName = this.userNameCache.get(senderUid);
                        if (cachedUserName && finalSenderName === 'Khách Zalo') {
                            finalSenderName = cachedUserName;
                            if (!isSelf) finalContactName = cachedUserName;
                        }

                        // Xác định cần phân giải profile (tên/avatar còn thiếu) — sẽ làm ở NỀN, không chặn.
                        const targetUidForProfile = isGroupChat ? senderUid : (isSelf ? finalExternalUserId : senderUid);
                        let needProfileFetch = false;
                        if (isGroupChat) {
                            if (!this.groupNameCache.get(finalExternalUserId.replace('g_', ''))) needProfileFetch = true;
                        } else if (!finalContactName || finalContactName === 'Khách Zalo' || !finalSenderAvatar || finalSenderName === 'Khách Zalo') {
                            needProfileFetch = true;
                        }

                        const parsedMessage: any = {
                            externalMessageId: String(message.data?.msgId || Date.now()),
                            externalUserId: finalExternalUserId,
                            senderName: finalSenderName,
                            contactName: finalContactName,
                            senderAvatar: finalSenderAvatar,
                            timestamp: new Date(parseInt(message.data?.ts || String(Date.now()))),
                            text: finalText,
                            rawPayload: message,
                            attachments: parsedAttachments,
                            isSelf: isSelf,
                        };
                        // Hiển thị tin NGAY (không chờ gọi API lấy tên/avatar)
                        await processor.processInbound(account.channelId, parsedMessage);

                        // TĂNG TỐC NHẬN: phân giải tên/avatar ở NỀN rồi cập nhật + emit (không chặn hiển thị)
                        if (needProfileFetch && targetUidForProfile && targetUidForProfile !== '0' && targetUidForProfile !== ownZaloUid) {
                            this.resolveProfileInBackground(accountId, account.channelId, {
                                isGroupChat, externalUserId: finalExternalUserId, senderUid, targetUidForProfile,
                            }).catch(() => {});
                        }
                    }
                }
            } catch (err) {
                this.logger.error(
                    `[zalo:${accountId}] Message handler error:`,
                    err,
                );
            }
        });


        listener.on('undo', async (data: any) => {
            this.logger.log(`⏪ [zalo:${accountId}] Undo event received: ${JSON.stringify(data?.data || data).substring(0, 500)}`);
            
            // The original message ID can be in multiple places:
            // - data.data.content.globalMsgId (the original msg's global ID)
            // - data.data.realMsgId (real message ID)  
            // - data.data.msgId (sometimes this IS the original msg ID)
            // - data.data.content.cliMsgId (client-side msg ID)
            const undoData = data.data || data;
            const contentData = typeof undoData.content === 'object' ? undoData.content : {};
            
            // Try all possible original message IDs
            const candidates = [
                String(contentData.globalMsgId || ''),
                String(undoData.realMsgId || ''),
                String(undoData.msgId || ''),
                String(contentData.cliMsgId || ''),
            ].filter(id => id && id !== '0' && id !== 'undefined' && id !== 'null');
            
            this.logger.log(`⏪ [zalo:${accountId}] Undo candidate IDs: ${JSON.stringify(candidates)}`);
            
            if (candidates.length > 0) {
                this.emitBroadcast('zalo:message-deleted', {
                    accountId,
                    msgId: candidates[0],
                });
                
                const account = await this.repo.findOne({ where: { id: accountId } });
                if (account && account.channelId) {
                    const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
                    // Try each candidate until one matches
                    for (const candidateId of candidates) {
                        this.logger.log(`⏪ [zalo:${accountId}] Trying undo with ID: ${candidateId}`);
                        await processor.processUndoEvent(account.channelId, candidateId);
                    }
                }
            } else {
                this.logger.warn(`⏪ [zalo:${accountId}] Undo event but no msgId found in: ${JSON.stringify(data).substring(0, 500)}`);
            }
        });

        listener.on('seen_messages', async (messages: any[]) => {
            if (!messages || messages.length === 0) return;
            const account = await this.repo.findOne({ where: { id: accountId } });
            if (!account || !account.channelId) return;

            const instance = this.instances.get(accountId);
            const ownZaloUid = instance?.zaloUid || '';

            const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
            for (const msg of messages) {
                const senderUid = String(msg.data?.uidFrom || '');
                const isSelf = senderUid === ownZaloUid || senderUid === '0';
                
                let extUserId = msg.data?.groupId ? `g_${String(msg.data.groupId).replace('g_', '')}` : String(msg.data?.idTo || '');
                if (!isSelf && !msg.data?.groupId) {
                    extUserId = senderUid;
                }

                if (extUserId && msg.data?.msgId) {
                    await processor.processSeenEvent(account.channelId, extUserId, String(msg.data.msgId), isSelf);
                }
            }
        });



        listener.on('typing', async (typing: any) => {
            const account = await this.repo.findOne({ where: { id: accountId } });
            if (!account || !account.channelId) return;

            const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
            const extUserId = typing.data?.groupId ? `g_${String(typing.data.groupId).replace('g_', '')}` : String(typing.data?.uidFrom || '');
            if (extUserId) {
                await processor.processTypingEvent(account.channelId, extUserId, typing.data?.isTyping !== 0);
            }
        });

        // ── Reaction Event ──
        listener.on('reaction', async (reaction: any) => {
            try {
                const data = reaction.data || reaction;
                const msgId = String(data.content?.rMsg?.[0]?.gMsgID || data.msgId || '');
                const icon = String(data.content?.rIcon || '');
                const senderId = String(data.uidFrom || '');
                const threadId = reaction.threadId || '';
                const isGroup = reaction.isGroup || false;

                if (!msgId || !icon) return;

                this.logger.log(`💬 [zalo:${accountId}] Reaction: ${icon} on msg ${msgId} from ${senderId}`);

                const account = await this.repo.findOne({ where: { id: accountId } });
                if (!account?.channelId) return;

                const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
                await processor.processReactionEvent(account.channelId, msgId, icon, senderId);
            } catch (err: any) {
                this.logger.warn(`[zalo:${accountId}] Reaction handler error: ${err.message}`);
            }
        });

        // ── Delivered Messages Event ──
        listener.on('delivered_messages', async (messages: any[]) => {
            try {
                if (!messages || messages.length === 0) return;
                const account = await this.repo.findOne({ where: { id: accountId } });
                if (!account?.channelId) return;

                const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
                for (const msg of messages) {
                    const extUserId = msg.data?.groupId
                        ? `g_${String(msg.data.groupId).replace('g_', '')}`
                        : String(msg.data?.idTo || msg.data?.uidFrom || '');
                    if (extUserId) {
                        await processor.processDeliveredEvent(account.channelId, extUserId);
                    }
                }
            } catch (err: any) {
                this.logger.warn(`[zalo:${accountId}] Delivered handler error: ${err.message}`);
            }
        });

        // ── Seen Messages Event (Read Receipts) ──
        listener.on('seen_messages', async (messages: any[]) => {
            try {
                if (!messages || messages.length === 0) return;
                const account = await this.repo.findOne({ where: { id: accountId } });
                if (!account?.channelId) return;

                const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
                for (const msg of messages) {
                    // UserSeenMessage: { data: { idTo, msgId }, threadId }
                    // GroupSeenMessage: { data: { groupId, msgId, seenUids }, threadId }
                    const extUserId = msg.threadId
                        ? (msg.type === 1 ? `g_${String(msg.threadId).replace('g_', '')}` : String(msg.threadId))
                        : String(msg.data?.idTo || msg.data?.groupId || '');
                    const msgId = String(msg.data?.msgId || '');

                    if (extUserId) {
                        this.logger.log(`👁️ [zalo:${accountId}] Seen event: user=${extUserId} msgId=${msgId}`);
                        await processor.processSeenEvent(account.channelId, extUserId, msgId);
                    }
                }
            } catch (err: any) {
                this.logger.warn(`[zalo:${accountId}] Seen handler error: ${err.message}`);
            }
        });

        // ── Friend Event ──
        listener.on('friend_event', async (event: any) => {
            try {
                const type = event.type || 'unknown';
                const data = event.data;
                this.logger.log(`👤 [zalo:${accountId}] Friend event: ${type}`);

                const account = await this.repo.findOne({ where: { id: accountId } });
                if (!account?.channelId) return;

                // friend ADD → new contact notification
                if (type === 'add' || type === 0) {
                    const friendUid = typeof data === 'string' ? data : (data?.fromUid || data?.toUid || '');
                    if (friendUid) {
                        // Cache the new friend's info
                        try {
                            const instance = this.instances.get(accountId);
                            if (instance?.api) {
                                const userInfo = await instance.api.getUserInfo(friendUid);
                                const profile = userInfo?.changed_profiles?.[friendUid] || userInfo?.changed_profiles?.[`${friendUid}_0`];
                                if (profile) {
                                    this.userNameCache.set(friendUid, profile.zaloName || profile.displayName || '');
                                    if (profile.avatar) this.avatarCache.set(friendUid, profile.avatar);
                                }
                            }
                        } catch(e) {}

                        this.emitBroadcast('zalo:friend-added', {
                            accountId,
                            friendUid,
                            friendName: this.userNameCache.get(friendUid) || 'Khách mới',
                        });
                    }
                }

                // friend REQUEST → notification
                if (type === 'request' || type === 2) {
                    const reqData = data as any;
                    this.emitBroadcast('zalo:friend-request', {
                        accountId,
                        fromUid: reqData?.fromUid || '',
                        message: reqData?.message || '',
                    });
                }

                // friend REMOVE → warning
                if (type === 'remove' || type === 1) {
                    const removedUid = typeof data === 'string' ? data : '';
                    this.emitBroadcast('zalo:friend-removed', {
                        accountId,
                        friendUid: removedUid,
                        friendName: this.userNameCache.get(removedUid) || 'Không rõ',
                    });
                }
            } catch (err: any) {
                this.logger.warn(`[zalo:${accountId}] Friend event error: ${err.message}`);
            }
        });

        // ── Group Event ──
        listener.on('group_event', async (event: any) => {
            try {
                const type = event.type || 'unknown';
                const data = event.data || {};
                const groupId = event.threadId || data.groupId || '';
                this.logger.log(`👥 [zalo:${accountId}] Group event: ${type} in ${groupId}`);

                // Update group name cache on group updates
                if (data.groupName && groupId) {
                    this.groupNameCache.set(String(groupId).replace('g_', ''), data.groupName);
                }

                // JOIN / JOIN_REQUEST → notify
                if (type === 'join' || type === 'join_request') {
                    const members = data.updateMembers || [];
                    this.emitBroadcast('zalo:group-event', {
                        accountId,
                        type,
                        groupId,
                        groupName: data.groupName || this.groupNameCache.get(String(groupId).replace('g_', '')) || 'Nhóm Zalo',
                        members: members.map((m: any) => ({ uid: m.id, name: m.dName, avatar: m.avatar })),
                    });
                }

                // LEAVE / REMOVE_MEMBER
                if (type === 'leave' || type === 'remove_member') {
                    const members = data.updateMembers || [];
                    this.emitBroadcast('zalo:group-event', {
                        accountId,
                        type,
                        groupId,
                        groupName: data.groupName || '',
                        members: members.map((m: any) => ({ uid: m.id, name: m.dName })),
                    });
                }

                // Generic broadcast for all other events
                if (!['join', 'join_request', 'leave', 'remove_member'].includes(type)) {
                    this.emitBroadcast('zalo:group-event', { accountId, type, groupId, groupName: data.groupName || '' });
                }
            } catch (err: any) {
                this.logger.warn(`[zalo:${accountId}] Group event error: ${err.message}`);
            }
        });

        listener.on('closed', (code: number, reason: string) => {
            this.logger.warn(
                `[zalo:${accountId}] Listener closed: ${code} ${reason}`,
            );
            this.handleDisconnect(accountId);
        });

        listener.on('error', (err: any) => {
            this.logger.error(`[zalo:${accountId}] Listener error:`, err);
        });

        listener.start({ retryOnClose: true });
    }

    /**
     * Handle disconnect with circuit breaker pattern.
     * If >5 disconnects in 5 min → stop auto-reconnect, require QR re-login.
     */
    private handleDisconnect(accountId: string): void {
        const inst = this.instances.get(accountId);
        if (inst) inst.status = 'disconnected';
        this.updateAccountDB(accountId, ZaloAccountStatus.DISCONNECTED, null);
        this.emitBroadcast('zalo:disconnected', { accountId });

        // Circuit breaker logic
        const now = Date.now();
        const key = `dc_${accountId}`;
        const history = (this.disconnectHistory.get(key) || []).filter(
            (t) => now - t < 5 * 60_000,
        );
        history.push(now);
        this.disconnectHistory.set(key, history);

        if (history.length >= 5) {
            // >5 disconnects in 5 min → STOP reconnecting
            this.logger.error(
                `[zalo:${accountId}] ⛔ Circuit breaker: ${history.length} disconnects in 5 min — QR re-login required`,
            );
            this.updateAccountDB(accountId, ZaloAccountStatus.QR_PENDING, null);
            this.emitBroadcast('zalo:reconnect-failed', {
                accountId,
                error: 'Session không ổn định, cần đăng nhập QR lại',
            });
            this.disconnectHistory.delete(key);
            return; // DON'T reconnect
        }

        // Normal auto-reconnect after 30 seconds
        this.logger.log(
            `[zalo:${accountId}] Auto-reconnect in 30s...`,
        );
        setTimeout(() => this.autoReconnect(accountId), 30_000);
    }

    // ═══════════════════════ AUTO-RECONNECT ═══════════════════════

    private async autoReconnect(accountId: string): Promise<void> {
        const inst = this.instances.get(accountId);
        if (inst?.status === 'connected') return; // Already recovered

        try {
            const account = await this.repo.findOne({
                where: { id: accountId },
                select: ['id', 'sessionData'],
            });
            const session = account?.sessionData;
            if (session && (session as any)?.imei) {
                this.logger.log(`[zalo:${accountId}] Auto-reconnecting...`);
                await this.reconnect(accountId, session);
            } else {
                this.logger.warn(
                    `[zalo:${accountId}] No saved session, cannot auto-reconnect`,
                );
            }
        } catch (err) {
            this.logger.error(`[zalo:${accountId}] Auto-reconnect failed:`, err);
            // Retry in 2 minutes
            setTimeout(() => this.autoReconnect(accountId), 120_000);
        }
    }

    // ═══════════════════════ SYNC MISSED MESSAGES ═══════════════════════

    /**
     * Sync messages that were missed while the system was offline.
     * Called automatically after reconnect.
     *
     * Strategy:
     * 1. Fetch recent conversations (friends + groups)
     * 2. For each, fetch recent message history from Zalo
     * 3. Feed each message through processInbound (auto-deduplication via idempotencyKey)
     */
    async syncMissedMessages(accountId: string, api?: any, ownZaloUid?: string, force = false): Promise<{ synced: number; skipped: number }> {
        this.logger.log(`🔄 [zalo:${accountId}] Starting missed message sync...`);

        // Debounce: bỏ qua nếu vừa sync gần đây (trừ khi force = sync thủ công).
        // Ngăn vòng lặp reconnect→sync→ngắt phiên→reconnect dội API liên tục lên Zalo.
        if (!force) {
            const last = this.lastSyncAt.get(accountId) || 0;
            const since = Date.now() - last;
            if (since < ZaloPoolService.SYNC_MIN_INTERVAL_MS) {
                this.logger.log(`[zalo:${accountId}] ⏭️ Bỏ qua sync (vừa chạy ${Math.round(since / 1000)}s trước, tối thiểu ${ZaloPoolService.SYNC_MIN_INTERVAL_MS / 1000}s).`);
                return { synced: 0, skipped: 0 };
            }
        }
        this.lastSyncAt.set(accountId, Date.now());

        // Auto-resolve api/ownZaloUid from live instance if not provided
        if (!api || !ownZaloUid) {
            const instance = this.instances.get(accountId);
            if (!instance || !instance.api || instance.status !== 'connected') {
                this.logger.warn(`[zalo:${accountId}] Not connected, cannot sync`);
                return { synced: 0, skipped: 0 };
            }
            api = instance.api;
            ownZaloUid = instance.zaloUid || '';
        }

        const account = await this.repo.findOne({ where: { id: accountId } });
        if (!account?.channelId) {
            this.logger.warn(`[zalo:${accountId}] No channelId, skipping sync`);
            return { synced: 0, skipped: 0 };
        }

        const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
        let totalSynced = 0;
        let totalSkipped = 0;

        const syncLog = (msg: string) => this.logger.log(msg);

        // ── 1. Sync Group Conversations ──
        try {
            const groupsResult = await api.getAllGroups();
            const groups: any[] = groupsResult?.gridVerMap
                ? Object.keys(groupsResult.gridVerMap)
                : (Array.isArray(groupsResult) ? groupsResult : []);

            this.logger.log(`[zalo:${accountId}] Found ${groups.length} groups to sync`);

            for (const groupId of groups.slice(0, 10)) { // Limit to 10 most recent groups (nhẹ tải Zalo)
                try {
                    const history = await api.getGroupChatHistory(String(groupId), 15);
                    const msgs = history?.groupMsgs || [];
                    if (msgs.length === 0) continue;

                    let groupName = this.groupNameCache.get(String(groupId));
                    if (!groupName) {
                        try {
                            const groupInfo = await api.getGroupInfo(String(groupId));
                            const info = groupInfo?.gridInfoMap?.[String(groupId)];
                            if (info?.name) {
                                groupName = info.name;
                                this.groupNameCache.set(String(groupId), info.name);
                            }
                        } catch (e) {}
                    }

                    for (const msg of msgs) {
                        try {
                            const data = msg.data || msg;
                            const msgId = String(data.msgId || data.globalMsgId || '');
                            if (!msgId) continue;

                            const senderUid = String(data.uidFrom || data.userId || '');
                            const isSelf = senderUid === ownZaloUid;
                            const senderName = data.dName || this.userNameCache.get(senderUid) || (isSelf ? 'Bạn' : 'Thành viên');
                            const content = typeof data.content === 'string' ? data.content : (data.content?.msg || data.content?.title || '');
                            const ts = data.ts ? new Date(parseInt(String(data.ts))) : new Date();

                            const parsedMessage: any = {
                                externalMessageId: msgId,
                                externalUserId: `g_${groupId}`,
                                senderName: senderName,
                                contactName: groupName || 'Nhóm Zalo',
                                senderAvatar: this.avatarCache.get(senderUid) || '',
                                timestamp: ts,
                                text: content,
                                rawPayload: data,
                                attachments: [],
                                isSelf: isSelf,
                                isBackfill: true, // Đồng bộ lịch sử — không bắn live/AI/SLA
                            };

                            const isNew = await processor.processInbound(account.channelId, parsedMessage);
                            if (isNew) totalSynced++;
                            else totalSkipped++;
                        } catch (e) {
                            totalSkipped++;
                        }
                    }

                    // Gentle delay between groups to avoid rate limiting
                    await new Promise(r => setTimeout(r, 700));
                } catch (e: any) {
                    this.logger.debug(`[zalo:${accountId}] Group ${groupId} history fetch failed: ${e.message}`);
                }
            }
        } catch (e: any) {
            this.logger.warn(`[zalo:${accountId}] Group sync error: ${e.message}`);
        }

        // ── 2. Sync 1-on-1 Messages via WebSocket (like Zalo PC sync) ──
        // Uses listener.requestOldMessages() which sends WS cmd 510 to fetch missed personal messages.
        // This is the same mechanism Zalo PC uses to sync with the phone.
        try {
            const instance = this.instances.get(accountId);
            const wsListener = instance?.api?.listener;

            if (wsListener && typeof wsListener.requestOldMessages === 'function') {
                syncLog(`[zalo:${accountId}] 🔄 Requesting old personal messages via WebSocket (Zalo sync)...`);

                // Collect messages from the 'old_messages' event
                const collectedMsgs: any[] = [];
                const msgPromise = new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => {
                        wsListener.removeListener('old_messages', handler);
                        resolve();
                    }, 10000); // Wait max 10 seconds for response

                    const handler = (messages: any[], threadType: any) => {
                        // ThreadType.User = 0 or 'User'
                        for (const msg of messages) {
                            collectedMsgs.push({ msg, threadType });
                        }
                        clearTimeout(timeout);
                        // Give a small window for additional batches
                        setTimeout(() => {
                            wsListener.removeListener('old_messages', handler);
                            resolve();
                        }, 2000);
                    };
                    wsListener.on('old_messages', handler);
                });

                // Send the request for User old messages
                wsListener.requestOldMessages(0); // ThreadType.User = 0

                // Wait for response
                await msgPromise;

                syncLog(`[zalo:${accountId}] 📬 Received ${collectedMsgs.length} old personal messages from Zalo`);

                // Process collected messages
                for (const { msg } of collectedMsgs) {
                    try {
                        const msgData = msg.data || msg;
                        const msgId = String(msgData.msgId || msgData.globalMsgId || '');
                        if (!msgId) continue;

                        const senderUid = String(msgData.uidFrom || msgData.userId || '');
                        const isSelf = senderUid === ownZaloUid;
                        const threadId = String(msgData.idTo || msgData.toUid || msgData.uidFrom || '');
                        const friendUid = isSelf ? threadId : senderUid;
                        const friendName = this.userNameCache.get(friendUid) || msgData.dName || 'Khách Zalo';
                        const senderName = isSelf ? 'Bạn' : (msgData.dName || friendName);

                        const rawContent = msgData.content;
                        const content = typeof rawContent === 'string' ? rawContent : (rawContent?.msg || rawContent?.title || '');
                        const ts = msgData.ts ? new Date(parseInt(String(msgData.ts))) : new Date();

                        const parsedMessage: any = {
                            externalMessageId: msgId,
                            externalUserId: friendUid,
                            senderName: senderName,
                            contactName: isSelf ? null : friendName,
                            senderAvatar: this.avatarCache.get(senderUid) || '',
                            timestamp: ts,
                            text: content,
                            rawPayload: msgData,
                            attachments: [],
                            isSelf: isSelf,
                            isBackfill: true, // Đồng bộ lịch sử — không bắn live/AI/SLA
                        };

                        const isNew = await processor.processInbound(account.channelId, parsedMessage);
                        if (isNew) totalSynced++;
                        else totalSkipped++;
                    } catch (e) {
                        totalSkipped++;
                    }
                }
            } else {
                syncLog(`[zalo:${accountId}] ⚠️ No active WebSocket listener, skipping personal message sync`);
            }

            // Also cache friend names/avatars for display
            const friendsResult = await api.getAllFriends();
            let friends: any[] = [];
            if (friendsResult?.data && Array.isArray(friendsResult.data)) {
                friends = friendsResult.data;
            } else if (Array.isArray(friendsResult)) {
                friends = friendsResult;
            } else if (friendsResult?.changed_friends) {
                friends = Object.values(friendsResult.changed_friends);
            }

            for (const friend of friends) {
                const uid = String(friend.userId || friend.uid || '');
                const name = friend.displayName || friend.zaloName || friend.zalo_name || '';
                if (uid && name) this.userNameCache.set(uid, name);
                if (uid && friend.avatar) this.avatarCache.set(uid, friend.avatar);
            }
            syncLog(`[zalo:${accountId}] Cached ${friends.length} friend names/avatars`);
        } catch (e: any) {
            this.logger.warn(`[zalo:${accountId}] Personal message sync error: ${e.message}`);
        }

        this.logger.log(`✅ [zalo:${accountId}] Sync complete: ${totalSynced} messages synced, ${totalSkipped} skipped (dedup or errors)`);


        // ── Post-Sync: Reconcile unread counts using Zalo's actual unread list ──
        try {
            const unreadResult = await api.getUnreadMark();
            const unreadData = unreadResult?.data || unreadResult;
            const unreadUserIds: string[] = (unreadData?.convsUser || []).map((u: any) => String(u.id || u.fromUid || ''));
            const unreadGroupIds: string[] = (unreadData?.convsGroup || []).map((g: any) => `g_${String(g.id || g.fromUid || '').replace('g_', '')}`);
            const allUnreadExtIds = new Set([...unreadUserIds, ...unreadGroupIds]);

            this.logger.log(`[zalo:${accountId}] Zalo unread: ${unreadUserIds.length} users, ${unreadGroupIds.length} groups`);

            // Get all conversations with unread > 0 in our DB
            const convRepo = processor['convRepo'];
            const conversations = await convRepo.find({
                where: { channel: { id: account.channelId } },
                relations: ['contact'],
            });

            let cleared = 0;
            for (const conv of conversations) {
                if ((conv.unreadCount || 0) === 0) continue;
                const extId = conv.contact?.externalUserId || '';
                
                // If Zalo says this conversation is NOT unread, clear the badge
                if (!allUnreadExtIds.has(extId)) {
                    conv.unreadCount = 0;
                    await convRepo.save(conv);
                    try { this.eventsGateway.emitConversationUpdated({ id: conv.id, unreadCount: 0 }); } catch(e) {}
                    cleared++;
                }
            }
            if (cleared > 0) {
                this.logger.log(`✅ [zalo:${accountId}] Cleared ${cleared} phantom unread badges via Zalo unread sync`);
            }
        } catch (e: any) {
            this.logger.warn(`[zalo:${accountId}] Post-sync unread reconciliation error: ${e.message}`);
        }

        return { synced: totalSynced, skipped: totalSkipped };
    }

    // ═══════════════════════ UNREAD POLLING ═══════════════════════

    /**
     * Periodically poll Zalo's getUnreadMark API to sync read status.
     * When user reads messages on Zalo phone, this clears the badge in CRM.
     */
    private startUnreadPolling(accountId: string, api: any): void {
        // Clear any existing interval
        const existing = this.unreadPollingIntervals.get(accountId);
        if (existing) clearInterval(existing);

        const pollFn = async () => {
            try {
                const account = await this.repo.findOne({ where: { id: accountId } });
                if (!account?.channelId) return;

                const unreadResult = await api.getUnreadMark();
                const unreadData = unreadResult?.data || unreadResult;
                const unreadUserIds: string[] = (unreadData?.convsUser || []).map((u: any) => String(u.id || u.fromUid || ''));
                const unreadGroupIds: string[] = (unreadData?.convsGroup || []).map((g: any) => `g_${String(g.id || g.fromUid || '').replace('g_', '')}`);
                const allUnreadExtIds = new Set([...unreadUserIds, ...unreadGroupIds]);

                const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
                await processor.syncUnreadMarks(account.channelId, Array.from(allUnreadExtIds));
            } catch (e: any) {
                this.logger.warn(`[zalo:${accountId}] Unread poll error: ${e.message}`);
            }
        };

        // Poll every 15 seconds (reduced from 60s for faster sync, but kept reasonable to avoid rate limits)
        const interval = setInterval(pollFn, 15_000);
        this.unreadPollingIntervals.set(accountId, interval);

        // Run once immediately after a short delay
        setTimeout(pollFn, 5000);
        this.logger.log(`📊 [zalo:${accountId}] Started unread polling (every 15s)`);
    }

    // ═══════════════════════ SEND MESSAGE — delegated ═══════════════════════

    async sendMessage(
        accountId: string,
        recipientUid: string,
        content: string | any,
    ): Promise<{ success: boolean; error?: string, messageId?: string, cliMsgId?: string }> {
        const api = this.getApi(accountId);
        const instance = this.instances.get(accountId);
        return this.sender.sendMessage(accountId, recipientUid, content, api, instance?.zaloUid || '');
    }

    // ═══════════════════════ HELPERS ═══════════════════════

    disconnect(accountId: string): void {
        const instance = this.instances.get(accountId);
        if (instance?.api?.listener) {
            try {
                instance.api.listener.stop();
            } catch (err) {
                this.logger.warn(`Error stopping listener for ${accountId}:`, err);
            }
        }
        this.instances.delete(accountId);
    }

    getStatus(accountId: string): string {
        return this.instances.get(accountId)?.status ?? 'disconnected';
    }

    getAllStatuses(): Record<string, any> {
        const statuses: Record<string, any> = {};
        for (const [id, inst] of this.instances) {
            statuses[id] = { status: inst.status, recentEvents: inst.recentEvents || [] };
        }
        return statuses;
    }

    async getAllAccounts(): Promise<any[]> {
        return this.repo.find();
    }

    getApi(accountId: string): any | null {
        const inst = this.instances.get(accountId);
        return inst?.status === 'connected' ? inst.api : null;
    }

    private saveCredentials(accountId: string, credentials: any): void {
        this.repo
            .update(accountId, { sessionData: credentials })
            .catch((err) =>
                this.logger.error(`saveCredentials error for ${accountId}:`, err),
            );
    }

    private async updateAccountDB(
        accountId: string,
        status: ZaloAccountStatus,
        zaloUid: string | null,
    ): Promise<void> {
        try {
            const data: any = { status };
            if (zaloUid !== null) data.zaloUid = zaloUid;
            if (status === ZaloAccountStatus.CONNECTED)
                data.lastConnectedAt = new Date();
            await this.repo.update(accountId, data);
        } catch (err) {
            this.logger.error(`updateAccountDB error for ${accountId}:`, err);
        }
    }

    private async fetchAndSaveProfile(
        accountId: string,
        api: any,
        ownId: string,
    ): Promise<void> {
        try {
            const userInfo = await api.getUserInfo(ownId);
            const profiles = userInfo?.changed_profiles || {};
            const profile = profiles[ownId] || profiles[`${ownId}_0`];
            if (profile?.avatar) {
                await this.repo.update(accountId, {
                    avatarUrl: profile.avatar,
                    displayName:
                        profile.zaloName ||
                        profile.zalo_name ||
                        profile.displayName ||
                        '',
                });
            }
        } catch {
            // Non-critical — profile fetch can fail
        }
    }

    /**
     * Phân giải tên/avatar ở NỀN (sau khi tin đã hiển thị) để tăng tốc nhận tin.
     * Gọi API Zalo, cập nhật cache + contact trong DB, rồi emit để FE đổi tên/avatar.
     */
    private async resolveProfileInBackground(
        accountId: string,
        channelId: string,
        p: { isGroupChat: boolean; externalUserId: string; senderUid: string; targetUidForProfile: string },
    ): Promise<void> {
        const api = this.instances.get(accountId)?.api;
        if (!api) return;
        const processor = this.moduleRef.get(MessageProcessorService, { strict: false });
        try {
            if (p.isGroupChat) {
                const groupIdRaw = p.externalUserId.replace('g_', '');
                if (!this.groupNameCache.get(groupIdRaw)) {
                    const groupInfo = await api.getGroupInfo(groupIdRaw);
                    const info = groupInfo?.gridInfoMap?.[groupIdRaw];
                    if (info?.name) {
                        this.groupNameCache.set(groupIdRaw, info.name);
                        await processor.updateContactProfile(channelId, p.externalUserId, { displayName: info.name });
                    }
                }
                return; // nhóm: chỉ cập nhật tên nhóm
            }

            const userInfo = await api.getUserInfo(p.targetUidForProfile);
            const profiles = userInfo?.changed_profiles ? (Object.values(userInfo.changed_profiles) as any[]) : [];
            if (!profiles.length) return;
            const profile = profiles[0];
            const fetchedName = profile?.displayName || profile?.zaloName || profile?.zalo_name;
            const avatar = (p.targetUidForProfile === p.senderUid) ? profile?.avatar : undefined;
            if (fetchedName) this.userNameCache.set(p.targetUidForProfile, fetchedName);
            if (avatar) this.avatarCache.set(p.senderUid, avatar);
            await processor.updateContactProfile(channelId, p.externalUserId, {
                displayName: fetchedName || undefined,
                avatarUrl: avatar || undefined,
            });
        } catch (e: any) {
            this.logger.warn(`[zalo:${accountId}] background profile resolve failed: ${e.message}`);
        }
    }

    private emit(room: string, event: string, data: any): void {
        try {
            this.eventsGateway.server?.to(room)?.emit(event, data);
        } catch (e) {
            this.logger.warn(`Failed to emit ${event} to ${room}: ${e.message}`);
        }
    }

    private emitBroadcast(event: string, data: any): void {
        try {
            this.eventsGateway.server?.emit(event, data);
        } catch (e) {
            this.logger.warn(`Failed to broadcast ${event}: ${e.message}`);
        }
    }

    // ═══════════════════════ CRM FEATURES — delegated ═══════════════════════

    /** Helper to get API with error check */
    private requireApi(accountId: string): any {
        const api = this.getApi(accountId);
        if (!api) throw new Error(`Account ${accountId} not connected`);
        return api;
    }

    async getAutoReplies(accountId: string): Promise<any> { return this.crm.getAutoReplies(this.requireApi(accountId), accountId); }
    async createAutoReply(accountId: string, payload: any): Promise<any> { return this.crm.createAutoReply(this.requireApi(accountId), accountId, payload); }
    async updateAutoReply(accountId: string, payload: any): Promise<any> { return this.crm.updateAutoReply(this.requireApi(accountId), accountId, payload); }
    async deleteAutoReply(accountId: string, replyId: number): Promise<any> { return this.crm.deleteAutoReply(this.requireApi(accountId), accountId, replyId); }
    async getLabels(accountId: string): Promise<any> { return this.crm.getLabels(this.requireApi(accountId), accountId); }
    async updateLabels(accountId: string, labelData: any[]): Promise<any> { return this.crm.updateLabels(this.requireApi(accountId), accountId, labelData); }
    async getQuickMessages(accountId: string): Promise<any> { return this.crm.getQuickMessages(this.requireApi(accountId), accountId); }
    async addQuickMessage(accountId: string, payload: any): Promise<any> { return this.crm.addQuickMessage(this.requireApi(accountId), accountId, payload); }
    async updateQuickMessage(accountId: string, payload: any): Promise<any> { return this.crm.updateQuickMessage(this.requireApi(accountId), accountId, payload); }
    async removeQuickMessage(accountId: string, messageId: string): Promise<any> { return this.crm.removeQuickMessage(this.requireApi(accountId), accountId, messageId); }

    // ── Rich Message Sending — delegated ──

    async sendLinkMsg(accountId: string, threadId: string, link: string, msg?: string, isGroup?: boolean): Promise<any> {
        return this.sender.sendLinkMsg(this.requireApi(accountId), threadId, link, msg, isGroup);
    }
    async sendBankCard(accountId: string, threadId: string, bankInfo: { binBank: string; numAccBank: string; nameAccBank?: string; }, isGroup?: boolean): Promise<any> {
        return this.sender.sendBankCard(this.requireApi(accountId), threadId, bankInfo, isGroup);
    }
    async sendContactCard(accountId: string, threadId: string, contactUserId: string, isGroup?: boolean): Promise<any> {
        return this.sender.sendContactCard(this.requireApi(accountId), threadId, contactUserId, isGroup);
    }

    // ── Contact & Friends — delegated ──

    async findUserByPhone(accountId: string, phone: string): Promise<any> { return this.crm.findUserByPhone(this.requireApi(accountId), accountId, phone); }
    async acceptFriendRequest(accountId: string, userId: string): Promise<any> { return this.crm.acceptFriendRequest(this.requireApi(accountId), accountId, userId); }
    async sendFriendRequest(accountId: string, userId: string, message?: string): Promise<any> { return this.crm.sendFriendRequest(this.requireApi(accountId), accountId, userId, message); }
}