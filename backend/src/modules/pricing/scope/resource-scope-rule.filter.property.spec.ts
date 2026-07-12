/**
 * Feature: resource-scope-config, Property 5: Lọc theo Loại_Sản_Phẩm chỉ giữ tài nguyên
 * trong phạm vi và đang hoạt động.
 *
 * Property-based test cho `filterForProductType` (Quy_Tắc_Phạm_Vi canonical, backend).
 *
 * For any danh sách ScopedResource ngẫu nhiên và for any productType ∈ {loose, bound, large_format}:
 * một tài nguyên `r` nằm trong `filterForProductType(list, productType)` KHI VÀ CHỈ KHI
 * `isActive(r.is_active) && resourceInScope(r, productType)`. Hệ quả: mọi Tài_Nguyên_Chỉ_Offset
 * và mọi tài nguyên `is_active ≠ 1` đều bị loại.
 *
 * **Validates: Requirements 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2**
 */

import fc from 'fast-check';
import {
    filterForProductType,
    isActive,
    isOffsetOnly,
    ProductType,
    resourceInScope,
    ScopedResource,
} from './resource-scope-rule';

const NUM_RUNS = 200;

/** Mọi giá trị cờ có thể gặp: smallint 0/1, boolean, null, undefined (thiếu). */
const flagValue = () =>
    fc.constantFrom<number | boolean | null | undefined>(0, 1, true, false, null, undefined);

/** is_active có thể gặp: hoạt động (1), tắt (0), giá trị lạ (2) và null. */
const isActiveValue = () => fc.constantFrom<number | null>(0, 1, 2, null);

const productTypeArb = (): fc.Arbitrary<ProductType> =>
    fc.constantFrom<ProductType>('loose', 'bound', 'large_format');

/**
 * Sinh danh sách ScopedResource ngẫu nhiên với id duy nhất, cờ scope và is_active phủ rộng
 * (gồm cả null/undefined/kiểu lẫn lộn) để bao quát mọi tổ hợp phạm vi và trạng thái hoạt động.
 */
const resourceListArb = (): fc.Arbitrary<ScopedResource[]> =>
    fc
        .uniqueArray(fc.integer({ min: 1, max: 10_000 }), { maxLength: 30 })
        .chain((ids) =>
            fc.tuple(
                ...ids.map((id) =>
                    fc.record(
                        {
                            id: fc.constant(id),
                            is_active: isActiveValue(),
                            scope_offset: flagValue(),
                            scope_loose: flagValue(),
                            scope_bound: flagValue(),
                            scope_large_format: flagValue(),
                        },
                        { requiredKeys: ['id'] },
                    ),
                ),
            ),
        );

describe('Feature: resource-scope-config, Property 5: filterForProductType', () => {
    it('giữ r KHI VÀ CHỈ KHI isActive(r) && resourceInScope(r, productType)', () => {
        fc.assert(
            fc.property(resourceListArb(), productTypeArb(), (resources, productType) => {
                const kept = filterForProductType(resources, productType);
                const keptIds = new Set(kept.map((r) => r.id));

                // Tập kỳ vọng tính độc lập với implementation của filter.
                const expectedIds = new Set(
                    resources
                        .filter(
                            (r) => isActive(r.is_active) && resourceInScope(r, productType),
                        )
                        .map((r) => r.id),
                );

                expect(keptIds).toEqual(expectedIds);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('loại bỏ mọi tài nguyên is_active ≠ 1 (kể cả null/giá trị lạ)', () => {
        fc.assert(
            fc.property(resourceListArb(), productTypeArb(), (resources, productType) => {
                const kept = filterForProductType(resources, productType);
                for (const r of kept) {
                    expect(isActive(r.is_active)).toBe(true);
                }
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('loại bỏ mọi Tài_Nguyên_Chỉ_Offset (offset Bật, ba cờ in nhanh Tắt)', () => {
        fc.assert(
            fc.property(resourceListArb(), productTypeArb(), (resources, productType) => {
                const kept = filterForProductType(resources, productType);
                for (const r of kept) {
                    expect(isOffsetOnly(r)).toBe(false);
                }
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('mọi tài nguyên được giữ đều thuộc Phạm_Vi của productType', () => {
        fc.assert(
            fc.property(resourceListArb(), productTypeArb(), (resources, productType) => {
                const kept = filterForProductType(resources, productType);
                for (const r of kept) {
                    expect(resourceInScope(r, productType)).toBe(true);
                }
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
