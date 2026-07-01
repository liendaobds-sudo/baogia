import {
    DIGITAL_QUOTE_TYPES,
    OFFSET_QUOTE_TYPES,
    resolveMethodForQuoteType,
} from './method-mapping';

describe('method-mapping — resolveMethodForQuoteType (Req 5)', () => {
    it.each(DIGITAL_QUOTE_TYPES)('loại digital "%s" → digital', (qt) => {
        expect(resolveMethodForQuoteType(qt)).toBe('digital');
    });

    it.each(OFFSET_QUOTE_TYPES)('loại offset "%s" → offset', (qt) => {
        expect(resolveMethodForQuoteType(qt)).toBe('offset');
    });

    it('loại không nhận dạng → null', () => {
        expect(resolveMethodForQuoteType('khong_ton_tai')).toBeNull();
        expect(resolveMethodForQuoteType('OFFSET')).toBeNull(); // phân biệt hoa/thường
    });

    it('rỗng / undefined / null → null', () => {
        expect(resolveMethodForQuoteType('')).toBeNull();
        expect(resolveMethodForQuoteType(undefined)).toBeNull();
        expect(resolveMethodForQuoteType(null)).toBeNull();
    });

    it('hai tập digital và offset rời nhau', () => {
        for (const d of DIGITAL_QUOTE_TYPES) {
            expect((OFFSET_QUOTE_TYPES as readonly string[]).includes(d)).toBe(false);
        }
    });
});
