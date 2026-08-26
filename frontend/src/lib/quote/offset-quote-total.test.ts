import fc from 'fast-check';
import { quoteAlignedOffsetTotals } from './offset-quote-total';

/**
 * Feature: offset-quote-display-parity
 *
 * Pin BẤT BIẾN: số tiền hiển thị ở configurator offset phải KHỚP công thức mà backend dùng
 * khi LƯU báo giá (OrdersService.createQuote) và khi in PDF (QuotePdfService):
 *
 *   item_total  = tongChuaVAT − chietKhau            (trước VAT)
 *   vat_amount  = item_total × rate                  (VAT trên giá SAU chiết khấu)
 *   grand_total = item_total + vat_amount
 *
 * Engine offset (`offset-engine/totals.ts`) lại trả `khachTra = tongChuaVAT × (1+rate) − chietKhau`
 * (VAT trên base TRƯỚC chiết khấu). Test này khoá chênh lệch đó lại đúng `chietKhau × rate`
 * để không ai vô tình đưa `khachTra` trở lại UI.
 */
describe('quoteAlignedOffsetTotals', () => {
    const NUM_RUNS = 200;

    // Sinh bộ số như engine trả về: vat = tongChuaVAT × rate (đúng theo totals.ts).
    const engineResultArb = fc
        .record({
            tongChuaVAT: fc.double({ min: 0, max: 5_000_000_000, noNaN: true }),
            rate: fc.double({ min: 0, max: 0.2, noNaN: true }),
            discountRatio: fc.double({ min: 0, max: 0.5, noNaN: true }),
            quantity: fc.integer({ min: 1, max: 1_000_000 }),
        })
        .map(({ tongChuaVAT, rate, discountRatio, quantity }) => ({
            tongChuaVAT,
            rate,
            chietKhau: tongChuaVAT * discountRatio,
            vat: tongChuaVAT * rate,
            quantity,
        }));

    // Sai số tương đối cho phép (float 64-bit qua vài phép nhân/chia).
    const closeTo = (a: number, b: number) => {
        const scale = Math.max(1, Math.abs(a), Math.abs(b));
        return Math.abs(a - b) <= 1e-9 * scale;
    };

    it('Property 1: grandTotal ≡ công thức backend (VAT trên giá sau chiết khấu)', () => {
        fc.assert(
            fc.property(engineResultArb, ({ tongChuaVAT, vat, chietKhau, rate, quantity }) => {
                const got = quoteAlignedOffsetTotals({ tongChuaVAT, vat, chietKhau }, quantity);
                const expectedNet = tongChuaVAT - chietKhau;
                const expectedGrand = expectedNet * (1 + rate);

                expect(closeTo(got.netPreVat, expectedNet)).toBe(true);
                expect(closeTo(got.grandTotal, expectedGrand)).toBe(true);
                expect(closeTo(got.vatAmount, expectedNet * rate)).toBe(true);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('Property 2: chênh lệch với khachTra của engine đúng bằng chietKhau × rate', () => {
        fc.assert(
            fc.property(engineResultArb, ({ tongChuaVAT, vat, chietKhau, rate, quantity }) => {
                const got = quoteAlignedOffsetTotals({ tongChuaVAT, vat, chietKhau }, quantity);
                const khachTraEngine = tongChuaVAT + vat - chietKhau;

                // Hiệu hai số cỡ triệu/tỷ đồng chịu catastrophic cancellation: nhiễu làm tròn
                // của (khachTraEngine − grandTotal) scale theo TOÁN HẠNG chứ không theo hiệu.
                // Dung sai vì vậy phải tính trên khachTraEngine — nếu tính trên hiệu (~e-9),
                // chietKhau siêu nhỏ (vd 2e-8đ, seed 1301377570) làm fail dù công thức đúng.
                const tol = 1e-9 * Math.max(1, khachTraEngine, got.grandTotal);
                expect(Math.abs((khachTraEngine - got.grandTotal) - chietKhau * rate) <= tol).toBe(true);
                // Với chiết khấu ≥ 0 và VAT ≥ 0, số hiển thị mới không bao giờ cao hơn engine
                // (ngoài nhiễu làm tròn float cùng cỡ tol).
                expect(got.grandTotal).toBeLessThanOrEqual(khachTraEngine + tol);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('Property 3: unitPrice × quantity ≡ grandTotal; quantity ≤ 0 ⇒ unitPrice = 0', () => {
        fc.assert(
            fc.property(engineResultArb, ({ tongChuaVAT, vat, chietKhau, quantity }) => {
                const r = { tongChuaVAT, vat, chietKhau };
                const got = quoteAlignedOffsetTotals(r, quantity);
                expect(closeTo(got.unitPrice * quantity, got.grandTotal)).toBe(true);

                expect(quoteAlignedOffsetTotals(r, 0).unitPrice).toBe(0);
                expect(quoteAlignedOffsetTotals(r, -5).unitPrice).toBe(0);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('thoái biến: result null / trường thiếu / không hữu hạn ⇒ toàn 0, không NaN', () => {
        for (const r of [null, undefined, {}, { tongChuaVAT: NaN, vat: Infinity, chietKhau: null }]) {
            const got = quoteAlignedOffsetTotals(r as never, 100);
            expect(got).toEqual({ vatRate: 0, netPreVat: 0, vatAmount: 0, grandTotal: 0, unitPrice: 0 });
        }
    });

    it('VAT 0% được tôn trọng (không suy ra rate mặc định)', () => {
        const got = quoteAlignedOffsetTotals({ tongChuaVAT: 1_000_000, vat: 0, chietKhau: 50_000 }, 10);
        expect(got.vatRate).toBe(0);
        expect(got.vatAmount).toBe(0);
        expect(got.grandTotal).toBe(950_000);
        expect(got.unitPrice).toBe(95_000);
    });
});
