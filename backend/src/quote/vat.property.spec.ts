/**
 * Property-based test cho VAT cấp báo giá — `applyQuoteVat`.
 *
 * Feature: print-method-unification, Property 12: VAT áp đúng một lần trên giá sau chiết khấu
 *
 * Property 12 (Design — Correctness Properties):
 *   For any báo giá gồm một hay nhiều dòng thuộc bất kỳ phương pháp nào và bất kỳ
 *   giá trị VAT cấp báo giá nào, số tiền VAT bằng `round((Σ priceBeforeVat) × vat_rate)`
 *   và tổng gồm VAT bằng `Σ priceBeforeVat + vatAmount` — VAT KHÔNG bị cộng chồng
 *   theo từng phương pháp.
 *
 * Validates: Requirements 8.2, 8.3, 8.4
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { applyQuoteVat, QuoteVatLine } from './vat';

const NUM_RUNS = 200;

/** Một dòng báo giá: giá sau chiết khấu, trước VAT (priceBeforeVat). */
const lineArb: fc.Arbitrary<QuoteVatLine> = fc
    .integer({ min: 0, max: 50_000_000 })
    .map((priceBeforeVat) => ({ priceBeforeVat }));

/** Báo giá có ≥1 dòng (đa dòng ⇒ mô phỏng nhiều phương pháp trong cùng báo giá). */
const linesArb: fc.Arbitrary<QuoteVatLine[]> = fc.array(lineArb, {
    minLength: 1,
    maxLength: 12,
});

describe('applyQuoteVat — VAT áp đúng một lần (property)', () => {
    // Feature: print-method-unification, Property 12: VAT áp đúng một lần trên giá sau chiết khấu
    it('Property 12: vatAmount = round(Σ priceBeforeVat × rate/100), grandTotal = Σ + vatAmount, áp một lần (Req 8.2, 8.3, 8.4)', () => {
        fc.assert(
            fc.property(
                linesArb,
                // VAT phần trăm cấp báo giá: gồm 0 và các mức hợp lệ (vd 8, 10).
                fc.integer({ min: 0, max: 100 }),
                (lines, vatRatePercent) => {
                    const result = applyQuoteVat(lines, vatRatePercent);

                    const expectedSum = lines.reduce(
                        (acc, l) => acc + l.priceBeforeVat,
                        0,
                    );

                    // (1) Tổng trước VAT = Σ priceBeforeVat của mọi dòng/phương pháp (Req 8.3).
                    expect(result.sumPriceBeforeVat).toBe(expectedSum);

                    // (2) VAT tính ĐÚNG MỘT LẦN trên TỔNG giá sau chiết khấu (Req 8.2, 8.4):
                    //     vatAmount = round(Σ × rate/100).
                    const expectedVat = Math.round(
                        (expectedSum * vatRatePercent) / 100,
                    );
                    expect(result.vatAmount).toBe(expectedVat);

                    // (3) grandTotal = Σ priceBeforeVat + vatAmount.
                    expect(result.grandTotal).toBe(expectedSum + expectedVat);

                    // (4) KHÔNG cộng VAT chồng VAT: áp VAT cùng tỷ lệ trên TỪNG dòng
                    //     rồi cộng lại sẽ >= VAT áp một lần (do làm tròn mỗi dòng),
                    //     và quan trọng hơn — kết quả áp một lần độc lập với cách
                    //     CHIA dòng: gộp tất cả thành một dòng tổng cho cùng kết quả.
                    const singleLine = applyQuoteVat(
                        [{ priceBeforeVat: expectedSum }],
                        vatRatePercent,
                    );
                    expect(singleLine.vatAmount).toBe(result.vatAmount);
                    expect(singleLine.grandTotal).toBe(result.grandTotal);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: print-method-unification, Property 12: VAT áp đúng một lần trên giá sau chiết khấu
    it('Property 12 (biên): rate = 0 hoặc không hợp lệ ⇒ không áp VAT (vatAmount = 0, grandTotal = Σ)', () => {
        fc.assert(
            fc.property(
                linesArb,
                // Giá trị VAT thiếu/không hợp lệ: 0, âm, NaN, null, undefined.
                fc.constantFrom<number | null | undefined>(
                    0,
                    -1,
                    -10,
                    Number.NaN,
                    null,
                    undefined,
                ),
                (lines, badRate) => {
                    const result = applyQuoteVat(lines, badRate);
                    const expectedSum = lines.reduce(
                        (acc, l) => acc + l.priceBeforeVat,
                        0,
                    );

                    expect(result.vatRatePercent).toBe(0);
                    expect(result.vatAmount).toBe(0);
                    expect(result.grandTotal).toBe(expectedSum);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
