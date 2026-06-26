/**
 * Auto-KB Service
 * Automatically extracts Q&A pairs from won conversations and adds them to KB.
 *
 * When a conversation is won:
 * 1. Extract key Q&A exchanges (customer question → agent answer that closed the deal)
 * 2. Format as KB-ready chunks
 * 3. Save to KB as "Auto-learned best practices"
 *
 * This ensures the KB grows organically from real successful interactions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { KbDocument, KbDocStatus } from '../../entities/kb-document.entity';
import { KbChunk } from '../../entities/kb-chunk.entity';
import { AiProviderService } from './ai-provider.service';

@Injectable()
export class AutoKbService {
    private readonly logger = new Logger(AutoKbService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(KbDocument) private docRepo: Repository<KbDocument>,
        @InjectRepository(KbChunk) private chunkRepo: Repository<KbChunk>,
        private aiProvider: AiProviderService,
    ) {}

    /**
     * Process a won conversation: extract Q&A pairs and add to KB.
     * Called after outcome is captured (fire-and-forget).
     */
    async processWonConversation(conversationId: string): Promise<void> {
        try {
            const conversation = await this.convRepo.findOne({
                where: { id: conversationId, status: ConversationStatus.WON },
            });
            if (!conversation) return;

            // Get or create the auto-KB document
            const doc = await this.getOrCreateAutoKbDoc();

            // Load conversation messages
            const messages = await this.msgRepo.find({
                where: { conversationId },
                order: { createdAt: 'ASC' },
                select: ['senderType', 'content', 'createdAt'],
            });

            if (messages.length < 4) return; // Too short to extract meaningful Q&A

            // Extract Q&A pairs using AI
            const qaPairs = await this.extractQAPairs(messages, conversation);
            if (qaPairs.length === 0) {
                this.logger.log(`📚 No new Q&A pairs extracted from conv ${conversationId.slice(-6)}`);
                return;
            }

            // Deduplicate against existing chunks
            const existingChunks = await this.chunkRepo.find({
                where: { documentId: doc.id, isActive: true },
                select: ['content'],
            });
            const existingTexts = existingChunks.map(c => c.content.toLowerCase());

            const newPairs = qaPairs.filter(qa => {
                const qLower = qa.question.toLowerCase();
                // Check if a similar question already exists (keyword overlap > 70%)
                return !existingTexts.some(existing => this.textSimilarity(qLower, existing) > 0.7);
            });

            if (newPairs.length === 0) {
                this.logger.log(`📚 All Q&A pairs already exist in auto-KB for conv ${conversationId.slice(-6)}`);
                return;
            }

            // Save new Q&A pairs as KB chunks
            const currentChunkCount = await this.chunkRepo.count({ where: { documentId: doc.id } });

            for (let i = 0; i < newPairs.length; i++) {
                const qa = newPairs[i];
                const content = `## ${qa.question}\n\n${qa.answer}`;

                const chunk = this.chunkRepo.create({
                    documentId: doc.id,
                    chunkIndex: currentChunkCount + i,
                    content,
                    tokenCount: Math.ceil(content.length / 4),
                    tags: [conversation.productType || 'general', 'auto-learned', 'best-practice'],
                    metadata: {
                        heading: qa.question,
                        sourceConversationId: conversationId,
                        extractedAt: new Date().toISOString(),
                    },
                    chunkType: 'qa_pair',
                    isActive: true,
                });
                await this.chunkRepo.save(chunk);
            }

            // Update doc chunk count
            const newTotal = await this.chunkRepo.count({ where: { documentId: doc.id, isActive: true } });
            await this.docRepo.update(doc.id, { chunkCount: newTotal });

            this.logger.log(
                `📚 Auto-KB: ${newPairs.length} new Q&A pairs extracted from conv ${conversationId.slice(-6)} ` +
                `(total auto-KB: ${newTotal} chunks)`
            );
        } catch (err) {
            this.logger.warn(`⚠️ Auto-KB processing failed for ${conversationId}: ${(err as Error).message}`);
        }
    }

    /**
     * Get or create the special "auto-learned" KB document.
     */
    private async getOrCreateAutoKbDoc(): Promise<KbDocument> {
        const existing = await this.docRepo.findOne({
            where: { title: 'Auto-learned Best Practices' },
        });
        if (existing) return existing;

        const doc = this.docRepo.create({
            title: 'Auto-learned Best Practices',
            fileUrl: '',
            fileType: 'auto',
            fileSize: 0,
            tags: ['auto-learned', 'best-practice'],
            status: KbDocStatus.INDEXED,
            chunkCount: 0,
        });
        const saved = await this.docRepo.save(doc);
        this.logger.log(`📚 Created auto-KB document: ${saved.id}`);
        return saved;
    }

    /**
     * Use AI to extract Q&A pairs from a won conversation.
     */
    private async extractQAPairs(
        messages: Message[],
        conversation: Conversation,
    ): Promise<{ question: string; answer: string }[]> {
        const chatSnippet = messages
            .map(m => `${m.senderType === 'customer' ? 'KH' : 'NV'}: ${m.content}`)
            .join('\n');

        const prompt = `Phân tích cuộc hội thoại CHỐT ĐƠN THÀNH CÔNG sau về in ấn.
Trích xuất 1-3 cặp Q&A có giá trị nhất — những câu hỏi khách thường hỏi và câu trả lời dẫn đến chốt đơn.

Quy tắc:
- Question: viết lại câu hỏi tổng quát hóa (không chứa tên khách)
- Answer: viết lại câu trả lời ngắn gọn, có thể tái sử dụng cho khách khác
- Chỉ giữ Q&A thực sự hữu ích (liên quan đến giá, chất liệu, quy trình, thời gian...)
- KHÔNG extract: chào hỏi, cảm ơn, xác nhận giao hàng

Sản phẩm: ${conversation.productType || 'chưa xác định'}

Hội thoại:
${chatSnippet.substring(0, 3000)}

Trả lời JSON: {"pairs": [{"question": "...", "answer": "..."}]}`;

        const providers = this.aiProvider.getProviders();
        for (const provider of providers) {
            try {
                const response = await this.callProvider(provider, prompt);
                let cleaned = response.replace(/```json\n?/g, '').replace(/```/g, '').trim();
                const jsonMatch = cleaned.match(/\{[\s\S]*"pairs"[\s\S]*\}/);
                if (jsonMatch) cleaned = jsonMatch[0];

                const parsed = JSON.parse(cleaned);
                if (Array.isArray(parsed.pairs)) {
                    return parsed.pairs
                        .filter((p: any) => p.question && p.answer && p.question.length > 10 && p.answer.length > 20)
                        .slice(0, 3);
                }
            } catch {
                continue;
            }
        }
        return [];
    }

    private async callProvider(
        provider: { name: string; apiKey: string; model: string; endpoint: string; apiType?: string },
        prompt: string,
    ): Promise<string> {
        if (provider.apiType === 'gemini' || provider.name === 'gemini') {
            const url = `${provider.endpoint}/models/${provider.model}:generateContent?key=${provider.apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0, maxOutputTokens: 500 },
                }),
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) throw new Error(`Gemini ${response.status}`);
            const data: any = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        }

        const response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify({
                model: provider.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                max_tokens: 500,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`${provider.name} ${response.status}`);
        const data: any = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }

    private textSimilarity(a: string, b: string): number {
        const wordsA = new Set(a.split(/[\s,;.!?]+/).filter(w => w.length > 2));
        const wordsB = new Set(b.split(/[\s,;.!?]+/).filter(w => w.length > 2));
        if (wordsA.size === 0 || wordsB.size === 0) return 0;
        const intersection = [...wordsA].filter(w => wordsB.has(w));
        return intersection.length / Math.min(wordsA.size, wordsB.size);
    }
}
