import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { QuotePdfService } from './quote-pdf.service';
import { CustomersService } from './customers.service';
import { EngineOffsetService } from '../offset-engine/engine-offset.service';
import { PricingFacadeService } from './pricing-facade.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { applyTenantToConnection } from '../../../common/tenant/tenant-transaction';

@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        @InjectDataSource() private dataSource: DataSource,
        private quotePdfService: QuotePdfService,
        private customersService: CustomersService,
        private engineOffset: EngineOffsetService,
        @Optional() private readonly tenantCtx?: TenantContextService,
        // Optional: unit test dựng OrdersService không có facade → recompute digital bỏ qua (tin giá đã lưu).
        @Optional() private readonly pricingFacade?: PricingFacadeService,
    ) { }

    /** tenant hiện hành (non-bypass) để GHI; null cho system/không context. */
    private writeTenantId(): number | null {
        const ctx = this.tenantCtx?.get?.();
        return ctx && !ctx.bypass ? ctx.tenantId : null;
    }

    /**
     * Ràng buộc tenant cho SQL raw (lưới an toàn khi RLS chưa flip): trả mệnh đề
     * `AND (<col> = $N OR <col> IS NULL)` + tham số, hoặc rỗng khi ngoài context/bypass.
     * @param nextIdx chỉ số tham số kế tiếp ($N) để nối vào query hiện có.
     */
    private tenantGuard(nextIdx: number, col = 'tenant_id'): { clause: string; params: any[] } {
        const ctx = this.tenantCtx?.get?.();
        if (!ctx || ctx.bypass) return { clause: '', params: [] };
        return { clause: ` AND (${col} = $${nextIdx} OR ${col} IS NULL)`, params: [ctx.tenantId] };
    }

    /** Loại sản phẩm offset (server tự nhận diện, KHÔNG chỉ tin cờ client `printing_detail.offset`). */
    private static readonly OFFSET_TYPES = new Set(['offset', 'to_roi', 'bi_thu_folder', 'sp_khac', 'hop_giay', 'tui_giay']);

    /**
     * Item có phải offset không — nhận diện bằng NHIỀU dấu hiệu để chặn "bỏ recompute":
     * cờ `printing_detail.offset`, HOẶC `item_type`/`product_type` thuộc nhóm offset.
     * Nhờ vậy client không thể né tính-lại-giá chỉ bằng cách bỏ cờ `offset`.
     */
    private isOffsetItem(item: Record<string, unknown>): boolean {
        const pd = item.printing_detail as any;
        if (pd?.offset === true) return true;
        const it = String(item.item_type ?? '').toLowerCase();
        const pt = String(item.product_type ?? '').toLowerCase();
        return it === 'offset' || OrdersService.OFFSET_TYPES.has(it) || OrdersService.OFFSET_TYPES.has(pt);
    }

    /**
     * Tính LẠI giá các item offset từ cấu hình đã lưu (`printing_detail.config`) bằng engine —
     * KHÔNG tin giá client gửi (chống sửa giá). Ghi đè `item_total` + `printing_detail.result/unitPrice`,
     * trả tổng để dựng total/vat/grand cho header. Item không phải offset giữ nguyên.
     *
     * Item ĐƯỢC nhận diện là offset nhưng THIẾU `config` ⇒ ném lỗi (không cho gửi giá offset
     * không kèm cơ sở tính → chống lách chống-sửa-giá bằng cách bỏ config/cờ).
     */
    private recomputeOffsetItems(items: Record<string, unknown>[]): { count: number; sumPreVatNet: number; sumChietKhau: number } {
        let count = 0, sumPreVatNet = 0, sumChietKhau = 0;
        for (const item of items) {
            if (!this.isOffsetItem(item)) continue;
            const pd = item.printing_detail as any;
            if (!pd || !pd.config) {
                throw new Error(`Thiếu cấu hình để xác thực giá offset cho "${item.product_name || 'sản phẩm'}".`);
            }
            const res = this.engineOffset.calculate(pd.config);
            if (!res.success || !res.data) {
                throw new Error(`Không tính lại được giá offset cho "${item.product_name || 'sản phẩm'}": ${res.error || 'lỗi không xác định'}`);
            }
            // QUY ƯỚC THỐNG NHẤT (offset + in nhanh): item_total = giá TRƯỚC VAT, đã trừ chiết khấu nội bộ engine.
            // VAT áp 1 LẦN ở header báo giá theo % chung của mục khách (trên giá sau chiết khấu) — không gói VAT vào item.
            const net = (res.data.tongChuaVAT || 0) - (res.data.chietKhau || 0);
            const qty = Number((item as any).quantity) || 0;
            item.item_total = net;
            pd.result = res.data;
            pd.unitPrice = qty > 0 ? net / qty : res.data.donGia1SP;
            count++;
            sumPreVatNet += net;
            sumChietKhau += res.data.chietKhau || 0;
        }
        return { count, sumPreVatNet, sumChietKhau };
    }

    /**
     * Xác thực LẠI giá item DIGITAL (loose/bound/large_format) bằng cách replay ĐÚNG payload
     * đã gửi lên `/pricing/calculate` qua CÙNG `PricingFacadeService` (chống client sửa giá +
     * ép whitelist server-side). `item_total = data.selling_subtotal` = GIÁ BÁN TRƯỚC VAT
     * (đã áp markup MỘT LẦN ở facade). KHÔNG dùng `data.total` (giá vốn — mất markup) và KHÔNG
     * dùng `data.grand_total` (đã gồm VAT — header lại áp VAT lần nữa ⇒ VAT chồng).
     *
     * An toàn ngược: item KHÔNG kèm `printing_detail.pricingPayload` (báo giá cũ, prefill chat,
     * hoặc facade chưa inject trong unit test) → BỎ QUA, tin giá đã lưu.
     */
    private async recomputeDigitalItems(items: Record<string, unknown>[]): Promise<void> {
        if (!this.pricingFacade) return;
        for (const item of items) {
            if (this.isOffsetItem(item)) continue; // offset đã do recomputeOffsetItems xử lý
            const pd = item.printing_detail as any;
            if (!pd) continue;
            const payload = pd.pricingPayload;
            if (!payload || typeof payload !== 'object') continue; // không có payload → tin giá đã lưu
            // Khổ lớn: phụ kiện tính phía client theo thiết kế (facade LF không cộng phụ kiện) →
            // `data.total` KHÔNG bằng "Thành tiền" giỏ hàng, không override để khỏi mất tiền phụ kiện.
            const ptype = String((payload as any).type || (payload as any).product_type || '');
            if (ptype === 'large_format') continue;
            const res: any = await this.pricingFacade.calculatePrice(payload);
            if (!res?.success || !res.data) {
                throw new Error(`Không xác thực được giá cho "${item.product_name || 'sản phẩm'}": ${res?.error || 'lỗi tính giá'}`);
            }
            // GIÁ BÁN TRƯỚC VAT (markup áp 1 lần ở facade). Fallback về `total` (giá vốn) chỉ khi
            // facade không trả selling_subtotal (không nên xảy ra với engine hiện tại).
            const authoritative = Number(res.data.selling_subtotal ?? res.data.total);
            if (Number.isFinite(authoritative)) item.item_total = authoritative;
        }
    }

    // ─── Quotes: List with search/filter/pagination ───

    async findAllQuotes(filters: {
        status?: string; keyword?: string; code?: string;
        customer_name?: string; customer_phone?: string; created_by?: string;
        date_from?: string; date_to?: string;
        page?: number; limit?: number;
    } = {}) {
        let query = `
            SELECT q.*, u.full_name as created_by_name
            FROM quotes q
            LEFT JOIN users u ON u.id::text = q.created_by::text
            WHERE 1=1
        `;
        const params: unknown[] = [];

        const p = () => `$${params.length}`; // current param placeholder

        if (filters.date_from) { params.push(filters.date_from); query += ` AND date(q.created_at) >= CAST(${p()} AS DATE)`; }
        if (filters.date_to) { params.push(filters.date_to); query += ` AND date(q.created_at) <= CAST(${p()} AS DATE)`; }
        if (filters.status) {
            // B2: accept multi-valued status (comma-separated). Single status keeps the
            // existing `= CAST($n AS TEXT)`; multiple statuses use `= ANY($n::text[])`.
            // Empty/whitespace-only entries are dropped; no status -> no filter.
            const statuses = filters.status.split(',').map((s) => s.trim()).filter(Boolean);
            if (statuses.length === 1) {
                params.push(statuses[0]);
                query += ` AND q.status = CAST(${p()} AS TEXT)`;
            } else if (statuses.length > 1) {
                params.push(statuses);
                query += ` AND q.status = ANY(${p()}::text[])`;
            }
        }
        if (filters.code) { params.push(`%${filters.code}%`); query += ` AND q.code LIKE CAST(${p()} AS TEXT)`; }
        if (filters.customer_name) { params.push(`%${filters.customer_name}%`); query += ` AND q.customer_name LIKE CAST(${p()} AS TEXT)`; }
        if (filters.customer_phone) { params.push(`%${filters.customer_phone}%`); query += ` AND q.customer_phone LIKE CAST(${p()} AS TEXT)`; }
        if (filters.created_by) { params.push(`%${filters.created_by}%`); query += ` AND u.full_name LIKE CAST(${p()} AS TEXT)`; }
        if (filters.keyword) {
            params.push(`%${filters.keyword}%`, `%${filters.keyword}%`, `%${filters.keyword}%`);
            query += ` AND (q.code LIKE CAST($${params.length - 2} AS TEXT) OR q.customer_name LIKE CAST($${params.length - 1} AS TEXT) OR q.customer_phone LIKE CAST($${params.length} AS TEXT))`;
        }

        // Cô lập tenant (tầng app; lưới an toàn khi RLS chưa flip): chỉ báo giá của
        // tenant hiện hành HOẶC dùng chung (NULL). Bỏ qua khi bypass/không context.
        {
            const t = this.tenantGuard(params.length + 1, 'q.tenant_id');
            if (t.clause) { params.push(...t.params); query += t.clause; }
        }

        query += ' ORDER BY q.created_at DESC';

        const page = filters.page ? parseInt(String(filters.page)) : null;
        const limit = filters.limit ? parseInt(String(filters.limit)) : null;

        if (page && limit) {
            // Build count query — strip ORDER BY and replace SELECT clause
            const baseQuery = query.replace(/ORDER BY .+$/s, '');
            const countQuery = baseQuery.replace(/SELECT\s+q\.\*,\s+u\.full_name\s+as\s+created_by_name/i, 'SELECT COUNT(*) as total');
            const [countResult] = await this.dataSource.query(countQuery, params);
            const total = parseInt(countResult.total);

            const offset = (page - 1) * limit;
            params.push(limit, offset);
            query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
            const quotes = await this.dataSource.query(query, params);

            // Batch fetch item types for all quotes (avoids N+1)
            await this._attachQuoteItems(quotes);

            const totalPages = Math.ceil(total / limit);
            return {
                data: quotes,
                pagination: {
                    page, limit, total, total_pages: totalPages,
                    has_prev: page > 1, has_next: page < totalPages,
                },
            };
        }

        const quotes = await this.dataSource.query(query, params);
        await this._attachQuoteItems(quotes);
        return quotes;
    }

    // ─── Batch attach items to quotes (avoids N+1) ───

    private async _attachQuoteItems(quotes: Record<string, unknown>[]) {
        if (!quotes.length) return;
        const ids = quotes.map(q => q.id);
        try {
            const allItems = await this.dataSource.query(
                'SELECT quote_id, item_type, print_type, product_type FROM quote_items WHERE quote_id = ANY($1)',
                [ids],
            );
            const grouped: Record<string, typeof allItems> = {};
            for (const item of allItems) {
                const qid = String(item.quote_id);
                if (!grouped[qid]) grouped[qid] = [];
                grouped[qid].push(item);
            }
            for (const quote of quotes) {
                quote.items = grouped[String(quote.id)] || [];
            }
        } catch {
            // Fallback: set empty items if batch query fails
            for (const quote of quotes) quote.items = [];
        }
    }

    // ─── Quotes: Get by ID (with items + material JOINs) ───


    async findQuoteById(id: string) {
        const numId = parseInt(id) || 0;
        // Cô lập tenant: không cho đọc chéo báo giá của tenant khác (rò rỉ PII/giá).
        const t = this.tenantGuard(2, 'q.tenant_id');
        const [quote] = await this.dataSource.query(`
            SELECT q.*, u.full_name as created_by_name
            FROM quotes q
            LEFT JOIN users u ON u.id::text = q.created_by::text
            WHERE q.id = $1${t.clause}
        `, [numId, ...t.params]);
        if (!quote) return null;

        quote.items = await this.dataSource.query(`
            SELECT qi.*,
                COALESCE(qi.cover_material_name, mc.name) as cover_material_name,
                COALESCE(qi.inner_material_name, mi.name) as inner_material_name
            FROM quote_items qi
            LEFT JOIN materials mc ON qi.cover_material_id = mc.id
            LEFT JOIN materials mi ON qi.inner_material_id = mi.id
            WHERE qi.quote_id = $1
        `, [numId]).catch(() => []);

        return quote;
    }

    // ─── Quotes: Create (with full 46-field item INSERT, transaction) ───

    async createQuote(data: Record<string, unknown>, userId: number) {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();

        try {
            await applyTenantToConnection(qr, this.tenantCtx);
            // Auto resolve customer
            let customerId = data.customer_id || null;

            // Calculate validity
            const validityDays = Number(data.validity_days || 7);

            // Tính lại giá offset từ cấu hình đã lưu (chống sửa giá) + chuẩn hoá item_total về TRƯỚC VAT cho mọi item.
            const items = (data.items && Array.isArray(data.items)) ? data.items as Record<string, unknown>[] : [];
            this.recomputeOffsetItems(items);
            await this.recomputeDigitalItems(items);

            // QUY ƯỚC THỐNG NHẤT (offset + in nhanh, trộn được): subtotal = Σ item_total (trước VAT, sau chiết khấu engine);
            // 1 VAT chung của mục khách áp trên (subtotal − chiết khấu thủ công); grand = sau-chiết-khấu + VAT + ship.
            const itemsSum = items.reduce((s, it) => s + (parseFloat(String((it as any).item_total ?? 0)) || 0), 0);
            const subtotal = itemsSum > 0 ? itemsSum : parseFloat(String(data.total || 0));
            const discountAmt = parseFloat(String(data.discount_amount || 0));
            const afterDiscount = subtotal - discountAmt;
            const vatRate = parseFloat(String(data.vat_rate || 0));
            const vatAmount = afterDiscount * vatRate / 100;
            const shippingFee = parseFloat(String(data.shipping_fee || 0));
            const grandTotal = afterDiscount + vatAmount + shippingFee;

            await qr.query(`
                INSERT INTO quotes (
                    code, type, customer_id,
                    customer_name, customer_phone, customer_unit, tax_code,
                    customer_address, customer_note, customer_email, customer_contact,
                    total, discount_type, discount_value, discount_amount,
                    vat_rate, vat_amount, shipping_fee, grand_total,
                    created_by, created_at, delivery_time,
                    status, validity_days, tenant_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), $20, 'draft', $21, $22)
            `, [
                data.code, data.type || 'In nhanh', customerId,
                data.customer_name || 'Khách lẻ', data.customer_phone || null,
                data.customer_unit || null, data.tax_code || null,
                data.customer_address || null, data.customer_note || null,
                data.customer_email || null, data.customer_contact || null,
                subtotal, data.discount_type || null,
                data.discount_value || 0, discountAmt,
                vatRate, vatAmount, shippingFee, grandTotal,
                userId || null, data.delivery_time || null,
                validityDays, this.writeTenantId(),
            ]);

            const [{ id: quoteId }] = await qr.query(`SELECT currval(pg_get_serial_sequence('quotes', 'id')) as id`);

            // Insert items
            if (data.items && Array.isArray(data.items)) {
                await this._insertQuoteItems(qr, quoteId, data.items as Record<string, unknown>[]);
            }

            await qr.commitTransaction();

            // Auto-create or link customer (fire-and-forget, outside transaction)
            try {
                const resolvedCustomerId = await this.customersService.autoResolveFromQuote({
                    customer_name: String(data.customer_name || 'Khách lẻ'),
                    customer_phone: data.customer_phone ? String(data.customer_phone) : undefined,
                    customer_unit: data.customer_unit ? String(data.customer_unit) : undefined,
                    tax_code: data.tax_code ? String(data.tax_code) : undefined,
                    customer_address: data.customer_address ? String(data.customer_address) : undefined,
                    quote_id: quoteId,
                });
                if (resolvedCustomerId && !customerId) {
                    await this.dataSource.query('UPDATE quotes SET customer_id = $1 WHERE id = $2', [resolvedCustomerId, quoteId]);
                }
            } catch (e) {
                this.logger.warn(`Auto-resolve customer failed: ${e instanceof Error ? e.message : e}`);
            }

            return this.findQuoteById(String(quoteId));
        } catch (e: unknown) {
            await qr.rollbackTransaction();
            throw e;
        } finally {
            await qr.release();
        }
    }

    // ─── Quotes: Update (dynamic fields + re-insert items) ───

    async updateQuote(id: string, data: Record<string, unknown>) {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();

        try {
            await applyTenantToConnection(qr, this.tenantCtx);
            // Guard: prevent editing completed/cancelled quotes (+ cô lập tenant).
            const tg = this.tenantGuard(2);
            const [existing] = await qr.query(`SELECT status FROM quotes WHERE id = $1${tg.clause}`, [id, ...tg.params]);
            if (!existing) throw new Error('Quote not found');
            if (['completed', 'cancelled', 'expired'].includes(existing.status)) {
                throw new Error(`Không thể sửa báo giá ở trạng thái "${existing.status}". Vui lòng tạo bản sao.`);
            }

            // Tính lại giá offset (chống sửa giá) + chuẩn hoá item_total trước VAT, rồi tính header THỐNG NHẤT.
            if (data.items && Array.isArray(data.items)) {
                const items = data.items as Record<string, unknown>[];
                this.recomputeOffsetItems(items);
                await this.recomputeDigitalItems(items);
                const itemsSum = items.reduce((s, it) => s + (parseFloat(String((it as any).item_total ?? 0)) || 0), 0);
                const subtotal = itemsSum > 0 ? itemsSum : parseFloat(String(data.total || 0));
                const discountAmt = parseFloat(String(data.discount_amount || 0));
                const afterDiscount = subtotal - discountAmt;
                const vatRate = parseFloat(String(data.vat_rate || 0));
                const vatAmount = afterDiscount * vatRate / 100;
                const shippingFee = parseFloat(String(data.shipping_fee || 0));
                data.total = subtotal;
                data.vat_amount = vatAmount;
                data.grand_total = afterDiscount + vatAmount + shippingFee;
            }

            // Dynamic header update
            const allowedFields = [
                'customer_name', 'customer_phone', 'customer_unit', 'tax_code',
                'customer_address', 'customer_note', 'customer_email', 'customer_contact',
                'total', 'delivery_time',
                'status', 'discount_type', 'discount_value', 'discount_amount',
                'vat_rate', 'vat_amount', 'shipping_fee', 'grand_total',
            ];
            const sets: string[] = [];
            const params: unknown[] = [];
            for (const f of allowedFields) {
                if (data[f] === undefined) continue;
                params.push(data[f]);
                sets.push(`${f} = $${params.length}`);
            }
            if (sets.length > 0) {
                params.push(id);
                await qr.query(`UPDATE quotes SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
            }

            // Replace items
            if (data.items && Array.isArray(data.items)) {
                await qr.query('DELETE FROM quote_items WHERE quote_id = $1', [id]);
                await this._insertQuoteItems(qr, parseInt(id), data.items);
            }

            await qr.commitTransaction();
            return this.findQuoteById(id);
        } catch (e) {
            await qr.rollbackTransaction();
            throw e;
        } finally {
            await qr.release();
        }
    }

    // ─── Quotes: Delete (cascade quote_versions + quote_items, transaction) ───

    async deleteQuote(id: string) {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            await applyTenantToConnection(qr, this.tenantCtx);
            // Cô lập tenant: chặn xóa chéo báo giá tenant khác.
            const tg = this.tenantGuard(2);
            const [own] = await qr.query(`SELECT id FROM quotes WHERE id = $1${tg.clause}`, [id, ...tg.params]);
            if (!own) throw new Error('Quote not found');
            await qr.query('DELETE FROM quote_versions WHERE quote_id = $1', [id]);
            await qr.query('DELETE FROM quote_items WHERE quote_id = $1', [id]);
            await qr.query('DELETE FROM quotes WHERE id = $1', [id]);
            await qr.commitTransaction();
        } catch (e) {
            await qr.rollbackTransaction();
            throw e;
        } finally {
            await qr.release();
        }
    }

    // ─── Quotes: Clone ───

    async cloneQuote(id: string, userId: number) {
        const original = await this.findQuoteById(id);
        if (!original) throw new Error('Quote not found');

        // Generate new code
        const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        const [{ cnt }] = await this.dataSource.query("SELECT COUNT(*) as cnt FROM quotes WHERE date(created_at) = CURRENT_DATE");
        const newCode = `BG-${dateCode}-${String(parseInt(cnt) + 1).padStart(4, '0')}`;

        const validityDays = original.validity_days || 7;

        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            await applyTenantToConnection(qr, this.tenantCtx);
            await qr.query(`
                INSERT INTO quotes (code, type, customer_name, customer_phone, customer_unit, tax_code,
                    customer_address, customer_note, customer_email, customer_contact,
                    total, discount_type, discount_value, discount_amount,
                    vat_rate, vat_amount, shipping_fee, grand_total,
                    created_by, created_at, delivery_time, status, validity_days, tenant_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), $19, 'draft', $20, $21)
            `, [
                newCode, original.type, original.customer_name, original.customer_phone,
                original.customer_unit, original.tax_code,
                original.customer_address, original.customer_note,
                original.customer_email || null, original.customer_contact || null,
                original.total, original.discount_type || null,
                original.discount_value || 0, original.discount_amount || 0,
                original.vat_rate || 0, original.vat_amount || 0,
                original.shipping_fee || 0, original.grand_total || original.total,
                userId || original.created_by, original.delivery_time, validityDays,
                this.writeTenantId(),
            ]);

            const [{ id: newId }] = await qr.query(`SELECT currval(pg_get_serial_sequence('quotes', 'id')) as id`);

            // Copy items
            if (original.items && original.items.length > 0) {
                await this._insertQuoteItems(qr, newId, original.items);
            }

            await qr.commitTransaction();
            return { id: newId, code: newCode };
        } catch (e) {
            await qr.rollbackTransaction();
            throw e;
        } finally {
            await qr.release();
        }
    }

    // ─── Quotes: Status transitions (Approval Workflow) ───
    // Flow: draft → pending_approval → approved → sent → accepted → completed
    //                              ↘ rejected (+ reason)

    async submitForApproval(id: string) {
        const t = this.tenantGuard(2);
        const [affected] = await this.dataSource.query(
            `UPDATE quotes SET status = 'pending_approval' WHERE id = $1 AND status = 'draft'${t.clause} RETURNING id`, [id, ...t.params],
        );
        if (!affected) {
            const [q] = await this.dataSource.query(`SELECT status FROM quotes WHERE id = $1${t.clause}`, [id, ...t.params]);
            if (!q) throw new Error('Quote not found');
            throw new Error(`Chỉ duyệt được báo giá ở trạng thái Nháp (hiện: ${q.status})`);
        }
    }

    async approveQuote(id: string, approvedBy?: number) {
        const t = this.tenantGuard(2);
        const [affected] = await this.dataSource.query(
            `UPDATE quotes SET status = 'approved' WHERE id = $1 AND status IN ('draft', 'pending_approval')${t.clause} RETURNING id`,
            [id, ...t.params],
        );
        if (!affected) throw new Error('Không thể duyệt ở trạng thái hiện tại');
    }

    async rejectQuote(id: string, reason: string, rejectedBy?: number) {
        const t = this.tenantGuard(2);
        const [affected] = await this.dataSource.query(
            `UPDATE quotes SET status = 'rejected' WHERE id = $1 AND status IN ('draft', 'pending_approval')${t.clause} RETURNING id`,
            [id, ...t.params],
        );
        if (!affected) throw new Error('Không thể từ chối ở trạng thái hiện tại');
    }

    async sendQuote(id: string) {
        const t = this.tenantGuard(2);
        const [affected] = await this.dataSource.query(
            `UPDATE quotes SET status = 'sent' WHERE id = $1 AND status IN ('draft', 'approved')${t.clause} RETURNING id`, [id, ...t.params],
        );
        if (!affected) {
            const [q] = await this.dataSource.query(`SELECT status FROM quotes WHERE id = $1${t.clause}`, [id, ...t.params]);
            if (!q) throw new Error('Quote not found');
            throw new Error('Báo giá phải ở trạng thái Nháp/Đã duyệt mới gửi được');
        }
    }

    async acceptQuote(id: string) {
        const t = this.tenantGuard(2);
        const [affected] = await this.dataSource.query(
            `UPDATE quotes SET status = 'accepted' WHERE id = $1 AND status = 'sent'${t.clause} RETURNING id`, [id, ...t.params],
        );
        if (!affected) throw new Error('Chỉ chấp nhận được báo giá đã gửi');
    }

    async completeQuote(id: string) {
        const t = this.tenantGuard(2);
        const [affected] = await this.dataSource.query(
            `UPDATE quotes SET status = 'completed' WHERE id = $1 AND status IN ('approved', 'accepted')${t.clause} RETURNING id, customer_id`, [id, ...t.params],
        );
        if (!affected) throw new Error('Không thể hoàn thành ở trạng thái hiện tại');

        // Auto-upgrade customer lifecycle
        if (affected.customer_id) {
            try {
                await this.customersService.upgradeOnQuoteComplete(affected.customer_id);
            } catch (e) {
                this.logger.warn(`Auto-upgrade customer lifecycle failed: ${e instanceof Error ? e.message : e}`);
            }
        }
    }

    async cancelQuote(id: string, reason?: string) {
        const t = this.tenantGuard(2);
        const [affected] = await this.dataSource.query(
            `UPDATE quotes SET status = 'cancelled' WHERE id = $1 AND status != 'cancelled'${t.clause} RETURNING id`,
            [id, ...t.params],
        );
        if (!affected) throw new Error('Quote not found or already cancelled');
    }

    // ─── Quotes: Expire (cron-ready) ───

    async expireQuotes() {
        const result = await this.dataSource.query(`
            UPDATE quotes SET status = 'expired'
            WHERE status IN ('draft', 'sent')
              AND validity_days IS NOT NULL
              AND created_at + (validity_days || ' days')::interval < NOW()
        `);
        // PostgreSQL raw driver returns [undefined, rowCount] for UPDATE
        const expired = typeof result === 'object' && result !== null
            ? (result[1] ?? result?.rowCount ?? 0)
            : 0;
        return { expired };
    }

    // ─── Versions ───

    async findVersionsByQuote(quoteId: string) {
        const t = this.tenantGuard(2);
        return this.dataSource.query(
            `SELECT * FROM quote_versions WHERE quote_id = $1${t.clause} ORDER BY version_number DESC`, [quoteId, ...t.params],
        );
    }

    async findVersionById(id: string) {
        // Cô lập tenant: quote_versions chứa snapshot đầy đủ (PII/giá) — chặn đọc chéo.
        const t = this.tenantGuard(2);
        const [version] = await this.dataSource.query(`SELECT * FROM quote_versions WHERE id = $1${t.clause}`, [id, ...t.params]);
        if (version) {
            try { version.quote_data = JSON.parse(version.quote_data); } catch { }
        }
        return version || null;
    }

    async createVersion(quoteId: string, note: string, createdBy: number) {
        const quote = await this.findQuoteById(quoteId);
        if (!quote) throw new Error('Quote not found');

        const [last] = await this.dataSource.query(
            'SELECT MAX(version_number) as max_v FROM quote_versions WHERE quote_id = $1', [quoteId],
        );
        const nextVersion = (parseInt(last.max_v || '0') || 0) + 1;

        await this.dataSource.query(`
            INSERT INTO quote_versions (quote_id, version_number, quote_data, created_by, note, tenant_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [quoteId, nextVersion, JSON.stringify(quote), createdBy || null, note || `Phiên bản ${nextVersion}`, this.writeTenantId()]);

        const [{ id }] = await this.dataSource.query(`SELECT currval(pg_get_serial_sequence('quote_versions', 'id')) as id`);
        return this.findVersionById(String(id));
    }

    // ─── PDF HTML Generator — delegates to QuotePdfService ───

    async getQuotePdf(id: string) {
        const quote = await this.findQuoteById(id);
        if (!quote) return null;

        const html = await this.quotePdfService.generateHtml(quote);
        return { quote, items: quote.items || [], html };
    }

    // ─── Private: Insert quote items (matching PHP's 46-field INSERT) ───

    private async _insertQuoteItems(qr: QueryRunner, quoteId: number, items: Record<string, unknown>[]) {
        const tempIdMap: Record<number, number> = {};

        for (const [index, item] of items.entries()) {
            let parentId = item.parent_id || null;
            if (!parentId && item.parent_temp_id !== undefined && tempIdMap[item.parent_temp_id as number]) {
                parentId = tempIdMap[item.parent_temp_id as number];
            }

            await qr.query(`
                INSERT INTO quote_items (
                    quote_id, item_type, product_name, unit,
                    material_id, material_name, paper_size_id, paper_size_name,
                    quantity, print_side, print_type, shape,
                    items_per_sheet, sheets_needed,
                    processing_details, printing_detail, item_total,
                    product_type, bound_size, page_count, binding_type,
                    cover_material_id, inner_material_id,
                    cover_print, inner_print, cover_finishing, extra_services,
                    parent_id, item_width, item_height,
                    cover_sheets_needed, inner_sheets_needed,
                    cover_processing, inner_processing,
                    cover_print_side, cover_print_type, cover_paper_size_name, cover_material_name,
                    inner_print_side, inner_print_type, inner_paper_size_name, inner_material_name,
                    cover_print_cost, cover_print_unit_price, inner_print_cost, inner_print_unit_price,
                    product_id
                ) VALUES (${Array.from({length: 47}, (_, i) => `$${i+1}`).join(',')})
            `, [
                quoteId,
                item.item_type || 'loose', item.product_name || 'Sản phẩm', item.unit || 'Tờ',
                item.material_id || null, item.material_name || null,
                item.paper_size_id || null, item.paper_size_name || null,
                item.quantity || 0, item.print_side || 'single', item.print_type || null, item.shape || 'rectangle',
                item.items_per_sheet || 0, item.sheets_needed || 0,
                JSON.stringify(item.processing_details || []),
                JSON.stringify({ ...(item.printing_detail || {}), charge_area: item.charge_area, inventory_area: item.inventory_area, waste_percent: item.waste_percent, roll_width: item.roll_width, charge_full_width: item.charge_full_width, price_per_sqm: item.price_per_sqm }),
                item.item_total || 0,
                item.product_type || null, item.bound_size || item.size || null, item.page_count || 0, item.binding_type || null,
                item.cover_material_id || null, item.inner_material_id || null,
                item.cover_print || null, item.inner_print || null,
                JSON.stringify(item.cover_finishing || []), JSON.stringify(item.extra_services || []),
                parentId, item.item_width || 0, item.item_height || 0,
                item.cover_sheets_needed || 0, item.inner_sheets_needed || 0,
                JSON.stringify(item.cover_processing || []), JSON.stringify(item.inner_processing || []),
                item.cover_print_side || null, item.cover_print_type || null,
                item.cover_paper_size_name || null, item.cover_material_name || null,
                item.inner_print_side || null, item.inner_print_type || null,
                item.inner_paper_size_name || null, item.inner_material_name || null,
                item.cover_print_cost || 0, item.cover_print_unit_price || 0,
                item.inner_print_cost || 0, item.inner_print_unit_price || 0,
                item.product_id || null,
            ]);

            const [{ id: insertedId }] = await qr.query(`SELECT currval(pg_get_serial_sequence('quote_items', 'id')) as id`);
            tempIdMap[index] = insertedId;
        }

        // Stamp tenant cho item vừa chèn (cô lập dữ liệu mới; sẵn sàng cho RLS).
        const tid = this.writeTenantId();
        if (tid != null) {
            await qr.query('UPDATE quote_items SET tenant_id = $1 WHERE quote_id = $2 AND tenant_id IS NULL', [tid, quoteId]);
        }
    }

    // ─── Send Quote via Zalo ───

    async sendViaZalo(id: string, conversationId: string) {
        const quote = await this.findQuoteById(id);
        if (!quote) throw new Error('Quote not found');

        // Generate PDF HTML
        const pdfHtml = await this.getQuotePdf(id);

        // Update status to sent
        await this.dataSource.query(
            "UPDATE quotes SET status = 'sent' WHERE id = $1",
            [id],
        );

        return {
            quoteId: id,
            quoteCode: quote.code,
            conversationId,
            channel: 'zalo',
            pdfHtml: pdfHtml?.html?.substring(0, 200) + '...',
            message: `Đã gửi báo giá ${quote.code} qua Zalo`,
        };
    }

    // ─── Send Quote via Email ───

    async sendViaEmail(id: string, email: string, subject?: string) {
        const quote = await this.findQuoteById(id);
        if (!quote) throw new Error('Quote not found');

        // Update status to sent
        await this.dataSource.query(
            "UPDATE quotes SET status = 'sent' WHERE id = $1",
            [id],
        );

        return {
            quoteId: id,
            quoteCode: quote.code,
            email,
            subject: subject || `Báo giá ${quote.code} - ZeplaoPrint`,
            channel: 'email',
            message: `Đã gửi báo giá ${quote.code} đến ${email}`,
        };
    }
}
