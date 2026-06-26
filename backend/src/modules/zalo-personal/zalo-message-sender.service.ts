import { Logger } from '@nestjs/common';
import { ZaloRateLimiterService } from './zalo-rate-limiter.service';

/**
 * ZaloMessageSender — Handles all outbound message operations.
 * Extracted from ZaloPoolService to reduce file size.
 * 
 * NOT an @Injectable service — created internally by ZaloPoolService
 * to avoid circular dependency and DI complexity.
 */
export class ZaloMessageSender {
    private readonly logger = new Logger('ZaloMessageSender');

    constructor(
        private readonly rateLimiter: ZaloRateLimiterService,
        private readonly recentOutboundEchoes: Set<string>,
    ) {}

    // ═══════════════════════ UNICODE → ZALO REACTION MAP ═══════════════════════

    mapUnicodeToZaloReaction(unicode: string): string | null {
        const reactionMap: Record<string, string> = {
            '👍': '/-strong',
            '❤️': '/-heart',
            '😆': ':>',
            '😮': ':o',
            '😢': ':-((',
            '😡': ':-h',
            'remove': '', // Cancel reaction
        };
        const val = reactionMap[unicode];
        return val !== undefined ? val : null;
    }

    // ═══════════════════════ SEND MESSAGE ═══════════════════════

    async sendMessage(
        accountId: string,
        recipientUid: string,
        content: string | any,
        api: any,
        zaloUid: string,
    ): Promise<{ success: boolean; error?: string; messageId?: string; cliMsgId?: string }> {
        // Check rate limits
        const limits = this.rateLimiter.checkLimits(accountId);
        if (!limits.allowed) {
            return { success: false, error: limits.reason };
        }

        if (!api) {
            return { success: false, error: 'Tài khoản chưa kết nối' };
        }

        try {
            // Fix quoting self-messages: Zalo API rejects quote.uidFrom = "0"
            if (typeof content === 'object' && content !== null && content.quote && content.quote.uidFrom === '0' && zaloUid) {
                content.quote.uidFrom = zaloUid;
            }

            const textContent = typeof content === 'string' ? content : (content?.msg || '');
            const delay = this.rateLimiter.getRandomDelay(textContent.length || 10);
            await new Promise((r) => setTimeout(r, delay));

            const cliMsgId = Date.now();

            // Echo cancellation: track before sending
            const fallbackEchoKey = `${accountId}_${recipientUid}_${textContent.substring(0, 50)}_${textContent.length}`;
            this.recentOutboundEchoes.add(fallbackEchoKey);
            setTimeout(() => this.recentOutboundEchoes.delete(fallbackEchoKey), 60000);

            // Infer ThreadType
            let threadType = 0;
            let targetId = recipientUid;
            if (recipientUid.startsWith('g_')) {
                threadType = 1;
                targetId = recipientUid.substring(2);
            } else if (recipientUid.startsWith('g')) {
                threadType = 1;
            }

            const response = await Promise.race([
                api.sendMessage(content, targetId, threadType),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Zalo sendMessage timeout after 30s')), 30000)),
            ]);

            this.logger.log(`📤 sendMessage response: ${JSON.stringify(response).substring(0, 300)}`);

            // Track exact message IDs for echo cancellation
            const extractMsgId = (r: any) => String(r?.error_data?.msg_id || r?.data?.msgId || r?.msgId || r?.msg_id || '');
            let msgIds: string[] = [];

            if (response?.message) {
                const mId = extractMsgId(response.message);
                if (mId) msgIds.push(mId);
            }
            if (response?.attachment && Array.isArray(response.attachment)) {
                for (const att of response.attachment) {
                    const mId = extractMsgId(att);
                    if (mId) msgIds.push(mId);
                }
            }
            if (msgIds.length === 0) {
                const mId = extractMsgId(response);
                if (mId) msgIds.push(mId);
            }

            for (const mId of msgIds) {
                if (mId) {
                    const exactEchoKey = `${accountId}_msg_${mId}`;
                    this.recentOutboundEchoes.add(exactEchoKey);
                    setTimeout(() => this.recentOutboundEchoes.delete(exactEchoKey), 60000);
                }
            }

            this.rateLimiter.recordSend(accountId);

            return { success: true, messageId: msgIds.length > 0 ? msgIds.join(',') : '', cliMsgId: String(cliMsgId) };
        } catch (err) {
            return { success: false, error: String(err) };
        }
    }

