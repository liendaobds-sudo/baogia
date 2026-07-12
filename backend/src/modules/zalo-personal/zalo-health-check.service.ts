import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { ZaloAccount, ZaloAccountStatus } from '../../entities/zalo-account.entity';
import { ZaloPoolService } from './zalo-pool.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { forEachTenant } from '../../common/tenant/tenant-background';

/**
 * ZaloHealthCheckService — Cron-based health monitor for Zalo account connections.
 * Ported from ZaloCRM's zalo-health-check.ts
 *
 * Functions:
 * 1. Every 5 minutes: detect disconnected accounts → auto-reconnect
 * 2. Daily at 04:00 UTC (11:00 VN): refresh all sessions to keep cookies fresh
 * 3. Daily: reset daily send counters
 */
@Injectable()
export class ZaloHealthCheckService {
    private readonly logger = new Logger(ZaloHealthCheckService.name);

    constructor(
        @InjectRepository(ZaloAccount)
        private readonly repo: Repository<ZaloAccount>,
        private readonly pool: ZaloPoolService,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) {}

    /**
     * Every 5 minutes: check all accounts with saved sessions.
     * If disconnected → attempt auto-reconnect.
     *
     * Khi RLS bật: lặp từng tenant, đọc/sửa zalo_accounts trong scope tenant (RLS lọc
     * đúng tài khoản từng xưởng). Khi tắt (mặc định): chạy thẳng như cũ.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async healthCheck(): Promise<void> {
        if (!this.pool.isAvailable()) return; // zca-js not installed
        await forEachTenant(this.tenantCtx, this.repo.manager, () => this.healthCheckCore());
    }

    private async healthCheckCore(): Promise<void> {
        try {
            const accounts = await this.repo.find({
                where: { sessionData: Not(IsNull()) },
                select: ['id', 'displayName', 'sessionData'],
            });

            for (const acc of accounts) {
                const status = this.pool.getStatus(acc.id);
                if (
                    status !== 'connected' &&
                    status !== 'connecting' &&
                    status !== 'qr_pending'
                ) {
                    const session = acc.sessionData as any;
                    if (session?.imei) {
                        this.logger.log(
                            `[health-check] Reconnecting ${acc.displayName || acc.id}...`,
                        );
                        this.pool.reconnect(acc.id, session).catch((err) => {
                            this.logger.warn(
                                `[health-check] Reconnect failed for ${acc.id}:`,
                                err,
                            );
                        });
                    }
                }
            }
        } catch (err) {
            this.logger.error('[health-check] Error during health check:', err);
        }
    }

    /**
     * Daily at 04:00 UTC (11:00 AM VN): refresh all sessions.
     * Disconnect → wait → reconnect to force cookie renewal.
     * Stagger reconnects by 10s per account to avoid rate limits.
     */
    @Cron('0 4 * * *')
    async dailyRefresh(): Promise<void> {
        if (!this.pool.isAvailable()) return;

        this.logger.log('[health-check] 🔄 Daily session refresh starting...');
        await forEachTenant(this.tenantCtx, this.repo.manager, () => this.dailyRefreshCore());
    }

    private async dailyRefreshCore(): Promise<void> {
        try {
            const accounts = await this.repo.find({
                where: { sessionData: Not(IsNull()) },
                select: ['id', 'sessionData'],
            });

            for (const acc of accounts) {
                const session = acc.sessionData as any;
                if (session?.imei) {
                    this.pool.disconnect(acc.id);
                    await new Promise((r) => setTimeout(r, 5_000)); // Wait 5s
                    this.pool.reconnect(acc.id, session).catch((err) => {
                        this.logger.warn(
                            `[health-check] Daily refresh failed for ${acc.id}:`,
                            err,
                        );
                    });
                }
                // Stagger: 10s between each account reconnect
                await new Promise((r) => setTimeout(r, 10_000));
            }
        } catch (err) {
            this.logger.error('[health-check] Error during daily refresh:', err);
        }
    }

    /**
     * Daily at midnight: reset daily send counters.
     */
    @Cron('0 0 * * *')
    async resetDailyCounts(): Promise<void> {
        await forEachTenant(this.tenantCtx, this.repo.manager, () => this.resetDailyCountsCore());
    }

    private async resetDailyCountsCore(): Promise<void> {
        try {
            await this.repo.update({}, { dailySendCount: 0 });
            this.logger.log('[health-check] Daily send counters reset');
        } catch (err) {
            this.logger.error('[health-check] Error resetting daily counts:', err);
        }
    }
}
