/**
 * Unit test cho MethodRegistry (task 1.3).
 *
 * Bao phủ:
 * - Đăng ký/tra cứu plugin theo methodId.
 * - Ném MethodNotRegisteredError khi tra cứu/định tuyến methodId chưa đăng ký (Req 4.6).
 * - appliesTo định tuyến đúng tới plugin.appliesTo (Req 1.5, 4.6).
 *
 * _Requirements: 1.5, 4.6_
 */
import {
    MethodNotRegisteredError,
    MethodRegistry,
} from './method-registry.service';
import {
    MethodId,
    MethodPlugin,
    PriceResult,
    ProductRef,
    Specification,
} from './types/method-plugin.types';

/** Tạo một plugin giả lập tối thiểu để kiểm thử registry. */
function makePlugin(
    methodId: MethodId,
    appliesToImpl: (product: ProductRef, spec: Specification) => boolean = () =>
        true,
): MethodPlugin {
    return {
        methodId,
        appliesTo: jest.fn(appliesToImpl),
        calculate: jest.fn(
            async (): Promise<PriceResult> => ({
                ok: true,
                methodId,
                costSubtotal: 0,
                sellingSubtotal: 0,
                discountAmount: 0,
                priceBeforeVat: 0,
                pricePerItem: 0,
                breakdown: {},
            }),
        ),
    };
}

const PRODUCT: ProductRef = { code: 'business-card', quoteType: 'loose' };
const SPEC: Specification = { quantity: 100 };

describe('MethodRegistry', () => {
    let registry: MethodRegistry;

    beforeEach(() => {
        registry = new MethodRegistry();
    });

    describe('register + getPlugin', () => {
        it('đăng ký rồi tra cứu trả về đúng plugin đã đăng ký', () => {
            const digital = makePlugin('digital');
            registry.register(digital);

            expect(registry.getPlugin('digital')).toBe(digital);
        });

        it('đăng ký nhiều phương pháp và tra cứu độc lập', () => {
            const digital = makePlugin('digital');
            const offset = makePlugin('offset');
            registry.register(digital);
            registry.register(offset);

            expect(registry.getPlugin('digital')).toBe(digital);
            expect(registry.getPlugin('offset')).toBe(offset);
        });

        it('đăng ký lại cùng methodId sẽ ghi đè plugin trước đó (đúng một plugin/methodId)', () => {
            const first = makePlugin('digital');
            const second = makePlugin('digital');
            registry.register(first);
            registry.register(second);

            expect(registry.getPlugin('digital')).toBe(second);
            expect(registry.listMethodIds()).toEqual(['digital']);
        });

        it('cho phép đăng ký phương pháp mở rộng tuỳ ý (Req 1.5)', () => {
            const largeFormat = makePlugin('large_format');
            registry.register(largeFormat);

            expect(registry.getPlugin('large_format')).toBe(largeFormat);
        });

        it('ném lỗi khi đăng ký plugin thiếu methodId', () => {
            expect(() =>
                registry.register({ methodId: '' } as unknown as MethodPlugin),
            ).toThrow('Không thể đăng ký plugin thiếu methodId.');
            expect(() =>
                registry.register(null as unknown as MethodPlugin),
            ).toThrow('Không thể đăng ký plugin thiếu methodId.');
        });
    });

    describe('getPlugin — phương pháp chưa đăng ký (Req 4.6)', () => {
        it('ném MethodNotRegisteredError khi tra cứu methodId chưa đăng ký', () => {
            expect(() => registry.getPlugin('offset')).toThrow(
                MethodNotRegisteredError,
            );
        });

        it('lỗi mang theo methodId và danh sách phương pháp đã đăng ký', () => {
            registry.register(makePlugin('digital'));

            try {
                registry.getPlugin('offset');
                fail('Mong đợi MethodNotRegisteredError được ném ra');
            } catch (err) {
                expect(err).toBeInstanceOf(MethodNotRegisteredError);
                const e = err as MethodNotRegisteredError;
                expect(e.methodId).toBe('offset');
                expect(e.registered).toEqual(['digital']);
                expect(e.message).toContain('offset');
                expect(e.message).toContain('digital');
            }
        });
    });

    describe('appliesTo — định tuyến (Req 1.5, 4.6)', () => {
        it('định tuyến tới plugin.appliesTo và trả về true', () => {
            const digital = makePlugin('digital', () => true);
            registry.register(digital);

            expect(registry.appliesTo('digital', PRODUCT, SPEC)).toBe(true);
            expect(digital.appliesTo).toHaveBeenCalledWith(PRODUCT, SPEC);
        });

        it('định tuyến tới plugin.appliesTo và trả về false', () => {
            const offset = makePlugin('offset', () => false);
            registry.register(offset);

            expect(registry.appliesTo('offset', PRODUCT, SPEC)).toBe(false);
            expect(offset.appliesTo).toHaveBeenCalledWith(PRODUCT, SPEC);
        });

        it('định tuyến đúng plugin khi có nhiều phương pháp đăng ký', () => {
            const digital = makePlugin('digital', () => true);
            const offset = makePlugin('offset', () => false);
            registry.register(digital);
            registry.register(offset);

            expect(registry.appliesTo('digital', PRODUCT, SPEC)).toBe(true);
            expect(registry.appliesTo('offset', PRODUCT, SPEC)).toBe(false);
            expect(digital.appliesTo).toHaveBeenCalledTimes(1);
            expect(offset.appliesTo).toHaveBeenCalledTimes(1);
        });

        it('ném MethodNotRegisteredError khi định tuyến tới methodId chưa đăng ký', () => {
            expect(() => registry.appliesTo('offset', PRODUCT, SPEC)).toThrow(
                MethodNotRegisteredError,
            );
        });
    });

    describe('listMethodIds', () => {
        it('trả về mảng rỗng khi chưa đăng ký phương pháp nào', () => {
            expect(registry.listMethodIds()).toEqual([]);
        });

        it('liệt kê các methodId đã đăng ký theo thứ tự đăng ký', () => {
            registry.register(makePlugin('digital'));
            registry.register(makePlugin('offset'));

            expect(registry.listMethodIds()).toEqual(['digital', 'offset']);
        });
    });
});
