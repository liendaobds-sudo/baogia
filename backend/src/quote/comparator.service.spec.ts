/**
 * Unit test cho ComparatorService (task 10.1).
 *
 * Kiểm tra logic cốt lõi: tính đa phương pháp trên cùng Thông_Số, chọn phương pháp
 * rẻ hơn (priceBeforeVat nhỏ nhất), loại phương pháp ok:false kèm lý do nhưng giữ phần
 * còn lại, và trả Giá đơn (không bảng so sánh) khi chỉ một phương pháp áp dụng được.
 *
 * Dùng MethodRegistry thật với plugin giả (fake) để không phụ thuộc engine — kiểm tra
 * đúng logic comparator chứ không phải số học engine.
 */
import { ComparatorService } from './comparator.service';
import { MethodRegistry } from './method-registry.service';
import {
    MethodPlugin,
    PriceResult,
    ProductRef,
    Specification,
} from './types/method-plugin.types';

function makeResult(
    methodId: string,
    priceBeforeVat: number,
    ok = true,
    unavailableReason?: string,
): PriceResult {
    return {
        ok,
        methodId,
        costSubtotal: priceBeforeVat * 0.7,
        sellingSubtotal: priceBeforeVat,
        discountAmount: 0,
        priceBeforeVat,
        pricePerItem: priceBeforeVat,
        breakdown: {},
        unavailableReason,
    };
}

/** Plugin giả: appliesTo cấu hình được; calculate trả kết quả định sẵn. */
function fakePlugin(
    methodId: string,
    opts: {
        applies?: boolean;
        result?: PriceResult;
        throwOnCalculate?: boolean;
    } = {},
): MethodPlugin {
    const { applies = true, result, throwOnCalculate = false } = opts;
    return {
        methodId,
        appliesTo: () => applies,
        calculate: async () => {
            if (throwOnCalculate) {
                throw new Error(`engine ${methodId} bùng nổ`);
            }
            return result ?? makeResult(methodId, 1000);
        },
    };
}

const PRODUCT: ProductRef = { code: 'name-card', quoteType: 'loose' };
const SPEC: Specification = { quantity: 500 };

