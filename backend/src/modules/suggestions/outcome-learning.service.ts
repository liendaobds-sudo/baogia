/**
 * Outcome Learning Service
 * Analyzes won vs lost conversations to extract winning patterns.
 *
 * Instead of generic few-shot examples, this service:
 * 1. Queries conversations with outcome data (won/lost)
 * 2. Extracts patterns from successful conversations
 * 3. Injects these patterns into the AI prompt as "proven strategies"
 *
 * This is the core of Phase 2 — AI learns from REAL results, not just edits.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { resolveLearningIntents } from './intents';

interface OutcomeInsight {
    winRate: number;
    totalWon: number;
    totalLost: number;
    avgWonMessages: number;
    avgLostMessages: number;
    topWonIntents: string[];
    topLostIntents: string[];
    avgResponseTimeWon: number;
    wonPatterns: string[];     // Human-readable insight strings
}

// Cache insights to avoid recalculating on every request
const INSIGHTS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class OutcomeLearningService {
    private readonly logger = new Logger(OutcomeLearningService.name);
    // Cache theo TENANT — trước đây 1 cache toàn cục trộn số liệu won/lost mọi tenant.
    private insightsCache = new Map<number, { insights: OutcomeInsight | null; cachedAt: number }>();

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
    ) {}

    /**
     * Build outcome-based learning context for the AI prompt.
     * Returns a string to inject into the system/user prompt.
     */
    async buildOutcomeContext(currentIntent?: string, currentProduct?: string, tenantId?: number | null): Promise<string> {
        // CÔ LẬP TENANT (fail-closed): win-rate/pattern tính trên hội thoại thật —
        // thiếu tenant thì bỏ qua, không tổng hợp chéo tenant.
        if (tenantId == null) {
            this.logger.debug('Bỏ qua outcome context: thiếu tenantId (fail-closed)');
            return '';
        }
        const insights = await this.getInsights(tenantId);
        if (!insights || insights.totalWon + insights.totalLost < 3) {
            return ''; // Not enough data to learn from
        }

        let context = '\n\n## HỌC TỪ KẾT QUẢ THỰC TẾ\n';
        context += `Dựa trên ${insights.totalWon + insights.totalLost} cuộc hội thoại đã kết thúc `;
        context += `(${insights.totalWon} chốt đơn, ${insights.totalLost} mất khách, tỷ lệ thắng ${(insights.winRate * 100).toFixed(0)}%):\n\n`;

        // Pattern insights
        if (insights.wonPatterns.length > 0) {
            context += '📊 CÁC MẪU DẪN ĐẾN CHỐT ĐƠN:\n';
            for (const pattern of insights.wonPatterns) {
                context += `• ${pattern}\n`;
            }
            context += '\n';
        }

        // Timing insight
        if (insights.avgResponseTimeWon > 0) {
            const minutes = Math.round(insights.avgResponseTimeWon / 60000);
            context += `⏱️ Thời gian phản hồi trung bình khi chốt đơn: ${minutes} phút\n`;
        }

        // Message count insight
        if (insights.avgWonMessages > 0) {
            context += `💬 Cuộc hội thoại chốt đơn trung bình: ${Math.round(insights.avgWonMessages)} tin nhắn\n`;
            if (insights.avgLostMessages > 0) {
                context += `💬 Cuộc hội thoại mất khách trung bình: ${Math.round(insights.avgLostMessages)} tin nhắn (dài hơn = khách thiếu thông tin)\n`;
            }
        }

        // Intent-specific advice.
        // Audit 2026-08-29: `currentIntent` từng nhận topic runtime (`'objection'`) trong khi
        // `topWonIntents/topLostIntents` dựng từ `outcomeData.intentChain` = intent CANONICAL
        // ⇒ hai nhánh dưới KHÔNG BAO GIỜ chạy. Nay quy topic → tập intent canonical trước khi so.
        const learningIntents = resolveLearningIntents(currentIntent);
        const matchedWon = learningIntents.find((i) => insights.topWonIntents.includes(i));
        const matchedLost = learningIntents.find((i) => insights.topLostIntents.includes(i));
        if (matchedWon) {
            context += `\n✅ Intent "${matchedWon}" có tỷ lệ chốt cao — tự tin trả lời chi tiết.\n`;
        }
        if (matchedLost) {
            context += `\n⚠️ Intent "${matchedLost}" có tỷ lệ mất khách cao — cần nhấn mạnh giá trị, ưu đãi, và hỗ trợ thêm.\n`;
        }
        context += '\n→ Áp dụng các mẫu thành công ở trên vào câu trả lời.\n';
        return context;
    }

    /**
     * Get aggregated outcome insights (cached theo tenant)
     */
    async getInsights(tenantId: number): Promise<OutcomeInsight | null> {
        const cached = this.insightsCache.get(tenantId);
        if (cached && Date.now() - cached.cachedAt < INSIGHTS_CACHE_TTL_MS) {
            return cached.insights;
        }

        try {
            const insights = await this.computeInsights(tenantId);
            this.insightsCache.set(tenantId, { insights, cachedAt: Date.now() });
            return insights;
        } catch (err) {
            this.logger.warn(`⚠️ Outcome insights computation failed: ${(err as Error).message}`);
            return null;
        }
    }

    private async computeInsights(tenantId: number): Promise<OutcomeInsight> {
        // Load won and lost conversations with outcome data (chỉ trong tenant hiện hành)
        const wonConvs = await this.convRepo.find({
            where: { status: ConversationStatus.WON, tenantId },
            select: ['id', 'outcomeData', 'productType', 'createdAt', 'closedAt'],
            order: { closedAt: 'DESC' },
            take: 50,
        });

        const lostConvs = await this.convRepo.find({
            where: { status: ConversationStatus.LOST, tenantId },
            select: ['id', 'outcomeData', 'productType', 'createdAt', 'closedAt'],
            order: { closedAt: 'DESC' },
            take: 50,
        });

        const totalWon = wonConvs.length;
        const totalLost = lostConvs.length;
        const winRate = (totalWon + totalLost) > 0 ? totalWon / (totalWon + totalLost) : 0;

        // Average message counts
        const wonWithData = wonConvs.filter(c => c.outcomeData?.totalMessages);
        const lostWithData = lostConvs.filter(c => c.outcomeData?.totalMessages);

        const avgWonMessages = wonWithData.length > 0
            ? wonWithData.reduce((sum, c) => sum + (c.outcomeData.totalMessages || 0), 0) / wonWithData.length
            : 0;

        const avgLostMessages = lostWithData.length > 0
            ? lostWithData.reduce((sum, c) => sum + (c.outcomeData.totalMessages || 0), 0) / lostWithData.length
            : 0;

        // Average first response time for won conversations
        const wonWithTiming = wonWithData.filter(c => c.outcomeData.firstResponseTimeMs && c.outcomeData.firstResponseTimeMs > 0);
        const avgResponseTimeWon = wonWithTiming.length > 0
            ? wonWithTiming.reduce((sum, c) => sum + (c.outcomeData.firstResponseTimeMs || 0), 0) / wonWithTiming.length
            : 0;

        // Intent analysis
        const wonIntentCounts = new Map<string, number>();
        const lostIntentCounts = new Map<string, number>();

        for (const conv of wonWithData) {
            for (const intent of conv.outcomeData.intentChain || []) {
                wonIntentCounts.set(intent, (wonIntentCounts.get(intent) || 0) + 1);
            }
        }
        for (const conv of lostWithData) {
            for (const intent of conv.outcomeData.intentChain || []) {
                lostIntentCounts.set(intent, (lostIntentCounts.get(intent) || 0) + 1);
            }
        }

        const topWonIntents = [...wonIntentCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([intent]) => intent);

        const topLostIntents = [...lostIntentCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([intent]) => intent);

        // Extract human-readable patterns
        const wonPatterns = this.extractWonPatterns({
            totalWon, totalLost, avgWonMessages, avgLostMessages,
            avgResponseTimeWon, wonWithData, lostWithData,
            wonIntentCounts, lostIntentCounts,
        });

        this.logger.log(`📊 Outcome insights: ${totalWon} won, ${totalLost} lost, ${wonPatterns.length} patterns extracted`);

        return {
            winRate, totalWon, totalLost,
            avgWonMessages, avgLostMessages,
            topWonIntents, topLostIntents,
            avgResponseTimeWon,
            wonPatterns,
        };
    }

    /**
     * Extract actionable patterns from outcome data
     */
    private extractWonPatterns(data: {
        totalWon: number;
        totalLost: number;
        avgWonMessages: number;
        avgLostMessages: number;
        avgResponseTimeWon: number;
        wonWithData: Conversation[];
        lostWithData: Conversation[];
        wonIntentCounts: Map<string, number>;
        lostIntentCounts: Map<string, number>;
    }): string[] {
        const patterns: string[] = [];

        // Pattern 1: Quick response = more wins
        if (data.avgResponseTimeWon > 0 && data.avgResponseTimeWon < 5 * 60 * 1000) {
            patterns.push('Phản hồi nhanh (dưới 5 phút) có tỷ lệ chốt đơn cao hơn');
        }

        // Pattern 2: Shorter conversations win more
        if (data.avgWonMessages > 0 && data.avgLostMessages > 0 && data.avgWonMessages < data.avgLostMessages) {
            patterns.push(`Hội thoại chốt đơn ngắn hơn (~${Math.round(data.avgWonMessages)} tin) — trả lời đầy đủ từ đầu, tránh để khách hỏi lại nhiều lần`);
        }

        // Pattern 3: AI suggestion acceptance in won conversations
        const wonAcceptRate = data.wonWithData.length > 0
            ? data.wonWithData.filter(c =>
                (c.outcomeData.aiSuggestionsAccepted || 0) > 0
            ).length / data.wonWithData.length
            : 0;

        if (wonAcceptRate > 0.5) {
            patterns.push(`${(wonAcceptRate * 100).toFixed(0)}% cuộc hội thoại chốt đơn sử dụng gợi ý AI — gợi ý đang phù hợp`);
        }

        // Pattern 4: Product type analysis
        const wonProducts = new Map<string, number>();
        for (const conv of data.wonWithData) {
            const pt = conv.outcomeData.productType || conv.productType;
            if (pt) wonProducts.set(pt, (wonProducts.get(pt) || 0) + 1);
        }
        const topProduct = [...wonProducts.entries()].sort((a, b) => b[1] - a[1])[0];
        if (topProduct && topProduct[1] >= 3) {
            patterns.push(`Sản phẩm "${topProduct[0]}" chốt đơn nhiều nhất (${topProduct[1]} đơn)`);
        }

        // Pattern 5: Quote accuracy
        const wonWithQuote = data.wonWithData.filter(c => (c.outcomeData.quotedAmount || 0) > 0);
        if (wonWithQuote.length >= 2) {
            patterns.push(`${wonWithQuote.length}/${data.wonWithData.length} đơn thắng có báo giá — khách thích nhận giá cụ thể sớm`);
        }

        // Pattern 6: Edited suggestions in lost conversations
        const lostEditRate = data.lostWithData.length > 0
            ? data.lostWithData.filter(c =>
                (c.outcomeData.aiSuggestionsEdited || 0) > (c.outcomeData.aiSuggestionsAccepted || 0)
            ).length / data.lostWithData.length
            : 0;

        if (lostEditRate > 0.5) {
            patterns.push('Cuộc hội thoại mất khách thường phải sửa nhiều gợi ý AI — cần cải thiện chất lượng gợi ý');
        }

        return patterns;
    }
}