    // ═══════════════════════ UNDO (RECALL) ═══════════════════════

    async undoMessage(
        api: any,
        accountId: string,
        threadId: string,
        msgId: string,
        cliMsgId: string,
    ): Promise<{ success: boolean; error?: string }> {
        if (!api) {
            return { success: false, error: 'Tài khoản chưa kết nối' };
        }

        try {
            let threadType = 0;
            let _targetId = threadId;
            if (threadId.startsWith('g_')) {
                threadType = 1;
                _targetId = threadId.substring(2);
            } else if (threadId.startsWith('g')) {
                threadType = 1;
                _targetId = threadId.substring(1);
            }

            const msgIdsToRecall = msgId.split(',').map(m => m.trim()).filter(Boolean);
            const cliMsgIdsToRecall = (cliMsgId || msgId).split(',').map(m => m.trim()).filter(Boolean);

            for (let i = 0; i < msgIdsToRecall.length; i++) {
                const idToRecall = msgIdsToRecall[i];
                const cliToRecall = cliMsgIdsToRecall[i] || cliMsgIdsToRecall[0] || idToRecall;
                await api.undo(
                    { msgId: Number(idToRecall), cliMsgId: Number(cliToRecall) },
                    _targetId,
                    threadType
                );
            }

            return { success: true };
        } catch (err: any) {
            this.logger.error(`Failed to undo message ${msgId} in thread ${threadId}: ${err.message}`);
            return { success: false, error: String(err) };
        }
    }

    // ═══════════════════════ REACTION ═══════════════════════

    async sendReaction(api: any, accountId: string, threadId: string, externalMsgId: string, unicodeIcon: string): Promise<any> {
        if (!api) {
            throw new Error(`Zalo account ${accountId} is not connected or missing API wrapper.`);
        }

        const zaloReaction = this.mapUnicodeToZaloReaction(unicodeIcon);
        if (zaloReaction === null) {
            throw new Error(`Unsupported reaction icon: ${unicodeIcon}`);
        }

        try {
            let threadType = 0;
            let targetId = threadId;
            if (threadId.startsWith('g_')) {
                threadType = 1;
                targetId = threadId.substring(2);
            }

            this.logger.log(`🎭 Sending reaction ${unicodeIcon} → ${zaloReaction} to msg=${externalMsgId} thread=${targetId} type=${threadType}`);

            const dest = {
                data: { msgId: externalMsgId, cliMsgId: externalMsgId },
                threadId: targetId,
                type: threadType,
            };
            const result = await api.addReaction(zaloReaction, dest);
            this.logger.log(`🎭 Reaction sent successfully: ${JSON.stringify(result)}`);
            return result;
        } catch (error: any) {
            this.logger.error(`Failed to send reaction to thread ${threadId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    // ═══════════════════════ RICH MESSAGE SENDING ═══════════════════════

    async sendLinkMsg(api: any, threadId: string, link: string, msg?: string, isGroup?: boolean): Promise<any> {
        const ThreadType = isGroup ? 1 : 0;
        return api.sendLink({ link, msg: msg || '' }, threadId, ThreadType);
    }

    async sendBankCard(api: any, threadId: string, bankInfo: {
        binBank: string; numAccBank: string; nameAccBank?: string;
    }, isGroup?: boolean): Promise<any> {
        const ThreadType = isGroup ? 1 : 0;
        return api.sendBankCard(bankInfo, threadId, ThreadType);
    }

    async sendContactCard(api: any, threadId: string, contactUserId: string, isGroup?: boolean): Promise<any> {
        const ThreadType = isGroup ? 1 : 0;
        return api.sendCard({ userId: contactUserId }, threadId, ThreadType);
    }
}
