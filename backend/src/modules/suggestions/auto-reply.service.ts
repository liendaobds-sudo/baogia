import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationPriority } from '../../entities/conversation.entity';
import { AutomationConfig, loadAutomationConfig } from './automation-config';

const AUTO_REPLY_MAX_PER_HOUR = 3;
const AUTO_REPLY_TRACKER_MAX_SIZE = 500;
const AUTOMATION_CONFIG_CACHE_MS = 10_000;

/**
 * ⚠️ GIỚI HẠN ĐÃ BIẾT (audit 2026-08-29) — ghi ra đây để không thành bẫy ngầm:
 *
 * 1. **Rate-limit + token budget là bộ đếm TRONG PROCESS** (`Map` bên dưới). Chạy nhiều instance
 *    (PM2 cluster / nhiều replica) thì trần thực tế là `AUTO_REPLY_MAX_PER_HOUR × số instance`,
 *    vì mỗi process có bộ đếm riêng và không có sticky routing theo hội thoại.
 *    Chưa chuyển sang Redis vì `checkAutoReplyEligibility` là hàm ĐỒNG BỘ nằm trên đường
 *    auto-gửi; đổi sang async + counter phân tán là thay đổi có rủi ro cao (lỗi ở đây = spam
 *    khách hoặc im lặng không trả lời) nên tách thành việc riêng, làm cùng test đa-replica.
 *    Trong lúc chờ: chạy MỘT instance cho worker CSKH, hoặc hạ `AUTO_REPLY_MAX_PER_HOUR`.
 *
 * 2. **`automation-config.json` là cấu hình TOÀN CỤC**, chưa có chiều tenant — bật/tắt auto-reply
 *    hoặc đổi ngưỡng sẽ ảnh hưởng mọi tenant. Ghi/sửa chỉ dành cho `SUPER_ADMIN`. Việc gate theo
 *    app-scope CSKH của từng tenant thì ĐÃ có ở tầng ingest (`MessageProcessorService`).
 */
@Injectable()
export class AutoReplyService {
    private readonly logger = new Logger(AutoReplyService.name);
    private autoReplyTracker = new Map<string, number[]>();

    // Cache config automation (đọc file mỗi 10s — cùng pattern ai-provider)
    private automationConfigCache: { config: AutomationConfig; loadedAt: number } | null = null;

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

    /**
     * Cấu hình automation do admin lưu từ UI Settings (automation-config.json).
     * Cache 10s để không đọc file mỗi tin nhắn. testOnly_clearConfigCache() cho test.
     */
    getAutomationConfig(): AutomationConfig {
        const now = Date.now();
        if (this.automationConfigCache && now - this.automationConfigCache.loadedAt < AUTOMATION_CONFIG_CACHE_MS) {
            return this.automationConfigCache.config;
        }
        const config = loadAutomationConfig(parseInt(process.env.SLA_MINUTES || '10', 10));
        this.automationConfigCache = { config, loadedAt: now };
        return config;
    }

    testOnly_clearConfigCache(): void {
        this.automationConfigCache = null;
    }

    checkAutoReplyEligibility(
        conversationId: string,
        intent: string,
        confidence: number,
        hasPrice: boolean,
        usedModel: string,
        directCannedReply: any,
    ): boolean {
        // CÔNG TẮC TỔNG từ UI Settings — tắt là chặn MỌI auto-gửi,
        // kể cả canned response gắn cờ autoReply.
        const cfg = this.getAutomationConfig();
        if (!cfg.autoReplyEnabled) {
            this.logger.debug(`Auto-reply OFF theo automation-config — bỏ qua ${conversationId.substring(0, 8)}`);
            return false;
        }

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

        // `!hasPrice` áp cho CẢ HAI nhánh (audit 2026-08-29).
        //
        // Trước đây nhánh canned (`directCannedReply.autoReply`) bỏ qua mọi điều kiện, kể cả
        // `!hasPrice`. Hệ quả: câu trả lời mẫu có chứa giá vẫn được TỰ ĐỘNG gửi cho khách; và vì
        // `validateAiResult` đã gỡ số tiền không nguồn, khách nhận đúng chuỗi có "[giá]" —
        // vừa sai nghiệp vụ (báo giá phải do người xác nhận) vừa xấu về trải nghiệm.
        // Các điều kiện riêng của canned (confidence/intent/model) vẫn được miễn có chủ đích:
        // canned là câu do người soạn sẵn nên không cần LLM confidence.
        const eligible = rateLimitOk && !hasPrice && (
            (directCannedReply?.autoReply) ||
            (cfg.autoReplyIntents.includes(intent)
                && confidence >= cfg.autoReplyMinConfidence
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
