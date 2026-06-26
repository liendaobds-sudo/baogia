import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConversationsService } from './conversations.service';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class SlaMonitorService {
    private readonly logger = new Logger(SlaMonitorService.name);

    constructor(
        private convService: ConversationsService,
        private gateway: EventsGateway,
    ) { }

    @Cron(CronExpression.EVERY_30_SECONDS)
    async checkSlaBreaches() {
        const breached = await this.convService.findBreachedSla();
        if (breached.length === 0) return;

        this.logger.warn(`⏰ SLA breaches detected: ${breached.length} conversations`);

        for (const conv of breached) {
            await this.convService.update(conv.id, { slaBreached: true } as any);
            this.gateway.emitConversationUpdated({
                id: conv.id,
                slaBreached: true,
            });

            // Notify assignee if any
            if (conv.assigneeId) {
                this.gateway.emitNotification(conv.assigneeId, {
                    type: 'sla_breach',
                    conversationId: conv.id,
                    message: `SLA đã vượt hạn cho hội thoại với ${conv.contactId}`,
                });
            }
        }
    }
}
