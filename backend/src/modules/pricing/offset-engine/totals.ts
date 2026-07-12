/**
 * Tổng cuối báo giá: tổng chưa VAT → VAT → chiết khấu → khách trả → donGia1SP.
 *
 * Bù hao được phân bổ vào SỐ LƯỢNG đi qua từng công đoạn (qua cascade) — KHÔNG cộng % hao phẳng
 * trên tổng (tránh double-count). `wasteInfo` chỉ là THÔNG TIN tổng chi phí bù hao để hiển thị.
 *
 * Quy ước:
 * - VAT áp trên tổng chưa VAT.
 * - Chiết khấu CHỈ áp trên chi phí sản xuất + thiết kế (baseSXTK), KHÔNG trên giấy/kẽm/vật tư,
 *   và bị giới hạn ở TyLe_ChietKhau_Max.
 */
import { PricingData, QuoteLine, QuoteResult } from './pricing-data';

export function tongHopKetQua(
    lines: QuoteLine[],
    baseSXTK: number,
    sl: number,
    d: PricingData,
    wasteInfo: number,
    chietKhauRate?: number,
    vatRate?: number,
): QuoteResult {
    const tongChuaVAT = lines.reduce((s, l) => s + (l.amount || 0), 0);
    // VAT: BẮT BUỘC đi theo % nhập ở thông tin khách hàng (truyền vào dạng phân số, vd 0.1).
    // KHÔNG fallback về cấu hình pricebook (TyLe_VAT) — thiếu rate ⇒ coi như không áp VAT (0)
    // để VAT chỉ có một nguồn duy nhất (mục khách hàng), tránh VAT "chui" từ config.
    const vatPct = vatRate ?? 0;
    const vat = tongChuaVAT * vatPct;
    const tongGomVAT = tongChuaVAT + vat; // KHÔNG cộng hao phẳng — hao đã nằm trong số lượng cascade

    // Chiết khấu: dùng % từ UI nếu truyền vào, nếu không lấy mặc định cấu hình; luôn chặn trần TyLe_ChietKhau_Max.
    const rate = Math.min(
        chietKhauRate ?? d.tyLe.params.TyLe_ChietKhau,
        d.tyLe.params.TyLe_ChietKhau_Max,
    );
    const chietKhau = baseSXTK * rate;

    const khachTra = tongGomVAT - chietKhau;
    const donGia1SP = sl > 0 ? khachTra / sl : 0;

    // haoHut = thông tin (chi phí bù hao đã phân bổ), không cộng vào tiền.
    return { lines, tongChuaVAT, haoHut: wasteInfo, vat, tongGomVAT, chietKhau, khachTra, donGia1SP };
}
