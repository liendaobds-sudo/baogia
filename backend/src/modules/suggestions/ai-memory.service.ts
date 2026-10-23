import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { AiSuggestion } from '../../entities/ai-suggestion.entity';
import { EmbeddingService } from '../knowledge-base/embedding.service';
import { resolveLearningIntents } from './intents';

@Injectable()
export class AiMemoryService {
    private readonly logger = new Logger(AiMemoryService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(AiSuggestion) private suggestRepo: Repository<AiSuggestion>,
        @InjectDataSource() private dataSource: DataSource,
        private embeddings: EmbeddingService,
    ) {}

    /**
     * Retrieve successful past Q&A pairs (Few-Shot examples) matching the current intent/product.
     * Extracts exact Customer Question and final Agent Reply from WON conversations.
     *
     * Postgres + pgvector: truy candidate WON theo NN ngữ nghĩa trên summary_embedding
     * (vector của "productType intent") → bắt được hội thoại cùng ý dù khác từ ngữ.
     * SQLite/thiếu vector: fallback về LIKE trên outcomeData như cũ.
     */
    /**
     * @param intentOrTopic intent canonical, HOẶC topic runtime (`'objection'`, `'comparison'`…).
     *   Audit 2026-08-29: call-site vốn truyền topic, nhưng `ai_suggestions.intent` lưu intent
     *   CANONICAL ⇒ `find({ intent: 'objection' })` không bao giờ khớp và few-shot chết. Nay quy về
     *   tập intent canonical qua `resolveLearningIntents`, và nếu tập đó không cho kết quả thì
     *   THOÁI về "không lọc intent" (giống `AiLearningService`) để vẫn có ví dụ chốt đơn.
     */
    async retrieveMemoryContext(
        intentOrTopic: string,
        productType: string,
        tenantId?: number | null,
    ): Promise<string> {
        if (!intentOrTopic) return '';

        // CÔ LẬP TENANT (fail-closed): few-shot lấy từ hội thoại chốt đơn thật —
        // không rõ tenant thì không trộn ký ức (tránh lộ câu chốt/giá chéo tenant).
        if (tenantId == null) {
            this.logger.debug('Bỏ qua memory few-shot: thiếu tenantId (fail-closed)');
            return '';
        }

        const canonicalIntents = resolveLearningIntents(intentOrTopic);
        // Truy candidate hội thoại WON theo nhãn ngữ nghĩa (vector dùng chuỗi gốc là đủ tốt).
        const wonConvs = await this.findCandidateWonConvs(intentOrTopic, productType, tenantId);
        if (wonConvs.length === 0) return '';

        let memoryContext = '\n\n## 🧠 KÝ ỨC CHỐT SALE (Few-shot Examples)\n';
        memoryContext += 'Dưới đây là các tình huống tương tự mà nhân viên công ty đã CHỐT ĐƠN THÀNH CÔNG. Hãy bắt chước phong cách, từ ngữ và chiến thuật thuyết phục này:\n\n';

        let addedCount = 0;
        const usedQuestions = new Set<string>();

        for (const conv of wonConvs) {
            // Lọc theo intent canonical đã map; rỗng ⇒ không lọc (fallback toàn cục).
            const suggestions = await this.suggestRepo.find({
                where: canonicalIntents.length > 0
                    ? { conversationId: conv.id, intent: In(canonicalIntents) as any }
                    : { conversationId: conv.id },
                order: { createdAt: 'DESC' },
                take: 2, // Look at top 2 suggestions for this intent in the conv
            });

            for (const suggestion of suggestions) {
                // Ensure it wasn't rejected by the agent or given a thumbs down
                if (suggestion.status === 'rejected' || suggestion.agentFeedback === 'down') continue;

                let customerText = 'Hỏi tư vấn';
                if (suggestion.triggerMessageId) {
                    const msg = await this.msgRepo.findOne({ where: { id: suggestion.triggerMessageId } });
                    if (msg && msg.content) customerText = msg.content;
                }

                // Skip duplicates
                if (usedQuestions.has(customerText)) continue;

                // The final text sent to customer (either edited by agent or accepted as-is)
                const finalReply = suggestion.editedText || suggestion.replies[suggestion.usedReplyIndex || 0]?.text;
                
                if (finalReply && finalReply.length > 20) {
                    // Strip newline characters to keep few-shots compact
                    const cleanReply = finalReply.replace(/\n/g, ' ').substring(0, 300);
                    memoryContext += `🧑‍🦱 Khách: "${customerText}"\n`;
                    memoryContext += `👩‍💼 Nhân viên: "${cleanReply}..."\n\n`;
                    
                    usedQuestions.add(customerText);
                    addedCount++;
                }

                if (addedCount >= 3) break; // Maximum 3 examples to save prompt tokens
            }

            if (addedCount >= 3) break;
        }

        if (addedCount === 0) {
            // Không có ví dụ nào khớp intent đã map. Nếu ĐÃ lọc theo intent thì lấy lại KHÔNG lọc
            // (fallback toàn cục, giống AiLearningService) — vẫn tốt hơn 0 few-shot khi khách
            // đang phản đối/so sánh, đúng lúc cần ví dụ chốt đơn nhất.
            if (canonicalIntents.length > 0) {
                this.logger.debug(
                    `Không có few-shot cho intent [${canonicalIntents.join('|')}] — lấy lại không lọc intent`,
                );
                return this.retrieveAnyWonFewShots(wonConvs);
            }
            return '';
        }

        this.logger.log(
            `🧠 Injected ${addedCount} memory few-shots (topic="${intentOrTopic}" → intent=[${canonicalIntents.join('|') || 'không lọc'}])`,
        );
        return memoryContext;
    }

