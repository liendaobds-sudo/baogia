import fc from 'fast-check';

import { readPricingResult } from './readPricingResult';

const resultArb = fc.record({
    total: fc.integer({ min: 0, max: 10_000_000 }),
    price_per_item: fc.integer({ min: 0, max: 100000 }),
    breakdown: fc.record({ printing: fc.integer({ min: 0, max: 1000 }) }),
});

describe('readPricingResult', () => {
    it('Feature: quote-parity-mini-detailed, Property 7: {success,data:r} và r hội tụ cùng kết quả', () => {
        fc.assert(
            fc.property(resultArb, (r) => {
                const a = readPricingResult({ success: true, data: r });
                const b = readPricingResult(r);
                expect(a.ok).toBe(true);
                expect(b.ok).toBe(true);
                expect(a.total).toBe(b.total);
                expect(a.total).toBe(r.total);
                expect(a.breakdown).toEqual(b.breakdown);
            }),
            { numRuns: 200 },
        );
    });

    it('Feature: quote-parity-mini-detailed, Property 8: success=false hoặc thiếu dữ liệu → ok=false + error', () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.record({ success: fc.constant(false), error: fc.string() }),
                    fc.record({ foo: fc.string() }), // object không có total
                    fc.constant(null),
                    fc.constant(undefined),
                ),
                (resp) => {
                    const out = readPricingResult(resp);
                    expect(out.ok).toBe(false);
                    expect(typeof out.error === 'string' || out.requiresManualQuote === true).toBe(true);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('Unit: requiresManualQuote được giữ nguyên', () => {
        const out = readPricingResult({ requiresManualQuote: true, reason: 'Pricing offline' });
        expect(out.ok).toBe(false);
        expect(out.requiresManualQuote).toBe(true);
        expect(out.reason).toBe('Pricing offline');
    });
});
