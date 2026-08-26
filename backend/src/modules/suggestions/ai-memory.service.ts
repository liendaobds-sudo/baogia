import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { AiSuggestion } from '../../entities/ai-suggestion.entity';
import { EmbeddingService } from '../knowledge-base/embedding.service';

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
    async retrieveMemoryContext(intent: string, productType: string, tenantId?: number | null): Promise<string> {
        if (!intent) return '';

        // CÔ LẬP TENANT (fail-closed): few-shot lấy từ hội thoại chốt đơn thật —
        // không rõ tenant thì không trộn ký ức (tránh lộ câu chốt/giá chéo tenant).
        if (tenantId == null) {
            this.logger.debug('Bỏ qua memory few-shot: thiếu tenantId (fail-closed)');
            return '';
        }

        const wonConvs = await this.findCandidateWonConvs(intent, productType, tenantId);
        if (wonConvs.length === 0) return '';

        let memoryContext = '\n\n## 🧠 KÝ ỨC CHỐT SALE (Few-shot Examples)\n';
        memoryContext += 'Dưới đây là các tình huống tương tự mà nhân viên công ty đã CHỐT ĐƠN THÀNH CÔNG. Hãy bắt chước phong cách, từ ngữ và chiến thuật thuyết phục này:\n\n';

        let addedCount = 0;
        const usedQuestions = new Set<string>();

        for (const conv of wonConvs) {
            // Find AI suggestions in this conversation that match the current intent
            const suggestions = await this.suggestRepo.find({
                where: { conversationId: conv.id, intent: intent },
                order: { createdAt: 'DESC' },
                take: 2 // Look at top 2 suggestions for this intent in the conv
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

        if (addedCount === 0) return '';

        this.logger.log(`🧠 Injected ${addedCount} memory few-shots for intent [${intent}]`);
        return memoryContext;
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
