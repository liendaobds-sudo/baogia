/**
 * Property-based test cho detectBreakEven — dò Điểm_Hoà_Vốn (break-even).
 *
 * Feature: print-method-unification, Property 11: Tính đúng điểm hoà vốn
 *
 * Property 11 (Design — Correctness Properties):
 *   For any hai Phương_Pháp_In có hàm chi phí theo số lượng đơn điệu không giảm trên
 *   một dải số lượng, nếu thứ tự rẻ-hơn-đắt-hơn đảo chiều trong dải đó thì Bộ_So_Sánh_Giá
 *   báo cáo một Điểm_Hoà_Vốn `q*` sao cho tại các số lượng < `q*` một phương pháp rẻ hơn
 *   và tại các số lượng > `q*` phương pháp kia rẻ hơn; nếu không có đảo chiều thì báo cáo
 *   không có điểm hoà vốn trong dải.
 *
 * Validates: Requirements 5.3
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { detectBreakEven, PairPriceSample } from './break-even';

const NUM_RUNS = 300;

const METHOD_A = 'offset';
const METHOD_B = 'digital';

/** Dấu của hiệu giá (priceA - priceB): -1 (A rẻ hơn), 1 (B rẻ hơn), 0 (bằng). */
function sign(diff: number): -1 | 0 | 1 {
    if (diff < 0) return -1;
    if (diff > 0) return 1;
    return 0;
}

/**
 * Sinh hai hàm chi phí TUYẾN TÍNH đơn điệu không giảm theo số lượng:
 *   priceA(q) = fixedA + slopeA·q,  priceB(q) = fixedB + slopeB·q
 * với fixed, slope ≥ 0 (⇒ không giảm). Hai đường thẳng cắt nhau tối đa một lần ⇒ thứ tự
 * rẻ-hơn đảo chiều nhiều nhất một lần trên dải — đúng tiền đề Property 11.
 *
 * Dùng số nguyên để giá là số nguyên chính xác (không sai số dấu phẩy động khi so dấu).
 */
const linearCostPairArb = fc.record({
    fixedA: fc.integer({ min: 0, max: 2_000_000 }),
    fixedB: fc.integer({ min: 0, max: 2_000_000 }),
    slopeA: fc.integer({ min: 0, max: 1_000 }),
    slopeB: fc.integer({ min: 0, max: 1_000 }),
    // Dải số lượng: tập số nguyên dương duy nhất, ≥2 mức, sắp tăng dần.
    quantities: fc
        .uniqueArray(fc.integer({ min: 1, max: 10_000 }), {
            minLength: 2,
            maxLength: 12,
        })
        .map((qs) => [...qs].sort((a, b) => a - b)),
});

describe('detectBreakEven — tính đúng điểm hoà vốn (property)', () => {
    // Feature: print-method-unification, Property 11: Tính đúng điểm hoà vốn
    it('Property 11: đảo chiều ⇒ báo q* phân tách đúng; không đảo chiều ⇒ không có điểm hoà vốn (Req 5.3)', () => {
        fc.assert(
            fc.property(linearCostPairArb, (cfg) => {
                const { fixedA, fixedB, slopeA, slopeB, quantities } = cfg;

                const priceA = (q: number) => fixedA + slopeA * q;
                const priceB = (q: number) => fixedB + slopeB * q;

                const samples: PairPriceSample[] = quantities.map((q) => ({
                    quantity: q,
                    priceA: priceA(q),
                    priceB: priceB(q),
                }));

                const result = detectBreakEven(METHOD_A, METHOD_B, samples);

                // --- Oracle độc lập: xác định đảo chiều trực tiếp từ dãy dấu hiệu giá ---
                const signs = quantities.map((q) => sign(priceA(q) - priceB(q)));
                const firstNonZero = signs.find((s) => s !== 0);
                const groundTruthReversal =
                    firstNonZero !== undefined &&
                    signs.some((s) => s !== 0 && s !== firstNonZero);

                // (1) hasBreakEven phải khớp việc có đảo chiều trong dải.
                expect(result.hasBreakEven).toBe(groundTruthReversal);

                if (!result.hasBreakEven) {
                    // Không đảo chiều ⇒ không có breakEven, có message giải thích.
                    expect(result.breakEven).toBeUndefined();
                    expect(typeof result.message).toBe('string');

                    // Khẳng định ngữ nghĩa: không tồn tại hai số lượng mà phương pháp
                    // rẻ hơn lại khác nhau (tức cheaper nhất quán trên các mẫu khác giá).
                    const nonZero = signs.filter((s) => s !== 0);
                    if (nonZero.length > 0) {
                        const allSame = nonZero.every((s) => s === nonZero[0]);
                        expect(allSame).toBe(true);
                    }
                    return;
                }

                // --- Có điểm hoà vốn: kiểm tra phân tách quanh q* ---
                const be = result.breakEven!;
                expect(be).toBeDefined();

                // lower/upper là hai phương pháp KHÁC nhau (đảo chiều thực sự).
                expect(be.lowerMethodId).not.toBe(be.upperMethodId);
                expect([METHOD_A, METHOD_B]).toContain(be.lowerMethodId);
                expect([METHOD_A, METHOD_B]).toContain(be.upperMethodId);

                // q* nằm trong khoảng kẹp [lowerQuantity, upperQuantity], và kẹp tăng dần.
                expect(be.lowerQuantity).toBeLessThan(be.upperQuantity);
                expect(be.quantity).toBeGreaterThanOrEqual(be.lowerQuantity);
                expect(be.quantity).toBeLessThanOrEqual(be.upperQuantity);

                const cheaperMethodAt = (q: number) => {
                    const s = sign(priceA(q) - priceB(q));
                    if (s < 0) return METHOD_A;
                    if (s > 0) return METHOD_B;
                    return null; // bằng giá
                };

                // Tại cận dưới: lowerMethodId rẻ hơn; tại cận trên: upperMethodId rẻ hơn.
                expect(cheaperMethodAt(be.lowerQuantity)).toBe(be.lowerMethodId);
                expect(cheaperMethodAt(be.upperQuantity)).toBe(be.upperMethodId);

                // Khẳng định cốt lõi Property 11: với mọi số lượng < q* (có chênh lệch),
                // lowerMethodId rẻ hơn; với mọi số lượng > q* (có chênh lệch), upperMethodId
                // rẻ hơn. (Hàm tuyến tính cắt một lần ⇒ phân tách sạch quanh q*.)
                for (const q of quantities) {
                    const cheaper = cheaperMethodAt(q);
                    if (cheaper === null) continue; // bỏ qua mẫu bằng giá
                    if (q < be.quantity) {
                        expect(cheaper).toBe(be.lowerMethodId);
                    } else if (q > be.quantity) {
                        expect(cheaper).toBe(be.upperMethodId);
                    }
                }
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
