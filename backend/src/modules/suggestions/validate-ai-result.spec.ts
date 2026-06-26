/**
 * Tests for validateAiResult — the anti-hallucination layer.
 * Tests the method on AiSuggestService directly via a minimal test harness.
 */

import { AiSuggestService } from './ai-suggest.service';

// We test validateAiResult by instantiating AiSuggestService with mocked dependencies
// Since validateAiResult is a public method, we can call it directly.

describe('validateAiResult (Anti-Hallucination)', () => {
    let service: AiSuggestService;

    beforeEach(() => {
        // Create service with null dependencies — we only test validateAiResult
        service = Object.create(AiSuggestService.prototype);
        // Inject logger manually
        (service as any).logger = { warn: jest.fn(), log: jest.fn() };
    });

    // ─── Structure validation ───

    describe('structure validation', () => {
        it('should return safe response for null result', () => {
            const validated = service.validateAiResult(null, null, []);
            expect(validated.replies).toBeDefined();
            expect(validated.replies.length).toBeGreaterThan(0);
            expect(validated.confidence).toBeLessThanOrEqual(0.5);
        });

        it('should return safe response for result without replies', () => {
            const validated = service.validateAiResult({}, null, []);
            expect(validated.replies).toBeDefined();
            expect(validated.replies.length).toBeGreaterThan(0);
        });

        it('should fix non-array replies', () => {
            const result = { replies: 'text', intent: 'chung', confidence: 0.5 };
            const validated = service.validateAiResult(result, null, []);
            expect(Array.isArray(validated.replies)).toBe(true);
        });

        it('should fix non-array missing_info', () => {
            const result = { replies: [{ text: 'test' }], missing_info: 'test' };
            const validated = service.validateAiResult(result, null, []);
            expect(Array.isArray(validated.missing_info)).toBe(true);
        });

        it('should default intent to "chung"', () => {
            const result = { replies: [{ text: 'test' }] };
            const validated = service.validateAiResult(result, null, []);
            expect(validated.intent).toBe('chung');
        });

        it('should default confidence to 0.4', () => {
            const result = { replies: [{ text: 'test' }] };
            const validated = service.validateAiResult(result, null, []);
            expect(validated.confidence).toBe(0.4);
        });
    });

    // ─── Price stripping (anti-hallucination) ───

    describe('price stripping', () => {
        it('should strip fabricated VND prices (***) when no verified quote and no pricing catalog', () => {
            const result = {
                replies: [{ text: 'Giá in namecard chỉ 500.000đ cho 500 cái ạ!' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            // Pass hasPricingCatalog = false
            const validated = service.validateAiResult(result, null, [], false);
            // In F7: Prices are stripped completely and replaced with ***
            expect(validated.replies[0].text).toContain('Giá in namecard chỉ *** cho 500 cái ạ!');
            expect(validated.replies[0].text).not.toContain('500.000đ');
        });

        it('should strip "triệu" prices when no verified quote', () => {
            const result = {
                replies: [{ text: 'Chi phí khoảng 2 triệu ạ' }],
                intent: 'hỏi_giá',
                confidence: 0.8,
            };
            const validated = service.validateAiResult(result, null, [], false);
            expect(validated.replies[0].text).toContain('Chi phí khoảng *** ạ');
        });

        it('should strip "nghìn/ngàn/k" prices', () => {
            const result = {
                replies: [{ text: 'Đơn giá khoảng 5k/cái' }],
                intent: 'hỏi_giá',
                confidence: 0.8,
            };
            const validated = service.validateAiResult(result, null, [], false);
            expect(validated.replies[0].text).toContain('Đơn giá khoảng ***/cái');
        });

        it('should NOT strip prices when verified quote exists', () => {
            const quoteResult = {
                productType: 'namecard',
                total: 500000,
                unitPrice: 1000,
                breakdown: [{ item: 'In', cost: 500000 }],
            } as any;

            const result = {
                replies: [{ text: 'Giá 500.000đ cho 500 cái' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            const validated = service.validateAiResult(result, quoteResult, [], false);
            // Should keep the price since verified quote exists
            expect(validated.replies[0].text).toContain('500.000đ');
        });

        it('should NOT strip prices when hasPricingCatalog is true', () => {
            const result = {
                replies: [{ text: 'Giá khoảng 500.000đ đến 1.000.000đ nhé' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            // Pass hasPricingCatalog = true
            const validated = service.validateAiResult(result, null, [], true);
            // Should keep the price because it's a reference price from catalog
            expect(validated.replies[0].text).toContain('500.000đ');
        });
    });

    // ─── Verified price append ───

    describe('verified price append', () => {
        it('should append system price block when verified quote and price not in AI text', () => {
            const quoteResult = {
                productType: 'namecard',
                total: 2500000,
                unitPrice: 5000,
                breakdown: [
                    { item: 'In offset', cost: 1500000 },
                    { item: 'Cán mờ', cost: 1000000 },
                ],
            } as any;

            const result = {
                replies: [{ text: 'Dạ em báo giá cho bạn nhé:' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            const validated = service.validateAiResult(result, quoteResult, []);

            expect(validated.replies[0].text).toContain('Báo giá hệ thống');
            expect(validated.replies[0].text).toContain('2.500.000đ');
            expect(validated.replies[0].text).toContain('5.000đ');
            expect(validated.replies[0].text).toContain('In offset');
            expect(validated.replies[0].text).toContain('Cán mờ');
        });

        it('should NOT duplicate price block if already in AI text', () => {
            const quoteResult = {
                productType: 'namecard',
                total: 2500000,
                unitPrice: 5000,
                breakdown: [{ item: 'In', cost: 2500000 }],
            } as any;

            const result = {
                replies: [{ text: 'Giá 2.500.000đ cho namecard' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            const validated = service.validateAiResult(result, quoteResult, []);

            // Should contain price only once (not duplicated)
            const priceCount = (validated.replies[0].text.match(/2\.500\.000đ/g) || []).length;
            expect(priceCount).toBe(1);
        });
    });

    // ─── Confidence capping ───

    describe('confidence capping', () => {
        it('should cap confidence to 0.7 when no verified price and AI says 0.95', () => {
            const result = {
                replies: [{ text: 'Xin chào!' }],
                intent: 'chào_hỏi',
                confidence: 0.95,
            };
            const validated = service.validateAiResult(result, null, []);
            expect(validated.confidence).toBe(0.7);
        });

        it('should NOT cap confidence when verified price exists', () => {
            const quoteResult = { total: 100000, breakdown: [{ item: 'x', cost: 100000 }] } as any;
            const result = {
                replies: [{ text: 'test' }],
                intent: 'hỏi_giá',
                confidence: 0.95,
            };
            const validated = service.validateAiResult(result, quoteResult, []);
            expect(validated.confidence).toBe(0.95);
        });

        it('should NOT cap confidence below 0.9', () => {
            const result = {
                replies: [{ text: 'test' }],
                intent: 'chung',
                confidence: 0.85,
            };
            const validated = service.validateAiResult(result, null, []);
            expect(validated.confidence).toBe(0.85); // Not capped because <= 0.9
        });
    });
});
