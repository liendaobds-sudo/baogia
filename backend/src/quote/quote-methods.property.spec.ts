/**
 * Property-based test cho QuoteController.getMethodsForProduct — Cổng_Tạo_Báo_Giá
 * chỉ trình các Phương_Pháp_In thuộc tập Phương_Pháp_Khả_Dụng (Req 4.7).
 *
 * Feature: print-method-unification, Property 7: Entry point chỉ cho chọn phương pháp khả dụng
 *
 * Property 7 (Design — Correctness Properties):
 *   For any Đơn_Vị, tập phương pháp mà Cổng_Tạo_Báo_Giá trình cho người dùng là
 *   tập con của Phương_Pháp_Khả_Dụng của Đơn_Vị đó.
 *
 * Validates: Requirements 4.7
 *
 * Logic dưới kiểm thử: `GET /quote/methods` (QuoteController.getMethodsForProduct) trả
 *   applicableMethods = (enabledMethods theo CapabilityService)
 *                       ∩ (đã đăng ký trong MethodRegistry)
 *                       ∩ (appliesTo == true).
 * Bất biến cần bảo đảm: applicableMethods ⊆ enabledMethods — KHÔNG BAO GIỜ trình một
 * phương pháp ngoài tập khả dụng, bất kể registry đăng ký gì hay appliesTo trả gì.
 *
 * Dựng QuoteController với CapabilityService / ProductsService giả lập và MethodRegistry
 * THẬT (logic giao thật, không mock) — chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { QuoteController } from './quote.controller';
import { MethodRegistry } from './method-registry.service';
import { MethodId, MethodPlugin } from './types/method-plugin.types';

const NUM_RUNS = 200;

/** Tập Phương_Pháp_In dùng để sinh dữ liệu (mở rộng được — Req 1.5). */
const METHOD_POOL = ['digital', 'offset', 'large_format', 'screen', 'flexo', 'uv'];

/**
 * Plugin giả lập với hành vi `appliesTo` cố định theo tham số — để tách bạch ảnh hưởng
 * của "áp dụng được" khỏi bất biến "chỉ trình phương pháp khả dụng".
 */
function makePlugin(methodId: MethodId, applies: boolean): MethodPlugin {
    return {
        methodId,
        appliesTo: () => applies,
        calculate: async () => ({
            ok: true,
            methodId,
            costSubtotal: 0,
            sellingSubtotal: 0,
            discountAmount: 0,
            priceBeforeVat: 0,
            pricePerItem: 0,
            breakdown: {},
        }),
    };
}

/** CapabilityService giả lập: chỉ cần `getEnabledMethods` cho endpoint /quote/methods. */
function fakeCapabilityService(enabledMethods: MethodId[]) {
    return {
        getEnabledMethods: async () => [...enabledMethods],
    } as any;
}

/** ProductsService giả lập: luôn phân giải được một sản phẩm method-agnostic. */
function fakeProductsService(quoteType: string) {
    return {
        getTemplateByCode: async (code: string) => ({ code, quoteType }),
    } as any;
}

/** ComparatorService giả lập: không dùng trong test /quote/methods, chỉ để dựng controller. */
function fakeComparatorService() {
    return {
        compare: async () => ({}),
        findBreakEven: async () => ({}),
    } as any;
}

describe('QuoteController.getMethodsForProduct — entry point chỉ trình phương pháp khả dụng (property)', () => {
    // Feature: print-method-unification, Property 7: Entry point chỉ cho chọn phương pháp khả dụng
    it('Property 7: applicableMethods luôn là tập con của enabledMethods (Req 4.7)', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Đơn_Vị bất kỳ.
                fc.constantFrom('default', 'tenant-a', 'tenant-b'),
                // Tập Phương_Pháp_Khả_Dụng bất kỳ (có thể rỗng).
                fc.uniqueArray(fc.constantFrom(...METHOD_POOL)),
                // Registry: tập phương pháp đã đăng ký + cờ appliesTo của từng phương pháp.
                fc.uniqueArray(
                    fc.record({
                        methodId: fc.constantFrom(...METHOD_POOL),
                        applies: fc.boolean(),
                    }),
                    { selector: (e) => e.methodId },
                ),
                // quoteType sản phẩm (không ảnh hưởng bất biến, plugin giả lập bỏ qua).
                fc.constantFrom('loose', 'bound', 'large_format', 'to_roi', 'hop_giay'),
                // productCode KHÔNG được rỗng/toàn khoảng trắng: controller phân giải
                // bằng `productCode.trim()` và (đúng hành vi) ném NotFoundException khi mã
                // rỗng. Generator phải sinh mã hợp lệ để kiểm đúng bất biến entry point.
                fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim().length > 0),
                async (unitId, enabledMethods, registered, quoteType, productCode) => {
                    // MethodRegistry THẬT — kiểm thử logic giao thật của hệ.
                    const registry = new MethodRegistry();
                    for (const { methodId, applies } of registered) {
                        registry.register(makePlugin(methodId, applies));
                    }

                    const controller = new QuoteController(
                        fakeCapabilityService(enabledMethods),
                        registry,
                        fakeComparatorService(),
                        fakeProductsService(quoteType),
                    );

                    const res = await controller.getMethodsForProduct(
                        productCode,
                        unitId,
                    );

                    const enabledSet = new Set(enabledMethods);

                    // Bất biến cốt lõi (Req 4.7): mọi phương pháp được trình ra phải
                    // thuộc tập Phương_Pháp_Khả_Dụng — không bao giờ trình phương pháp
                    // ngoài tập khả dụng, dù registry/appliesTo nói gì.
                    for (const m of res.applicableMethods) {
                        expect(enabledSet.has(m)).toBe(true);
                    }

                    // applicableMethods không có phần tử trùng lặp.
                    expect(new Set(res.applicableMethods).size).toBe(
                        res.applicableMethods.length,
                    );

                    // Endpoint phản ánh đúng enabledMethods đã hỏi từ CapabilityService.
                    expect(new Set(res.enabledMethods)).toEqual(enabledSet);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
