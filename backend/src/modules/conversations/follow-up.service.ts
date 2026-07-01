import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FollowUp, FollowUpStatus } from '../../entities/follow-up.entity';
import { Conversation } from '../../entities/conversation.entity';
import { AiSuggestion } from '../../entities/ai-suggestion.entity';
import { EventsGateway } from '../gateway/events.gateway';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { forEachTenant } from '../../common/tenant/tenant-background';

// Follow-up delay schedule: attempt 1 → 2h, attempt 2 → 6h, attempt 3 → 24h
const FOLLOW_UP_DELAYS_HOURS = [2, 6, 24];
const MAX_FOLLOW_UPS = 3;

// Follow-up templates by context
const TEMPLATES: Record<string, string[]> = {
    waiting_info: [
        'Chào bạn 👋 Bạn đã có thêm thông tin mà bên em đã hỏi chưa ạ? Em sẽ báo giá ngay khi nhận được nhé!',
        'Chào bạn, bên em vẫn chờ thông tin từ bạn để báo giá chính xác ạ. Bạn cần em hỗ trợ gì thêm không?',
        'Xin chào bạn! Em nhận thấy cuộc hội thoại chưa được hoàn tất. Nếu bạn vẫn quan tâm, hãy gửi thông tin để em tiếp tục hỗ trợ nhé ạ 🙏',
    ],
    quote_sent: [
        'Chào bạn 👋 Bạn đã xem giá bên em gửi chưa ạ? Có cần em điều chỉnh gì không?',
        'Bạn ơi, về báo giá bên em gửi trước đó, bạn thấy phù hợp không ạ? Mình có thể thương lượng thêm nếu cần!',
        'Xin chào bạn! Em gửi lại thông tin báo giá. Nếu cần thay đổi số lượng hoặc quy cách, em tính lại ngay ạ 🙏',
    ],
    general: [
        'Chào bạn 👋 Bên em có thể hỗ trợ thêm gì cho bạn không ạ?',
        'Xin chào! Em thấy cuộc trò chuyện chưa được hoàn tất. Bạn cần tư vấn thêm không ạ?',
        'Chào bạn! Nếu bạn vẫn quan tâm đến dịch vụ in ấn, hãy nhắn cho em nhé. Em sẵn sàng hỗ trợ ạ 🙏',
    ],
};

@Injectable()
export class FollowUpService {
    private readonly logger = new Logger(FollowUpService.name);

    constructor(
        @InjectRepository(FollowUp) private followUpRepo: Repository<FollowUp>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(AiSuggestion) private suggestRepo: Repository<AiSuggestion>,
        private gateway: EventsGateway,
        @Optional() private tenantCtx?: TenantContextService,
    ) { }

    /**
     * Schedule follow-up for a conversation after agent sends a message
     */
    async scheduleFollowUp(conversationId: string): Promise<FollowUp | null> {
        // Check existing pending follow-ups
        const existing = await this.followUpRepo.count({
            where: { conversationId, status: FollowUpStatus.PENDING },
        });
        if (existing > 0) {
            this.logger.debug(`⏭️ Follow-up already scheduled for conv ${conversationId.substring(0, 8)}`);
            return null;
        }

        // Count past follow-ups for this conversation
        const pastCount = await this.followUpRepo.count({
            where: { conversationId, status: FollowUpStatus.SENT },
        });
        if (pastCount >= MAX_FOLLOW_UPS) {
            this.logger.debug(`⏭️ Max follow-ups (${MAX_FOLLOW_UPS}) reached for conv ${conversationId.substring(0, 8)}`);
            return null;
        }

        const attempt = pastCount + 1;
        const delayHours = FOLLOW_UP_DELAYS_HOURS[Math.min(attempt - 1, FOLLOW_UP_DELAYS_HOURS.length - 1)];
        const scheduledAt = new Date(Date.now() + delayHours * 3600_000);

        // Determine context from latest suggestion
        const context = await this.detectContext(conversationId);
        const templates = TEMPLATES[context] || TEMPLATES.general;
        const message = templates[Math.min(attempt - 1, templates.length - 1)];

        const followUp = this.followUpRepo.create({
            conversationId,
            message,
            attempt,
            scheduledAt,
            context,
            status: FollowUpStatus.PENDING,
        });

        const saved = await this.followUpRepo.save(followUp);
        this.logger.log(`⏰ Follow-up #${attempt} scheduled for conv ${conversationId.substring(0, 8)} at ${scheduledAt.toLocaleString('vi-VN')} (context: ${context})`);

        // Emit event so frontend can show badge
        this.gateway.server.to(`conversation:${conversationId}`).emit('follow_up_scheduled', {
            followUpId: saved.id,
            scheduledAt: saved.scheduledAt,
            attempt: saved.attempt,
            context: saved.context,
        });

        return saved;
    }

