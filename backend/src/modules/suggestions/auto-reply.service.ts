import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationPriority } from '../../entities/conversation.entity';

const AUTO_REPLY_INTENTS = ['chào_hỏi', 'cảm_ơn', 'tạm_biệt', 'xác_nhận', 'q&a_template'];
const AUTO_REPLY_MIN_CONFIDENCE = 0.8;
const AUTO_REPLY_MAX_PER_HOUR = 3;
const AUTO_REPLY_TRACKER_MAX_SIZE = 500;

@Injectable()
export class AutoReplyService {
    private readonly logger = new Logger(AutoReplyService.name);
    private autoReplyTracker = new Map<string, number[]>();
    
    // Pattern: UsageSummary token budgeting (claw-code pattern)
    private tokenBudgetTracker = new Map<string, { date: string; count: number }>();
    private readonly MAX_DAILY_TOKENS_PER_CONV = 100000; // 100k tokens per chat/day

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    ) { }

    async handleSentimentEscalation(conversationId: string, sentiment: number, result: any): Promise<void> {
        this.logger.warn(`😡 Low sentiment detected (${sentiment}/5) for conversation ${conversationId.substring(0, 8)}`);
        if (!result.warnings) result.warnings = [];
        result.warnings.push(`⚠️ Cảnh báo: Khách hàng có cảm xúc TIÊU CỰC (sentiment: ${sentiment}/5). Cần xử lý cẩn thận!`);

        try {
            const conv = await this.convRepo.findOne({ where: { id: conversationId } });
            if (conv) {
                conv.priority = ConversationPriority.URGENT;
                const metadata = (conv as any).metadata || {};
                metadata.sentimentAlert = new Date().toISOString();
                (conv as any).metadata = metadata;
                await this.convRepo.save(conv);
                this.logger.log(`🚨 Conversation ${conversationId.substring(0, 8)} escalated to URGENT`);
            }
        } catch (e: any) {
            this.logger.warn(`⚠️ Failed to escalate conversation: ${e.message}`);
        }
    }

    checkAutoReplyEligibility(
        conversationId: string,
        intent: string,
        confidence: number,
        hasPrice: boolean,
        usedModel: string,
        directCannedReply: any,
    ): boolean {
        // AI Spam Protection via Token Budgeting
        const today = new Date().toISOString().slice(0, 10);
        const budget = this.tokenBudgetTracker.get(conversationId);
        if (budget && budget.date === today && budget.count > this.MAX_DAILY_TOKENS_PER_CONV) {
            this.logger.warn(`🛑 Auto-reply blocked for ${conversationId} - Daily Token Budget Exceeded (${budget.count} tokens)`);
            return false;
        }

        const now = Date.now();
        const recentAutoReplies = (this.autoReplyTracker.get(conversationId) || []).filter(t => now - t < 3600_000);
        const rateLimitOk = recentAutoReplies.length < AUTO_REPLY_MAX_PER_HOUR;

        const eligible = rateLimitOk && (
            (directCannedReply?.autoReply) ||
            (AUTO_REPLY_INTENTS.includes(intent)
                && confidence >= AUTO_REPLY_MIN_CONFIDENCE
                && !hasPrice
                && usedModel !== 'template')
        ) || false;

        // LƯU Ý: KHÔNG ghi nhận lượt gửi ở đây. Việc đếm rate-limit chỉ xảy ra khi tin
        // ĐƯỢC GỬI THẬT (gọi recordAutoReplySent) — tránh đếm nhầm khi reply rỗng/gửi lỗi.
        return eligible;
    }

    /**
     * Ghi nhận một lượt auto-reply ĐÃ GỬI THÀNH CÔNG (dùng cho rate-limit theo giờ).
     * Tách khỏi checkAutoReplyEligibility để bộ đếm không tăng khi không thực sự gửi.
     */
    recordAutoReplySent(conversationId: string): void {
        const now = Date.now();
        const recentAutoReplies = (this.autoReplyTracker.get(conversationId) || []).filter(t => now - t < 3600_000);
        recentAutoReplies.push(now);
        // LRU: evict oldest if over max size (chỉ evict khi đây là key mới)
        if (this.autoReplyTracker.size >= AUTO_REPLY_TRACKER_MAX_SIZE && !this.autoReplyTracker.has(conversationId)) {
            const oldest = this.autoReplyTracker.keys().next().value;
            if (oldest) this.autoReplyTracker.delete(oldest);
        }
        this.autoReplyTracker.set(conversationId, recentAutoReplies);
    }

    cleanupTrackers(): number {
        const now = Date.now();
        let trackerEvicted = 0;
        for (const [key, timestamps] of this.autoReplyTracker) {
            const valid = timestamps.filter(t => now - t < 3600_000);
            if (valid.length === 0) {
                this.autoReplyTracker.delete(key);
                trackerEvicted++;
            } else {
                this.autoReplyTracker.set(key, valid);
            }
        }
        return trackerEvicted;
    }

    /**
     * Increment token usage for a conversation (UsageSummary Budgeting)
     */
    trackTokenUsage(conversationId: string, tokensUsed: number): void {
        if (!tokensUsed || tokensUsed <= 0) return;
        const today = new Date().toISOString().slice(0, 10);
        let budget = this.tokenBudgetTracker.get(conversationId);
        if (!budget || budget.date !== today) {
            budget = { date: today, count: 0 };
        }
        budget.count += tokensUsed;
        this.tokenBudgetTracker.set(conversationId, budget);
        
        // Evict LRU to avoid memory bloat
        if (this.tokenBudgetTracker.size > AUTO_REPLY_TRACKER_MAX_SIZE * 2) {
             const oldest = this.tokenBudgetTracker.keys().next().value;
             if (oldest) this.tokenBudgetTracker.delete(oldest);
        }
    }
}
