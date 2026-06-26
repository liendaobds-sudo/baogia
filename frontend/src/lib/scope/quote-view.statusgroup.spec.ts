/**
 * Property test cho ánh xạ trạng thái Báo giá/Đơn hàng rời nhau (Property 13).
 *
 * Feature: product-rescope-cskh-quote, Property 13: Ánh xạ trạng thái Báo giá/Đơn hàng rời nhau
 * Validates: Requirements 8.3
 *
 * Property:
 *  - `QUOTE_STATUSES` và `ORDER_STATUSES` rời nhau (disjoint) — không trạng thái nào
 *    thuộc cả hai tập.
 *  - Với mọi chuỗi trạng thái `s`:
 *      statusGroup(s) === 'quote'  ⟺  s ∈ QUOTE_STATUSES
 *      statusGroup(s) === 'order'  ⟺  s ∈ ORDER_STATUSES
 *      ngược lại                    statusGroup(s) === 'all'
 *  - Không trạng thái nào ánh xạ tới cả 'quote' lẫn 'order' (hệ quả của disjoint).
 *
 * Generator gồm các trạng thái lề: `cancelled`, `expired`, chuỗi rỗng, giá trị lạ,
 * cùng các thành viên của cả hai tập trạng thái.
 */

import fc from 'fast-check';
import {
  ORDER_STATUSES,
  QUOTE_STATUSES,
  statusGroup,
} from './quote-view';

const RUNS = 200;

const QUOTE_SET = new Set<string>(QUOTE_STATUSES);
const ORDER_SET = new Set<string>(ORDER_STATUSES);

/**
 * Trạng thái lề/ngoài tập đáng quan tâm theo design (Req 8.6): những giá trị này
 * KHÔNG được thuộc QUOTE_STATUSES hay ORDER_STATUSES, do đó phải rơi vào 'all'.
 */
const FALLBACK_STATUSES = ['cancelled', 'expired', 'rejected', ''] as const;

/**
 * Generator chuỗi trạng thái tuỳ ý, có trọng số nghiêng về các giá trị thú vị:
 * thành viên hai tập, các trạng thái lề, và chuỗi ngẫu nhiên.
 */
const statusArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...QUOTE_STATUSES),
  fc.constantFrom<string>(...ORDER_STATUSES),
  fc.constantFrom<string>(...FALLBACK_STATUSES),
  fc.string(),
);

describe('Feature: product-rescope-cskh-quote, Property 13: Ánh xạ trạng thái Báo giá/Đơn hàng rời nhau', () => {
  it('QUOTE_STATUSES và ORDER_STATUSES rời nhau (disjoint)', () => {
    for (const s of QUOTE_STATUSES) {
      expect(ORDER_SET.has(s)).toBe(false);
    }
    for (const s of ORDER_STATUSES) {
      expect(QUOTE_SET.has(s)).toBe(false);
    }
  });

  it('statusGroup(s) === "quote" ⟺ s ∈ QUOTE_STATUSES (Req 8.3)', () => {
    fc.assert(
      fc.property(statusArb, (s) => {
        expect(statusGroup(s) === 'quote').toBe(QUOTE_SET.has(s));
      }),
      { numRuns: RUNS },
    );
  });

  it('statusGroup(s) === "order" ⟺ s ∈ ORDER_STATUSES (Req 8.3)', () => {
    fc.assert(
      fc.property(statusArb, (s) => {
        expect(statusGroup(s) === 'order').toBe(ORDER_SET.has(s));
      }),
      { numRuns: RUNS },
    );
  });

  it('trạng thái ngoài cả hai tập (gồm cancelled/expired/rỗng/giá trị lạ) → "all" (Req 8.3, 8.6)', () => {
    fc.assert(
      fc.property(statusArb, (s) => {
        const outsideBothSets = !QUOTE_SET.has(s) && !ORDER_SET.has(s);
        expect(statusGroup(s) === 'all').toBe(outsideBothSets);
      }),
      { numRuns: RUNS },
    );
  });

  it('không trạng thái nào ánh xạ tới cả "quote" lẫn "order" (chỉ đúng một nhóm)', () => {
    fc.assert(
      fc.property(statusArb, (s) => {
        const group = statusGroup(s);
        expect(group === 'quote' || group === 'order' || group === 'all').toBe(true);
        // Đúng một nhóm: chỉ một trong các điều kiện thành viên đúng tại một thời điểm.
        const inQuote = QUOTE_SET.has(s);
        const inOrder = ORDER_SET.has(s);
        expect(inQuote && inOrder).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });

  it('các trạng thái lề cụ thể luôn ánh xạ tới "all"', () => {
    for (const s of FALLBACK_STATUSES) {
      expect(statusGroup(s)).toBe('all');
    }
  });
});
