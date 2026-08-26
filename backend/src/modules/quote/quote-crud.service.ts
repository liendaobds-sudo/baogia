import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Quote, QuoteItem, User } from '../../entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

@Injectable()
export class QuoteCrudService {
    private readonly logger = new Logger(QuoteCrudService.name);
    constructor(
        @InjectDataSource() private dataSource: DataSource,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) {}

    async findAll(query: any) {
        try {
        const qb = this.dataSource.getRepository(Quote).createQueryBuilder('q')
            .orderBy('q.createdAt', 'DESC');

        // Tenant filter (defense-in-depth; reads still allowed for legacy list UIs)
        const ctx = this.tenantCtx?.get?.();
        if (ctx && !ctx.bypass && ctx.tenantId != null) {
            qb.andWhere('(q.tenantId = :_tid OR q.tenantId IS NULL)', { _tid: ctx.tenantId });
        }

        if (query.date_from) qb.andWhere('DATE(q.createdAt) >= :from', { from: query.date_from });
        if (query.date_to) qb.andWhere('DATE(q.createdAt) <= :to', { to: query.date_to });
        if (query.status) qb.andWhere('q.status = :status', { status: query.status });
        if (query.code) qb.andWhere('q.code LIKE :code', { code: `%${query.code}%` });
        if (query.customer_name) qb.andWhere('q.customerName LIKE :cname', { cname: `%${query.customer_name}%` });
        if (query.customer_phone) qb.andWhere('q.customerPhone LIKE :cphone', { cphone: `%${query.customer_phone}%` });
        // Cross-DB filtering not supported automatically
        // if (query.created_by) qb.andWhere('u.fullName LIKE :creator', { creator: `%${query.created_by}%` });

        if (query.keyword) {
            const kw = `%${query.keyword}%`;
            qb.andWhere('(q.code LIKE :kw OR q.customerName LIKE :kw OR q.customerPhone LIKE :kw)', { kw });
        }

        const page = query.page ? Math.max(1, parseInt(query.page)) : null;
        const limit = query.limit ? Math.max(1, parseInt(query.limit)) : null;

        if (page && limit) {
            qb.skip((page - 1) * limit).take(limit);
            const [quotes, total] = await qb.getManyAndCount();
            
            for (const q of quotes) {
                q.items = await this.dataSource.getRepository(QuoteItem)
                    .find({ where: { quoteId: q.id }, select: ['itemType', 'printType', 'productType'] });
            }

            return {
                data: quotes,
                pagination: {
                    page, limit, total,
                    total_pages: Math.ceil(total / limit),
                    has_prev: page > 1,
                    has_next: page < Math.ceil(total / limit)
                }
            };
        }

        const quotes = await qb.getMany();
        for (const q of quotes) {
            q.items = await this.dataSource.getRepository(QuoteItem)
                .find({ where: { quoteId: q.id }, select: ['itemType', 'printType', 'productType'] });
        }
        return quotes;
        } catch (e: any) {
            this.logger.error(`findAll quotes failed: ${e?.message}`, e?.stack);
            throw e;
        }
    }

    /**
     * Chốt IDOR (audit 2026-08-13): bản ghi thuộc tenant khác → 404 như không tồn tại
     * (cùng pattern assertConversationInTenant của messages). Hàng legacy tenant NULL
     * vẫn đọc được — nhất quán với findAll; sẽ siết khi gỡ nới lỏng sau flip RLS.
     */
    private assertQuoteInTenant(quote: { tenantId?: number | null } | null): void {
        if (!quote) throw new NotFoundException('Quote not found');
        const ctx = this.tenantCtx?.get?.();
        if (ctx && !ctx.bypass && ctx.tenantId != null
            && (quote as any).tenantId != null && (quote as any).tenantId !== ctx.tenantId) {
            throw new NotFoundException('Quote not found');
        }
    }

    async findOne(id: number) {
        const quote = await this.dataSource.getRepository(Quote).createQueryBuilder('q')
            .leftJoinAndMapOne('q.createdBy', User, 'u', 'q.createdBy = u.id')
            .where('q.id = :id', { id })
            .getOne();

        this.assertQuoteInTenant(quote);
        quote!.items = await this.dataSource.getRepository(QuoteItem).find({ where: { quoteId: quote!.id } });
        return quote!;
    }

    // LƯU Ý (dọn 2026-08-13): createQuote/updateQuote/deleteQuote/cloneQuote đã XÓA.
    // Các endpoint tương ứng trả 410 Gone từ trước (quote.controller.ts) và không còn
    // call-site nào; bản service cũ nhận `total`/`item_total` thẳng từ client (không
    // recompute) — giữ code chết này lại chỉ để lại một đường sửa giá tay. Đường ghi
    // chính thống: POST/PUT /erp/orders (OrdersService — recompute server-side).

