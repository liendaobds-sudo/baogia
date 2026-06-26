import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { AiSuggestion } from '../../entities/ai-suggestion.entity';

@Injectable()
export class AiMemoryService {
    private readonly logger = new Logger(AiMemoryService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(AiSuggestion) private suggestRepo: Repository<AiSuggestion>,
    ) {}

    /**
     * Retrieve successful past Q&A pairs (Few-Shot examples) matching the current intent/product.
     * Extracts exact Customer Question and final Agent Reply from WON conversations.
     * TODO: Upgrade to Vector DB (pgvector/Pinecone) for deep semantic search in the future.
     */
    async retrieveMemoryContext(intent: string, productType: string): Promise<string> {
        if (!intent) return '';

        // Query WON conversations matching the product or intent
        const wonConvs = await this.convRepo.createQueryBuilder('c')
            .where('c.status = :status', { status: ConversationStatus.WON })
            .andWhere('(c.productType = :product OR c.outcomeData::text LIKE :intentKey)', { 
                product: productType || '',
                intentKey: `%${intent}%`
            })
            .orderBy('c.closedAt', 'DESC')
            .limit(10)
            .getMany();

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
}
