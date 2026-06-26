// Feature: quote-page-ux, Property 3: formatVND xác định, một ký hiệu, parse lại được
import fc from 'fast-check';
import { formatVND } from './currency';

/**
 * Property 3 — formatVND xác định, một ký hiệu, và parse lại được.
 *
 * Với mọi số hữu hạn `amount`, `formatVND(amount)` phải:
 *  (a) xác định (deterministic): gọi nhiều lần cùng input cho cùng chuỗi;
 *  (b) chứa đúng một ký hiệu '₫' và kết thúc bằng ' ₫';
 *  (c) khi gỡ mọi ký tự không phải chữ số (và dấu trừ) rồi parseInt thì bằng Math.round(amount).
 *
 * **Validates: Requirements 7.1, 7.2**
 */

// Generator số hữu hạn: gồm 0, âm, lớn, và có phần thập phân.
// Giới hạn trong vùng số nguyên an toàn để việc parse lại bằng parseInt là chính xác
// (Math.round vẫn cho số nguyên chính xác, tránh sai số dấu phẩy động với số cực lớn).
const finiteAmount = (): fc.Arbitrary<number> =>
  fc.oneof(
    // số thực (có phần thập phân), cả âm lẫn dương, bao gồm 0
    fc.double({
      min: -1e12,
      max: 1e12,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    // số nguyên lớn để kiểm "large"
    fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
    // các giá trị biên đáng chú ý
    fc.constantFrom(0, -0, 0.4, -0.4, 0.5, -0.5, 999.5, -999.5, 1_000_000.49),
  );

describe('formatVND — Property 3', () => {
  it('(a) là hàm xác định: cùng input → cùng chuỗi', () => {
    fc.assert(
      fc.property(finiteAmount(), (amount) => {
        expect(formatVND(amount)).toBe(formatVND(amount));
      }),
      { numRuns: 200 },
    );
  });

  it("(b) chứa đúng một ký hiệu '₫' và kết thúc bằng ' ₫'", () => {
    fc.assert(
      fc.property(finiteAmount(), (amount) => {
        const out = formatVND(amount);
        const symbolCount = (out.match(/₫/g) ?? []).length;
        expect(symbolCount).toBe(1);
        expect(out.endsWith(' ₫')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('(c) gỡ ký tự không phải số/dấu trừ rồi parse lại = Math.round(amount)', () => {
    fc.assert(
      fc.property(finiteAmount(), (amount) => {
        const out = formatVND(amount);
        const digits = out.replace(/[^0-9-]/g, '');
        const parsed = parseInt(digits, 10);
        // Dùng so sánh `===` (thay vì Object.is của toBe) để -0 và 0 coi là bằng nhau,
        // đúng theo ngữ nghĩa "equals" của property (vd Math.round(-0.2) === -0).
        expect(parsed === Math.round(amount)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
