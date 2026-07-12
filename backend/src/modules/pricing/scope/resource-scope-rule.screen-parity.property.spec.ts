/**
 * Feature: resource-scope-config, Property 6: Màn_Cài_Đặt và Màn_Báo_Giá cho tập trùng khớp.
 *
 * Property-based test cho parity giữa Màn_Cài_Đặt_Sản_Phẩm và Màn_Báo_Giá.
 *
 * Cả Màn_Cài_Đặt_Sản_Phẩm và Màn_Báo_Giá đều suy ra tập Tài_Nguyên_Trong_Phạm_Vi từ cùng MỘT
 * nguồn sự thật `filterForProductType` (Quy_Tắc_Phạm_Vi canonical). Vì vậy với cùng một danh sách
 * tài nguyên và cùng một `productType`, tập tài nguyên hai màn dẫn ra phải trùng khớp hoàn toàn.
 *
 * Mô hình hoá: hai lời gọi độc lập `filterForProductType(resources, productType)` (đại diện cho hai
 * màn cùng đi qua nguồn sự thật duy nhất) cho ra tập y hệt nhau, và tập đó bằng đúng
 * `{ r | isActive(r) && resourceInScope(r, productType) }`.
 *
 * **Validates: Requirements 1.2**
 *
 * Chạy >= 200 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import {
    filterForProductType,
    isActive,
    resourceInScope,
    ProductType,
    ScopedResource,
} from './resource-scope-rule';

const NUM_RUNS = 200;

/** Sinh giá trị một Cờ_Phạm_Vi: phủ smallint, boolean, và null/undefined/thiếu. */
const flagArb: fc.Arbitrary<number | boolean | null | undefined> = fc.constantFrom<
    number | boolean | null | undefined
>(0, 1, true, false, null, undefined);

/** Sinh `is_active`: phủ hoạt động (1), tắt (0), null, và giá trị ngoài {0,1} (2). */
const isActiveArb: fc.Arbitrary<number | null> = fc.constantFrom<number | null>(0, 1, null, 2);

/** Loại_Sản_Phẩm in nhanh. */
const productTypeArb: fc.Arbitrary<ProductType> = fc.constantFrom<ProductType>(
    'loose',
    'bound',
    'large_format',
);

/**
 * Sinh danh sách `ScopedResource` ngẫu nhiên với `id` duy nhất (như dữ liệu thật).
 * `id` được gán tuần tự sau khi sinh để bảo đảm tính duy nhất, không phụ thuộc generator.
 */
const scopedResourcesArb: fc.Arbitrary<ScopedResource[]> = fc
    .array(
        fc.record(
            {
                is_active: isActiveArb,
                scope_offset: flagArb,
                scope_loose: flagArb,
                scope_bound: flagArb,
                scope_large_format: flagArb,
            },
            { requiredKeys: [] },
        ),
        { maxLength: 20 },
    )
    .map((partials) =>
        partials.map((partial, index): ScopedResource => ({ id: index + 1, ...partial })),
    );

describe('Feature: resource-scope-config, Property 6: parity Màn_Cài_Đặt và Màn_Báo_Giá', () => {
    // Feature: resource-scope-config, Property 6: Màn_Cài_Đặt và Màn_Báo_Giá cho tập trùng khớp
    it('Property 6: hai lời gọi filterForProductType cho cùng tham số ⇒ tập tài nguyên trùng khớp (Req 1.2)', () => {
        fc.assert(
            fc.property(scopedResourcesArb, productTypeArb, (resources, productType) => {
                // Màn_Cài_Đặt_Sản_Phẩm đi qua nguồn sự thật duy nhất.
                const settingsScreen = filterForProductType(resources, productType);
                // Màn_Báo_Giá đi qua CÙNG nguồn sự thật, độc lập.
                const quoteScreen = filterForProductType(resources, productType);

                // (1) Hai màn dẫn ra tập trùng khớp hoàn toàn (cùng phần tử, cùng thứ tự).
                const settingsIds = settingsScreen.map((r) => r.id);
                const quoteIds = quoteScreen.map((r) => r.id);
                expect(settingsIds).toEqual(quoteIds);
                expect(settingsScreen).toEqual(quoteScreen);

                // (2) Tập đó bằng đúng { r | isActive(r) && resourceInScope(r, productType) }.
                const expectedIds = resources
                    .filter(
                        (r) => isActive(r.is_active) && resourceInScope(r, productType),
                    )
                    .map((r) => r.id);
                expect(settingsIds).toEqual(expectedIds);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: resource-scope-config, Property 6: Màn_Cài_Đặt và Màn_Báo_Giá cho tập trùng khớp
    it('Property 6 (tập hợp): hai màn cho cùng TẬP id, không phụ thuộc thứ tự (Req 1.2)', () => {
        fc.assert(
            fc.property(scopedResourcesArb, productTypeArb, (resources, productType) => {
                const settingsSet = new Set(
                    filterForProductType(resources, productType).map((r) => r.id),
                );
                const quoteSet = new Set(
                    filterForProductType(resources, productType).map((r) => r.id),
                );

                // Cùng kích thước và cùng phần tử.
                expect(settingsSet.size).toBe(quoteSet.size);
                for (const id of settingsSet) {
                    expect(quoteSet.has(id)).toBe(true);
                }
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
