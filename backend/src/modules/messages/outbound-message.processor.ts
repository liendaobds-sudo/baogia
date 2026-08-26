import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus, Conversation } from '../../entities';
import { getChannelAdapter } from '../channels/adapters/adapter-factory';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { runInTenant } from '../../common/tenant/tenant-background';

/**
 * `concurrency` (audit 2026-07-25): trước đây không set ⇒ BullMQ mặc định 1 ⇒ mọi tin nhắn đi
 * ra bị xếp hàng tuần tự, một tin chậm (Zalo timeout + 3 lần retry) làm nghẽn cả hàng đợi.
 * Đặt 5: đủ song song cho nhiều hội thoại nhưng vẫn dưới ngưỡng rate-limit của Zalo
 * (ZaloRateLimiterService vẫn là chốt cuối chống spam).
 */
@Processor('outbound_messages', { concurrency: 5 })
@Injectable()
export class OutboundMessageProcessor extends WorkerHost {
    private readonly logger = new Logger(OutboundMessageProcessor.name);

    constructor(
        @InjectRepository(Message) private messagesRepo: Repository<Message>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @Optional() private tenantCtx?: TenantContextService,
    ) {
        super();
    }

    /**
     * Khi RLS bật (TENANT_RLS_ENABLED): phân giải tenant từ payload (job.data.tenantId)
     * hoặc từ conversation tham chiếu, rồi bọc withTenant + transaction (set
     * app.current_tenant) để đọc/ghi nền gắn đúng tenant + qua connection RLS.
     * Khi tắt (mặc định): chạy thẳng như cũ — không query phân giải, không overhead.
     */
    async process(job: Job<any, any, string>): Promise<any> {
        if (process.env.TENANT_RLS_ENABLED !== 'true' || !this.tenantCtx) {
            return this.processCore(job);
        }
        let tenantId = Number(job.data?.tenantId) || 0;
        if (!tenantId && job.data?.conversationId) {
            // Lỗi query phân giải KHÔNG nuốt nữa — throw để BullMQ retry theo backoff.
            const rows = await this.convRepo.manager.query(
                'SELECT tenant_id FROM conversations WHERE id = $1 LIMIT 1', [job.data.conversationId]);
            if (rows?.[0]?.tenant_id) tenantId = Number(rows[0].tenant_id);
        }
        if (!tenantId) {
            // Fail-loud (Req 2.3): KHÔNG mặc định tenant 1 — job không rõ tenant mà vẫn
            // chạy sẽ đọc/ghi nhầm dữ liệu vào tenant 1 (rò chéo tenant khó phát hiện).
            throw new Error(
                `Không phân giải được tenant cho outbound job ${job.id} (conversationId=${job.data?.conversationId ?? 'n/a'}) — từ chối xử lý`,
            );
        }
        return runInTenant(this.tenantCtx, this.convRepo.manager, tenantId, () => this.processCore(job));
    }

    private async processCore(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing outbound message job: ${job.id}`);
        const { messageId, conversationId } = job.data;

        const message = await this.messagesRepo.findOne({ where: { id: messageId } });
        if (!message) {
            this.logger.warn(`Message ${messageId} not found`);
            return;
        }

        const conversation = await this.convRepo.findOne({
            where: { id: conversationId },
            relations: ['channel', 'contact'],
        });

        if (conversation && conversation.channel) {
            const adapter = getChannelAdapter(conversation.channel.type);

            try {
                // Using basic text format for now until adapter is fully extended
                const msgContent: any = { text: message.content };
                
                const result = await adapter.sendMessage(
                    conversation.channel.accessTokenEnc,
                    conversation.contact.externalUserId,
                    msgContent
                );

                if (result.success) {
                    message.status = MessageStatus.SENT;
                    message.externalMsgId = result.externalMessageId || '';
                } else {
                    message.status = MessageStatus.FAILED;
                    this.logger.error(`Zalo API send failed: ${result.error}`);
                    // Save failed status but still throw to trigger BullMQ retry
                    await this.messagesRepo.save(message);
                    throw new Error(result.error || 'Zalo API Error');
                }
            } catch (err: any) {
                message.status = MessageStatus.FAILED;
                this.logger.error(`Zalo API send exception: ${err.message}`);
                await this.messagesRepo.save(message);
                throw err;
            }
        } else {
            message.status = MessageStatus.SENT;
        }

        await this.messagesRepo.save(message);
        return { success: true, status: message.status };
    }
}
