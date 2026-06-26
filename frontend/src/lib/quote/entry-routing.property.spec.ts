/**
 * Property test cho định tuyến Cổng_Tạo_Báo_Giá (`decideEntryRouting`).
 *
 * Feature: print-method-unification, Property 6: Định tuyến entry point theo số
 * phương pháp khả dụng.
 *
 * **Validates: Requirements 4.4, 4.5**
 *
 * Property 6 nói: *For any* Sản_Phẩm và tập Phương_Pháp_Khả_Dụng áp dụng được cho
 * sản phẩm đó:
 *   - nếu tập có ĐÚNG MỘT phần tử ⇒ luồng đi THẲNG vào Configurator của phương pháp
 *     đó (bỏ bước chọn — Req 4.4): `mode = 'auto'` và `selectedMethod` là chính
 *     phương pháp đó;
 *   - nếu có ≥2 phần tử ⇒ luồng YÊU CẦU một lựa chọn rõ ràng trước khi vào
 *     Configurator (Req 4.5): `mode = 'choose'` và KHÔNG auto-chọn
 *     (`selectedMethod = null`);
 *   - biên 0 phần tử ⇒ `mode = 'none'`, không có phương pháp được chọn.
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (dùng 200).
 */

import fc from 'fast-check';

import { decideEntryRouting } from './entry-routing';
import type { MethodId } from '@/lib/scope/types';

const FEATURE_TAG = 'Feature: print-method-unification, Property 6';
const RUNS = 200;

/** Tập Phương_Pháp_In dùng để sinh dữ liệu (đủ ≥2 phần tử để kiểm nhánh 'choose'). */
const METHODS: readonly MethodId[] = ['digital', 'offset', 'large-format', 'screen'];

/**
 * Tập Phương_Pháp_Khả_Dụng áp dụng được cho sản phẩm — không trùng lặp, bất kỳ
 * kích thước nào kể cả rỗng (0) và đầy (≥2). `uniqueArray` phản ánh đúng ngữ nghĩa
 * "tập" của applicableMethods.
 */
const applicableMethodsArb: fc.Arbitrary<MethodId[]> = fc.uniqueArray(
    fc.constantFrom(...METHODS),
    { minLength: 0, maxLength: METHODS.length },
);

describe(FEATURE_TAG, () => {
    it('định tuyến theo số phương pháp: 0⇒none, 1⇒auto-chọn đúng phương pháp, ≥2⇒choose (không auto-chọn) (Req 4.4, 4.5)', () => {
        fc.assert(
            fc.property(applicableMethodsArb, (methods) => {
                const decision = decideEntryRouting(methods);

                if (methods.length === 0) {
                    // Biên: không có phương pháp khả dụng → không chọn.
                    expect(decision.mode).toBe('none');
                    expect(decision.selectedMethod).toBeNull();
                } else if (methods.length === 1) {
                    // Req 4.4: đúng một phương pháp ⇒ vào thẳng, auto-chọn chính nó.
                    expect(decision.mode).toBe('auto');
                    expect(decision.selectedMethod).toBe(methods[0]);
                } else {
                    // Req 4.5: ≥2 ⇒ bắt chọn rõ ràng, KHÔNG auto-chọn phương pháp nào.
                    expect(decision.mode).toBe('choose');
                    expect(decision.selectedMethod).toBeNull();
                }
            }),
            { numRuns: RUNS },
        );
    });
});
