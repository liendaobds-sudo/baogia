import { QuoteParserService } from './quote-parser.service';
import {
    detectProduct, loadProductTemplates,
} from './extractors';

describe('QuoteParserService', () => {
    let service: QuoteParserService;

    beforeEach(() => {
        service = new QuoteParserService();
    });

    // ─── parse() — full Vietnamese messages ───

    describe('parse', () => {
        it('should parse namecard with full specifications', () => {
            const result = service.parse('in 500 cái namecard 9x5.5cm couche 300gsm cán mờ 2 mặt');

            expect(result.product).toBe('namecard');
            expect(result.quantity).toBe(500);
            expect(result.material).toBeDefined();
            expect((result.material as any)?.type).toBe('couche');
            expect(result.printSides).toBe(2);
        });

        it('should detect flyer product', () => {
            const result = service.parse('in tờ rơi A5 1000 tờ');

            expect(result.product).toBe('flyer');
            expect(result.quantity).toBe(1000);
        });

        it('should detect catalogue/catalog product as bound type', () => {
            const result = service.parse('in catalogue 20 trang A4 200 cuốn');

            expect(result.product).toBe('catalog');
            expect(result.quantity).toBe(200);
        });

        it('should extract size in cm format', () => {
            const result = service.parse('in tem 5x8cm 1000 cái');

            expect(result.size).toBeTruthy();
            expect(result.quantity).toBe(1000);
        });

        it('should extract material with gsm', () => {
            const result = service.parse('in trên giấy art 250gsm');

            expect(result.material).toBeDefined();
            expect((result.material as any)?.type).toBe('art');
        });

        it('should detect binding type', () => {
            const result = service.parse('in sổ tay đóng lò xo 200 cuốn');

            expect(result.product).toBe('notebook');
            expect(result.quantity).toBe(200);
        });

        it('should detect lamination', () => {
            const result = service.parse('namecard cán bóng 2 mặt');

            expect(result.product).toBe('namecard');
            expect(result.lamination).toBeTruthy();
        });

        it('should detect sticker/decal product', () => {
            const result = service.parse('in decal nhãn dán chai 500 cái');

            expect(result.product).toBe('sticker');
            expect(result.quantity).toBe(500);
        });

        it('should return null product for greeting', () => {
            const result = service.parse('xin chào');

            expect(result.product).toBeFalsy();
        });

        it('should handle Vietnamese number words', () => {
            const result = service.parse('cần in 1 nghìn cái namecard');

            expect(result.quantity).toBe(1000);
        });
    });

    // ─── parseWithContext() — multi-turn accumulation ───

    describe('parseWithContext', () => {
        it('should merge info from multiple messages', () => {
            const first = service.parse('in namecard 500 cái');
            const merged = service.parseWithContext('couche 300gsm cán mờ', first);

            expect(merged.product).toBe('namecard');
            expect(merged.quantity).toBe(500);
            expect(merged.material).toBeDefined();
            expect((merged.material as any)?.type).toBe('couche');
        });

        it('should override quantity with new value', () => {
            const first = service.parse('in namecard 500 cái');
            const merged = service.parseWithContext('à 1000 đi', first);

            expect(merged.product).toBe('namecard');
            expect(merged.quantity).toBe(1000);
        });

        it('should keep previous product when new message has no product', () => {
            const first = service.parse('in poster A2');
            const merged = service.parseWithContext('300 tờ', first);

            expect(merged.product).toBe('poster');
            expect(merged.quantity).toBe(300);
        });

        it('should work without previous context', () => {
            const result = service.parseWithContext('in 500 namecard');

            expect(result.product).toBe('namecard');
            expect(result.quantity).toBe(500);
        });
    });

    // ─── Missing fields detection ───

    describe('missing fields', () => {
        it('should detect missing quantity', () => {
            const result = service.parse('in namecard couche 300gsm');

            expect(result.missingFields).toContain('quantity');
        });

        it('should detect missing material', () => {
            const result = service.parse('in namecard 500 cái');

            expect(result.missingFields).toContain('material');
        });

        it('should mark as complete when all required fields present', () => {
            const result = service.parse('in 500 namecard 9x5.5cm couche 300gsm');

            expect(result.isComplete).toBe(true);
            expect(result.missingFields).toHaveLength(0);
        });
    });

    // ─── Pricing dynamic detection ───

    describe('Pricing product detection', () => {
        beforeEach(() => {
            loadProductTemplates([
                {
                    id: 1,
                    code: 'NAMECARD',
                    name: 'Namecard',
                    product_type: 'loose' as any,
                    keywords: ['namecard', 'danh thiếp', 'name card', 'business card'],
                },
                {
                    id: 2,
                    code: 'BROCHURE',
                    name: 'Brochure',
                    product_type: 'bound' as any,
                    keywords: ['brochure', 'tờ gấp', 'to gap'],
                },
            ]);
        });

        it('should detect product from Pricing keywords', () => {
            const match = detectProduct('in namecard cho công ty');

            expect(match).not.toBeNull();
            expect(match!.product).toBe('NAMECARD');
            expect(match!.templateId).toBe(1);
        });

        it('should prioritize Pricing over static patterns', () => {
            const match = detectProduct('in brochure A5');

            expect(match).not.toBeNull();
            expect(match!.product).toBe('BROCHURE');
            expect(match!.templateId).toBe(2);
        });

        it('should fall back to static regex when no Pricing match', () => {
            const match = detectProduct('in standee quảng cáo');

            expect(match).not.toBeNull();
            expect(match!.product).toBe('standee');
            expect(match!.templateId).toBeUndefined();
        });
    });
});
