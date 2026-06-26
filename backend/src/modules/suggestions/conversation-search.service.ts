/**
 * Conversation Search Service
 * Finds similar past conversations that were "won" (successfully closed).
 *
 * When a customer asks about namecard printing, this service finds
 * 2-3 past conversations about namecard that ended in a deal,
 * then extracts the winning reply patterns for the AI to reference.
 *
 * This is the "experienced colleague" pattern — instead of guessing,
 * the AI sees how successful conversations actually went.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { AiSuggestion, SuggestionStatus } from '../../entities/ai-suggestion.entity';

interface SimilarConversation {
    conversationId: string;
    productType: string;
    summary: string;
    totalMessages: number;
    winningReply: string;      // The reply text that was accepted/sent and led to win
    intentChain: string[];
    quotedAmount?: number;
    similarity: number;        // 0-1 score
}

@Injectable()
export class ConversationSearchService {
    private readonly logger = new Logger(ConversationSearchService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(AiSuggestion) private suggestRepo: Repository<AiSuggestion>,
    ) {}

    /**
     * Find similar won conversations and build context for the AI prompt.
     *
     * @param currentProduct - Detected product type (e.g. "namecard", "decal")
     * @param currentCustomerText - Current customer message text
     * @param currentIntent - Detected intent
     * @returns Prompt context string with winning conversation examples
     */
    async buildSimilarConversationContext(
        currentProduct?: string,
        currentCustomerText?: string,
        currentIntent?: string,
    ): Promise<string> {
        const similar = await this.findSimilarWon(currentProduct, currentCustomerText, currentIntent);
        if (similar.length === 0) return '';

        let context = '\n\n## THAM KHẢO TỪ CUỘC HỘI THOẠI ĐÃ CHỐT ĐƠN\n';
        context += `Dưới đây là ${similar.length} cuộc hội thoại THÀNH CÔNG tương tự trước đây:\n\n`;

        for (let i = 0; i < similar.length; i++) {
            const conv = similar[i];
            context += `### Ví dụ ${i + 1}`;
            if (conv.productType) context += ` (${conv.productType})`;
            context += `:\n`;

            if (conv.summary) {
                context += `Tóm tắt: ${conv.summary.substring(0, 300)}\n`;
            }

            if (conv.winningReply) {
                context += `Câu trả lời dẫn đến chốt đơn:\n"${conv.winningReply.substring(0, 400)}"\n`;
            }

            if (conv.quotedAmount) {
                context += `Giá đã báo: ${conv.quotedAmount.toLocaleString('vi-VN')}đ\n`;
            }

            context += '\n';
        }

        context += '→ Tham khảo phong cách và nội dung các ví dụ trên, NHƯNG phải điều chỉnh cho phù hợp với khách hàng hiện tại.\n';
        return context;
    }

    /**
     * Search for similar won conversations using keyword + product matching.
     */
    private async findSimilarWon(
        product?: string,
        customerText?: string,
        intent?: string,
        limit = 3,
    ): Promise<SimilarConversation[]> {
        // Build query for won conversations
        const qb = this.convRepo.createQueryBuilder('c')
            .where('c.status = :status', { status: ConversationStatus.WON })
            .andWhere('c.ai_summary IS NOT NULL')
            .orderBy('c.closed_at', 'DESC')
            .take(30); // Load candidate pool

        // Filter by product type if available
        if (product) {
            qb.andWhere('c.product_type = :product', { product });
        }

        const candidates = await qb.getMany();
        if (candidates.length === 0) return [];

        // Score candidates by similarity
        const scored = candidates.map(conv => {
            let score = 0;

            // Product match (strongest signal)
            if (product && conv.productType === product) score += 0.5;

            // Intent chain match
            const convIntents = conv.outcomeData?.intentChain || [];
            if (intent && convIntents.includes(intent)) score += 0.3;

            // Keyword overlap between customer text and summary
            if (customerText && conv.aiSummary) {
                score += this.keywordOverlap(customerText, conv.aiSummary) * 0.2;
            }

            return { conv, score };
        });

        // Sort by score, take top N
        const topCandidates = scored
            .filter(s => s.score > 0.1)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        // Enrich with winning reply for each candidate
        const results: SimilarConversation[] = [];
        for (const { conv, score } of topCandidates) {
            const winningReply = await this.extractWinningReply(conv.id);

            results.push({
                conversationId: conv.id,
                productType: conv.productType || '',
                summary: conv.aiSummary || '',
                totalMessages: conv.outcomeData?.totalMessages || 0,
                winningReply,
                intentChain: conv.outcomeData?.intentChain || [],
                quotedAmount: conv.outcomeData?.quotedAmount,
                similarity: score,
            });
        }

        if (results.length > 0) {
            this.logger.log(`🔍 Found ${results.length} similar won conversations for product="${product}" intent="${intent}"`);
        }

        return results;
    }

    /**
     * Extract the "winning reply" — the agent's reply that led to the deal.
     * Strategy: find the last accepted/sent AI suggestion, or the last agent message.
     */
    private async extractWinningReply(conversationId: string): Promise<string> {
        // Strategy 1: Find the last accepted AI suggestion
        const acceptedSuggestion = await this.suggestRepo.findOne({
            where: {
                conversationId,
                status: SuggestionStatus.SENT,
            },
            order: { createdAt: 'DESC' },
            select: ['replies', 'editedText', 'usedReplyIndex'],
        });

        if (acceptedSuggestion) {
            // Prefer edited text (agent polished it before sending)
            if (acceptedSuggestion.editedText) return acceptedSuggestion.editedText;
            // Otherwise use the original accepted reply
            const idx = acceptedSuggestion.usedReplyIndex || 0;
            return acceptedSuggestion.replies?.[idx]?.text || acceptedSuggestion.replies?.[0]?.text || '';
        }

        // Strategy 2: Fallback — get the last agent message before closing
        const lastAgentMsg = await this.msgRepo.findOne({
            where: { conversationId, senderType: 'agent' as any },
            order: { createdAt: 'DESC' },
            select: ['content'],
        });

        return lastAgentMsg?.content || '';
    }

    /**
     * Simple keyword overlap scoring between two texts.
     * Returns 0-1 similarity score.
     */
    private keywordOverlap(textA: string, textB: string): number {
        const stopWords = new Set(['của', 'và', 'là', 'cho', 'với', 'các', 'có', 'được', 'trong', 'không',
            'một', 'này', 'những', 'để', 'theo', 'về', 'từ', 'đến', 'tại', 'bạn',
            'em', 'anh', 'chị', 'tôi', 'rất', 'đã', 'đang', 'sẽ']);

        const tokenize = (text: string) => new Set(
            text.toLowerCase().split(/[\s,;.!?]+/)
                .filter(w => w.length > 1 && !stopWords.has(w))
        );

        const wordsA = tokenize(textA);
        const wordsB = tokenize(textB);

        if (wordsA.size === 0 || wordsB.size === 0) return 0;

        const intersection = [...wordsA].filter(w => wordsB.has(w));
        return intersection.length / Math.min(wordsA.size, wordsB.size);
    }
}
