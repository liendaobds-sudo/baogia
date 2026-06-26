/**
 * Property-based test cho ComparatorService.compare — Bộ_So_Sánh_Giá dùng chung MỘT
 * bộ Thông_Số cho mọi Phương_Pháp_In (task 10.2).
 *
 * Feature: print-method-unification, Property 9: So sánh dùng chung một bộ Thông số
 *
 * Property 9 (Design — Correctness Properties):
 *   For any Sản_Phẩm, một bộ Thông_Số và một số lượng, mọi Phương_Pháp_In trong kết
 *   quả so sánh đều nhận đúng cùng bộ Thông_Số đầu vào (không có phương pháp nào được
 *   tính với thông số khác).
 *
 * Validates: Requirements 5.4
 *
 * Cách kiểm: dựng MethodRegistry THẬT, đăng ký nhiều plugin "spy" — mỗi plugin ghi lại
 * tham chiếu `Specification` mà nó nhận trong `appliesTo` và `calculate`. Sau khi
 * ComparatorService.compare chạy, khẳng định:
 *   1. Mọi plugin nhận ĐÚNG CÙNG một đối tượng `Specification` (so khớp tham chiếu) —
 *      không có per-method spec divergence.
 *   2. Giá trị Thông_Số mỗi plugin nhận deep-equal bộ Thông_Số đầu vào (không bị biến đổi).
 *   3. Số lượng trong kết quả so sánh đúng bằng `spec.quantity` đầu vào (Req 5.4).
 *   4. Mọi plugin nhận cùng `quantity` — không phương pháp nào bị đổi số lượng.
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { ComparatorService } from './comparator.service';
import { MethodRegistry } from './method-registry.service';
import {
    MethodId,
    MethodPlugin,
    PriceResult,
    ProductRef,
    Specification,
} from './types/method-plugin.types';

const NUM_RUNS = 200;

/** Tập Phương_Pháp_In dùng để sinh dữ liệu (mở rộng được — Req 1.5). */
const METHOD_POOL = ['digital', 'offset', 'large_format', 'screen', 'flexo', 'uv'];

/** Bản ghi một lần plugin được gọi: tham chiếu Specification nhận được. */
interface SpecCapture {
    methodId: MethodId;
    phase: 'appliesTo' | 'calculate';
    spec: Specification;
}

/**
 * Plugin spy: luôn `appliesTo=true` và `ok=true` (để mọi phương pháp vào kết quả so
 * sánh), ghi lại tham chiếu `Specification` nhận được ở cả hai pha.
 */
function makeSpyPlugin(
    methodId: MethodId,
    captures: SpecCapture[],
    price: number,
): MethodPlugin {
    return {
        methodId,
        appliesTo: (_product: ProductRef, spec: Specification): boolean => {
            captures.push({ methodId, phase: 'appliesTo', spec });
            return true;
        },
        calculate: async (
            _product: ProductRef,
            spec: Specification,
        ): Promise<PriceResult> => {
            captures.push({ methodId, phase: 'calculate', spec });
            return {
                ok: true,
                methodId,
                costSubtotal: price * 0.6,
                sellingSubtotal: price,
                discountAmount: 0,
                priceBeforeVat: price,
                pricePerItem: spec.quantity > 0 ? price / spec.quantity : price,
                breakdown: {},
            };
        },
    };
}

/** Generator cho một bộ Thông_Số đa dạng (rich Specification). */
const specArb: fc.Arbitrary<Specification> = fc.record(
    {
        quantity: fc.integer({ min: 1, max: 1_000_000 }),
        dimensions: fc.option(
            fc.record({
                width: fc.integer({ min: 1, max: 5000 }),
                height: fc.integer({ min: 1, max: 5000 }),
                depth: fc.integer({ min: 0, max: 2000 }),
            }),
            { nil: undefined },
        ),
        materialCode: fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
            nil: undefined,
        }),
        paperSizeCode: fc.option(fc.string({ minLength: 1, maxLength: 12 }), {
            nil: undefined,
        }),
        processing: fc.option(
            fc.array(
                fc.record({
                    code: fc.string({ minLength: 1, maxLength: 8 }),
                    side: fc.constantFrom('front', 'back', 'both'),
                }),
                { maxLength: 4 },
            ),
            { nil: undefined },
        ),
        attributes: fc.option(
            fc.dictionary(
                fc.string({ minLength: 1, maxLength: 6 }),
                fc.oneof(fc.integer(), fc.string(), fc.boolean()),
            ),
            { nil: undefined },
        ),
    },
    { requiredKeys: ['quantity'] },
);

describe('ComparatorService.compare — so sánh dùng chung một bộ Thông_Số (property)', () => {
    // Feature: print-method-unification, Property 9: So sánh dùng chung một bộ Thông số
    it('Property 9: mọi phương pháp trong so sánh nhận đúng cùng một bộ Thông_Số đầu vào (Req 5.4)', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Sản_Phẩm method-agnostic bất kỳ.
                fc.record({
                    code: fc.string({ minLength: 1, maxLength: 10 }),
                    quoteType: fc.constantFrom(
                        'loose',
                        'bound',
                        'large_format',
                        'to_roi',
                        'hop_giay',
                        'tui_giay',
                    ),
                }),
                // Một bộ Thông_Số dùng chung.
                specArb,
                // Tập Phương_Pháp_In ứng viên (>=1, không trùng) kèm giá để tạo thứ hạng.
                fc.uniqueArray(
                    fc.record({
                        methodId: fc.constantFrom(...METHOD_POOL),
                        price: fc.integer({ min: 1, max: 10_000_000 }),
                    }),
                    { minLength: 1, maxLength: METHOD_POOL.length, selector: (e) => e.methodId },
                ),
                async (product: ProductRef, spec: Specification, candidates) => {
                    const captures: SpecCapture[] = [];

                    // MethodRegistry THẬT — kiểm thử logic định tuyến thật của hệ.
                    const registry = new MethodRegistry();
                    for (const { methodId, price } of candidates) {
                        registry.register(makeSpyPlugin(methodId, captures, price));
                    }

                    const comparator = new ComparatorService(registry);
                    const candidateMethods = candidates.map((c) => c.methodId);

                    const result = await comparator.compare(
                        product,
                        spec,
                        candidateMethods,
                    );

                    // (Tiền đề) Mọi phương pháp ứng viên đều được gọi (appliesTo=true ⇒ tính giá).
                    const calcCaptures = captures.filter((c) => c.phase === 'calculate');
                    expect(calcCaptures.length).toBe(candidateMethods.length);
                    expect(result.results.length).toBe(candidateMethods.length);

                    // (1) Bất biến cốt lõi (Req 5.4): MỌI plugin — ở cả appliesTo lẫn
                    // calculate — nhận ĐÚNG CÙNG một đối tượng Specification (cùng tham
                    // chiếu), không có per-method spec divergence.
                    for (const cap of captures) {
                        expect(cap.spec).toBe(spec);
                    }

                    // (2) Giá trị Thông_Số mỗi plugin nhận deep-equal đầu vào (không biến đổi).
                    for (const cap of captures) {
                        expect(cap.spec).toEqual(spec);
                    }

                    // (3) Số lượng trong kết quả so sánh đúng bằng spec.quantity (Req 5.4).
                    expect(result.quantity).toBe(spec.quantity);

                    // (4) Mọi plugin nhận cùng số lượng — không phương pháp nào bị đổi số lượng.
                    for (const cap of captures) {
                        expect(cap.spec.quantity).toBe(spec.quantity);
                    }
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
