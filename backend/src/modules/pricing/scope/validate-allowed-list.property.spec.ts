/**
 * Property-based test cho validateAllowedList — xác định đúng phần tử ngoài phạm vi
 * trong một Danh_Sách_Được_Phép.
 *
 * Feature: resource-scope-config, Property 8: Validate Danh_Sách_Được_Phép xác định đúng phần tử ngoài phạm vi
 *
 * Property 8 (Design — Correctness Properties):
 *   For any Danh_Sách_Được_Phép `allowed` và for any `productType`,
 *   `validateAllowedList(allowed, resourcesById, productType)` có `outOfScope` bằng
 *   đúng tập `{ id ∈ allowed | not resourceInScope(resource(id), productType) }`
 *   (gồm cả id không có trong map), và `ok === (outOfScope.length === 0)`.
 *   Hàm không làm thay đổi dữ liệu đầu vào và giữ nguyên thứ tự xuất hiện trong `allowed`.
 *
 * Validates: Requirements 4.3, 4.4, 4.5
 *
 * Chạy >= 200 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import {
    ProductType,
    ScopeFlags,
    resourceInScope,
    validateAllowedList,
} from './resource-scope-rule';

const NUM_RUNS = 300;

/** Generator một giá trị Cờ_Phạm_Vi: phủ cả smallint, boolean, null, undefined. */
const flagArb = fc.constantFrom<number | boolean | null | undefined>(
    1,
    0,
    true,
    false,
    null,
    undefined,
);

/** Generator một bộ Cờ_Phạm_Vi ngẫu nhiên. */
const scopeFlagsArb: fc.Arbitrary<ScopeFlags> = fc.record({
    scope_loose: flagArb,
    scope_bound: flagArb,
    scope_large_format: flagArb,
    scope_offset: flagArb,
});

/** Generator Loại_Sản_Phẩm in nhanh. */
const productTypeArb = fc.constantFrom<ProductType>('loose', 'bound', 'large_format');

/**
 * Sinh đồng thời:
 * - `entries`: tập (id, flags) duy nhất theo id để dựng `resourcesById`.
 * - `allowed`: danh sách id (có thể trùng, có thể chứa id không nằm trong map).
 */
const scenarioArb = fc
    .uniqueArray(fc.tuple(fc.integer({ min: 0, max: 50 }), scopeFlagsArb), {
        selector: ([id]) => id,
        maxLength: 12,
    })
    .chain((entries) => {
        const knownIds = entries.map(([id]) => id);
        // id ứng viên cho allowed: vài id đã biết + vài id ngoài map (51..70).
        const idArb =
            knownIds.length > 0
                ? fc.oneof(fc.constantFrom(...knownIds), fc.integer({ min: 51, max: 70 }))
                : fc.integer({ min: 51, max: 70 });
        return fc.record({
            entries: fc.constant(entries),
            allowed: fc.array(idArb, { maxLength: 15 }),
        });
    });

describe('validateAllowedList — xác định đúng phần tử ngoài phạm vi (property)', () => {
    // Feature: resource-scope-config, Property 8: Validate Danh_Sách_Được_Phép xác định đúng phần tử ngoài phạm vi

    it('Property 8: outOfScope == đúng tập id ngoài phạm vi (gồm id thiếu trong map), ok ⇔ rỗng (Req 4.3, 4.4, 4.5)', () => {
        fc.assert(
            fc.property(scenarioArb, productTypeArb, ({ entries, allowed }, productType) => {
                const resourcesById = new Map<number, ScopeFlags>(entries);

                const result = validateAllowedList(allowed, resourcesById, productType);

                // Tập kỳ vọng: id mà tài nguyên KHÔNG thuộc phạm vi, giữ nguyên thứ tự trong allowed.
                const expectedOutOfScope = allowed.filter((id) => {
                    const flags = resourcesById.get(id);
                    return flags === undefined || !resourceInScope(flags, productType);
                });

                expect(result.outOfScope).toEqual(expectedOutOfScope);
                expect(result.ok).toBe(expectedOutOfScope.length === 0);

                // Mỗi id trong outOfScope thực sự ngoài phạm vi; không có id trong phạm vi bị lọt vào.
                for (const id of result.outOfScope) {
                    const flags = resourcesById.get(id);
                    expect(flags === undefined || !resourceInScope(flags, productType)).toBe(true);
                }
                for (const id of allowed) {
                    const flags = resourcesById.get(id);
                    const inScope = flags !== undefined && resourceInScope(flags, productType);
                    if (inScope) {
                        expect(result.outOfScope).not.toContain(id);
                    }
                }
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('Property 8: hàm KHÔNG làm thay đổi đầu vào (allowed và resourcesById bất biến) (Req 4.3, 4.4, 4.5)', () => {
        fc.assert(
            fc.property(scenarioArb, productTypeArb, ({ entries, allowed }, productType) => {
                const resourcesById = new Map<number, ScopeFlags>(entries);

                const allowedSnapshot = [...allowed];
                const mapSnapshot = new Map(resourcesById);

                validateAllowedList(allowed, resourcesById, productType);

                // allowed không bị mutate (thứ tự + phần tử nguyên vẹn).
                expect(allowed).toEqual(allowedSnapshot);
                // resourcesById không bị mutate (cùng kích thước + cùng cặp key/value).
                expect(resourcesById.size).toBe(mapSnapshot.size);
                for (const [id, flags] of mapSnapshot) {
                    expect(resourcesById.get(id)).toEqual(flags);
                }
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
