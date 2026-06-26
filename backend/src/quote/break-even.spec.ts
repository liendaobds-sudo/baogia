/**
 * Unit test cho dò Điểm_Hoà_Vốn (task 10.4).
 *
 * Hai tầng:
 *  - Hàm thuần `detectBreakEven`: kiểm tra phát hiện đảo chiều, nội suy `q*`, và báo
 *    "không có điểm hoà vốn" khi không đảo chiều / thiếu dữ liệu.
 *  - `ComparatorService.findBreakEven`: kiểm tra tính lại giá trên cùng Thông_Số (chỉ
 *    đổi số lượng) và lắp ráp kết quả + mẫu giá, dùng plugin giả qua MethodRegistry thật.
 *
 * _Requirements: 5.3_
 */
import { detectBreakEven, PairPriceSample } from './break-even';
import { ComparatorService } from './comparator.service';
import { MethodRegistry } from './method-registry.service';
import {
    MethodPlugin,
    PriceResult,
    ProductRef,
    Specification,
} from './types/method-plugin.types';

describe('detectBreakEven (pure)', () => {
    function samples(rows: [number, number | null, number | null][]): PairPriceSample[] {
        return rows.map(([quantity, priceA, priceB]) => ({ quantity, priceA, priceB }));
    }

    it('phát hiện đảo chiều: A rẻ ở số lượng thấp, B rẻ ở số lượng cao (Req 5.3)', () => {
        // A: chi phí cố định thấp, biến phí cao; B: cố định cao, biến phí thấp.
        const res = detectBreakEven(
            'digital',
            'offset',
            samples([
                [100, 100, 300],
                [500, 500, 500 + 100], // A vẫn rẻ hơn
                [1000, 1000, 800], // B rẻ hơn
                [2000, 2000, 1200],
            ]),
        );

        expect(res.hasBreakEven).toBe(true);
        expect(res.breakEven?.lowerMethodId).toBe('digital');
        expect(res.breakEven?.upperMethodId).toBe('offset');
        // Đảo chiều giữa 500 và 1000.
        expect(res.breakEven?.lowerQuantity).toBe(500);
        expect(res.breakEven?.upperQuantity).toBe(1000);
        expect(res.breakEven!.quantity).toBeGreaterThanOrEqual(500);
        expect(res.breakEven!.quantity).toBeLessThanOrEqual(1000);
    });

    it('nội suy q* tại giao điểm tuyến tính (A=2q, B=1000+q ⇒ q*=1000)', () => {
        const res = detectBreakEven(
            'A',
            'B',
            samples([
                [500, 1000, 1500], // A rẻ hơn (1000 < 1500)
                [1500, 3000, 2500], // B rẻ hơn (2500 < 3000)
            ]),
        );
        expect(res.hasBreakEven).toBe(true);
        // d(q)=A-B=q-1000 ⇒ q*=1000.
        expect(res.breakEven?.quantity).toBe(1000);
    });

    it('báo "không có điểm hoà vốn" khi một phương pháp luôn rẻ hơn trong dải (Req 5.3)', () => {
        const res = detectBreakEven(
            'digital',
            'offset',
            samples([
                [100, 100, 300],
                [500, 400, 600],
                [1000, 900, 1100],
            ]),
        );
        expect(res.hasBreakEven).toBe(false);
        expect(res.breakEven).toBeUndefined();
        expect(res.message).toContain('Không có điểm hoà vốn');
    });

    it('điểm hoà vốn đúng tại số lượng có giá bằng nhau', () => {
        const res = detectBreakEven(
            'A',
            'B',
            samples([
                [100, 100, 200], // A rẻ
                [500, 500, 500], // bằng nhau
                [1000, 1000, 700], // B rẻ
            ]),
        );
        expect(res.hasBreakEven).toBe(true);
        // dLo=0 ở 500 ⇒ q*=500.
        expect(res.breakEven?.quantity).toBe(500);
        expect(res.breakEven?.lowerMethodId).toBe('A');
        expect(res.breakEven?.upperMethodId).toBe('B');
    });

    it('thiếu dữ liệu (<2 số lượng cả hai tính được giá) ⇒ không có điểm hoà vốn', () => {
        const res = detectBreakEven(
            'A',
            'B',
            samples([
                [100, 100, null],
                [500, null, 500],
            ]),
        );
        expect(res.hasBreakEven).toBe(false);
        expect(res.message).toContain('Không đủ dữ liệu');
    });

    it('bỏ qua số lượng mà một phương pháp không tính được giá', () => {
        const res = detectBreakEven(
            'A',
            'B',
            samples([
                [100, 100, 300], // A rẻ
                [500, null, 500], // bỏ qua (A thiếu giá)
                [1000, 1000, 700], // B rẻ ⇒ đảo chiều giữa 100 và 1000
            ]),
        );
        expect(res.hasBreakEven).toBe(true);
        expect(res.breakEven?.lowerQuantity).toBe(100);
        expect(res.breakEven?.upperQuantity).toBe(1000);
    });

    it('hai phương pháp bằng giá toàn dải ⇒ không có điểm hoà vốn đơn lẻ', () => {
        const res = detectBreakEven(
            'A',
            'B',
            samples([
                [100, 500, 500],
                [1000, 900, 900],
            ]),
        );
        expect(res.hasBreakEven).toBe(false);
        expect(res.message).toContain('bằng nhau');
    });
});

