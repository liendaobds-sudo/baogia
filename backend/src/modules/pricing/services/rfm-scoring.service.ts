import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * RFM Scoring Service — Phân loại khách hàng tự động
 * R (Recency): Lần cuối mua hàng cách đây bao lâu
 * F (Frequency): Tần suất mua hàng
 * M (Monetary): Tổng chi tiêu
 * 
 * Score 1-5 cho mỗi chiều, tổng 3-15
 * Segments: VIP(12-15), Loyal(9-11), Regular(6-8), At Risk(4-5), Lost(3)
 */
@Injectable()
export class RfmScoringService {
    private readonly logger = new Logger(RfmScoringService.name);

    constructor(@InjectDataSource() private dataSource: DataSource) {}

    async calculateAll() {
        this.logger.log('Starting RFM scoring...');

        // Get all customers with order stats
        const customers = await this.dataSource.query(`
            SELECT c.id,
                EXTRACT(DAY FROM NOW() - MAX(q.created_at)) as days_since_last,
                COUNT(q.id) as order_count,
                COALESCE(SUM(q.grand_total), 0) as total_spent
            FROM customers c
            LEFT JOIN quotes q ON q.customer_id = c.id AND q.status IN ('completed', 'accepted', 'approved')
            GROUP BY c.id
        `);

        if (!customers.length) {
            this.logger.log('No customers to score');
            return { scored: 0 };
        }

        // Calculate percentile boundaries for each dimension
        const recencies = customers.map((c: any) => parseFloat(c.days_since_last) || 9999).sort((a: number, b: number) => a - b);
        const frequencies = customers.map((c: any) => parseInt(c.order_count) || 0).sort((a: number, b: number) => a - b);
        const monetaries = customers.map((c: any) => parseFloat(c.total_spent) || 0).sort((a: number, b: number) => a - b);

        const percentile = (arr: number[], p: number) => arr[Math.floor(arr.length * p / 100)] || 0;

        const rBreaks = [percentile(recencies, 20), percentile(recencies, 40), percentile(recencies, 60), percentile(recencies, 80)];
        const fBreaks = [percentile(frequencies, 20), percentile(frequencies, 40), percentile(frequencies, 60), percentile(frequencies, 80)];
        const mBreaks = [percentile(monetaries, 20), percentile(monetaries, 40), percentile(monetaries, 60), percentile(monetaries, 80)];

        // Score each customer (in-memory), rồi ghi TẤT CẢ bằng 1 bulk UPDATE (tránh N UPDATE tuần tự).
        const ids: number[] = [];
        const rs: number[] = [];
        const fs: number[] = [];
        const ms: number[] = [];
        const totals: number[] = [];
        const segments: string[] = [];
        for (const c of customers) {
            const daysSince = parseFloat(c.days_since_last) || 9999;
            const freq = parseInt(c.order_count) || 0;
            const monetary = parseFloat(c.total_spent) || 0;

            // R score (lower days = higher score, inverted)
            const rScore = daysSince <= rBreaks[0] ? 5 : daysSince <= rBreaks[1] ? 4 : daysSince <= rBreaks[2] ? 3 : daysSince <= rBreaks[3] ? 2 : 1;
            // F score
            const fScore = freq >= fBreaks[3] ? 5 : freq >= fBreaks[2] ? 4 : freq >= fBreaks[1] ? 3 : freq >= fBreaks[0] ? 2 : 1;
            // M score
            const mScore = monetary >= mBreaks[3] ? 5 : monetary >= mBreaks[2] ? 4 : monetary >= mBreaks[1] ? 3 : monetary >= mBreaks[0] ? 2 : 1;

            const totalScore = rScore + fScore + mScore;
            let segment: string;
            if (totalScore >= 12) segment = 'vip';
            else if (totalScore >= 9) segment = 'loyal';
            else if (totalScore >= 6) segment = 'regular';
            else if (totalScore >= 4) segment = 'at_risk';
            else segment = 'lost';

            ids.push(Number(c.id));
            rs.push(rScore); fs.push(fScore); ms.push(mScore);
            totals.push(totalScore); segments.push(segment);
        }

        // 1 UPDATE cho toàn bộ khách qua unnest(). VIP tự nâng lifecycle_stage (CASE trong SQL).
        await this.dataSource.query(
            `UPDATE customers c SET
                rfm_r = v.r, rfm_f = v.f, rfm_m = v.m, rfm_score = v.score,
                rfm_segment = v.segment, rfm_calculated_at = NOW(),
                lifecycle_stage = CASE WHEN v.segment = 'vip' THEN 'vip' ELSE c.lifecycle_stage END
             FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::int[], $6::text[])
                AS v(id, r, f, m, score, segment)
             WHERE c.id = v.id`,
            [ids, rs, fs, ms, totals, segments],
        );

        const scored = ids.length;
        this.logger.log(`RFM scoring complete: ${scored} customers scored`);
        return { scored };
    }
}
