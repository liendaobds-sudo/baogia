/**
 * VAT cấp báo giá — Công_Cụ_Báo_Giá hợp nhất (Phase 4).
 *
 * Mô hình VAT chung cấp báo giá (Req 8): VAT là **một giá trị duy nhất** thuộc mục
 * khách hàng của báo giá, áp **đúng một lần** trên TỔNG giá sau chiết khấu của mọi
 * dòng / mọi Phương_Pháp_In trong cùng báo giá — không khai báo riêng theo phương
 * pháp và không cộng VAT chồng VAT.
 *
 * Mỗi dòng (do Method Plugin trả về) mang `priceBeforeVat` = giá bán sau chiết khấu,
 * TRƯỚC VAT (xem `PriceResult.priceBeforeVat`). Module này gộp các dòng rồi áp VAT:
 *
 *   sumPriceBeforeVat = Σ priceBeforeVat
 *   vatAmount         = round(sumPriceBeforeVat × vat_rate)
 *   grandTotal        = sumPriceBeforeVat + vatAmount
 *
 * Quy ước `vat_rate`: hệ lưu VAT dưới dạng **phần trăm** (vd 8, 10) ở mục khách hàng
 * của báo giá (`quotes.vat_rate`, `pricing_config.vat_rate`). Để nhất quán với phần
 * còn lại của hệ (`pricing-facade.service.ts`, `quote-pdf.service.ts`,
 * `orders.service.ts`), công thức `× vat_rate` được hiện thực là `× (percent / 100)`,
 * làm tròn bằng `Math.round` về số tiền nguyên (đồng).
 *
 * Đây là một hàm THUẦN — không phụ thuộc engine, không I/O — nên không cần đăng ký
 * provider; tầng báo giá/controller gọi trực tiếp.
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4_
 */

/** Một dòng báo giá mang giá sau chiết khấu, trước VAT. */
export interface QuoteVatLine {
    /** Giá bán sau chiết khấu, TRƯỚC VAT (= PriceResult.priceBeforeVat). */
    priceBeforeVat: number;
}

/** Kết quả áp VAT cấp báo giá. */
export interface QuoteVatResult {
    /** Σ priceBeforeVat của mọi dòng/phương pháp. */
    sumPriceBeforeVat: number;
    /** VAT phần trăm đã dùng (đã chuẩn hoá; vd 8, 10). */
    vatRatePercent: number;
    /** round((Σ priceBeforeVat) × vat_rate) — áp đúng một lần (Req 8.4). */
    vatAmount: number;
    /** Σ priceBeforeVat + vatAmount. */
    grandTotal: number;
}

/**
 * Chuẩn hoá vat_rate (phần trăm) về số hữu hạn không âm.
 * Giá trị thiếu/không hợp lệ ⇒ 0 (không áp VAT), khớp mẫu `parseFloat(...) || 0`
 * dùng khắp hệ.
 */
function normalizeVatRatePercent(vatRatePercent: number | null | undefined): number {
    const r = Number(vatRatePercent);
    if (!Number.isFinite(r) || r <= 0) {
        return 0;
    }
    return r;
}

/** Số tiền hợp lệ của một dòng (không hữu hạn ⇒ 0). */
function lineAmount(value: number | null | undefined): number {
    const v = Number(value);
    return Number.isFinite(v) ? v : 0;
}

/**
 * Áp VAT cấp báo giá một lần cho mọi dòng/phương pháp.
 *
 * @param lines  Các dòng báo giá, mỗi dòng mang `priceBeforeVat` (sau chiết khấu).
 * @param vatRatePercent  VAT phần trăm cấp báo giá (vd 8, 10) — một giá trị chung.
 * @returns Tổng trước VAT, số tiền VAT (làm tròn) và tổng có VAT.
 */
export function applyQuoteVat(
    lines: ReadonlyArray<QuoteVatLine>,
    vatRatePercent: number | null | undefined,
): QuoteVatResult {
    const rate = normalizeVatRatePercent(vatRatePercent);

    // VAT áp MỘT LẦN trên TỔNG giá sau chiết khấu của mọi dòng/phương pháp (Req 8.3, 8.4).
    const sumPriceBeforeVat = (lines ?? []).reduce(
        (sum, line) => sum + lineAmount(line?.priceBeforeVat),
        0,
    );

    const vatAmount = Math.round((sumPriceBeforeVat * rate) / 100);
    const grandTotal = sumPriceBeforeVat + vatAmount;

    return {
        sumPriceBeforeVat,
        vatRatePercent: rate,
        vatAmount,
        grandTotal,
    };
}
