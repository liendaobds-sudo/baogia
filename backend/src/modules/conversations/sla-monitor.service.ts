import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConversationsService } from './conversations.service';
import { EventsGateway } from '../gateway/events.gateway';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { forEachTenant } from '../../common/tenant/tenant-background';

@Injectable()
export class SlaMonitorService {
    private readonly logger = new Logger(SlaMonitorService.name);

    constructor(
        private convService: ConversationsService,
        private gateway: EventsGateway,
        @Optional() private tenantCtx?: TenantContextService,
        @Optional() @InjectDataSource() private dataSource?: DataSource,
    ) { }

    /**
     * Khi RLS bật (TENANT_RLS_ENABLED): lặp từng tenant, mỗi vòng quét SLA trong scope
     * tenant (RLS lọc đúng hội thoại từng xưởng). Khi tắt (mặc định): chạy thẳng như cũ.
     */
    @Cron(CronExpression.EVERY_30_SECONDS)
    async checkSlaBreaches() {
        const manager = this.dataSource?.manager ?? (this.convService as any).convRepo?.manager;
        await forEachTenant(this.tenantCtx, manager, () => this.checkSlaBreachesCore());
    }

    private async checkSlaBreachesCore() {
        const breached = await this.convService.findBreachedSla();
        if (breached.length === 0) return;

        this.logger.warn(`⏰ SLA breaches detected: ${breached.length} conversations`);

        for (const conv of breached) {
            await this.convService.update(conv.id, { slaBreached: true } as any);
            this.gateway.emitConversationUpdated({
                id: conv.id,
                slaBreached: true,
            }, conv.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined);

            // Notify assignee if any
            if (conv.assigneeId) {
                this.gateway.emitNotification(conv.assigneeId, {
                    type: 'sla_breach',
                    conversationId: conv.id,
                    message: `SLA đã vượt hạn cho hội thoại với ${conv.contactId}`,
                }, conv.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined);
            }
        }
    }
}
