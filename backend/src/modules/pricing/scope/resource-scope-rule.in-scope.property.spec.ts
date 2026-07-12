/**
 * Feature: resource-scope-config, Property 2: Thuộc Phạm_Vi khi và chỉ khi cờ tương ứng Bật.
 *
 * Property-based test cho `resourceInScope` (Quy_Tắc_Phạm_Vi canonical, backend).
 *
 * For any ScopeFlags ngẫu nhiên (gồm cả null/undefined/thiếu) và for any scope ∈
 * {offset, loose, bound, large_format}: `resourceInScope(flags, scope)` trả về true KHI VÀ CHỈ KHI
 * `isOn` của cờ tương ứng với scope là true. Cờ thiếu/null → không thuộc phạm vi đó.
 *
 * **Validates: Requirements 1.1, 1.7, 2.2, 2.3, 2.4, 2.5, 6.3, 6.6, 6.7**
 */

import fc from 'fast-check';
import { isOn, resourceInScope, Scope, ScopeFlags } from './resource-scope-rule';

const NUM_RUNS = 200;

/** Mọi giá trị cờ có thể gặp: smallint 0/1, boolean, null, undefined (thiếu). */
const flagValue = () => fc.constantFrom<number | boolean | null | undefined>(
    0,
    1,
    true,
    false,
    null,
    undefined,
);

/** Sinh ScopeFlags ngẫu nhiên, bao gồm cả khả năng vắng mặt (thiếu) từng cờ. */
const scopeFlagsArb = (): fc.Arbitrary<ScopeFlags> =>
    fc.record(
        {
            scope_offset: flagValue(),
            scope_loose: flagValue(),
            scope_bound: flagValue(),
            scope_large_format: flagValue(),
        },
        { requiredKeys: [] },
    );

const scopeArb = (): fc.Arbitrary<Scope> =>
    fc.constantFrom<Scope>('offset', 'loose', 'bound', 'large_format');

/** Ánh xạ Phạm_Vi → tên cờ tương ứng, dùng để kiểm chứng độc lập với implementation. */
const FLAG_OF_SCOPE: Record<Scope, keyof ScopeFlags> = {
    offset: 'scope_offset',
    loose: 'scope_loose',
    bound: 'scope_bound',
    large_format: 'scope_large_format',
};

describe('Feature: resource-scope-config, Property 2: resourceInScope membership', () => {
    it('resourceInScope(flags, scope) === isOn(cờ tương ứng) cho mọi flags và scope', () => {
        fc.assert(
            fc.property(scopeFlagsArb(), scopeArb(), (flags, scope) => {
                const expected = isOn(flags[FLAG_OF_SCOPE[scope]]);
                expect(resourceInScope(flags, scope)).toBe(expected);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('cờ thiếu/null → tài nguyên KHÔNG thuộc phạm vi đó', () => {
        fc.assert(
            fc.property(
                scopeArb(),
                fc.constantFrom<null | undefined>(null, undefined),
                (scope, absent) => {
                    const flags: ScopeFlags = { [FLAG_OF_SCOPE[scope]]: absent };
                    expect(resourceInScope(flags, scope)).toBe(false);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });

    it('cờ Bật (1 hoặc true) → trong phạm vi; cờ Tắt (0 hoặc false) → ngoài phạm vi', () => {
        fc.assert(
            fc.property(
                scopeArb(),
                fc.constantFrom<number | boolean>(0, 1, true, false),
                (scope, value) => {
                    const flags: ScopeFlags = { [FLAG_OF_SCOPE[scope]]: value };
                    expect(resourceInScope(flags, scope)).toBe(value === 1 || value === true);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
