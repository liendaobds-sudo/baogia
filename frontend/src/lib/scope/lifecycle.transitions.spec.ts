/**
 * Property test cho vòng đời phân loại — ràng buộc "không gỡ-trực-tiếp".
 *
 * Property 6: Không gỡ bỏ khi chưa qua đóng băng.
 *
 * *For any* dãy chuyển trạng thái phân loại của một tính năng, nếu tính năng đạt
 * trạng thái `removed` thì trước đó nó đã từng ở trạng thái `frozen` (không tồn
 * tại chuyển trực tiếp `core → removed`, và cũng không có `[*] → removed`).
 *
 * Diễn đạt kiểm thử được: với mọi dãy trạng thái ngẫu nhiên,
 *   validateTransitionSequence(states).valid === true
 *     ⇒ removedAlwaysPrecededByFrozen(states) === true.
 * Đồng thời `isValidTransition` không bao giờ cho phép `core → removed`, và không
 * cho phép chuyển tự lặp (`from === to`).
 *
 * **Validates: Requirements 5.1**
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (dùng 200).
 */

import fc from 'fast-check';

import {
  isValidTransition,
  removedAlwaysPrecededByFrozen,
  validateTransitionSequence,
} from './lifecycle';
import type { ScopeClass } from './types';

const FEATURE_TAG = 'Feature: product-rescope-cskh-quote, Property 6';

const SCOPES: readonly ScopeClass[] = ['core', 'frozen', 'removed'];

/** Generator một trạng thái phân loại bất kỳ. */
const scopeArb: fc.Arbitrary<ScopeClass> = fc.constantFrom(...SCOPES);

/** Generator một dãy trạng thái ngẫu nhiên (gồm cả dãy rỗng và một phần tử). */
const stateSequenceArb: fc.Arbitrary<ScopeClass[]> = fc.array(scopeArb, {
  minLength: 0,
  maxLength: 12,
});

/** Generator một cặp chuyển trạng thái ngẫu nhiên `(from, to)`. */
const transitionPairArb: fc.Arbitrary<[ScopeClass, ScopeClass]> = fc.tuple(
  scopeArb,
  scopeArb,
);

describe(FEATURE_TAG, () => {
  it('validateTransitionSequence(states).valid implies removedAlwaysPrecededByFrozen(states)', () => {
    fc.assert(
      fc.property(stateSequenceArb, (states) => {
        if (validateTransitionSequence(states).valid) {
          expect(removedAlwaysPrecededByFrozen(states)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('isValidTransition never allows core -> removed and never allows self-transitions', () => {
    fc.assert(
      fc.property(transitionPairArb, ([from, to]) => {
        // Cấm trực tiếp core → removed (Req 5.1).
        if (from === 'core' && to === 'removed') {
          expect(isValidTransition(from, to)).toBe(false);
        }
        // Không có cạnh tự lặp trong state machine.
        if (from === to) {
          expect(isValidTransition(from, to)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('any valid single transition into removed must come from frozen', () => {
    fc.assert(
      fc.property(transitionPairArb, ([from, to]) => {
        if (to === 'removed' && isValidTransition(from, to)) {
          expect(from).toBe('frozen');
        }
      }),
      { numRuns: 200 },
    );
  });
});
