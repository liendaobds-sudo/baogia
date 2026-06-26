/**
 * Conversation Summary Service
 * Manages persistent AI-generated summaries of conversation history.
 * 
 * Instead of re-summarizing every AI suggestion request, summaries are:
 * 1. Generated once when conversation passes threshold (15+ messages)
 * 2. Persisted to the Conversation entity (aiSummary column)
 * 3. Incrementally updated when new messages arrive (delta summarization)
 * 4. Reused across all subsequent AI calls — massive latency + token savings
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { AiProviderService } from './ai-provider.service';

const SUMMARY_THRESHOLD = 12;     // Start summarizing when > 12 messages
const RECENT_KEEP = 8;            // Keep 8 most recent messages verbatim
const DELTA_THRESHOLD = 6;        // Re-summarize when 6+ new messages since last summary
const MAX_SUMMARY_CHARS = 1500;   // Cap summary length

@Injectable()
export class ConversationSummaryService {
    private readonly logger = new Logger(ConversationSummaryService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        private aiProvider: AiProviderService,
    ) {}

    /**
     * Build chat history with persistent summarization.
     * 
     * Flow:
     * 1. If ≤ SUMMARY_THRESHOLD messages → return full verbatim history
     * 2. If existing summary covers enough → reuse summary + recent messages
     * 3. If delta > DELTA_THRESHOLD → incrementally update summary
     * 4. If no summary exists → generate fresh summary
     */
    async buildChatHistory(conversationId: string, messages: Message[]): Promise<string> {
        const formatMsg = (m: Message) =>
            `${m.senderType === 'customer' ? 'Khách' : 'NV'}: ${m.content}`;

        const totalMessages = await this.msgRepo.count({ where: { conversationId } });

        // Short conversations — full verbatim
        if (totalMessages <= SUMMARY_THRESHOLD) {
            return messages.map(formatMsg).join('\n');
        }

        // Load existing summary
        const conversation = await this.convRepo.findOne({
            where: { id: conversationId },
            select: ['id', 'aiSummary', 'aiSummaryAt', 'aiSummaryMsgCount'],
        });

        const existingSummary = conversation?.aiSummary;
        const summarizedCount = conversation?.aiSummaryMsgCount || 0;

        // How many messages are NOT yet summarized?
        const unsummarizedCount = totalMessages - summarizedCount;

        // Split: older messages (to summarize) vs recent (keep verbatim)
        const recentMessages = messages.slice(-RECENT_KEEP);
        const recentHistory = recentMessages.map(formatMsg).join('\n');

        // Case 1: Existing summary is fresh enough — reuse it
        if (existingSummary && unsummarizedCount <= DELTA_THRESHOLD) {
            this.logger.log(`📋 Reusing persisted summary (${summarizedCount} msgs summarized, ${unsummarizedCount} new)`);
            
            // Include any unsummarized-but-not-recent messages
            const gapStart = summarizedCount;
            const gapEnd = totalMessages - RECENT_KEEP;
            let gapHistory = '';
            if (gapEnd > gapStart) {
                // Fetch the gap messages from DB
                const gapMessages = await this.msgRepo.find({
                    where: { conversationId },
                    order: { createdAt: 'ASC' },
                    skip: gapStart,
                    take: gapEnd - gapStart,
                });
                gapHistory = '\n\n[TIN NHẮN CHƯA TÓM TẮT]:\n' + gapMessages.map(formatMsg).join('\n');
            }

            return `[TÓM TẮT HỘI THOẠI (${summarizedCount} tin nhắn trước)]:\n${existingSummary}${gapHistory}\n\n[TIN NHẮN GẦN ĐÂY]:\n${recentHistory}`;
        }

        // Case 2: Need to update/create summary
        const summarizeSkip = summarizedCount > 0 ? summarizedCount : 0;
        const summarizeTake = totalMessages - RECENT_KEEP - summarizeSkip;
        
        let newSummary = existingSummary || '';
        let messagesToSummarize: any[] = [];

        if (summarizeTake > 0) {
            messagesToSummarize = await this.msgRepo.find({
                where: { conversationId },
                order: { createdAt: 'ASC' },
                skip: summarizeSkip,
                take: summarizeTake,
            });

            if (existingSummary && summarizedCount > 0) {
                // Incremental: merge old summary with new delta messages
                newSummary = await this.incrementalSummarize(existingSummary, messagesToSummarize);
            } else {
                // Fresh summary from scratch
                newSummary = await this.summarizeMessages(messagesToSummarize);
            }
        }

        // Persist the summary
        if (newSummary && newSummary !== existingSummary) {
            const newSummarizedCount = totalMessages - RECENT_KEEP;
            await this.convRepo.update(conversationId, {
                aiSummary: newSummary,
                aiSummaryAt: new Date(),
                aiSummaryMsgCount: newSummarizedCount,
            });
            this.logger.log(`💾 Persisted summary for ${conversationId}: ${newSummary.length} chars covering ${newSummarizedCount} messages`);
        }

        // Fallback if summarization failed entirely
        if (!newSummary) {
            newSummary = this.extractKeyFactsManually(messagesToSummarize);
        }

        const msgCount = (summarizedCount || 0) + messagesToSummarize.length;
        return `[TÓM TẮT HỘI THOẠI (${msgCount} tin nhắn trước)]:\n${newSummary}\n\n[TIN NHẮN GẦN ĐÂY]:\n${recentHistory}`;
    }

    /**
     * Generate a fresh summary from messages using LLM
     */
    private async summarizeMessages(messages: Message[]): Promise<string> {
        const providers = this.aiProvider.getProviders();
        if (providers.length === 0) return this.extractKeyFactsManually(messages);

        const conversation = messages.map(m =>
            `${m.senderType === 'customer' ? 'Khách' : 'NV'}: ${m.content}`
        ).join('\n');

        const prompt = `Tóm tắt cuộc hội thoại CSKH in ấn sau thành DANH SÁCH CÁC THÔNG TIN QUAN TRỌNG.

BẮT BUỘC giữ lại:
- Sản phẩm khách hỏi (tên, loại)
- Số lượng, kích thước cụ thể
- Chất liệu đã thảo luận (tên + gsm nếu có)
- Gia công sau in (cán mờ, bóng, UV, ép nhũ, bế...)
- Giá đã báo (nếu có)
- File thiết kế đã gửi/chưa gửi
- Thỏa thuận/quyết định đã đạt
- Yêu cầu đặc biệt (giao gấp, VAT, mẫu in thử...)

BỎ QUA: chào hỏi, cảm ơn, chờ đợi, tin nhắn hệ thống.

Format: mỗi dòng 1 fact, bắt đầu bằng "•". Tối đa 12 dòng.

${conversation}`;

        for (const provider of providers) {
            try {
                const text = await this.callProviderForText(provider, prompt);
                if (text && text.length > 10) {
                    // Truncate if too long
                    const truncated = text.length > MAX_SUMMARY_CHARS
                        ? text.substring(0, MAX_SUMMARY_CHARS) + '...'
                        : text;
                    this.logger.log(`📝 Summarized ${messages.length} messages → ${truncated.length} chars via ${provider.name}`);
                    return truncated;
                }
            } catch (e) {
                this.logger.warn(`⚠️ Summary via ${provider.name} failed: ${(e as Error).message}`);
            }
        }

        return this.extractKeyFactsManually(messages);
    }

    /**
     * Incremental summarization: merge existing summary with new messages
     * More token-efficient than re-summarizing everything
     */
    private async incrementalSummarize(existingSummary: string, newMessages: Message[]): Promise<string> {
        const providers = this.aiProvider.getProviders();
        if (providers.length === 0) {
            const newFacts = this.extractKeyFactsManually(newMessages);
            return existingSummary + '\n' + newFacts;
        }

        const newConversation = newMessages.map(m =>
            `${m.senderType === 'customer' ? 'Khách' : 'NV'}: ${m.content}`
        ).join('\n');

        const prompt = `Bạn có TÓM TẮT CŨ của cuộc hội thoại CSKH in ấn:

${existingSummary}

Và ${newMessages.length} TIN NHẮN MỚI tiếp theo:

${newConversation}

Hãy CẬP NHẬT tóm tắt bằng cách:
1. GIỮ NGUYÊN các facts cũ còn đúng
2. CẬP NHẬT facts đã thay đổi (VD: khách đổi số lượng)
3. THÊM facts mới từ tin nhắn mới
4. XÓA facts đã lỗi thời (VD: khách đã chọn chất liệu → bỏ câu "chưa chọn chất liệu")

Format: mỗi dòng 1 fact, bắt đầu bằng "•". Tối đa 15 dòng.`;

        for (const provider of providers) {
            try {
                const text = await this.callProviderForText(provider, prompt);
                if (text && text.length > 10) {
                    const truncated = text.length > MAX_SUMMARY_CHARS
                        ? text.substring(0, MAX_SUMMARY_CHARS) + '...'
                        : text;
                    this.logger.log(`🔄 Incremental summary: +${newMessages.length} msgs → ${truncated.length} chars via ${provider.name}`);
                    return truncated;
                }
            } catch (e) {
                this.logger.warn(`⚠️ Incremental summary via ${provider.name} failed: ${(e as Error).message}`);
            }
        }

        // Fallback: append manual facts
        const newFacts = this.extractKeyFactsManually(newMessages);
        return (existingSummary + '\n' + newFacts).substring(0, MAX_SUMMARY_CHARS);
    }

    /**
     * Manual key fact extraction — regex-based fallback when LLM is unavailable
     */
    private extractKeyFactsManually(messages: Message[]): string {
        const facts: string[] = [];
        const customerMsgs = messages.filter(m => m.senderType === 'customer');
        const allText = customerMsgs.map(m => m.content).join(' ');

        // Product detection
        const productKeywords: Record<string, string> = {
            'namecard|name card|danh thiếp|card visit': 'Namecard',
            'decal|sticker|tem nhãn|tem dán': 'Decal/Sticker',
            'tờ rơi|flyer|leaflet': 'Tờ rơi',
            'catalogue|catalog|brochure': 'Catalogue/Brochure',
            'banner|standee|hiflex|bạt': 'Banner/Standee',
            'menu|thực đơn': 'Menu',
            'hộp giấy|hộp quà|packaging': 'Hộp giấy',
            'túi giấy|túi xách': 'Túi giấy',
            'poster|áp phích': 'Poster',
        };
        for (const [pattern, name] of Object.entries(productKeywords)) {
            if (new RegExp(pattern, 'i').test(allText)) {
                facts.push(`• Sản phẩm: ${name}`);
                break;
            }
        }

        // Quantity
        const qtyMatch = allText.match(/(\d[\d,.]*)\s*(?:cái|tờ|bộ|hộp|cuốn|tấm|quyển|chiếc)/i);
        if (qtyMatch) facts.push(`• Số lượng: ${qtyMatch[0]}`);

        // Size
        const sizeMatch = allText.match(/(\d+)\s*[×xX]\s*(\d+)\s*(cm|mm|m)?/);
        if (sizeMatch) facts.push(`• Kích thước: ${sizeMatch[0]}`);

        // Material
        const materials = ['couche', 'kraft', 'ivory', 'pvc', 'pp', 'decal giấy', 'decal nhựa', 'offset', 'duplex', 'art paper', 'art card'];
        for (const mat of materials) {
            if (allText.toLowerCase().includes(mat)) { facts.push(`• Chất liệu: ${mat}`); break; }
        }

        // GSM
        const gsmMatch = allText.match(/(\d{2,3})\s*(?:gsm|g)\b/i);
        if (gsmMatch) facts.push(`• Định lượng: ${gsmMatch[0]}`);

        // Processing
        const processing: string[] = [];
        if (/cán mờ/i.test(allText)) processing.push('cán mờ');
        if (/cán bóng/i.test(allText)) processing.push('cán bóng');
        if (/ép nhũ/i.test(allText)) processing.push('ép nhũ');
        if (/uv cục bộ|spot uv/i.test(allText)) processing.push('UV cục bộ');
        if (/bế|die.?cut/i.test(allText)) processing.push('bế');
        if (/bo góc/i.test(allText)) processing.push('bo góc');
        if (processing.length > 0) facts.push(`• Gia công: ${processing.join(', ')}`);

        // Price mentioned by staff
        const staffMsgs = messages.filter(m => m.senderType !== 'customer');
        for (const msg of staffMsgs) {
            const priceMatch = msg.content.match(/(\d[\d,.]+)\s*(?:đ|vnđ|đồng)/i);
            if (priceMatch) { facts.push(`• NV đã báo giá: ${priceMatch[0]}`); break; }
        }

        // File status
        const hasFile = messages.some(m => m.contentType === 'image' || m.contentType === 'file' || /file|thiết kế|mẫu/.test(m.content));
        if (hasFile) facts.push('• Khách đã gửi file/hình ảnh');

        return facts.length > 0 ? facts.join('\n') : '• Khách đã hỏi thông tin chung trước đó';
    }

    /**
     * Lightweight LLM call for text generation (no JSON schema)
     */
    private async callProviderForText(
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
                    generationConfig: { temperature: 0, maxOutputTokens: 400 },
                }),
                signal: AbortSignal.timeout(8000),
            });
            if (!response.ok) throw new Error(`Gemini ${response.status}`);
            const data: any = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        }

        // OpenAI-compatible
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
                max_tokens: 400,
            }),
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`${provider.name} ${response.status}`);
        const data: any = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }
}
