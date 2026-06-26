/**
 * Unit tests cho VAT cấp báo giá (`applyQuoteVat`).
 *
 * Bao phủ mô hình VAT chung cấp báo giá (Req 8): áp một lần trên tổng giá sau
 * chiết khấu của mọi dòng/phương pháp, không cộng VAT chồng VAT.
 *
 * _Requirements: 8.1, 8.2, 8.3, 8.4_
 */
import { applyQuoteVat } from './vat';

describe('applyQuoteVat — VAT cấp báo giá (Req 8)', () => {
    it('áp VAT một lần trên tổng của nhiều dòng/phương pháp (Req 8.3, 8.4)', () => {
        // 2 dòng: 1 digital + 1 offset, cùng một VAT cấp báo giá.
        const res = applyQuoteVat(
            [{ priceBeforeVat: 1_000_000 }, { priceBeforeVat: 500_000 }],
            10,
        );
        expect(res.sumPriceBeforeVat).toBe(1_500_000);
        // round(1_500_000 × 10%) = 150_000 — một lần trên TỔNG, không cộng theo từng dòng.
        expect(res.vatAmount).toBe(150_000);
        expect(res.grandTotal).toBe(1_650_000);
    });

    it('VAT trên tổng = VAT cộng dồn theo dòng KHI không có làm tròn lệch (chứng minh áp một lần)', () => {
        const lines = [{ priceBeforeVat: 1_000_000 }, { priceBeforeVat: 500_000 }];
        const onWhole = applyQuoteVat(lines, 10).vatAmount;
        const perLineSum = lines
            .map((l) => Math.round((l.priceBeforeVat * 10) / 100))
            .reduce((a, b) => a + b, 0);
        // Ở đây trùng nhau, nhưng module LUÔN tính trên tổng (Req 8.4) — xem test làm tròn dưới.
        expect(onWhole).toBe(perLineSum);
    });

    it('làm tròn trên TỔNG, không làm tròn từng dòng (Req 8.4)', () => {
        // Mỗi dòng round(...) sẽ ra 0 nếu áp riêng; áp trên tổng cho kết quả khác.
        const lines = [{ priceBeforeVat: 3 }, { priceBeforeVat: 3 }, { priceBeforeVat: 3 }];
        // Σ = 9; round(9 × 50%) = round(4.5) = 5 (Math.round làm tròn lên ở .5).
        const res = applyQuoteVat(lines, 50);
        expect(res.sumPriceBeforeVat).toBe(9);
        expect(res.vatAmount).toBe(5);
        expect(res.grandTotal).toBe(14);
        // Nếu áp riêng từng dòng: round(3×50%)=round(1.5)=2, ×3 = 6 ≠ 5 ⇒ khác biệt được bảo toàn.
    });

    it('VAT phần trăm thông dụng 8% làm tròn về đồng nguyên (Req 8.2)', () => {
        const res = applyQuoteVat([{ priceBeforeVat: 79_200 }], 8);
        // round(79_200 × 8%) = round(6_336) = 6_336
        expect(res.vatAmount).toBe(6_336);
        expect(res.grandTotal).toBe(85_536);
    });

    it('vat_rate = 0 ⇒ không áp VAT, grandTotal = tổng trước VAT', () => {
        const res = applyQuoteVat([{ priceBeforeVat: 1_000_000 }], 0);
        expect(res.vatAmount).toBe(0);
        expect(res.grandTotal).toBe(1_000_000);
    });

    it('danh sách dòng rỗng ⇒ mọi giá trị bằng 0', () => {
        const res = applyQuoteVat([], 10);
        expect(res.sumPriceBeforeVat).toBe(0);
        expect(res.vatAmount).toBe(0);
        expect(res.grandTotal).toBe(0);
    });

    it('vat_rate thiếu/không hợp lệ/âm ⇒ chuẩn hoá về 0 (không áp VAT)', () => {
        for (const bad of [undefined, null, NaN, -5] as Array<number | null | undefined>) {
            const res = applyQuoteVat([{ priceBeforeVat: 1_000_000 }], bad);
            expect(res.vatRatePercent).toBe(0);
            expect(res.vatAmount).toBe(0);
            expect(res.grandTotal).toBe(1_000_000);
        }
    });

    it('bỏ qua priceBeforeVat không hữu hạn của một dòng (defensive)', () => {
        const res = applyQuoteVat(
            [{ priceBeforeVat: 1_000_000 }, { priceBeforeVat: NaN as unknown as number }],
            10,
        );
        expect(res.sumPriceBeforeVat).toBe(1_000_000);
        expect(res.vatAmount).toBe(100_000);
    });

    it('một phương pháp duy nhất: VAT vẫn áp một lần trên dòng đó', () => {
        const res = applyQuoteVat([{ priceBeforeVat: 250_000 }], 8);
        expect(res.vatAmount).toBe(Math.round((250_000 * 8) / 100));
        expect(res.grandTotal).toBe(250_000 + res.vatAmount);
    });
});
