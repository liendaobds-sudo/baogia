/**
 * offset-quote-total — Quy đổi kết quả EngineOffset sang CÙNG quy ước tiền của TẦNG BÁO GIÁ.
 *
 * BỐI CẢNH (audit 2026-07-25): engine offset và tầng báo giá áp VAT trên hai cơ sở khác nhau
 *
 *   Engine (`offset-engine/totals.ts`):
 *     vat        = tongChuaVAT × rate                  ← VAT trên base TRƯỚC chiết khấu
 *     khachTra   = (tongChuaVAT + vat) − chietKhau
 *
 *   Tầng báo giá (`OrdersService.createQuote`, và PDF `QuotePdfService`):
 *     item_total = tongChuaVAT − chietKhau             ← lưu TRƯỚC VAT
 *     vat_amount = (Σ item_total − chiết_khấu_thủ_công) × rate   ← VAT trên base SAU chiết khấu
 *     grand_total = sau_chiết_khấu + vat_amount + phí_giao_hàng
 *
 * ⇒ `khachTra` của engine LỚN HƠN số thực lưu/PDF đúng bằng `chietKhau × rate`. Nếu UI in
 * `khachTra` thì con số báo cho khách ở configurator KHÁC con số trong báo giá đã lưu.
 *
 * Module này KHÔNG sửa engine (giữ nguyên golden `offset-price-preservation.golden.spec.ts`),
 * chỉ quy đổi cho HIỂN THỊ về đúng quy ước tầng báo giá — nơi tiền thật được chốt.
 *
 * Hàm thuần: không I/O, không mutate đầu vào.
 */

/** Phần kết quả engine cần cho việc quy đổi (subset của `OffsetQuoteResult`). */
export interface OffsetEngineTotalsLike {
    tongChuaVAT?: number | null;
    vat?: number | null;
    chietKhau?: number | null;
}

export interface QuoteAlignedOffsetTotals {
    /** Tỷ lệ VAT suy ra từ engine (phân số, vd 0.1). */
    vatRate: number;
    /** Giá trước VAT sau chiết khấu engine = `item_total` server sẽ lưu. */
    netPreVat: number;
    /** VAT theo quy ước báo giá: tính trên `netPreVat`. */
    vatAmount: number;
    /** Tổng khách trả (chưa gồm phí giao hàng / chiết khấu thủ công cấp báo giá). */
    grandTotal: number;
    /** Đơn giá 1 sản phẩm theo `grandTotal`. */
    unitPrice: number;
}

const finite = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Quy đổi kết quả engine offset về quy ước tiền của tầng báo giá.
 *
 * @param result kết quả engine (có thể null khi chưa tính)
 * @param quantity số lượng sản phẩm (để suy đơn giá); ≤ 0 ⇒ đơn giá 0
 */
export function quoteAlignedOffsetTotals(
    result: OffsetEngineTotalsLike | null | undefined,
    quantity: number,
): QuoteAlignedOffsetTotals {
    const tongChuaVAT = finite(result?.tongChuaVAT);
    const vatEngine = finite(result?.vat);
    const chietKhau = finite(result?.chietKhau);

    // Suy tỷ lệ VAT từ chính engine (engine: vat = tongChuaVAT × rate). tongChuaVAT ≤ 0 ⇒ 0.
    const vatRate = tongChuaVAT > 0 ? vatEngine / tongChuaVAT : 0;

    const netPreVat = tongChuaVAT - chietKhau;
    const vatAmount = netPreVat * vatRate;
    const grandTotal = netPreVat + vatAmount;
    const qty = finite(quantity);

    return {
        vatRate,
        netPreVat,
        vatAmount,
        grandTotal,
        unitPrice: qty > 0 ? grandTotal / qty : 0,
    };
}
