/**
 * Proactive Outreach Service
 * AI-driven proactive follow-up based on conversation context and customer behavior.
 *
 * Unlike the existing FollowUpService (template-based, fixed delays),
 * this service generates PERSONALIZED follow-up messages using AI:
 *
 * 1. Analyzes conversation history + customer profile
 * 2. Generates a context-aware follow-up message
 * 3. Schedules based on intent (quote_sent → 4h, waiting_file → 24h, etc.)
 *
 * Runs as a cron job every 15 minutes, processing stale conversations.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, Not } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { Contact } from '../../entities/contact.entity';
import { FollowUp, FollowUpStatus } from '../../entities/follow-up.entity';
import { AiProviderService } from './ai-provider.service';
import { EventsGateway } from '../gateway/events.gateway';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { safeErrorMetadata } from '../../common/logging/safe-log-metadata';
import { forEachTenant } from '../../common/tenant/tenant-background';

// Stale thresholds per conversation status (in hours)
const STALE_THRESHOLDS: Record<string, number> = {
    [ConversationStatus.IN_PROGRESS]: 4,       // No reply for 4 hours
    [ConversationStatus.WAITING_CUSTOMER]: 6,   // Customer hasn't replied for 6h
    [ConversationStatus.WAITING_FILE]: 24,      // Waiting for file for 24h
    [ConversationStatus.QUOTED]: 8,             // Quote sent, no reply for 8h
};

const MAX_PROACTIVE_PER_CONV = 2; // Max AI-generated follow-ups per conversation
const PROACTIVE_COOLDOWN_HOURS = 12; // Don't send another proactive within 12h

@Injectable()
export class ProactiveOutreachService {
    private readonly logger = new Logger(ProactiveOutreachService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(Contact) private contactRepo: Repository<Contact>,
        @InjectRepository(FollowUp) private followUpRepo: Repository<FollowUp>,
        private aiProvider: AiProviderService,
        private gateway: EventsGateway,
        @Optional() private tenantCtx?: TenantContextService,
    ) {}

    /**
     * Cron: every 15 minutes, find stale conversations and generate proactive messages.
     * Only generates the message and notifies agents — doesn't auto-send to customer.
     *
     * Khi RLS bật (TENANT_RLS_ENABLED): lặp từng tenant, mỗi vòng quét trong scope tenant
     * (withTenant + transaction set app.current_tenant) → RLS lọc đúng dữ liệu mỗi xưởng.
     * Khi tắt (mặc định): chạy thẳng logic gốc quét toàn bộ — không đổi hành vi.
     */
    @Cron('0 */15 * * * *') // Every 15 minutes
    async scanForStaleConversations(): Promise<void> {
        await forEachTenant(this.tenantCtx, this.convRepo.manager, () => this.scanStaleCore());
    }

    private async scanStaleCore(): Promise<void> {
        const activeStatuses = Object.keys(STALE_THRESHOLDS);

        for (const status of activeStatuses) {
            const thresholdHours = STALE_THRESHOLDS[status];
            const cutoff = new Date(Date.now() - thresholdHours * 3600_000);

            const staleConvs = await this.convRepo.find({
                where: {
                    status: status as ConversationStatus,
                    lastMessageAt: LessThan(cutoff),
                },
                relations: ['contact'],
                take: 10, // Process max 10 per status per cycle
            });

            for (const conv of staleConvs) {
                await this.processStaleConversation(conv);
            }
        }
    }

    /**
     * Process a single stale conversation: generate and schedule proactive follow-up.
     */
    private async processStaleConversation(conversation: Conversation): Promise<void> {
        try {
            const convId = conversation.id;

            // Check cooldown: don't spam
            const recentProactive = await this.followUpRepo.count({
                where: {
                    conversationId: convId,
                    context: 'proactive_ai',
                    status: In([FollowUpStatus.PENDING, FollowUpStatus.SENT]),
                },
            });
            if (recentProactive >= MAX_PROACTIVE_PER_CONV) return;

            // Check time since last proactive message
            const lastProactive = await this.followUpRepo.findOne({
                where: {
                    conversationId: convId,
                    context: 'proactive_ai',
                },
                order: { createdAt: 'DESC' },
            });
            if (lastProactive) {
                const hoursSince = (Date.now() - new Date(lastProactive.createdAt).getTime()) / 3600_000;
                if (hoursSince < PROACTIVE_COOLDOWN_HOURS) return;
            }

            // Load recent messages for context
            const messages = await this.msgRepo.find({
                where: { conversationId: convId },
                order: { createdAt: 'DESC' },
                take: 10,
                select: ['senderType', 'content', 'createdAt'],
            });
            messages.reverse();

            if (messages.length === 0) return;

            // Determine who sent the last message
            const lastMessage = messages[messages.length - 1];
            // Don't follow up if we (agent) sent the last message and customer hasn't replied
            // UNLESS enough time has passed (which the stale threshold already checks)

            // Generate AI follow-up
            const followUpMessage = await this.generateFollowUp(
                conversation, messages, conversation.contact,
            );

            if (!followUpMessage) return;

            // Schedule as a proactive follow-up (agent will see suggestion, not auto-sent)
            const followUp = this.followUpRepo.create({
                conversationId: convId,
                message: followUpMessage,
                status: FollowUpStatus.PENDING,
                attempt: recentProactive + 1,
                scheduledAt: new Date(), // Show immediately
                context: 'proactive_ai',
            });
            await this.followUpRepo.save(followUp);

            // Notify agents via WebSocket. Conversation legacy thiếu tenant bị drop fail-closed.
            if (conversation.tenantId != null) {
                this.gateway.emitProactiveFollowUp(conversation.tenantId, {
                    conversationId: convId,
                    contactName: conversation.contact?.displayName || 'Khách hàng',
                    message: followUpMessage.substring(0, 100),
                    status: conversation.status,
                    followUpId: followUp.id,
                });
            }

            this.logger.log(
                `🔔 Proactive follow-up generated for conv ${convId.slice(-6)} ` +
                `(hasContact=${Boolean(conversation.contact)}, status=${conversation.status})`
            );
        } catch (err) {
            this.logger.warn(
                `⚠️ Proactive outreach failed for conv ${conversation.id.slice(-6)} ` +
                `(${safeErrorMetadata(err)})`,
            );
        }
    }

    /**
     * Generate a personalized follow-up message using AI.
     */
    private async generateFollowUp(
        conversation: Conversation,
        messages: Message[],
        contact: Contact | undefined,
    ): Promise<string | null> {
        const providers = this.aiProvider.getProviders();
        if (providers.length === 0) return this.fallbackMessage(conversation);

        const chatSnippet = messages
            .slice(-5)
            .map(m => `${m.senderType === 'customer' ? 'KH' : 'NV'}: ${m.content}`)
            .join('\n');

        const staleHours = Math.round((Date.now() - new Date(conversation.lastMessageAt).getTime()) / 3600_000);
        const customerName = contact?.displayName || 'bạn';

        const prompt = `Bạn là nhân viên CSKH in ấn chuyên nghiệp. Hãy viết 1 tin nhắn follow-up ngắn gọn, thân thiện.

Bối cảnh:
- Khách: ${customerName}
- Status: ${conversation.status}
- Sản phẩm: ${conversation.productType || 'chưa xác định'}
- Lần cuối nhắn: ${staleHours} giờ trước
- Tóm tắt hội thoại: ${conversation.aiSummary?.substring(0, 300) || 'Chưa có'}

5 tin nhắn gần nhất:
${chatSnippet}

Yêu cầu:
- Viết 1 câu ngắn (dưới 100 từ), tự nhiên như đang chat Zalo
- Nhắc lại vấn đề khách cần (không hỏi lại từ đầu)
- Nếu đã báo giá → hỏi khách thấy sao
- Nếu đang chờ thông tin → nhắc nhẹ nhàng
- Sử dụng emoji phù hợp 👋
- KHÔNG dùng kính ngữ quá rập khuôn

Chỉ trả lời đúng nội dung tin nhắn, KHÔNG giải thích.`;

        for (const provider of providers) {
            try {
                const response = await this.callProvider(provider, prompt);
                if (response && response.length > 10 && response.length < 500) {
                    return response.replace(/^["']|["']$/g, '').trim();
                }
            } catch {
                continue;
            }
        }

        return this.fallbackMessage(conversation);
    }

    /**
     * Template-based fallback when AI is unavailable.
     */
    private fallbackMessage(conversation: Conversation): string {
        switch (conversation.status) {
            case ConversationStatus.QUOTED:
                return 'Chào bạn 👋 Bạn đã xem báo giá bên em gửi chưa ạ? Nếu cần điều chỉnh gì em hỗ trợ ngay nhé!';
            case ConversationStatus.WAITING_CUSTOMER:
                return 'Chào bạn 👋 Bên em vẫn chờ thông tin từ bạn để hỗ trợ tiếp ạ. Bạn cần em giúp gì thêm không?';
            case ConversationStatus.WAITING_FILE:
                return 'Chào bạn 👋 Bạn đã chuẩn bị được file thiết kế chưa ạ? Em sẵn sàng kiểm tra và tư vấn nhé!';
            default:
                return 'Chào bạn 👋 Bên em có thể hỗ trợ thêm gì cho bạn không ạ?';
        }
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
                    generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
                }),
                signal: AbortSignal.timeout(8000),
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
                temperature: 0.7,
                max_tokens: 200,
            }),
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`${provider.name} ${response.status}`);
        const data: any = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }
}
