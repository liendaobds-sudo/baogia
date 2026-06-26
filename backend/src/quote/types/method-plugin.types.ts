/**
 * Method Plugin contract types — tầng method-agnostic của Công_Cụ_Báo_Giá hợp nhất.
 *
 * Hợp đồng chung cho mọi Phương_Pháp_In (digital, offset, mở rộng về sau).
 * KHÔNG phụ thuộc engine cụ thể: các plugin (DigitalMethodPlugin, OffsetMethodPlugin)
 * sẽ bọc engine hiện hữu mà không đổi số học.
 *
 * Lưu ý VAT: PriceResult mang `priceBeforeVat`; VAT là giá trị chung cấp báo giá
 * và được áp một lần ở tầng báo giá (Req 8), không nằm trong tầng plugin.
 *
 * _Requirements: 3.3, 1.5, 3.6_
 */

/** Định danh phương pháp in — mở rộng được (Req 1.5). */
export type MethodId = 'digital' | 'offset' | string;

/** Tham chiếu method-agnostic tới một sản phẩm trong catalog hợp nhất. */
export interface ProductRef {
    /** UnifiedProduct.code */
    code: string;
    /** loose | bound | large_format | to_roi | ... (gợi ý định tuyến plugin) */
    quoteType: string;
}

/** Thông số dùng chung — không phụ thuộc phương pháp (Req 3.2). */
export interface Specification {
    quantity: number;
    dimensions?: { width?: number; height?: number; depth?: number };
    materialCode?: string;
    paperSizeCode?: string;
    processing?: { code: string; side?: string }[];
    accessories?: { id: number; qty?: number }[];
    /** Tham số riêng theo phương pháp (vd soKemIn, boxType). */
    attributes?: Record<string, unknown>;
}

/**
 * Tham số giá đọc từ cấu hình (Req 7).
 * VAT KHÔNG nằm ở đây — VAT là giá trị chung cấp báo giá (Req 8).
 */
export interface PricingConfigView {
    discountRate?: number;
    markupPercent?: number;
    // các định mức khác đọc nội bộ engine từ config store
}

/** Kết quả tính giá trước VAT (VAT áp ở tầng báo giá). */
export interface PriceResult {
    ok: boolean;
    methodId: MethodId;
    /** giá vốn */
    costSubtotal: number;
    /** giá bán trước chiết khấu/VAT */
    sellingSubtotal: number;
    /** chiết khấu (cấu hình) */
    discountAmount: number;
    /** sellingSubtotal - discountAmount ← cơ sở tính VAT */
    priceBeforeVat: number;
    pricePerItem: number;
    breakdown: Record<string, unknown>;
    /** khi ok=false (Req 5.5) */
    unavailableReason?: string;
}

/**
 * Hợp đồng chung cho mọi Phương_Pháp_In (Req 3.3).
 * Cho phép thêm phương pháp mới mà không đổi tầng Sản_Phẩm/Thông_Số (Req 1.5, 3.6).
 */
export interface MethodPlugin {
    readonly methodId: MethodId;
    /** Plugin có áp dụng được cho sản phẩm + thông số này không (Req 5.1, 5.5). */
    appliesTo(product: ProductRef, spec: Specification): boolean;
    /** Tính giá; bọc engine hiện hữu, KHÔNG đổi số học (Req 6.1, 6.2). */
    calculate(
        product: ProductRef,
        spec: Specification,
        cfg: PricingConfigView,
    ): Promise<PriceResult>;
}
