import {
    defaultBasisForQuoteType,
    resolveQuoteUnits,
    resolveUnitLabel,
    UNIT_LABELS_VI,
} from './quote-units';

describe('quote-units — QuantityBasis + resolveQuoteUnits', () => {
    describe('defaultBasisForQuoteType', () => {
        it('bound → book', () => {
            expect(defaultBasisForQuoteType('bound')).toBe('book');
            expect(defaultBasisForQuoteType('BOUND')).toBe('book');
        });
        it('large_format → board', () => {
            expect(defaultBasisForQuoteType('large_format')).toBe('board');
        });
        it('to_roi → sheet', () => {
            expect(defaultBasisForQuoteType('to_roi')).toBe('sheet');
        });
        it('loose / offset types → piece', () => {
            expect(defaultBasisForQuoteType('loose')).toBe('piece');
            expect(defaultBasisForQuoteType('hop_giay')).toBe('piece');
            expect(defaultBasisForQuoteType('tui_giay')).toBe('piece');
            expect(defaultBasisForQuoteType('bi_thu_folder')).toBe('piece');
            expect(defaultBasisForQuoteType(null)).toBe('piece');
            expect(defaultBasisForQuoteType(undefined)).toBe('piece');
        });
    });

    describe('resolveQuoteUnits priority', () => {
        it('client unit thắng product + type', () => {
            const r = resolveQuoteUnits({
                unit: 'tờ',
                productUnit: 'cái',
                quoteType: 'bound',
            });
            expect(r).toEqual({ basis: 'sheet', unit: 'tờ' });
        });

        it('productUnit khi client trống', () => {
            const r = resolveQuoteUnits({
                unit: '',
                productUnit: 'cuốn',
                quoteType: 'loose',
            });
            expect(r).toEqual({ basis: 'book', unit: 'cuốn' });
        });

        it('default theo type khi không có unit', () => {
            expect(resolveQuoteUnits({ quoteType: 'bound' })).toEqual({
                basis: 'book',
                unit: 'cuốn',
            });
            expect(resolveQuoteUnits({ quoteType: 'large_format' })).toEqual({
                basis: 'board',
                unit: 'tấm',
            });
            expect(resolveQuoteUnits({ quoteType: 'to_roi' })).toEqual({
                basis: 'sheet',
                unit: 'tờ',
            });
            expect(resolveQuoteUnits({ itemType: 'loose' })).toEqual({
                basis: 'piece',
                unit: 'cái',
            });
        });

        it('chuẩn hoá alias (sp, quyển, m2, con)', () => {
            expect(resolveQuoteUnits({ unit: 'sp' }).unit).toBe('cái');
            expect(resolveQuoteUnits({ unit: 'quyển' }).unit).toBe('cuốn');
            expect(resolveQuoteUnits({ unit: 'm2' }).unit).toBe('m²');
            expect(resolveQuoteUnits({ unit: 'con' }).unit).toBe('cái');
            expect(resolveQuoteUnits({ unit: 'Tờ' }).unit).toBe('tờ');
        });

        it('free-text custom được giữ nguyên', () => {
            const r = resolveQuoteUnits({ unit: 'hộp' });
            expect(r.unit).toBe('hộp');
            expect(r.basis).toBe('piece');
        });
    });

    describe('resolveUnitLabel', () => {
        it('trả nhãn VI', () => {
            expect(resolveUnitLabel({ quoteType: 'bound' })).toBe('cuốn');
            expect(resolveUnitLabel({ unit: 'm²' })).toBe('m²');
        });
    });

    describe('UNIT_LABELS_VI', () => {
        it('đủ 7 basis chuẩn in ấn', () => {
            expect(Object.keys(UNIT_LABELS_VI).sort()).toEqual(
                ['board', 'book', 'piece', 'roll', 'set', 'sheet', 'sqm'].sort(),
            );
        });
    });
});