    async sendQuote(id: number) {
        const quote = await this.dataSource.getRepository(Quote).findOne({ where: { id } });
        this.assertQuoteInTenant(quote);
        if (quote!.status !== 'draft') throw new BadRequestException('Quote must be draft to send');
        quote!.status = 'sent';
        await this.dataSource.getRepository(Quote).save(quote!);
        return { message: 'Quote marked as sent' };
    }

    /**
     * Escape HTML — chống HTML/script injection vào trang in. customerNote/customerName
     * có thể bắt nguồn từ chatbot public (khách tự nhập); trước đây nội suy thẳng vào
     * template (audit 2026-08-13) trong khi QuotePdfService đã có esc() từ lâu.
     */
    private esc(value: unknown): string {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Generate professional HTML invoice for PDF printing */
    async generatePdfHtml(id: number): Promise<string> {
        const quote = await this.findOne(id);
        const items = quote.items || [];
        const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
        const date = new Date(quote.createdAt).toLocaleDateString('vi-VN');
        const esc = (v: unknown) => this.esc(v);

        const rows = items.map((item: any, i: number) => `
            <tr>
                <td style="padding:10px;border:1px solid #e2e8f0;text-align:center">${i + 1}</td>
                <td style="padding:10px;border:1px solid #e2e8f0">${esc(item.productName || 'Sản phẩm')}</td>
                <td style="padding:10px;border:1px solid #e2e8f0;text-align:center">${esc(item.unit || 'cái')}</td>
                <td style="padding:10px;border:1px solid #e2e8f0;text-align:right">${fmt(item.quantity || 0)}</td>
                <td style="padding:10px;border:1px solid #e2e8f0;text-align:right">${item.quantity ? fmt(Math.round((item.itemTotal || 0) / item.quantity)) : '—'}</td>
                <td style="padding:10px;border:1px solid #e2e8f0;text-align:right;font-weight:600">${fmt(item.itemTotal || 0)}₫</td>
            </tr>
        `).join('');

        return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>Báo giá ${quote.code}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;padding:40px;max-width:800px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #2563eb}
.company{font-size:22px;font-weight:700;color:#2563eb}
.company small{display:block;font-size:12px;color:#64748b;font-weight:400;margin-top:4px}
.quote-info{text-align:right}
.quote-info .code{font-size:18px;font-weight:700;color:#0f172a}
.quote-info .date{font-size:13px;color:#64748b;margin-top:4px}
.section{margin-bottom:24px}
.section h3{font-size:14px;font-weight:600;color:#2563eb;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px}
.info-grid .label{color:#64748b}
.info-grid .value{font-weight:600}
table{width:100%;border-collapse:collapse;font-size:13px;margin:16px 0}
th{background:#f1f5f9;padding:10px;border:1px solid #e2e8f0;font-weight:600;color:#334155;text-align:left}
.totals{text-align:right;margin-top:16px;font-size:14px}
.totals .grand{font-size:20px;font-weight:700;color:#2563eb}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center}
@media print{body{padding:20px}@page{margin:15mm}}
</style></head><body>
<div class="header">
    <div><div class="company">🖨️ ZeplaoPrint<small>In ấn chuyên nghiệp • Báo giá nhanh</small></div></div>
    <div class="quote-info"><div class="code">${esc(quote.code)}</div><div class="date">Ngày: ${date}</div>
    <div class="date">Hiệu lực: ${quote.validityDays || 7} ngày</div></div>
</div>
<div class="section"><h3>Thông tin khách hàng</h3>
<div class="info-grid">
    <span class="label">Tên:</span><span class="value">${esc(quote.customerName || 'Khách lẻ')}</span>
    <span class="label">SĐT:</span><span class="value">${esc(quote.customerPhone || '—')}</span>
    <span class="label">Đơn vị:</span><span class="value">${esc(quote.customerUnit || '—')}</span>
    <span class="label">Địa chỉ:</span><span class="value">${esc(quote.customerAddress || '—')}</span>
</div></div>
<div class="section"><h3>Chi tiết sản phẩm</h3>
<table><thead><tr><th style="text-align:center">STT</th><th>Sản phẩm</th><th style="text-align:center">ĐVT</th><th style="text-align:right">SL</th><th style="text-align:right">Đơn giá</th><th style="text-align:right">Thành tiền</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="totals">
    ${quote.discountAmount ? `<div>Chiết khấu: -${fmt(quote.discountAmount)}₫</div>` : ''}
    <div class="grand">Tổng cộng: ${fmt(quote.total || 0)}₫</div>
</div></div>
${quote.customerNote ? `<div class="section"><h3>Ghi chú</h3><p style="font-size:13px;color:#475569">${esc(quote.customerNote)}</p></div>` : ''}
<div class="footer">Báo giá được tạo tự động bởi ZeplaoPrint ERP • ${date}</div>
</body></html>`;
    }
}
