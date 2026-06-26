import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class PricingDashboardService {
    private readonly logger = new Logger(PricingDashboardService.name);

    constructor(
        @InjectDataSource() private ds: DataSource,
    ) {}

    /**
     * Overview KPIs for the tenant's pricing dashboard
     */
    async getOverview() {
        try {
            // Quote stats
            const quoteStats = await this.ds.query(`
                SELECT 
                    COUNT(*) as total_quotes,
                    COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
                    COUNT(CASE WHEN status = 'pending_approval' THEN 1 END) as pending,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
                    COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
                    COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                    COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
                    COALESCE(SUM(CASE WHEN status IN ('approved','sent','accepted','completed') THEN total ELSE 0 END), 0) as total_revenue,
                    COALESCE(SUM(CASE WHEN status IN ('approved','sent','accepted','completed') AND created_at >= date_trunc('month', CURRENT_DATE) THEN total ELSE 0 END), 0) as month_revenue
                FROM quotes
            `).catch(() => [{}]);

            // Material stats
            const materialStats = await this.ds.query(`
                SELECT 
                    COUNT(*) as total_materials,
                    COUNT(CASE WHEN CAST(stock AS numeric) < CAST(COALESCE(min_stock, '0') AS numeric) THEN 1 END) as low_stock
                FROM materials
            `).catch(() => [{}]);

            // Customer stats
            const customerStats = await this.ds.query(`
                SELECT COUNT(*) as total_customers FROM customers
            `).catch(() => [{ total_customers: 0 }]);

            // This month vs last month
            const monthComparison = await this.ds.query(`
                SELECT
                    COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) THEN 1 END) as this_month_quotes,
                    COUNT(CASE WHEN created_at >= date_trunc('month', CURRENT_DATE) - interval '1 month' AND created_at < date_trunc('month', CURRENT_DATE) THEN 1 END) as last_month_quotes,
                    COALESCE(SUM(CASE WHEN status IN ('approved','sent','accepted','completed') AND created_at >= date_trunc('month', CURRENT_DATE) THEN total ELSE 0 END), 0) as this_month_revenue,
                    COALESCE(SUM(CASE WHEN status IN ('approved','sent','accepted','completed') AND created_at >= date_trunc('month', CURRENT_DATE) - interval '1 month' AND created_at < date_trunc('month', CURRENT_DATE) THEN total ELSE 0 END), 0) as last_month_revenue
                FROM quotes
            `).catch(() => [{}]);

            const q = quoteStats[0] || {};
            const m = materialStats[0] || {};
            const c = customerStats[0] || {};
            const mc = monthComparison[0] || {};

            const conversionRate = parseInt(q.total_quotes || '0') > 0
                ? Math.round((parseInt(q.completed || '0') + parseInt(q.accepted || '0')) / parseInt(q.total_quotes) * 100)
                : 0;

            return {
                quotes: {
                    total: parseInt(q.total_quotes || '0'),
                    draft: parseInt(q.draft || '0'),
                    pending: parseInt(q.pending || '0'),
                    approved: parseInt(q.approved || '0'),
                    sent: parseInt(q.sent || '0'),
                    accepted: parseInt(q.accepted || '0'),
                    completed: parseInt(q.completed || '0'),
                    rejected: parseInt(q.rejected || '0'),
                    cancelled: parseInt(q.cancelled || '0'),
                },
                revenue: {
                    total: parseFloat(q.total_revenue || '0'),
                    thisMonth: parseFloat(mc.this_month_revenue || '0'),
                    lastMonth: parseFloat(mc.last_month_revenue || '0'),
                },
                materials: {
                    total: parseInt(m.total_materials || '0'),
                    lowStock: parseInt(m.low_stock || '0'),
                },
                customers: {
                    total: parseInt(c.total_customers || '0'),
                },
                conversionRate,
                thisMonthQuotes: parseInt(mc.this_month_quotes || '0'),
                lastMonthQuotes: parseInt(mc.last_month_quotes || '0'),
            };
        } catch (e: any) {
            this.logger.error(`Dashboard overview error: ${e?.message}`);
            return { quotes: { total: 0 }, revenue: { total: 0, thisMonth: 0, lastMonth: 0 }, materials: { total: 0, lowStock: 0 }, customers: { total: 0 }, conversionRate: 0 };
        }
    }

    /**
     * Monthly revenue chart data (12 months)
     */
    async getRevenueChart(months = 12) {
        try {
            const rows = await this.ds.query(`
                SELECT 
                    to_char(date_trunc('month', created_at), 'YYYY-MM') as month,
                    COUNT(*) as quotes_count,
                    COALESCE(SUM(CASE WHEN status IN ('approved','sent','accepted','completed') THEN total ELSE 0 END), 0) as revenue
                FROM quotes
                WHERE created_at >= (CURRENT_DATE - ($1 || ' months')::interval)
                GROUP BY date_trunc('month', created_at)
                ORDER BY month ASC
            `, [months]);

            return rows.map((r: any) => ({
                month: r.month,
                quotes: parseInt(r.quotes_count || '0'),
                revenue: parseFloat(r.revenue || '0'),
            }));
        } catch {
            return [];
        }
    }

    /**
     * Top products by quote frequency
     */
    async getTopProducts(limit = 10) {
        try {
            const rows = await this.ds.query(`
                SELECT product_name, COUNT(*) as count, COALESCE(SUM(total), 0) as revenue
                FROM quotes
                WHERE product_name IS NOT NULL AND product_name != ''
                GROUP BY product_name
                ORDER BY count DESC
                LIMIT $1
            `, [limit]);

            return rows.map((r: any) => ({
                product: r.product_name,
                count: parseInt(r.count || '0'),
                revenue: parseFloat(r.revenue || '0'),
            }));
        } catch {
            return [];
        }
    }

    /**
     * Top customers by quote value
     */
    async getTopCustomers(limit = 10) {
        try {
            const rows = await this.ds.query(`
                SELECT customer_name, customer_phone, COUNT(*) as quote_count, COALESCE(SUM(total), 0) as total_value
                FROM quotes
                WHERE customer_name IS NOT NULL AND customer_name != ''
                GROUP BY customer_name, customer_phone
                ORDER BY total_value DESC
                LIMIT $1
            `, [limit]);

            return rows.map((r: any) => ({
                name: r.customer_name,
                phone: r.customer_phone,
                quotes: parseInt(r.quote_count || '0'),
                revenue: parseFloat(r.total_value || '0'),
            }));
        } catch {
            return [];
        }
    }

    /**
     * Alerts: low stock, expiring subscription, pending approvals
     */
    async getAlerts() {
        const alerts: { type: string; severity: string; message: string; count?: number }[] = [];

        try {
            // Low stock materials
            const [lowStock] = await this.ds.query(`
                SELECT COUNT(*) as cnt FROM materials WHERE CAST(stock AS numeric) < CAST(COALESCE(min_stock, '0') AS numeric)
            `).catch(() => [{ cnt: 0 }]);
            if (parseInt(lowStock?.cnt || '0') > 0) {
                alerts.push({ type: 'low_stock', severity: 'warning', message: `${lowStock.cnt} vật tư dưới mức tồn kho tối thiểu`, count: parseInt(lowStock.cnt) });
            }

            // Pending approvals
            const [pending] = await this.ds.query(`
                SELECT COUNT(*) as cnt FROM quotes WHERE status = 'pending_approval'
            `).catch(() => [{ cnt: 0 }]);
            if (parseInt(pending?.cnt || '0') > 0) {
                alerts.push({ type: 'pending_approval', severity: 'info', message: `${pending.cnt} báo giá đang chờ duyệt`, count: parseInt(pending.cnt) });
            }

            // Expiring quotes (within 3 days)
            const [expiring] = await this.ds.query(`
                SELECT COUNT(*) as cnt FROM quotes 
                WHERE status IN ('draft', 'sent') AND valid_until IS NOT NULL AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '3 days'
            `).catch(() => [{ cnt: 0 }]);
            if (parseInt(expiring?.cnt || '0') > 0) {
                alerts.push({ type: 'expiring_quotes', severity: 'warning', message: `${expiring.cnt} báo giá sắp hết hạn (3 ngày tới)`, count: parseInt(expiring.cnt) });
            }
        } catch { /* ignore */ }

        return alerts;
    }
}
