import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { QuotePdfService } from './quote-pdf.service';
import { CustomersService } from './customers.service';
import { EngineOffsetService } from '../offset-engine/engine-offset.service';
import { PricingFacadeService } from './pricing-facade.service';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { applyTenantToConnection } from '../../../common/tenant/tenant-transaction';
import { computeAuthoritativeQuoteTotals } from '../lib/quote-totals';

@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name);

    constructor(
        @InjectDataSource() private dataSource: DataSource,
        private quotePdfService: QuotePdfService,
        private customersService: CustomersService,
        private engineOffset: EngineOffsetService,
        @Optional() private readonly tenantCtx?: TenantContextService,
        // Optional chỉ để không phá các unit test legacy dựng service thủ công. Đường
        // ghi digital thật sẽ fail-closed nếu dependency này vắng mặt.
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
    private static readonly DIGITAL_TYPES = new Set(['loose', 'bound', 'large_format']);

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

    private digitalItemType(item: Record<string, unknown>): string | null {
        const pd = item.printing_detail as any;
        const itemType = String(item.item_type ?? '').trim().toLowerCase();
        const productType = String(item.product_type ?? '').trim().toLowerCase();
        if (OrdersService.DIGITAL_TYPES.has(productType)) return productType;
        if (OrdersService.DIGITAL_TYPES.has(itemType)) return itemType;
        if (pd?.digital === true) {
            const payloadType = String(pd?.pricingPayload?.type ?? '').trim().toLowerCase();
            return OrdersService.DIGITAL_TYPES.has(payloadType) ? payloadType : 'digital';
        }
        return null;
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
     * Đường ĐỌC báo giá cũ không đi qua hàm này. Mọi CREATE/UPDATE mới của item digital
     * thiếu replay payload đều bị từ chối; không có nhánh tin `item_total` do client gửi.
     */
    private async recomputeDigitalItems(items: Record<string, unknown>[]): Promise<void> {
        for (const item of items) {
            if (this.isOffsetItem(item)) continue; // offset đã do recomputeOffsetItems xử lý
            const digitalType = this.digitalItemType(item);
            if (!digitalType) continue;
            const pd = item.printing_detail as any;
            const payload = pd?.pricingPayload;
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                throw new Error(
                    `Thiếu pricingPayload để xác thực giá digital cho "${item.product_name || 'sản phẩm'}". ` +
                    'Vui lòng tính giá lại trước khi lưu.',
                );
            }
            const payloadType = String((payload as any).type ?? '').trim().toLowerCase();
            if (!OrdersService.DIGITAL_TYPES.has(payloadType)) {
                throw new Error(`pricingPayload không có loại digital hợp lệ cho "${item.product_name || 'sản phẩm'}".`);
            }
            if (digitalType !== 'digital' && payloadType !== digitalType) {
                throw new Error(
                    `Loại pricingPayload (${payloadType}) không khớp loại sản phẩm (${digitalType}).`,
                );
            }
            if (!this.pricingFacade) {
                throw new Error('PricingFacadeService chưa sẵn sàng; từ chối ghi giá digital chưa được xác thực.');
            }
            // large_format: facade (sau fix) đã cộng accessories vào cost rồi markup → selling_subtotal.
            // Replay full payload (kèm accessories) để chống client sửa giá.
            const res: any = await this.pricingFacade.calculatePrice(payload);
            if (!res?.success || !res.data) {
                throw new Error(`Không xác thực được giá cho "${item.product_name || 'sản phẩm'}": ${res?.error || 'lỗi tính giá'}`);
            }
            // GIÁ BÁN TRƯỚC VAT (markup áp 1 lần ở facade). Fallback về `total` (giá vốn) chỉ khi
            // facade không trả selling_subtotal (không nên xảy ra với engine hiện tại).
            const authoritative = Number(res.data.selling_subtotal ?? res.data.total);
            if (!Number.isFinite(authoritative) || authoritative < 0) {
                throw new Error(`Giá server trả về không hợp lệ cho "${item.product_name || 'sản phẩm'}".`);
            }
            item.item_total = authoritative;
        }
    }

    /** Mọi write mới phải có ít nhất một item có cấu trúc hợp lệ. */
    private requireWriteItems(value: unknown): Record<string, unknown>[] {
        if (!Array.isArray(value) || value.length === 0) {
            throw new Error('Báo giá phải có ít nhất một hạng mục.');
        }
        if (value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
            throw new Error('Hạng mục báo giá không hợp lệ.');
        }
        return value as Record<string, unknown>[];
    }

    /**
     * Chỉ cộng item đã đi qua một engine server-side nhận diện được. Nhờ vậy item type lạ
     * không thể mang `item_total` do client tự đặt vào subtotal của quote.
     */
    private sumAuthoritativeItemTotals(items: Record<string, unknown>[]): number {
        return items.reduce((sum, item) => {
            if (!this.isOffsetItem(item) && !this.digitalItemType(item)) {
                throw new Error(
                    `Không xác định được engine giá cho "${item.product_name || 'sản phẩm'}". ` +
                    'Vui lòng tính giá lại trước khi lưu.',
                );
            }
            const itemTotal = Number(item.item_total);
            if (!Number.isFinite(itemTotal) || itemTotal < 0) {
                throw new Error(`Giá item server không hợp lệ cho "${item.product_name || 'sản phẩm'}".`);
            }
            return sum + itemTotal;
        }, 0);
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

    /**
     * Normalize actor id for quotes.created_by (varchar storing users.id UUID
     * or legacy int). Reject empty; never cast UUID to integer.
     */
    private actorId(userId: string | number | null | undefined): string | null {
        if (userId == null || userId === '' || userId === 0 || userId === '0') return null;
        return String(userId);
    }

    /** validity_days → date hết hạn (date only, local calendar). */
    private computeValidUntil(validityDays: number, from: Date = new Date()): string {
        const d = new Date(from);
        d.setDate(d.getDate() + Math.max(1, Math.floor(validityDays) || 7));
        return d.toISOString().slice(0, 10);
    }

    /**
     * Bổ sung material_name / paper_size_name / cover names từ master-data
     * khi client chỉ gửi id (báo giá cũ / API). Mutates items in place.
     */
    private async enrichItemNames(
        qr: QueryRunner,
        items: Record<string, unknown>[],
    ): Promise<void> {
        const matIds = new Set<number>();
        const paperIds = new Set<number>();
        for (const it of items) {
            const mid = Number(it.material_id);
            if (Number.isFinite(mid) && mid > 0) matIds.add(mid);
            const cid = Number(it.cover_material_id);
            if (Number.isFinite(cid) && cid > 0) matIds.add(cid);
            const iid = Number(it.inner_material_id);
            if (Number.isFinite(iid) && iid > 0) matIds.add(iid);
            const pid = Number(it.paper_size_id);
            if (Number.isFinite(pid) && pid > 0) paperIds.add(pid);
            // configParams trong printing_detail
            const pd = it.printing_detail as any;
            const cfg = pd?.configParams || {};
            const cfgMid = Number(cfg.materialId || cfg.lfMaterialId);
            if (Number.isFinite(cfgMid) && cfgMid > 0) matIds.add(cfgMid);
            const cfgPid = Number(cfg.paperSizeId);
            if (Number.isFinite(cfgPid) && cfgPid > 0) paperIds.add(cfgPid);
        }
        const matMap = new Map<number, string>();
        const paperMap = new Map<number, string>();
        if (matIds.size) {
            const ids = [...matIds];
            const rows = await qr.query(
                `SELECT id, name FROM materials WHERE id = ANY($1::int[])`,
                [ids],
            ).catch(() => []);
            for (const r of rows) matMap.set(Number(r.id), r.name);
        }
        if (paperIds.size) {
            const ids = [...paperIds];
            const rows = await qr.query(
                `SELECT id, name FROM paper_sizes WHERE id = ANY($1::int[])`,
                [ids],
            ).catch(() => []);
            for (const r of rows) paperMap.set(Number(r.id), r.name);
        }
        for (const it of items) {
            const pd = (it.printing_detail && typeof it.printing_detail === 'object')
                ? { ...(it.printing_detail as Record<string, unknown>) }
                : {};
            const cfg = { ...((pd as any).configParams || {}) };

            const mid = Number(it.material_id || cfg.materialId || cfg.lfMaterialId);
            if ((!it.material_name || it.material_name === '') && Number.isFinite(mid) && matMap.has(mid)) {
                it.material_name = matMap.get(mid);
                cfg.materialName = it.material_name;
            }
            const pid = Number(it.paper_size_id || cfg.paperSizeId);
            if ((!it.paper_size_name || it.paper_size_name === '') && Number.isFinite(pid) && paperMap.has(pid)) {
                it.paper_size_name = paperMap.get(pid);
                cfg.paperSizeName = it.paper_size_name;
            }
            const cid = Number(it.cover_material_id);
            if ((!it.cover_material_name || it.cover_material_name === '') && Number.isFinite(cid) && matMap.has(cid)) {
                it.cover_material_name = matMap.get(cid);
            }
            const iid = Number(it.inner_material_id);
            if ((!it.inner_material_name || it.inner_material_name === '') && Number.isFinite(iid) && matMap.has(iid)) {
                it.inner_material_name = matMap.get(iid);
            }
            // Ghi lại configParams đã enrich vào printing_detail
            if (Object.keys(cfg).length) {
                (pd as any).configParams = cfg;
                it.printing_detail = pd;
            }
        }
    }

    /**
     * Mã báo giá: FE thường không gửi `code` → sinh tự động BG-YYMMDD-####.
     * Luôn trả string non-empty (fallback timestamp nếu COUNT lỗi).
     */
    private async generateQuoteCode(qr?: { query: (sql: string, params?: any[]) => Promise<any> }): Promise<string> {
        const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        try {
            const runner = qr ?? this.dataSource;
            const rows = await runner.query(
                "SELECT COUNT(*)::int AS cnt FROM quotes WHERE date(created_at) = CURRENT_DATE",
            );
            // TypeORM/pg: rows = [{ cnt: n }] — phòng array rỗng / key khác
            const row = Array.isArray(rows) ? rows[0] : rows;
            const cnt = row?.cnt ?? row?.count ?? 0;
            const seq = (parseInt(String(cnt), 10) || 0) + 1;
            const code = `BG-${dateCode}-${String(seq).padStart(4, '0')}`;
            if (code && code.length >= 6) return code;
        } catch (e) {
            this.logger.warn(`generateQuoteCode COUNT failed, using timestamp fallback: ${e instanceof Error ? e.message : e}`);
        }
        return `BG-${dateCode}-${Date.now().toString(36).toUpperCase()}`;
    }

    /** Resolve code for INSERT — never null/empty (quotes.code NOT NULL). */
    private async resolveQuoteCode(
        data: Record<string, unknown>,
        qr?: { query: (sql: string, params?: any[]) => Promise<any> },
    ): Promise<string> {
        const raw = data.code != null && data.code !== '' ? String(data.code).trim() : '';
        if (raw && raw.toLowerCase() !== 'null' && raw.toLowerCase() !== 'undefined') {
            return raw;
        }
        const generated = await this.generateQuoteCode(qr);
        return generated || `BG-${Date.now()}`;
    }

    async createQuote(data: Record<string, unknown>, userId: string | number) {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();

        try {
            await applyTenantToConnection(qr, this.tenantCtx);
            // Auto resolve customer
            let customerId = data.customer_id || null;

            // FE không gửi code → tự sinh (tránh NOT NULL constraint trên quotes.code)
            const quoteCode = await this.resolveQuoteCode(data, qr);
            this.logger.log(`createQuote code=${quoteCode} items=${Array.isArray(data.items) ? data.items.length : 0}`);

            // Calculate validity
            const validityDays = Number(data.validity_days || 7);
            const validUntil = data.valid_until
                ? String(data.valid_until).slice(0, 10)
                : this.computeValidUntil(validityDays);

            // Tính lại giá offset từ cấu hình đã lưu (chống sửa giá) + chuẩn hoá item_total về TRƯỚC VAT cho mọi item.
            const items = this.requireWriteItems(data.items);
            this.recomputeOffsetItems(items);
            await this.recomputeDigitalItems(items);
            await this.enrichItemNames(qr, items);

            // QUY ƯỚC THỐNG NHẤT (offset + in nhanh, trộn được): subtotal = Σ item_total (trước VAT, sau chiết khấu engine);
            // 1 VAT chung của mục khách áp trên (subtotal − chiết khấu thủ công); grand = sau-chiết-khấu + VAT + ship.
            const totals = computeAuthoritativeQuoteTotals({
                subtotal: this.sumAuthoritativeItemTotals(items),
                discountType: data.discount_type,
                discountValue: data.discount_value,
                vatRate: data.vat_rate,
                shippingFee: data.shipping_fee,
            });

            await qr.query(`
                INSERT INTO quotes (
                    code, type, customer_id,
                    customer_name, customer_phone, customer_unit, tax_code,
                    customer_address, customer_note, customer_email, customer_contact,
                    total, discount_type, discount_value, discount_amount,
                    vat_rate, vat_amount, shipping_fee, grand_total,
                    created_by, created_at, delivery_time,
                    status, validity_days, valid_until, tenant_id
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                    $12, $13, $14, $15, $16, $17, $18, $19,
                    $20, NOW(), $21, 'draft', $22, $23::date, $24
                )
            `, [
                quoteCode, data.type || 'In nhanh', customerId,
                data.customer_name || 'Khách lẻ', data.customer_phone || null,
                data.customer_unit || null, data.tax_code || null,
                data.customer_address || null, data.customer_note || null,
                data.customer_email || null, data.customer_contact || null,
                totals.subtotal, totals.discountType,
                totals.discountValue, totals.discountAmount,
                totals.vatRate, totals.vatAmount, totals.shippingFee, totals.grandTotal,
                this.actorId(userId),
                data.delivery_time || null,
                validityDays, validUntil, this.writeTenantId(),
            ]);

            const [{ id: quoteId }] = await qr.query(`SELECT currval(pg_get_serial_sequence('quotes', 'id')) as id`);

            // Insert items
            await this._insertQuoteItems(qr, quoteId, items);

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
            const [existing] = await qr.query(`
                SELECT status, total, discount_type, discount_value, vat_rate, shipping_fee
                FROM quotes
                WHERE id = $1${tg.clause}
                FOR UPDATE
            `, [id, ...tg.params]);
            if (!existing) throw new Error('Quote not found');
            if (['completed', 'cancelled', 'expired'].includes(existing.status)) {
                throw new Error(`Không thể sửa báo giá ở trạng thái "${existing.status}". Vui lòng tạo bản sao.`);
            }

            // Có items thì replay toàn bộ bằng engine. Update header-only giữ subtotal hiện có,
            // nhưng vẫn tính lại mọi field dẫn xuất và không bao giờ nhận total/VAT/grand từ client.
            const items = data.items === undefined || data.items === null
                ? null
                : this.requireWriteItems(data.items);
            let subtotal: unknown = existing.total;
            if (items) {
                this.recomputeOffsetItems(items);
                await this.recomputeDigitalItems(items);
                await this.enrichItemNames(qr, items);
                subtotal = this.sumAuthoritativeItemTotals(items);
            }

            const totals = computeAuthoritativeQuoteTotals({
                subtotal,
                discountType: data.discount_type !== undefined ? data.discount_type : existing.discount_type,
                discountValue: data.discount_value !== undefined ? data.discount_value : existing.discount_value,
                vatRate: data.vat_rate !== undefined ? data.vat_rate : existing.vat_rate,
                shippingFee: data.shipping_fee !== undefined ? data.shipping_fee : existing.shipping_fee,
            });
            const updateData: Record<string, unknown> = {
                ...data,
                total: totals.subtotal,
                discount_type: totals.discountType,
                discount_value: totals.discountValue,
                discount_amount: totals.discountAmount,
                vat_rate: totals.vatRate,
                vat_amount: totals.vatAmount,
                shipping_fee: totals.shippingFee,
                grand_total: totals.grandTotal,
            };

            // Cập nhật hiệu lực nếu client gửi validity_days
            if (data.validity_days != null && data.valid_until == null) {
                updateData.valid_until = this.computeValidUntil(Number(data.validity_days) || 7);
            }

            // Dynamic header update
            const allowedFields = [
                'customer_name', 'customer_phone', 'customer_unit', 'tax_code',
                'customer_address', 'customer_note', 'customer_email', 'customer_contact',
                'total', 'delivery_time',
                'status', 'discount_type', 'discount_value', 'discount_amount',
                'vat_rate', 'vat_amount', 'shipping_fee', 'grand_total',
                'validity_days', 'valid_until',
            ];
            const sets: string[] = [];
            const params: unknown[] = [];
            for (const f of allowedFields) {
                if (updateData[f] === undefined) continue;
                params.push(updateData[f]);
                sets.push(`${f} = $${params.length}`);
            }
            if (sets.length > 0) {
                params.push(id);
                await qr.query(`UPDATE quotes SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
            }

            // Replace items
            if (items) {
                await qr.query('DELETE FROM quote_items WHERE quote_id = $1', [id]);
                await this._insertQuoteItems(qr, parseInt(id), items);
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

    async cloneQuote(id: string, userId: string | number) {
        const original = await this.findQuoteById(id);
        if (!original) throw new Error('Quote not found');

        const validityDays = original.validity_days || 7;

        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            await applyTenantToConnection(qr, this.tenantCtx);
            const newCode = await this.resolveQuoteCode({}, qr);
            const validUntil = this.computeValidUntil(Number(validityDays) || 7);
            await qr.query(`
                INSERT INTO quotes (code, type, customer_name, customer_phone, customer_unit, tax_code,
                    customer_address, customer_note, customer_email, customer_contact,
                    total, discount_type, discount_value, discount_amount,
                    vat_rate, vat_amount, shipping_fee, grand_total,
                    created_by, created_at, delivery_time, status, validity_days, valid_until, tenant_id)
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18,
                    $19, NOW(), $20, 'draft', $21, $22::date, $23
                )
            `, [
                newCode, original.type, original.customer_name, original.customer_phone,
                original.customer_unit, original.tax_code,
                original.customer_address, original.customer_note,
                original.customer_email || null, original.customer_contact || null,
                original.total, original.discount_type || null,
                original.discount_value || 0, original.discount_amount || 0,
                original.vat_rate || 0, original.vat_amount || 0,
                original.shipping_fee || 0, original.grand_total || original.total,
                this.actorId(userId) ?? original.created_by ?? null,
                original.delivery_time || null,
                validityDays, validUntil,
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

    async createVersion(quoteId: string, note: string, createdBy: string | number) {
        const quote = await this.findQuoteById(quoteId);
        if (!quote) throw new Error('Quote not found');

        const [last] = await this.dataSource.query(
            'SELECT MAX(version_number) as max_v FROM quote_versions WHERE quote_id = $1', [quoteId],
        );
        const nextVersion = (parseInt(last.max_v || '0') || 0) + 1;

        await this.dataSource.query(`
            INSERT INTO quote_versions (quote_id, version_number, quote_data, created_by, note, tenant_id)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [quoteId, nextVersion, JSON.stringify(quote), this.actorId(createdBy), note || `Phiên bản ${nextVersion}`, this.writeTenantId()]);

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

    /**
     * Insert quote_items — CHỈ cột đang có trên Postgres (probe 2026-07-18).
     * Các field bound/LF mở rộng (cover_processing, cover_print_side, …) GÓI vào
     * printing_detail JSON — không INSERT cột phantom (sẽ 400 column does not exist).
     */
    private async _insertQuoteItems(qr: QueryRunner, quoteId: number, items: Record<string, unknown>[]) {
        const tempIdMap: Record<number, number> = {};

        // Nạp unit catalog (unified_products) theo product_id — nguồn ưu tiên sau unit client.
        const productIds = [
            ...new Set(
                items
                    .map((it) => Number(it.product_id))
                    .filter((id) => Number.isFinite(id) && id > 0),
            ),
        ];
        const productUnitById = new Map<number, string>();
        if (productIds.length > 0) {
            const rows: Array<{ id: number; unit: string | null }> = await qr.query(
                `SELECT id, unit FROM unified_products WHERE id = ANY($1)`,
                [productIds],
            ).catch(() => []);
            for (const r of rows) {
                if (r.unit && String(r.unit).trim()) productUnitById.set(Number(r.id), String(r.unit));
            }
        }

        const { resolveUnitLabel } = await import('../lib/quote-units');

        for (const [index, item] of items.entries()) {
            let parentId = item.parent_id || null;
            if (!parentId && item.parent_temp_id !== undefined && tempIdMap[item.parent_temp_id as number]) {
                parentId = tempIdMap[item.parent_temp_id as number];
            }

            // Gộp printing_detail client + meta LF + field bound không có cột riêng
            const pdBase = (item.printing_detail && typeof item.printing_detail === 'object')
                ? { ...(item.printing_detail as Record<string, unknown>) }
                : {};
            const printingDetail = {
                ...pdBase,
                charge_area: item.charge_area ?? pdBase.charge_area,
                inventory_area: item.inventory_area ?? pdBase.inventory_area,
                waste_percent: item.waste_percent ?? pdBase.waste_percent,
                roll_width: item.roll_width ?? pdBase.roll_width,
                charge_full_width: item.charge_full_width ?? pdBase.charge_full_width,
                price_per_sqm: item.price_per_sqm ?? pdBase.price_per_sqm,
                // Bound extras (không có cột DB) — giữ để Sửa/hydrate
                cover_processing: item.cover_processing ?? pdBase.cover_processing,
                inner_processing: item.inner_processing ?? pdBase.inner_processing,
                cover_print_side: item.cover_print_side ?? pdBase.cover_print_side,
                cover_print_type: item.cover_print_type ?? pdBase.cover_print_type,
                cover_paper_size_name: item.cover_paper_size_name ?? pdBase.cover_paper_size_name,
                inner_print_side: item.inner_print_side ?? pdBase.inner_print_side,
                inner_print_type: item.inner_print_type ?? pdBase.inner_print_type,
                inner_paper_size_name: item.inner_paper_size_name ?? pdBase.inner_paper_size_name,
                cover_print_cost: item.cover_print_cost ?? pdBase.cover_print_cost,
                cover_print_unit_price: item.cover_print_unit_price ?? pdBase.cover_print_unit_price,
                inner_print_cost: item.inner_print_cost ?? pdBase.inner_print_cost,
                inner_print_unit_price: item.inner_print_unit_price ?? pdBase.inner_print_unit_price,
            };

            const pid = Number(item.product_id);
            const unitLabel = resolveUnitLabel({
                unit: item.unit as string | undefined,
                productUnit: Number.isFinite(pid) ? productUnitById.get(pid) : undefined,
                quoteType: (item.product_type as string) || (item.item_type as string),
                itemType: item.item_type as string,
            });

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
                    cover_material_name, inner_material_name,
                    product_id
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
                    $31, $32, $33, $34, $35
                )
            `, [
                quoteId,
                item.item_type || 'loose',
                item.product_name || 'Sản phẩm',
                unitLabel,
                item.material_id || null,
                item.material_name || null,
                item.paper_size_id || null,
                item.paper_size_name || null,
                item.quantity || 0,
                item.print_side || 'single',
                item.print_type || null,
                item.shape || 'rectangle',
                item.items_per_sheet || 0,
                item.sheets_needed || 0,
                JSON.stringify(item.processing_details || []),
                JSON.stringify(printingDetail),
                item.item_total || 0,
                item.product_type || null,
                item.bound_size || item.size || null,
                item.page_count || 0,
                item.binding_type || null,
                item.cover_material_id || null,
                item.inner_material_id || null,
                item.cover_print || null,
                item.inner_print || null,
                JSON.stringify(item.cover_finishing || []),
                JSON.stringify(item.extra_services || []),
                parentId,
                item.item_width || 0,
                item.item_height || 0,
                item.cover_sheets_needed || 0,
                item.inner_sheets_needed || 0,
                item.cover_material_name || null,
                item.inner_material_name || null,
                item.product_id || null,
            ]);

            const [{ id: insertedId }] = await qr.query(
                `SELECT currval(pg_get_serial_sequence('quote_items', 'id')) as id`,
            );
            tempIdMap[index] = insertedId;
        }

        // Stamp tenant cho item vừa chèn (cô lập dữ liệu mới; sẵn sàng cho RLS).
        const tid = this.writeTenantId();
        if (tid != null) {
            await qr.query(
                'UPDATE quote_items SET tenant_id = $1 WHERE quote_id = $2 AND tenant_id IS NULL',
                [tid, quoteId],
            );
        }
    }

    // ─── Send Quote via Zalo / Email ───
    // CHƯA có kênh gửi tự động thật. Phiên bản cũ chỉ đổi status='sent' rồi trả
    // "Đã gửi báo giá..." (không gửi gì, không tenant guard, không kiểm trạng thái)
    // → sale tưởng khách đã nhận, mất đơn âm thầm. Fail-loud cho tới khi nối
    // ZaloPool/mailer thật; đánh dấu "đã gửi" thủ công dùng sendQuote() ở trên.

    async sendViaZalo(_id: string, _conversationId: string): Promise<never> {
        throw new Error(
            'Gửi báo giá tự động qua Zalo chưa được hỗ trợ. Vui lòng gửi cho khách trong Inbox rồi bấm "Gửi khách" để cập nhật trạng thái.',
        );
    }

    async sendViaEmail(_id: string, _email: string, _subject?: string): Promise<never> {
        throw new Error(
            'Gửi báo giá qua email chưa được hỗ trợ. Vui lòng gửi cho khách thủ công rồi bấm "Gửi khách" để cập nhật trạng thái.',
        );
    }
}
