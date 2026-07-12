/**
 * Property-based test cho validateScopeFlags — validate giá trị Cờ_Phạm_Vi đầu vào.
 *
 * Feature: resource-scope-config, Property 9: Validate giá trị Cờ_Phạm_Vi đầu vào
 *
 * Property 9 (Design — Correctness Properties):
 *   For any `ScopeFlagInput` ngẫu nhiên, `validateScopeFlags(input)` có `ok === true`
 *   KHI VÀ CHỈ KHI `scope_offset` ∈ {true, false} (hoặc vắng mặt) VÀ mỗi cờ smallint
 *   `scope_loose`/`scope_bound`/`scope_large_format` ∈ {0, 1} (hoặc vắng mặt);
 *   ngược lại `ok === false` và `invalidFlags` liệt kê ĐÚNG các tên cờ vi phạm.
 *
 * Validates: Requirements 5.8, 6.2
 *
 * Chạy >= 200 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { validateScopeFlags, ScopeFlagInput } from './resource-scope-rule';

const NUM_RUNS = 300;

/** Sentinel đánh dấu "vắng mặt" (key không xuất hiện trong input). */
const ABSENT = Symbol('absent');

/**
 * Oracle độc lập, khớp đúng ngữ nghĩa implementation:
 * - smallint flag hợp lệ ⇔ vắng mặt (undefined) HOẶC === 0 HOẶC === 1.
 * - scope_offset hợp lệ ⇔ vắng mặt (undefined) HOẶC === true HOẶC === false.
 * Thứ tự invalidFlags: ba cờ smallint trước (loose, bound, large_format), rồi scope_offset.
 */
const SMALLINT_FLAGS: (keyof ScopeFlagInput)[] = [
    'scope_loose',
    'scope_bound',
    'scope_large_format',
];

function expectedInvalidFlags(input: ScopeFlagInput): string[] {
    const invalid: string[] = [];
    for (const name of SMALLINT_FLAGS) {
        const v = input[name];
        if (v !== undefined && v !== 0 && v !== 1) {
            invalid.push(name);
        }
    }
    const offset = input.scope_offset;
    if (offset !== undefined && offset !== true && offset !== false) {
        invalid.push('scope_offset');
    }
    return invalid;
}

/** Các giá trị hợp lệ và vi phạm cho một cờ smallint, trộn với null/sai-kiểu/ngoài-dải. */
const smallintValueArb = fc.constantFrom<unknown>(
    ABSENT, // vắng mặt → hợp lệ
    0, // hợp lệ
    1, // hợp lệ
    null, // vi phạm
    true, // vi phạm (boolean không hợp lệ cho smallint)
    false, // vi phạm
    2, // ngoài dải → vi phạm
    -1, // ngoài dải → vi phạm
    0.5, // thập phân → vi phạm
    NaN, // vi phạm
    '0', // sai kiểu (chuỗi) → vi phạm
    '1', // sai kiểu → vi phạm
    'loose', // sai kiểu → vi phạm
    {}, // sai kiểu → vi phạm
);

/** Các giá trị hợp lệ và vi phạm cho scope_offset (boolean), trộn rộng. */
const offsetValueArb = fc.constantFrom<unknown>(
    ABSENT, // vắng mặt → hợp lệ
    true, // hợp lệ
    false, // hợp lệ
    null, // vi phạm
    0, // smallint không hợp lệ cho offset → vi phạm
    1, // vi phạm
    2, // vi phạm
    'true', // sai kiểu → vi phạm
    'false', // vi phạm
    {}, // vi phạm
);

/** Dựng ScopeFlagInput: mỗi key có thể vắng mặt (ABSENT) hoặc mang một giá trị bất kỳ. */
const inputArb: fc.Arbitrary<ScopeFlagInput> = fc
    .record({
        scope_loose: smallintValueArb,
        scope_bound: smallintValueArb,
        scope_large_format: smallintValueArb,
        scope_offset: offsetValueArb,
    })
    .map((raw) => {
        const input: ScopeFlagInput = {};
        for (const [key, value] of Object.entries(raw)) {
            if (value !== ABSENT) {
                (input as Record<string, unknown>)[key] = value;
            }
        }
        return input;
    });

describe('validateScopeFlags — validate giá trị Cờ_Phạm_Vi đầu vào (property)', () => {
    // Feature: resource-scope-config, Property 9: Validate giá trị Cờ_Phạm_Vi đầu vào

    it('Property 9: ok ⇔ mọi cờ smallint ∈ {0,1}/vắng mặt và scope_offset ∈ {true,false}/vắng mặt; invalidFlags liệt kê đúng các cờ vi phạm (Req 5.8, 6.2)', () => {
        fc.assert(
            fc.property(inputArb, (input) => {
                const result = validateScopeFlags(input);
                const expected = expectedInvalidFlags(input);

                // invalidFlags đúng tập VÀ đúng thứ tự (smallint trước, offset sau).
                expect(result.invalidFlags).toEqual(expected);
                // ok ⇔ không có cờ vi phạm.
                expect(result.ok).toBe(expected.length === 0);
                expect(result.ok).toBe(result.invalidFlags.length === 0);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('Property 9: input toàn giá trị hợp lệ (0/1, true/false, hoặc vắng mặt) luôn ok === true, invalidFlags rỗng (Req 5.8, 6.2)', () => {
        const validSmallint = fc.constantFrom<unknown>(ABSENT, 0, 1);
        const validOffset = fc.constantFrom<unknown>(ABSENT, true, false);

        const validInputArb = fc
            .record({
                scope_loose: validSmallint,
                scope_bound: validSmallint,
                scope_large_format: validSmallint,
                scope_offset: validOffset,
            })
            .map((raw) => {
                const input: ScopeFlagInput = {};
                for (const [key, value] of Object.entries(raw)) {
                    if (value !== ABSENT) {
                        (input as Record<string, unknown>)[key] = value;
                    }
                }
                return input;
            });

        fc.assert(
            fc.property(validInputArb, (input) => {
                const result = validateScopeFlags(input);
                expect(result.ok).toBe(true);
                expect(result.invalidFlags).toEqual([]);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('Property 9: hàm THUẦN — không làm thay đổi input (Req 5.8, 6.2)', () => {
        fc.assert(
            fc.property(inputArb, (input) => {
                const snapshot = JSON.stringify(input);
                validateScopeFlags(input);
                expect(JSON.stringify(input)).toBe(snapshot);
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
