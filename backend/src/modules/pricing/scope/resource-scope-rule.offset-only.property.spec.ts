/**
 * Property-based test cho `isOffsetOnly` — định nghĩa Tài_Nguyên_Chỉ_Offset.
 *
 * Feature: resource-scope-config, Property 4: Định nghĩa Tài_Nguyên_Chỉ_Offset
 *
 * Property 4 (Design — Correctness Properties):
 *   For any `ScopeFlags` ngẫu nhiên, `isOffsetOnly(flags)` trả về true KHI VÀ CHỈ KHI
 *   `scope_offset` đang Bật VÀ đồng thời cả ba cờ `scope_loose`, `scope_bound`,
 *   `scope_large_format` đều Tắt.
 *
 * Validates: Requirements 2.6
 *
 * Chạy >= 200 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { isOffsetOnly, isOn, ScopeFlags } from './resource-scope-rule';

const NUM_RUNS = 200;

/**
 * Sinh giá trị một Cờ_Phạm_Vi phủ cả smallint (0/1), boolean (false/true)
 * lẫn các giá trị Tắt đặc biệt (null/undefined) để kiểm tính group-agnostic.
 */
const flagValueArb: fc.Arbitrary<number | boolean | null | undefined> = fc.constantFrom(
    0,
    1,
    true,
    false,
    null,
    undefined,
);

/** Sinh một bộ `ScopeFlags` ngẫu nhiên (mỗi cờ độc lập, gồm cả null/undefined). */
const scopeFlagsArb: fc.Arbitrary<ScopeFlags> = fc.record({
    scope_loose: flagValueArb,
    scope_bound: flagValueArb,
    scope_large_format: flagValueArb,
    scope_offset: flagValueArb,
});

describe('isOffsetOnly — định nghĩa Tài_Nguyên_Chỉ_Offset (property)', () => {
    // Feature: resource-scope-config, Property 4: Định nghĩa Tài_Nguyên_Chỉ_Offset
    it('Property 4: isOffsetOnly(flags) === (offset Bật && cả ba cờ in nhanh Tắt) (Req 2.6)', () => {
        fc.assert(
            fc.property(scopeFlagsArb, (flags) => {
                const offsetOn = isOn(flags.scope_offset);
                const anyPrintOn =
                    isOn(flags.scope_loose) ||
                    isOn(flags.scope_bound) ||
                    isOn(flags.scope_large_format);

                const expected = offsetOn && !anyPrintOn;

                expect(isOffsetOnly(flags)).toBe(expected);
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
