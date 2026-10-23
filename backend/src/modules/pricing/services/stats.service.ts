import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { Quote } from '../../../entities';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { tenantQbCondition } from '../../../common/tenant/tenant-sql';

@Injectable()
export class StatsService {
    constructor(
        @InjectRepository(Quote) private quoteRepo: Repository<Quote>,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) { }

    /**
     * Cô lập tenant cho số liệu `/erp/stats` (audit 2026-08-29): trước đây
     * `count()`/`SUM(total)` quét toàn bảng `quotes` ⇒ đếm chéo tenant.
     * Thiếu context ⇒ fail-closed (tenantId = -1 ⇒ 0 hàng).
     */
    private scopedWhere(base: FindOptionsWhere<Quote> = {}): FindOptionsWhere<Quote>[] {
        const ctx = this.tenantCtx?.get?.();
        if (ctx?.bypass) return [base];
        if (!ctx || ctx.tenantId == null) return [{ ...base, tenantId: -1 } as FindOptionsWhere<Quote>];
        return [
            { ...base, tenantId: ctx.tenantId } as FindOptionsWhere<Quote>,
            { ...base, tenantId: IsNull() } as FindOptionsWhere<Quote>,
        ];
    }

    async getStats(action?: string) {
        if (action === 'quote-trend') {
            return [
                { date: '2026-04-06', count: 5 }, { date: '2026-04-07', count: 12 },
                { date: '2026-04-08', count: 8 }, { date: '2026-04-09', count: 15 },
                { date: '2026-04-10', count: 10 }, { date: '2026-04-11', count: 4 },
                { date: '2026-04-12', count: 7 }
            ];
        }
        if (action === 'quote-status') {
            return [
                { status: 'new', label: 'Báo giá mới', count: 12 },
                { status: 'processing', label: 'Đang xử lý', count: 8 },
                { status: 'completed', label: 'Hoàn thành', count: 25 },
                { status: 'cancelled', label: 'Đã hủy', count: 3 }
            ];
        }
        if (action === 'recent-quotes') {
            return this.quoteRepo.find({ where: this.scopedWhere(), order: { createdAt: 'DESC' }, take: 6 });
        }
        if (action === 'price-changes') return [];
        if (action === 'low-stock') return [];

        const totalOrders = await this.quoteRepo.count({ where: this.scopedWhere() });
        const newOrders = await this.quoteRepo.count({ where: this.scopedWhere({ status: 'new' }) });
        const completedOrders = await this.quoteRepo.count({ where: this.scopedWhere({ status: 'completed' }) });
        const processingOrders = totalOrders - newOrders - completedOrders;

        const revenueQb = this.quoteRepo.createQueryBuilder('q').select('SUM(q.total)', 'sum');
        const revScope = tenantQbCondition(this.tenantCtx?.get?.(), 'q');
        if (revScope) revenueQb.andWhere(revScope.condition, revScope.params);
        const revenueResult = await revenueQb.getRawOne();
        return {
            totalOrders, processingOrders, completedOrders, newOrders,
            totalRevenue: parseFloat(revenueResult?.sum || 0), lowStockCount: 0
        };
    }
}
