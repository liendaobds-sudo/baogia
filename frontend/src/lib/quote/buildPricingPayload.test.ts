import fc from 'fast-check';

import {
    buildPricingPayload,
    buildBoundPayload,
    buildLoosePayload,
    buildLargeFormatPayload,
    toMillimeters,
    InvalidPayloadError,
    DEFAULT_GAP_MM,
    INNER_PAGE_OFFSET,
    type LooseInput,
    type BoundInput,
    type LargeFormatInput,
    type Dimension,
} from './buildPricingPayload';

const unitArb = fc.constantFrom<'mm' | 'cm' | 'm'>('mm', 'cm', 'm');
const dimArb: fc.Arbitrary<Dimension> = fc.record({
    value: fc.double({ min: 0, max: 100000, noNaN: true }),
    unit: unitArb,
});
const procArb = fc.array(
    fc.record({ id: fc.integer({ min: 1, max: 999 }), side: fc.constantFrom('single', 'double') }, { requiredKeys: ['id'] }),
    { maxLength: 3 },
);

const looseArb: fc.Arbitrary<LooseInput> = fc.record({
    product_type: fc.constant<'loose'>('loose'),
    material_id: fc.integer({ min: 1, max: 999 }),
    quantity: fc.integer({ min: 1, max: 100000 }),
    item_width: dimArb,
    item_height: dimArb,
    print_side: fc.constantFrom('single', 'double'),
    print_type: fc.constantFrom('4c', '1c'),
    shape: fc.constantFrom('rectangle', 'circle'),
    processing: procArb,
});

const sectionArb = fc.record({
    material_id: fc.integer({ min: 1, max: 999 }),
    paper_size_id: fc.integer({ min: 1, max: 99 }),
    print_side: fc.constantFrom('single', 'double'),
    print_type: fc.constantFrom('4c', '1c'),
});

const boundArb: fc.Arbitrary<BoundInput> = fc.record({
    product_type: fc.constant<'bound'>('bound'),
    quantity: fc.integer({ min: 1, max: 10000 }),
    page_count: fc.integer({ min: 0, max: 500 }),
    binding_type: fc.constantFrom('saddle_stitch', 'ghim_long'),
    cover: sectionArb,
    inner: sectionArb,
});

const lfArb: fc.Arbitrary<LargeFormatInput> = fc.record({
    product_type: fc.constant<'large_format'>('large_format'),
    material_id: fc.integer({ min: 1, max: 999 }),
    quantity: fc.integer({ min: 1, max: 1000 }),
    width: dimArb,
    height: dimArb,
    print_type: fc.constantFrom('uv', 'eco'),
});

describe('buildPricingPayload', () => {
    it('Feature: quote-parity-mini-detailed, Property 5: toMillimeters đúng hệ số, độc lập độ lớn', () => {
        fc.assert(
            fc.property(fc.double({ min: 0, max: 100000, noNaN: true }), (v) => {
                expect(toMillimeters({ value: v, unit: 'mm' })).toBe(Math.round(v));
                expect(toMillimeters({ value: v, unit: 'cm' })).toBe(Math.round(v * 10));
                expect(toMillimeters({ value: v, unit: 'm' })).toBe(Math.round(v * 1000));
            }),
            { numRuns: 200 },
        );
    });

    it('Feature: quote-parity-mini-detailed, Property 2: bound inner.page_count = max(0, page_count - 4)', () => {
        fc.assert(
            fc.property(boundArb, (input) => {
                const payload = buildBoundPayload(input) as any;
                expect(payload.inner[0].page_count).toBe(Math.max(0, input.page_count - INNER_PAGE_OFFSET));
            }),
            { numRuns: 200 },
        );
    });

    it('Feature: quote-parity-mini-detailed, Property 3: bound inner luôn có print_type và print_side', () => {
        fc.assert(
            fc.property(boundArb, (input) => {
                const payload = buildBoundPayload(input) as any;
                expect(payload.inner[0].print_type).toBe(input.inner.print_type);
                expect(payload.inner[0].print_side).toBe(input.inner.print_side);
                expect(payload.cover.print_type).toBe(input.cover.print_type);
            }),
            { numRuns: 200 },
        );
    });

    it('Feature: quote-parity-mini-detailed, Property 4: loose dùng gap input, mặc định thống nhất khi thiếu', () => {
        fc.assert(
            fc.property(looseArb, fc.option(fc.integer({ min: 0, max: 10 }), { nil: undefined }), (base, gap) => {
                const withGap = { ...base, gap_h: gap, gap_v: gap } as LooseInput;
                const payload = buildLoosePayload(withGap) as any;
                const expected = gap ?? DEFAULT_GAP_MM;
                expect(payload.gap_h).toBe(expected);
                expect(payload.gap_v).toBe(expected);
            }),
            { numRuns: 200 },
        );
    });

    it('Feature: quote-parity-mini-detailed, Property 6: processing nhất quán (giữ id/side, bỏ khóa rỗng)', () => {
        fc.assert(
            fc.property(looseArb, (input) => {
                const payload = buildLoosePayload(input) as any;
                expect(payload.processing.length).toBe((input.processing ?? []).length);
                payload.processing.forEach((p: any, i: number) => {
                    expect(p.id).toBe(input.processing![i].id);
                    expect('name' in p).toBe(false); // không có name trong input → không sinh khóa rỗng
                });
            }),
            { numRuns: 200 },
        );
    });

    it('Feature: quote-parity-mini-detailed, Property 1: parity — cùng input cho payload xác định & bất biến chính', () => {
        fc.assert(
            fc.property(fc.oneof(looseArb, boundArb, lfArb), (input) => {
                const a = buildPricingPayload(input);
                const b = buildPricingPayload(input);
                expect(a).toEqual(b); // xác định
                // bất biến then chốt theo product_type
                if (input.product_type === 'bound') {
                    expect((a as any).inner[0].page_count).toBe(Math.max(0, input.page_count - 4));
                } else if (input.product_type === 'loose') {
                    expect((a as any).gap_h).toBe(input.gap_h ?? DEFAULT_GAP_MM);
                    expect((a as any).item_width).toBe(toMillimeters(input.item_width));
                } else {
                    expect((a as any).width).toBe(toMillimeters(input.width));
                }
            }),
            { numRuns: 300 },
        );
    });

    it('Unit: bound page_count ≤ 4 → inner.page_count = 0; thiếu cover/inner → ném InvalidPayloadError', () => {
        const base: BoundInput = {
            product_type: 'bound', quantity: 10, page_count: 4, binding_type: 'saddle_stitch',
            cover: { material_id: 1, paper_size_id: 1, print_side: 'double', print_type: '4c' },
            inner: { material_id: 2, paper_size_id: 1, print_side: 'double', print_type: '4c' },
        };
        expect((buildBoundPayload(base) as any).inner[0].page_count).toBe(0);
        expect(() => buildBoundPayload({ ...base, cover: undefined as any })).toThrow(InvalidPayloadError);
        expect(() => buildBoundPayload({ ...base, inner: undefined as any })).toThrow(InvalidPayloadError);
    });

    it('Unit: large_format quy đổi đơn vị', () => {
        const lf: LargeFormatInput = {
            product_type: 'large_format', material_id: 1, quantity: 2,
            width: { value: 1.5, unit: 'm' }, height: { value: 80, unit: 'cm' }, print_type: 'uv',
        };
        const p = buildLargeFormatPayload(lf) as any;
        expect(p.width).toBe(1500);
        expect(p.height).toBe(800);
    });
});