describe('ComparatorService.findBreakEven', () => {
    const PRODUCT: ProductRef = { code: 'name-card', quoteType: 'loose' };
    const BASE_SPEC: Specification = { quantity: 1, materialCode: 'C300' };

    function makeResult(methodId: string, priceBeforeVat: number): PriceResult {
        return {
            ok: true,
            methodId,
            costSubtotal: priceBeforeVat * 0.7,
            sellingSubtotal: priceBeforeVat,
            discountAmount: 0,
            priceBeforeVat,
            pricePerItem: priceBeforeVat,
            breakdown: {},
        };
    }

    /** Plugin giả với hàm giá theo số lượng. */
    function linearPlugin(
        methodId: string,
        priceOfQuantity: (q: number) => number,
        opts: { appliesAtQuantity?: (q: number) => boolean } = {},
    ): MethodPlugin {
        const { appliesAtQuantity = () => true } = opts;
        return {
            methodId,
            appliesTo: (_p, spec) => appliesAtQuantity(spec.quantity),
            calculate: async (_p, spec) => makeResult(methodId, priceOfQuantity(spec.quantity)),
        };
    }

    let registry: MethodRegistry;
    let service: ComparatorService;

    beforeEach(() => {
        registry = new MethodRegistry();
        service = new ComparatorService(registry);
    });

    it('tính lại giá trên cùng Thông_Số, chỉ thay đổi số lượng, và dò ra q* (Req 5.3, 5.4)', async () => {
        const seenSpecs: Specification[] = [];
        // digital: 5000 cố định + 2/đơn vị; offset: 9000 cố định + 0.5/đơn vị.
        registry.register({
            methodId: 'digital',
            appliesTo: () => true,
            calculate: async (_p, spec) => {
                seenSpecs.push(spec);
                return makeResult('digital', 5000 + 2 * spec.quantity);
            },
        });
        registry.register(linearPlugin('offset', (q) => 9000 + 0.5 * q));

        const res = await service.findBreakEven(
            PRODUCT,
            BASE_SPEC,
            'digital',
            'offset',
            [500, 1000, 2000, 4000],
        );

        expect(res.hasBreakEven).toBe(true);
        // d(q)=digital-offset = (5000+2q)-(9000+0.5q) = 1.5q-4000 ⇒ q*≈2667.
        expect(res.breakEven?.lowerMethodId).toBe('digital');
        expect(res.breakEven?.upperMethodId).toBe('offset');
        expect(res.breakEven?.lowerQuantity).toBe(2000);
        expect(res.breakEven?.upperQuantity).toBe(4000);
        // Mọi mẫu giữ nguyên Thông_Số nền, chỉ khác số lượng.
        expect(seenSpecs).toHaveLength(4);
        for (const s of seenSpecs) {
            expect(s.materialCode).toBe('C300');
        }
        expect(seenSpecs.map((s) => s.quantity)).toEqual([500, 1000, 2000, 4000]);
        expect(res.samples).toHaveLength(4);
    });

    it('báo "không có điểm hoà vốn" khi không đảo chiều trong dải (Req 5.3)', async () => {
        registry.register(linearPlugin('digital', (q) => 1000 + q));
        registry.register(linearPlugin('offset', (q) => 5000 + 2 * q)); // luôn đắt hơn

        const res = await service.findBreakEven(
            PRODUCT,
            BASE_SPEC,
            'digital',
            'offset',
            [100, 500, 1000],
        );

        expect(res.hasBreakEven).toBe(false);
        expect(res.message).toContain('Không có điểm hoà vốn');
        expect(res.samples.every((s) => s.cheaperMethodId === 'digital')).toBe(true);
    });

    it('số lượng mà một phương pháp không áp dụng được ⇒ giá null, vẫn dò trên phần còn lại', async () => {
        registry.register(linearPlugin('digital', (q) => 5000 + 2 * q));
        // offset chỉ áp dụng từ số lượng ≥ 1000.
        registry.register(
            linearPlugin('offset', (q) => 9000 + 0.5 * q, {
                appliesAtQuantity: (q) => q >= 1000,
            }),
        );

        const res = await service.findBreakEven(
            PRODUCT,
            BASE_SPEC,
            'digital',
            'offset',
            [500, 2000, 4000],
        );

        const lowSample = res.samples.find((s) => s.quantity === 500);
        expect(lowSample?.priceB).toBeNull();
        expect(lowSample?.cheaperMethodId).toBeNull();
        expect(res.hasBreakEven).toBe(true);
    });

    it('khử trùng lặp, lọc số không dương và sắp xếp số lượng tăng dần', async () => {
        registry.register(linearPlugin('digital', (q) => 5000 + 2 * q));
        registry.register(linearPlugin('offset', (q) => 9000 + 0.5 * q));

        const res = await service.findBreakEven(
            PRODUCT,
            BASE_SPEC,
            'digital',
            'offset',
            [4000, 500, 4000, 0, -100, 2000, 1000],
        );

        expect(res.samples.map((s) => s.quantity)).toEqual([500, 1000, 2000, 4000]);
    });
});
