import { resolveUnitLabel } from '@/lib/quote/quote-units';

/**
 * Ánh xạ MỘT item giỏ hàng → `QuoteItemDto` của `POST /erp/orders`.
 *
 * NGUỒN SỰ THẬT DUY NHẤT cho cả ba trang lưu báo giá: `/pricing/quotes/new` (digital),
 * `/pricing/quotes/offset` (offset) và `/pricing/quotes/start` (Cổng hợp nhất, cả hai).
 *
 * Audit 2026-08-29 — vì sao phải gom lại: trang Cổng có bản `mapItem` riêng, nhánh digital
 * `return { ...cfg, ... }` spread `configParams` dạng camelCase (`materialId`, `itemWidth`,
 * `materialName`…). `QuoteItemDto` chỉ khai snake_case và `main.ts` bật
 * `whitelist + forbidNonWhitelisted` ⇒ HTTP 400. Nhánh đó còn THIẾU `printing_detail`, nên
 * nếu lọt DTO thì `OrdersService.recomputeDigitalItems` ném "Thiếu pricingPayload…". Kết quả:
 * lưu báo giá digital từ Cổng hỏng hoàn toàn (fail-closed, không sai tiền).
 *
 * Hai bất biến phải giữ khi sửa file này:
 *  1. CHỈ gửi khoá snake_case có trong `QuoteItemDto`; mọi cấu hình camelCase phải nằm trong
 *     `printing_detail` (field JSON tự do).
 *  2. `printing_detail.pricingPayload` (digital) và `printing_detail.config` (offset) là cơ sở
 *     để server TÍNH LẠI giá. Bỏ chúng đi = báo giá bị từ chối, không phải "lưu giá client".
 */

export interface CartItemLike {
    name: string;
    type: 'loose' | 'bound' | 'large_format' | 'offset';
    quantity: number;
    total: number;
    unitPrice: number;
    details: unknown;
    configParams: unknown;
    pricingPayload?: Record<string, unknown>;
}

/**
 * Số hữu hạn, hoặc `undefined` để `@IsOptional` bỏ qua.
 *
 * Phải loại `''`/`null`/`undefined` TRƯỚC khi ép số: `Number('') === 0` và `Number(null) === 0`,
 * nên nếu chỉ dựa vào `Number.isFinite` thì form để trống sẽ gửi `material_id: 0` — một id không
 * tồn tại — thay vì bỏ hẳn field. (Giữ đúng hành vi của `numOrUndef` gốc ở `/quotes/new`.)
 */
const numOrUndef = (v: unknown): number | undefined => {
    if (v === '' || v == null) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** Item offset: cấu hình camelCase gói trong `printing_detail.config`. */
function mapOffsetItem(it: CartItemLike, cfg: Record<string, unknown>): Record<string, unknown> {
    const productType = str(cfg.type) ?? 'offset';
    return {
        product_name: it.name,
        item_type: 'offset',
        product_type: productType,
        quantity: it.quantity,
        item_total: it.total,
        unit: resolveUnitLabel({
            unit: str(cfg.unit),
            productUnit: str(cfg.productUnit),
            quoteType: productType,
            itemType: 'offset',
        }),
        printing_detail: {
            offset: true,
            config: it.configParams,
            result: it.details,
            unitPrice: it.unitPrice,
        },
    };
}

/** Item digital (loose/bound/large_format): field whitelisted + payload replay. */
function mapDigitalItem(it: CartItemLike, cfg: Record<string, unknown>): Record<string, unknown> {
    const base: Record<string, unknown> = {
        product_name: it.name,
        item_type: it.type,
        product_type: it.type,
        quantity: it.quantity,
        item_total: it.total,
        unit: resolveUnitLabel({
            unit: str(cfg.unit),
            productUnit: str(cfg.productUnit),
            quoteType: it.type,
        }),
        // Denormalize tên để PDF/list không phụ thuộc join master-data.
        material_name: str(cfg.materialName),
        // Cấu hình + kết quả + payload GỐC để "Sửa" khôi phục được và backend replay xác thực giá.
        printing_detail: {
            digital: true,
            configParams: cfg,
            details: it.details,
            pricingPayload: it.pricingPayload,
        },
    };

    if (it.type === 'loose') {
        return {
            ...base,
            material_id: numOrUndef(cfg.materialId),
            paper_size_id: numOrUndef(cfg.paperSizeId),
            paper_size_name: str(cfg.paperSizeName),
            item_width: numOrUndef(cfg.itemWidth),
            item_height: numOrUndef(cfg.itemHeight),
            print_type: str(cfg.printType),
            print_side: str(cfg.printSide),
        };
    }
    if (it.type === 'large_format') {
        return {
            ...base,
            material_id: numOrUndef(cfg.lfMaterialId),
            item_width: numOrUndef(cfg.lfWidth),
            item_height: numOrUndef(cfg.lfHeight),
            print_type: str(cfg.lfPrintType),
        };
    }
    if (it.type === 'bound') {
        return {
            ...base,
            page_count: numOrUndef(cfg.bPageCount),
            binding_type: str(cfg.bBindingType),
        };
    }
    return base;
}

export function mapCartItemToQuoteItem(it: CartItemLike): Record<string, unknown> {
    const cfg = (it.configParams as Record<string, unknown>) ?? {};
    return it.type === 'offset' ? mapOffsetItem(it, cfg) : mapDigitalItem(it, cfg);
}
