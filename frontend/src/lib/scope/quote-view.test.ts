/**
 * Property test cho `viewToStatuses` — phân hoạch hai chiều với `statusGroup`.
 *
 * Feature: quote-page-ux, Property 1: viewToStatuses nhất quán với statusGroup
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5
 *
 * Property 1:
 *  - Với mọi trạng thái `s` mà `statusGroup(s) ∈ {'quote','order'}`, thì
 *    `viewToStatuses(statusGroup(s))` phải chứa `s`.
 *  - Với mọi view `v ∈ {'quote','order'}` và mọi `s ∈ viewToStatuses(v)`, phải có
 *    `statusGroup(s) === v`.
 *  - `viewToStatuses('all')` phải bằng `[]`.
 *
 * Generator: chuỗi trạng thái bất kỳ (thành viên hai tập + trạng thái lề/lạ/rỗng),
 * cùng view ∈ {quote, order, all}.
 */

import fc from 'fast-check';
import {
  ORDER_STATUSES,
  QUOTE_STATUSES,
  statusGroup,
  viewToStatuses,
} from './quote-view';
import type { ViewKey } from './types';

const RUNS = 200;

/** Trạng thái lề/ngoài tập (phải rơi vào nhóm 'all'). */
const FALLBACK_STATUSES = ['cancelled', 'expired', 'rejected', ''] as const;

/** Generator chuỗi trạng thái tuỳ ý, nghiêng về các giá trị thú vị. */
const statusArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...QUOTE_STATUSES),
  fc.constantFrom<string>(...ORDER_STATUSES),
  fc.constantFrom<string>(...FALLBACK_STATUSES),
  fc.string(),
);

/** Generator chỉ các view có nhóm (loại trừ 'all'). */
const groupViewArb: fc.Arbitrary<Exclude<ViewKey, 'all'>> = fc.constantFrom('quote', 'order');

describe('Feature: quote-page-ux, Property 1: viewToStatuses nhất quán với statusGroup', () => {
  it('mọi trạng thái thuộc nhóm quote/order ⇒ viewToStatuses(statusGroup(s)) chứa s (Req 1.1, 1.4)', () => {
    fc.assert(
      fc.property(statusArb, (s) => {
        const group = statusGroup(s);
        if (group === 'quote' || group === 'order') {
          expect(viewToStatuses(group)).toContain(s);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('mọi s ∈ viewToStatuses(v) (v ∈ {quote,order}) ⇒ statusGroup(s) === v (Req 1.3, 1.4)', () => {
    fc.assert(
      fc.property(groupViewArb, (v) => {
        const statuses = viewToStatuses(v);
        expect(statuses.length).toBeGreaterThan(0);
        for (const s of statuses) {
          expect(statusGroup(s)).toBe(v);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("viewToStatuses('all') === [] (Req 1.5)", () => {
    expect(viewToStatuses('all')).toEqual([]);
  });

  it('viewToStatuses thuần: không đột biến hằng số nguồn, trả mảng mới mỗi lần (Req 1.4)', () => {
    fc.assert(
      fc.property(groupViewArb, (v) => {
        const a = viewToStatuses(v);
        const b = viewToStatuses(v);
        expect(a).toEqual(b);
        expect(a).not.toBe(b); // mảng mới mỗi lần gọi
      }),
      { numRuns: RUNS },
    );
    // Hằng số nguồn không bị thay đổi.
    expect([...QUOTE_STATUSES]).toEqual(['draft', 'pending_approval', 'approved', 'sent']);
    expect([...ORDER_STATUSES]).toEqual(['accepted', 'completed']);
  });
});
