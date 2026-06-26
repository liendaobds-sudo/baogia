import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Quote, QuoteItem, Customer, User } from '../../entities';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { applyTenantToConnection } from '../../common/tenant/tenant-transaction';

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

    async findOne(id: number) {
        const quote = await this.dataSource.getRepository(Quote).createQueryBuilder('q')
            .leftJoinAndMapOne('q.createdBy', User, 'u', 'q.createdBy = u.id')
            .where('q.id = :id', { id })
            .getOne();

        if (!quote) throw new NotFoundException('Quote not found');
        quote.items = await this.dataSource.getRepository(QuoteItem).find({ where: { quoteId: quote.id } });
        return quote;
    }

    async createQuote(data: any, userId: number) {
        if (!data.code) throw new BadRequestException('Quote code is required');
        
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            await applyTenantToConnection(queryRunner, this.tenantCtx);
            let customerId: number | undefined = undefined;
            if (data.customer_phone) {
                let customer = await queryRunner.manager.findOne(Customer, { where: { phone: data.customer_phone } });
                if (!customer) {
                    customer = queryRunner.manager.create(Customer, {
                        name: data.customer_name || undefined,
                        phone: data.customer_phone,
                        email: data.customer_email || undefined,
                        address: data.customer_address || undefined,
                        company: data.customer_unit || undefined,
                        source: 'erp'
                    });
                    await queryRunner.manager.save(customer);
                }
                customerId = customer.id;
            }

            const newQuote = queryRunner.manager.create(Quote, {
                code: data.code,
                type: data.type || 'In nhanh',
                customerId,
                customerName: data.customer_name || 'Khách lẻ',
                customerPhone: data.customer_phone || undefined,
                customerUnit: data.customer_unit || undefined,
                taxCode: data.tax_code || undefined,
                customerAddress: data.customer_address || undefined,
                customerNote: data.customer_note || undefined,
                total: data.total || 0,
                discountType: data.discount_type || undefined,
                discountValue: data.discount_value || 0,
                discountAmount: data.discount_amount || 0,
                createdBy: userId,
                status: 'draft',
                validityDays: data.validity_days || 7,
                source: 'erp'
            });

            await queryRunner.manager.save(newQuote);

            if (data.items && Array.isArray(data.items)) {
                for (const item of data.items) {
                    const mappedItem = this.mapInputToItemEntity(item);
                    mappedItem.quoteId = newQuote.id;
                    const dbItem = queryRunner.manager.create(QuoteItem, mappedItem);
                    await queryRunner.manager.save(dbItem);
                }
            }

            await queryRunner.commitTransaction();
            return this.findOne(newQuote.id);
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }

    async updateQuote(id: number, data: any, userId: number) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            await applyTenantToConnection(queryRunner, this.tenantCtx);
            const quote = await queryRunner.manager.findOne(Quote, { where: { id } });
            if (!quote) throw new NotFoundException('Quote not found');

            const allowedFields = {
                customer_name: 'customerName', customer_phone: 'customerPhone', 
                customer_unit: 'customerUnit', tax_code: 'taxCode', 
                customer_address: 'customerAddress', customer_note: 'customerNote', 
                total: 'total', status: 'status', discount_type: 'discountType', 
                discount_value: 'discountValue', discount_amount: 'discountAmount'
            };

            for (const [key, prop] of Object.entries(allowedFields)) {
                if (data[key] !== undefined) (quote as any)[prop] = data[key];
            }

            await queryRunner.manager.save(quote);

            if (data.items && Array.isArray(data.items)) {
                await queryRunner.manager.delete(QuoteItem, { quoteId: id });
                for (const item of data.items) {
                    const mappedItem = this.mapInputToItemEntity(item);
                    mappedItem.quoteId = quote.id;
                    const dbItem = queryRunner.manager.create(QuoteItem, mappedItem);
                    await queryRunner.manager.save(dbItem);
                }
            }
            await queryRunner.commitTransaction();
            return this.findOne(id);
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }

    async deleteQuote(id: number) {
        const quote = await this.dataSource.getRepository(Quote).findOne({ where: { id } });
        if (!quote) throw new NotFoundException('Quote not found');
        await this.dataSource.getRepository(Quote).delete(id);
        return { message: 'Quote deleted successfully' };
    }

    async cloneQuote(id: number, userId: number) {
        const originalQuote = await this.findOne(id);
        const code = `BG-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const dataToCopy = {
            code,
            type: originalQuote.type,
            customer_name: originalQuote.customerName,
            customer_phone: originalQuote.customerPhone,
            customer_unit: originalQuote.customerUnit,
            tax_code: originalQuote.taxCode,
            customer_address: originalQuote.customerAddress,
            customer_note: originalQuote.customerNote,
            total: originalQuote.total,
            validity_days: originalQuote.validityDays,
            items: originalQuote.items.map(i => {
                const itemObj: any = { ...i };
                // revert entity keys to snake_case inputs for the creator
                return {
                    item_type: itemObj.itemType, product_name: itemObj.productName, unit: itemObj.unit,
                    material_id: itemObj.materialId, paper_size_id: itemObj.paperSizeId,
                    quantity: itemObj.quantity, print_side: itemObj.printSide, print_type: itemObj.printType,
                    shape: itemObj.shape, items_per_sheet: itemObj.itemsPerSheet, sheets_needed: itemObj.sheetsNeeded,
                    item_total: itemObj.itemTotal, product_type: itemObj.productType, bound_size: itemObj.boundSize,
                    page_count: itemObj.pageCount, binding_type: itemObj.bindingType,
                };
            })
        };

        return this.createQuote(dataToCopy, userId);
    }

    async sendQuote(id: number) {
        const quote = await this.dataSource.getRepository(Quote).findOne({ where: { id } });
        if (!quote) throw new NotFoundException('Quote not found');
        if (quote.status !== 'draft') throw new BadRequestException('Quote must be draft to send');
        quote.status = 'sent';
        await this.dataSource.getRepository(Quote).save(quote);
        return { message: 'Quote marked as sent' };
    }

    private mapInputToItemEntity(item: any): Partial<QuoteItem> {
        return {
            itemType: item.item_type || 'loose',
            productName: item.product_name || 'Sản phẩm',
            unit: item.unit || 'Tờ',
            materialId: item.material_id || undefined,
            materialName: item.material_name || undefined,
            paperSizeId: item.paper_size_id || undefined,
            paperSizeName: item.paper_size_name || undefined,
            quantity: item.quantity || 0,
            printSide: item.print_side || 'single',
            printType: item.print_type || undefined,
            shape: item.shape || 'rectangle',
            itemsPerSheet: item.items_per_sheet || 0,
            sheetsNeeded: item.sheets_needed || 0,
            processingDetails: item.processing_details ? JSON.stringify(item.processing_details) : undefined,
            printingDetail: item.printing_detail ? JSON.stringify(item.printing_detail) : undefined,
            itemTotal: item.item_total || 0,
            productType: item.product_type || undefined,
            boundSize: item.bound_size || item.size || undefined,
            pageCount: item.page_count || 0,
            bindingType: item.binding_type || undefined,
            coverMaterialId: item.cover_material_id || undefined,
            innerMaterialId: item.inner_material_id || undefined,
            coverMaterialName: item.cover_material_name || undefined,
            innerMaterialName: item.inner_material_name || undefined,
            coverPrint: item.cover_print || undefined,
            innerPrint: item.inner_print || undefined,
            coverFinishing: item.cover_finishing ? JSON.stringify(item.cover_finishing) : undefined,
            extraServices: item.extra_services ? JSON.stringify(item.extra_services) : undefined,
            itemWidth: item.item_width || 0,
            itemHeight: item.item_height || 0,
            coverSheetsNeeded: item.cover_sheets_needed || 0,
            innerSheetsNeeded: item.inner_sheets_needed || 0,
            productId: item.product_id || undefined
        };
    }

    /** Generate professional HTML invoice for PDF printing */
    async generatePdfHtml(id: number): Promise<string> {
        const quote = await this.findOne(id);
        const items = quote.items || [];
        const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
        const date = new Date(quote.createdAt).toLocaleDateString('vi-VN');

        const rows = items.map((item: any, i: number) => `
            <tr>
                <td style="padding:10px;border:1px solid #e2e8f0;text-align:center">${i + 1}</td>
                <td style="padding:10px;border:1px solid #e2e8f0">${item.productName || 'Sản phẩm'}</td>
                <td style="padding:10px;border:1px solid #e2e8f0;text-align:center">${item.unit || 'Tờ'}</td>
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
    <div class="quote-info"><div class="code">${quote.code}</div><div class="date">Ngày: ${date}</div>
    <div class="date">Hiệu lực: ${quote.validityDays || 7} ngày</div></div>
</div>
<div class="section"><h3>Thông tin khách hàng</h3>
<div class="info-grid">
    <span class="label">Tên:</span><span class="value">${quote.customerName || 'Khách lẻ'}</span>
    <span class="label">SĐT:</span><span class="value">${quote.customerPhone || '—'}</span>
    <span class="label">Đơn vị:</span><span class="value">${quote.customerUnit || '—'}</span>
    <span class="label">Địa chỉ:</span><span class="value">${quote.customerAddress || '—'}</span>
</div></div>
<div class="section"><h3>Chi tiết sản phẩm</h3>
<table><thead><tr><th style="text-align:center">STT</th><th>Sản phẩm</th><th style="text-align:center">ĐVT</th><th style="text-align:right">SL</th><th style="text-align:right">Đơn giá</th><th style="text-align:right">Thành tiền</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="totals">
    ${quote.discountAmount ? `<div>Chiết khấu: -${fmt(quote.discountAmount)}₫</div>` : ''}
    <div class="grand">Tổng cộng: ${fmt(quote.total || 0)}₫</div>
</div></div>
${quote.customerNote ? `<div class="section"><h3>Ghi chú</h3><p style="font-size:13px;color:#475569">${quote.customerNote}</p></div>` : ''}
<div class="footer">Báo giá được tạo tự động bởi ZeplaoPrint ERP • ${date}</div>
</body></html>`;
    }
}