    /**
     * Fallback: lấy few-shot từ chính danh sách hội thoại WON đã tìm được, KHÔNG lọc intent.
     * Tách hàm riêng để nhánh fallback không đệ quy vô hạn.
     */
    private async retrieveAnyWonFewShots(wonConvs: Conversation[]): Promise<string> {
        let out = '\n\n## 🧠 KÝ ỨC CHỐT SALE (Few-shot Examples)\n';
        out += 'Dưới đây là các tình huống mà nhân viên công ty đã CHỐT ĐƠN THÀNH CÔNG. Hãy bắt chước phong cách, từ ngữ và chiến thuật thuyết phục này:\n\n';
        let added = 0;
        const used = new Set<string>();

        for (const conv of wonConvs) {
            const suggestions = await this.suggestRepo.find({
                where: { conversationId: conv.id },
                order: { createdAt: 'DESC' },
                take: 2,
            });
            for (const s of suggestions) {
                if (s.status === 'rejected' || s.agentFeedback === 'down') continue;
                let customerText = 'Hỏi tư vấn';
                if (s.triggerMessageId) {
                    const msg = await this.msgRepo.findOne({ where: { id: s.triggerMessageId } });
                    if (msg?.content) customerText = msg.content;
                }
                if (used.has(customerText)) continue;
                const finalReply = s.editedText || s.replies?.[s.usedReplyIndex || 0]?.text;
                if (finalReply && finalReply.length > 20) {
                    out += `🧑‍🦱 Khách: "${customerText}"\n`;
                    out += `👩‍💼 Nhân viên: "${finalReply.replace(/\n/g, ' ').substring(0, 300)}..."\n\n`;
                    used.add(customerText);
                    added++;
                }
                if (added >= 3) break;
            }
            if (added >= 3) break;
        }

        if (added === 0) return '';
        this.logger.log(`🧠 Injected ${added} memory few-shots (fallback: không lọc intent)`);
        return out;
    }

    /**
     * Tìm candidate WON conversations cho trí nhớ few-shot.
     * Postgres + pgvector: NN ngữ nghĩa trên summary_embedding (vector của "productType intent").
     * SQLite/thiếu vector/không embed được: fallback về LIKE trên outcomeData như cũ.
     * Lọc tenant TƯỜNG MINH — không trông cậy RLS (đang chờ flip).
     */
    private async findCandidateWonConvs(intent: string, productType: string, tenantId: number): Promise<Conversation[]> {
        // Nhánh vector (chỉ Postgres).
        if (this.dataSource.options.type === 'postgres') {
            const queryText = `${productType || ''} ${intent}`.trim();
            const qvec = await this.embeddings.generateEmbedding(queryText);
            if (qvec) {
                const rows = await this.dataSource.query(
                    `SELECT id FROM conversations
                     WHERE status = 'won' AND summary_embedding IS NOT NULL
                       AND tenant_id = $2
                     ORDER BY summary_embedding <=> $1::vector
                     LIMIT 10`,
                    [`[${qvec.join(',')}]`, tenantId],
                );
                if (rows && rows.length > 0) {
                    const ids: string[] = rows.map((r: any) => r.id);
                    const convs = await this.convRepo.findByIds(ids);
                    const byId = new Map(convs.map(c => [c.id, c]));
                    return ids.map(id => byId.get(id)).filter(Boolean) as Conversation[];
                }
                // Chưa có vector nào (chưa backfill) → rơi xuống fallback LIKE.
            }
        }

        // Fallback: LIKE trên outcomeData như bản gốc (thêm lưới lọc tenant).
        return this.convRepo.createQueryBuilder('c')
            .where('c.status = :status', { status: ConversationStatus.WON })
            .andWhere('c.tenant_id = :tenantId', { tenantId })
            .andWhere('(c.productType = :product OR c.outcomeData::text LIKE :intentKey)', {
                product: productType || '',
                intentKey: `%${intent}%`,
            })
            .orderBy('c.closedAt', 'DESC')
            .limit(10)
            .getMany();
    }
}