    /**
     * Cancel all pending follow-ups for a conversation (when customer replies)
     */
    async cancelPending(conversationId: string): Promise<number> {
        const pending = await this.followUpRepo.find({
            where: { conversationId, status: FollowUpStatus.PENDING },
        });

        if (pending.length === 0) return 0;

        for (const fu of pending) {
            fu.status = FollowUpStatus.CANCELLED;
        }
        await this.followUpRepo.save(pending);

        this.logger.log(`❌ Cancelled ${pending.length} pending follow-ups for conv ${conversationId.substring(0, 8)}`);

        this.gateway.server.to(`conversation:${conversationId}`).emit('follow_up_cancelled', {
            conversationId,
            count: pending.length,
        });

        return pending.length;
    }

    /**
     * Cron job: check and send due follow-ups every 5 minutes.
     *
     * Khi RLS bật (TENANT_RLS_ENABLED): lặp từng tenant, mỗi vòng xử lý trong scope tenant
     * → RLS chỉ trả follow-up của xưởng hiện hành. Khi tắt (mặc định): chạy thẳng như cũ.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async processFollowUps() {
        await forEachTenant(this.tenantCtx, this.followUpRepo.manager, () => this.processFollowUpsCore());
    }

    private async processFollowUpsCore() {
        const now = new Date();
        const dueFollowUps = await this.followUpRepo.find({
            where: {
                status: FollowUpStatus.PENDING,
                scheduledAt: LessThanOrEqual(now),
            },
            relations: ['conversation'],
            take: 20, // Process max 20 at a time
        });

        if (dueFollowUps.length === 0) return;

        this.logger.log(`⏰ Processing ${dueFollowUps.length} due follow-ups`);

        for (const fu of dueFollowUps) {
            try {
                // Emit follow-up via WebSocket (agent will see it as a notification)
                this.gateway.server.emit('follow_up_due', {
                    followUpId: fu.id,
                    conversationId: fu.conversationId,
                    message: fu.message,
                    attempt: fu.attempt,
                    context: fu.context,
                });

                fu.status = FollowUpStatus.SENT;
                fu.sentAt = now;
                await this.followUpRepo.save(fu);

                this.logger.log(`✅ Task dispatched to UI: #${fu.attempt} for conv ${fu.conversationId.substring(0, 8)}`);
                // Note: We no longer auto-schedule the next follow-up. 
                // The AI or agent will handle lifecycle.
            } catch (err: any) {
                this.logger.warn(`⚠️ Follow-up failed for conv ${fu.conversationId.substring(0, 8)}: ${err.message}`);
            }
        }
    }

    /**
     * Get follow-up status & active tasks for a conversation
     */
    async getStatus(conversationId: string) {
        const [pending, sent, completed, rejected] = await Promise.all([
            this.followUpRepo.find({
                where: { conversationId, status: FollowUpStatus.PENDING },
                order: { scheduledAt: 'ASC' },
            }),
            this.followUpRepo.find({
                where: { conversationId, status: FollowUpStatus.SENT },
                order: { sentAt: 'DESC' },
            }),
            this.followUpRepo.count({
                where: { conversationId, status: FollowUpStatus.COMPLETED },
            }),
            this.followUpRepo.count({
                where: { conversationId, status: FollowUpStatus.REJECTED },
            }),
        ]);

        return { 
            pending, 
            sent, // "SENT" effectively means "ACTIVE in UI Task List"
            completedCount: completed,
            rejectedCount: rejected,
            maxFollowUps: MAX_FOLLOW_UPS 
        };
    }

    /**
     * Mark task as COMPLETED or REJECTED
     */
    async updateStatus(id: string, status: FollowUpStatus, rejectionReason?: string): Promise<FollowUp> {
        const fu = await this.followUpRepo.findOne({ where: { id } });
        if (!fu) throw new Error('Follow-up task not found');
        
        fu.status = status;
        if (rejectionReason) fu.rejectionReason = rejectionReason;
        
        return this.followUpRepo.save(fu);
    }

    /**
     * Cancel a specific follow-up by ID
     */
    async cancelById(id: string): Promise<FollowUp> {
        const fu = await this.followUpRepo.findOne({ where: { id } });
        if (!fu) throw new Error('Follow-up not found');
        fu.status = FollowUpStatus.CANCELLED;
        return this.followUpRepo.save(fu);
    }

    /**
     * Detect context for follow-up template selection
     */
    private async detectContext(conversationId: string): Promise<string> {
        const latestSuggestion = await this.suggestRepo.findOne({
            where: { conversationId },
            order: { createdAt: 'DESC' },
            select: ['intent', 'quoteResult', 'missingInfo'],
        });

        if (!latestSuggestion) return 'general';

        // If there was a successful quote → quote_sent
        if (latestSuggestion.quoteResult?.total > 0) return 'quote_sent';

        // If there are missing info fields → waiting_info
        if (latestSuggestion.missingInfo?.length > 0) return 'waiting_info';

        return 'general';
    }
}