describe('ComparatorService', () => {
    let registry: MethodRegistry;
    let service: ComparatorService;

    beforeEach(() => {
        registry = new MethodRegistry();
        service = new ComparatorService(registry);
    });

    it('chọn phương pháp có priceBeforeVat nhỏ nhất khi ≥2 phương pháp tính được giá (Req 5.2)', async () => {
        registry.register(fakePlugin('digital', { result: makeResult('digital', 1200) }));
        registry.register(fakePlugin('offset', { result: makeResult('offset', 900) }));

        const res = await service.compare(PRODUCT, SPEC, ['digital', 'offset']);

        expect(res.mode).toBe('comparison');
        expect(res.results).toHaveLength(2);
        expect(res.cheapestMethodId).toBe('offset');
        expect(res.cheapest?.priceBeforeVat).toBe(900);
        // Sắp xếp tăng dần theo giá.
        expect(res.results.map((r) => r.methodId)).toEqual(['offset', 'digital']);
        expect(res.excluded).toHaveLength(0);
    });

    it('loại phương pháp ok:false kèm lý do nhưng vẫn giữ phần còn lại (Req 5.5)', async () => {
        registry.register(fakePlugin('digital', { result: makeResult('digital', 1200) }));
        registry.register(
            fakePlugin('offset', {
                result: makeResult('offset', 0, false, 'Thiếu đơn giá khổ giấy'),
            }),
        );

        const res = await service.compare(PRODUCT, SPEC, ['digital', 'offset']);

        // Chỉ còn 1 phương pháp tính được ⇒ Giá đơn, không bảng so sánh (Req 5.6).
        expect(res.mode).toBe('single');
        expect(res.results.map((r) => r.methodId)).toEqual(['digital']);
        expect(res.excluded).toEqual([
            { methodId: 'offset', reason: 'Thiếu đơn giá khổ giấy' },
        ]);
        expect(res.cheapestMethodId).toBe('digital');
    });

    it('loại phương pháp appliesTo=false kèm lý do (Req 5.5)', async () => {
        registry.register(fakePlugin('digital', { result: makeResult('digital', 1200) }));
        registry.register(fakePlugin('offset', { applies: false }));

        const res = await service.compare(PRODUCT, SPEC, ['digital', 'offset']);

        expect(res.mode).toBe('single');
        expect(res.results.map((r) => r.methodId)).toEqual(['digital']);
        expect(res.excluded).toHaveLength(1);
        expect(res.excluded[0].methodId).toBe('offset');
        expect(res.excluded[0].reason).toContain('không áp dụng');
    });

    it('trả Giá đơn (mode=single) khi chỉ một phương pháp áp dụng được (Req 5.6)', async () => {
        registry.register(fakePlugin('digital', { result: makeResult('digital', 1500) }));

        const res = await service.compare(PRODUCT, SPEC, ['digital']);

        expect(res.mode).toBe('single');
        expect(res.results).toHaveLength(1);
        expect(res.cheapest?.methodId).toBe('digital');
    });

    it('mode=none khi không phương pháp nào tính được giá', async () => {
        registry.register(fakePlugin('offset', { applies: false }));

        const res = await service.compare(PRODUCT, SPEC, ['offset']);

        expect(res.mode).toBe('none');
        expect(res.results).toHaveLength(0);
        expect(res.cheapest).toBeUndefined();
        expect(res.cheapestMethodId).toBeUndefined();
        expect(res.excluded).toHaveLength(1);
    });

    it('loại phương pháp chưa đăng ký kèm lý do, không ném (Req 5.5)', async () => {
        registry.register(fakePlugin('digital', { result: makeResult('digital', 1000) }));

        const res = await service.compare(PRODUCT, SPEC, ['digital', 'offset']);

        expect(res.mode).toBe('single');
        expect(res.results.map((r) => r.methodId)).toEqual(['digital']);
        expect(res.excluded[0].methodId).toBe('offset');
    });

    it('loại phương pháp khi plugin.calculate ném lỗi, không làm hỏng so sánh (Req 5.5)', async () => {
        registry.register(fakePlugin('digital', { result: makeResult('digital', 1000) }));
        registry.register(fakePlugin('offset', { throwOnCalculate: true }));

        const res = await service.compare(PRODUCT, SPEC, ['digital', 'offset']);

        expect(res.mode).toBe('single');
        expect(res.results.map((r) => r.methodId)).toEqual(['digital']);
        expect(res.excluded[0].methodId).toBe('offset');
        expect(res.excluded[0].reason).toContain('bùng nổ');
    });

    it('dùng cùng một bộ Thông_Số cho mọi phương pháp (Req 5.4)', async () => {
        const seen: Specification[] = [];
        const spyPlugin = (methodId: string): MethodPlugin => ({
            methodId,
            appliesTo: () => true,
            calculate: async (_p, spec) => {
                seen.push(spec);
                return makeResult(methodId, 1000);
            },
        });
        registry.register(spyPlugin('digital'));
        registry.register(spyPlugin('offset'));

        await service.compare(PRODUCT, SPEC, ['digital', 'offset']);

        expect(seen).toHaveLength(2);
        expect(seen[0]).toBe(SPEC);
        expect(seen[1]).toBe(SPEC);
    });

    it('khử trùng lặp phương pháp ứng viên', async () => {
        let calls = 0;
        const counting: MethodPlugin = {
            methodId: 'digital',
            appliesTo: () => true,
            calculate: async () => {
                calls += 1;
                return makeResult('digital', 1000);
            },
        };
        registry.register(counting);

        const res = await service.compare(PRODUCT, SPEC, ['digital', 'digital']);

        expect(calls).toBe(1);
        expect(res.results).toHaveLength(1);
    });
});
