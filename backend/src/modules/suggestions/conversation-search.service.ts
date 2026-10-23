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
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { AiSuggestion, SuggestionStatus } from '../../entities/ai-suggestion.entity';
import { EmbeddingService } from '../knowledge-base/embedding.service';
import { resolveLearningIntents } from './intents';

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
        @InjectDataSource() private dataSource: DataSource,
        private embeddings: EmbeddingService,
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
        tenantId?: number | null,
    ): Promise<string> {
        // CÔ LẬP TENANT (fail-closed): ví dụ chốt đơn chứa giá đã báo + nội dung chat.
        // Không rõ tenant → KHÔNG trộn ví dụ (thà thiếu few-shot còn hơn lộ chéo tenant).
        if (tenantId == null) {
            this.logger.debug('Bỏ qua similar-won context: thiếu tenantId (fail-closed)');
            return '';
        }
        const similar = await this.findSimilarWon(currentProduct, currentCustomerText, currentIntent, tenantId);
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
        product: string | undefined,
        customerText: string | undefined,
        intent: string | undefined,
        tenantId: number,
        limit = 3,
    ): Promise<SimilarConversation[]> {
        // Postgres + pgvector → tìm nearest-neighbor ngữ nghĩa; các trường hợp khác → keyword.
        let candidates: Conversation[] | null = null;
        if (customerText && this.dataSource.options.type === 'postgres') {
            candidates = await this.findCandidatesByVector(product, customerText, tenantId);
        }

        // Fallback (SQLite/dev, thiếu vector, hoặc không có customerText): giữ nguyên keyword cũ.
        if (candidates === null) {
            const qb = this.convRepo.createQueryBuilder('c')
                .where('c.status = :status', { status: ConversationStatus.WON })
                .andWhere('c.ai_summary IS NOT NULL')
                // Lưới an toàn tầng app khi RLS chưa flip: chỉ học từ hội thoại CÙNG tenant.
                .andWhere('c.tenant_id = :tenantId', { tenantId })
                .orderBy('c.closed_at', 'DESC')
                .take(30);
            if (product) {
                qb.andWhere('c.product_type = :product', { product });
            }
            candidates = await qb.getMany();
        }

        if (candidates.length === 0) return [];

        // Boost product/intent làm secondary signal (vector đã lo phần ngữ nghĩa).
        const scored = candidates.map(conv => {
            let score = 0;
            if (product && conv.productType === product) score += 0.5;
            const convIntents = conv.outcomeData?.intentChain || [];
            // Audit 2026-08-29: `intent` có thể là TOPIC runtime ('objection'/'comparison'),
            // còn `intentChain` lưu intent CANONICAL ⇒ so trực tiếp không bao giờ khớp và boost
            // 0.3 này chết. Quy topic → tập intent canonical trước khi so.
            const learningIntents = resolveLearningIntents(intent);
            if (learningIntents.some((i) => convIntents.includes(i))) score += 0.3;
            // Tie-breaker keyword khi có (giữ hành vi cũ ở nhánh fallback).
            if (customerText && conv.aiSummary) {
                score += this.keywordOverlap(customerText, conv.aiSummary) * 0.2;
            }
            return { conv, score };
        });

        // Nhánh vector: ứng viên đã gần về ngữ nghĩa, giữ thứ tự NN, chỉ dùng boost để sắp lại.
        // Nhánh keyword: lọc ngưỡng như cũ.
        const topCandidates = scored
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
     * Tìm ứng viên WON gần nhất về ngữ nghĩa qua pgvector (toán tử cosine `<=>`).
     * Trả null nếu không embed được → caller rơi về nhánh keyword.
     * Lọc tenant TƯỜNG MINH trong SQL — không trông cậy RLS (đang chờ flip);
     * sau flip vẫn đúng (điều kiện trùng với policy).
     */
    private async findCandidatesByVector(
        product: string | undefined,
        customerText: string,
        tenantId: number,
    ): Promise<Conversation[] | null> {
        const qvec = await this.embeddings.generateEmbedding(customerText);
        if (!qvec) return null;

        const params: any[] = [`[${qvec.join(',')}]`, tenantId];
        let productFilter = '';
        if (product) {
            params.push(product);
            productFilter = `AND product_type = $${params.length}`;
        }

        // Chỉ lấy hàng có vector; ORDER BY khoảng cách cosine tăng dần (gần nhất trước).
        const rows = await this.dataSource.query(
            `SELECT id FROM conversations
             WHERE status = 'won' AND summary_embedding IS NOT NULL
               AND tenant_id = $2 ${productFilter}
             ORDER BY summary_embedding <=> $1::vector
             LIMIT 20`,
            params,
        );
        if (!rows || rows.length === 0) return [];

        // Nạp lại entity đầy đủ theo đúng thứ tự NN để tái dùng logic enrich phía sau.
        const ids: string[] = rows.map((r: any) => r.id);
        const convs = await this.convRepo.findByIds(ids);
        const byId = new Map(convs.map(c => [c.id, c]));
        return ids.map(id => byId.get(id)).filter(Boolean) as Conversation[];
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
