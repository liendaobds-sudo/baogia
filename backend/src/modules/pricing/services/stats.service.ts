import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from '../../../entities';

@Injectable()
export class StatsService {
    constructor(@InjectRepository(Quote) private quoteRepo: Repository<Quote>) { }

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
            return this.quoteRepo.find({ order: { createdAt: 'DESC' }, take: 6 });
        }
        if (action === 'price-changes') return [];
        if (action === 'low-stock') return [];

        const totalOrders = await this.quoteRepo.count();
        const newOrders = await this.quoteRepo.count({ where: { status: 'new' } });
        const completedOrders = await this.quoteRepo.count({ where: { status: 'completed' } });
        const processingOrders = totalOrders - newOrders - completedOrders;

        const revenueResult = await this.quoteRepo.createQueryBuilder('q').select('SUM(q.total)', 'sum').getRawOne();
        return {
            totalOrders, processingOrders, completedOrders, newOrders,
            totalRevenue: parseFloat(revenueResult?.sum || 0), lowStockCount: 0
        };
    }
}
