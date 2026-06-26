/**
 * Property-based test cho ComparatorService.compare — Bộ_So_Sánh_Giá chọn đúng
 * phương pháp rẻ hơn và loại phương pháp không tính được giá (task 10.3).
 *
 * Feature: print-method-unification, Property 10: Comparator chọn đúng phương pháp rẻ hơn và loại phương pháp lỗi
 *
 * Property 10 (Design — Correctness Properties):
 *   For any tập kết quả tính giá của ≥2 Phương_Pháp_In tại một số lượng, phương pháp
 *   được đánh dấu "rẻ hơn" là phương pháp có `priceBeforeVat` nhỏ nhất trong các phương
 *   pháp tính được; mọi phương pháp không tính được giá bị loại khỏi so sánh kèm lý do,
 *   và các phương pháp còn lại vẫn hiển thị.
 *
 * Validates: Requirements 5.2, 5.5
 *
 * Cách dựng: MethodRegistry THẬT + plugin giả (fake) sinh giá tuỳ ý và trạng thái
 *   ok / ok:false / appliesTo=false tuỳ ý — kiểm thử đúng logic comparator, không mock.
 *   Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { ComparatorService } from './comparator.service';
import { MethodRegistry } from './method-registry.service';
import {
    MethodId,
    MethodPlugin,
    PriceResult,
} from './types/method-plugin.types';

const NUM_RUNS = 200;

const PRODUCT = { code: 'name-card', quoteType: 'loose' };
const SPEC = { quantity: 500 };

/** Tập Phương_Pháp_In dùng để sinh dữ liệu (mở rộng được — Req 1.5). */
const METHOD_POOL = ['digital', 'offset', 'large_format', 'screen', 'flexo', 'uv'];

/**
 * Trạng thái sinh cho một phương pháp ứng viên:
 * - status='ok'        : appliesTo=true, calculate trả ok=true với `price` tuỳ ý.
 * - status='not-ok'    : appliesTo=true, calculate trả ok=false kèm lý do.
 * - status='not-apply' : appliesTo=false (không áp dụng cho Thông_Số).
 */
interface MethodSpec {
    methodId: MethodId;
    status: 'ok' | 'not-ok' | 'not-apply';
    price: number;
}

function makeResult(methodId: MethodId, price: number, ok: boolean): PriceResult {
    return {
        ok,
        methodId,
        costSubtotal: price * 0.7,
        sellingSubtotal: price,
        discountAmount: 0,
        priceBeforeVat: price,
        pricePerItem: price,
        breakdown: {},
        unavailableReason: ok ? undefined : `engine ${methodId} không có đơn giá`,
    };
}

function makePlugin(spec: MethodSpec): MethodPlugin {
    return {
        methodId: spec.methodId,
        appliesTo: () => spec.status !== 'not-apply',
        calculate: async () =>
            makeResult(spec.methodId, spec.price, spec.status === 'ok'),
    };
}

describe('ComparatorService.compare — chọn phương pháp rẻ hơn & loại phương pháp lỗi (property)', () => {
    // Feature: print-method-unification, Property 10: Comparator chọn đúng phương pháp rẻ hơn và loại phương pháp lỗi
    it('Property 10: cheapest = min priceBeforeVat trong các phương pháp ok; phương pháp lỗi bị loại kèm lý do, phần còn lại giữ nguyên (Req 5.2, 5.5)', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Tập phương pháp ứng viên (≥1, duy nhất theo methodId) với trạng thái + giá tuỳ ý.
                fc.uniqueArray(
                    fc.record({
                        methodId: fc.constantFrom(...METHOD_POOL),
                        status: fc.constantFrom<'ok' | 'not-ok' | 'not-apply'>(
                            'ok',
                            'not-ok',
                            'not-apply',
                        ),
                        // Giá nguyên dương; cho phép trùng giá để kiểm tra tie-break ổn định.
                        price: fc.integer({ min: 1, max: 100000 }),
                    }),
                    { selector: (e) => e.methodId, minLength: 1, maxLength: 6 },
                ),
                async (methodSpecs: MethodSpec[]) => {
                    // MethodRegistry THẬT — kiểm thử logic giao thật của hệ.
                    const registry = new MethodRegistry();
                    for (const ms of methodSpecs) {
                        registry.register(makePlugin(ms));
                    }
                    const service = new ComparatorService(registry);

                    const candidates = methodSpecs.map((m) => m.methodId);
                    const res = await service.compare(PRODUCT, SPEC, candidates);

                    const okSpecs = methodSpecs.filter((m) => m.status === 'ok');
                    const failSpecs = methodSpecs.filter((m) => m.status !== 'ok');

                    // (A) results chứa đúng tập phương pháp tính được giá (ok=true).
                    expect(new Set(res.results.map((r) => r.methodId))).toEqual(
                        new Set(okSpecs.map((m) => m.methodId)),
                    );

                    // (B) results sắp xếp tăng dần theo priceBeforeVat.
                    for (let i = 1; i < res.results.length; i++) {
                        expect(res.results[i - 1].priceBeforeVat).toBeLessThanOrEqual(
                            res.results[i].priceBeforeVat,
                        );
                    }

                    // (C) Phương pháp được đánh dấu "rẻ hơn" có priceBeforeVat nhỏ nhất
                    //     trong các phương pháp tính được (Req 5.2).
                    if (okSpecs.length > 0) {
                        const minPrice = Math.min(...okSpecs.map((m) => m.price));
                        expect(res.cheapest).toBeDefined();
                        expect(res.cheapest!.priceBeforeVat).toBe(minPrice);
                        // cheapestMethodId là MỘT trong các phương pháp đạt giá nhỏ nhất.
                        const minMethodIds = new Set(
                            okSpecs
                                .filter((m) => m.price === minPrice)
                                .map((m) => m.methodId),
                        );
                        expect(minMethodIds.has(res.cheapestMethodId!)).toBe(true);
                        // cheapest đứng đầu danh sách đã sắp xếp.
                        expect(res.results[0].methodId).toBe(res.cheapestMethodId);
                    } else {
                        // Không phương pháp nào tính được giá ⇒ không có "rẻ hơn".
                        expect(res.cheapest).toBeUndefined();
                        expect(res.cheapestMethodId).toBeUndefined();
                    }

                    // (D) Mọi phương pháp không tính được giá (ok:false / không áp dụng)
                    //     bị loại khỏi so sánh kèm lý do (Req 5.5).
                    expect(new Set(res.excluded.map((e) => e.methodId))).toEqual(
                        new Set(failSpecs.map((m) => m.methodId)),
                    );
                    for (const ex of res.excluded) {
                        expect(typeof ex.reason).toBe('string');
                        expect(ex.reason.length).toBeGreaterThan(0);
                    }

                    // (E) results và excluded phân hoạch trọn vẹn tập ứng viên (không mất,
                    //     không trùng) — các phương pháp còn lại vẫn hiển thị.
                    expect(res.results.length + res.excluded.length).toBe(
                        methodSpecs.length,
                    );
                    const resultIds = new Set(res.results.map((r) => r.methodId));
                    const excludedIds = new Set(res.excluded.map((e) => e.methodId));
                    for (const id of resultIds) {
                        expect(excludedIds.has(id)).toBe(false);
                    }

                    // (F) mode phản ánh số phương pháp tính được giá.
                    if (okSpecs.length === 0) expect(res.mode).toBe('none');
                    else if (okSpecs.length === 1) expect(res.mode).toBe('single');
                    else expect(res.mode).toBe('comparison');
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
