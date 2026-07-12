/**
 * Property-based test cho `classifyResource` — Quy_Tắc_Phạm_Vi (canonical backend).
 *
 * Feature: resource-scope-config, Property 3: classifyResource trả về đúng tập các phạm vi đang Bật
 *
 * Property 3 (Design — Correctness Properties):
 *   For any `ScopeFlags` ngẫu nhiên, `classifyResource(flags)` trả về đúng tập hợp
 *   `{ s | resourceInScope(flags, s) }` — không thừa, không thiếu — theo thứ tự ổn định
 *   (offset, loose, bound, large_format), và trả về tập rỗng KHI VÀ CHỈ KHI mọi cờ đều Tắt.
 *
 * Validates: Requirements 2.7, 2.8, 6.7
 *
 * Chạy >= 200 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import {
    classifyResource,
    resourceInScope,
    Scope,
    ScopeFlags,
} from './resource-scope-rule';

const NUM_RUNS = 200;

/** Thứ tự ổn định của các Phạm_Vi như module canonical định nghĩa. */
const STABLE_ORDER: Scope[] = ['offset', 'loose', 'bound', 'large_format'];

/** Sinh giá trị một Cờ_Phạm_Vi: phủ smallint, boolean, và null/undefined/thiếu. */
const flagArb: fc.Arbitrary<number | boolean | null | undefined> = fc.constantFrom<
    number | boolean | null | undefined
>(0, 1, true, false, null, undefined);

/** Sinh `ScopeFlags` ngẫu nhiên với cả 4 cờ độc lập. */
const scopeFlagsArb: fc.Arbitrary<ScopeFlags> = fc.record({
    scope_offset: flagArb,
    scope_loose: flagArb,
    scope_bound: flagArb,
    scope_large_format: flagArb,
});

describe('classifyResource — tập phạm vi đang Bật (property)', () => {
    // Feature: resource-scope-config, Property 3: classifyResource trả về đúng tập các phạm vi đang Bật
    it('Property 3: classifyResource(flags) === { s | resourceInScope(flags, s) }, đúng thứ tự, rỗng ⇔ tắt hết (Req 2.7, 2.8, 6.7)', () => {
        fc.assert(
            fc.property(scopeFlagsArb, (flags) => {
                const result = classifyResource(flags);

                // Tập kỳ vọng = đúng các phạm vi mà resourceInScope trả true, theo thứ tự ổn định.
                const expected = STABLE_ORDER.filter((scope) =>
                    resourceInScope(flags, scope),
                );

                // (1) Không thừa, không thiếu — bằng nhau cả phần tử lẫn thứ tự.
                expect(result).toEqual(expected);

                // (2) Mọi phạm vi trả về phải thực sự in-scope (không thừa).
                for (const scope of result) {
                    expect(resourceInScope(flags, scope)).toBe(true);
                }

                // (3) Mọi phạm vi in-scope phải có mặt (không thiếu).
                for (const scope of STABLE_ORDER) {
                    if (resourceInScope(flags, scope)) {
                        expect(result).toContain(scope);
                    }
                }

                // (4) Tập rỗng KHI VÀ CHỈ KHI mọi cờ đều Tắt (Không_Thuộc_Phạm_Vi_Nào).
                const anyOn = STABLE_ORDER.some((scope) =>
                    resourceInScope(flags, scope),
                );
                expect(result.length === 0).toBe(!anyOn);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: resource-scope-config, Property 3: classifyResource trả về đúng tập các phạm vi đang Bật
    it('Property 3 (biên): mọi cờ Tắt (0/false/null/undefined) ⇒ tập rỗng (Req 2.8)', () => {
        fc.assert(
            fc.property(
                fc.constantFrom<number | boolean | null | undefined>(
                    0,
                    false,
                    null,
                    undefined,
                ),
                fc.constantFrom<number | boolean | null | undefined>(
                    0,
                    false,
                    null,
                    undefined,
                ),
                fc.constantFrom<number | boolean | null | undefined>(
                    0,
                    false,
                    null,
                    undefined,
                ),
                fc.constantFrom<number | boolean | null | undefined>(
                    0,
                    false,
                    null,
                    undefined,
                ),
                (offset, loose, bound, large_format) => {
                    const result = classifyResource({
                        scope_offset: offset,
                        scope_loose: loose,
                        scope_bound: bound,
                        scope_large_format: large_format,
                    });
                    expect(result).toEqual([]);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
