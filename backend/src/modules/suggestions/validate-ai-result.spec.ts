/**
 * Tests for validateAiResult — the anti-hallucination layer.
 * Tests the method on AiSuggestService directly via a minimal test harness.
 */

import { AiSuggestService } from './ai-suggest.service';

// We test validateAiResult by instantiating AiSuggestService with mocked dependencies
// Since validateAiResult is a public method, we can call it directly.

describe('validateAiResult (Anti-Hallucination)', () => {
    let service: AiSuggestService;

    const authoritativeQuote = (overrides: Record<string, unknown> = {}) => ({
        productType: 'namecard',
        total: 500000,
        unitPrice: 1000,
        currency: 'VND',
        breakdown: [
            { item: 'In', detail: '', cost: 300000 },
            { item: 'Gia công', detail: '', cost: 200000 },
        ],
        requiresManualQuote: false,
        warnings: [],
        source: 'pricing',
        ...overrides,
    }) as any;

    beforeEach(() => {
        // Create service with null dependencies — we only test validateAiResult
        service = Object.create(AiSuggestService.prototype);
        // Inject logger manually. `debug` bổ sung 2026-08-29: việc gỡ claim giá là hành vi bình
        // thường (tới 6 pattern × mỗi reply) nên đã hạ từ `warn` xuống `debug` theo §11 audit-rules.
        (service as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() };
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
        it('should strip fabricated VND prices ([giá]) when no verified quote and no pricing catalog', () => {
            const result = {
                replies: [{ text: 'Giá in namecard chỉ 500.000đ cho 500 cái ạ!' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            const validated = service.validateAiResult(result, null, []);
            // Giá bịa bị thay bằng placeholder [giá]
            expect(validated.replies[0].text).toContain('Giá in namecard chỉ [giá] cho 500 cái ạ!');
            expect(validated.replies[0].text).not.toContain('500.000đ');
        });

        it('should strip "triệu" prices when no verified quote', () => {
            const result = {
                replies: [{ text: 'Chi phí khoảng 2 triệu ạ' }],
                intent: 'hỏi_giá',
                confidence: 0.8,
            };
            const validated = service.validateAiResult(result, null, []);
            expect(validated.replies[0].text).toContain('Chi phí khoảng [giá] ạ');
        });

        it('should strip "nghìn/ngàn/k" prices', () => {
            const result = {
                replies: [{ text: 'Đơn giá khoảng 5k/cái' }],
                intent: 'hỏi_giá',
                confidence: 0.8,
            };
            const validated = service.validateAiResult(result, null, []);
            expect(validated.replies[0].text).toContain('Đơn giá khoảng [giá]/cái');
        });

        it('strips a price written without a currency suffix', () => {
            const validated = service.validateAiResult({
                replies: [{ text: 'Giá 900.000 cho 500 cái ạ.' }],
                intent: 'hỏi_giá',
                confidence: 0.8,
            }, null, []);

            expect(validated.replies[0].text).not.toContain('900.000');
            expect(validated.replies[0].text).toContain('[giá]');
        });

        it('strips currency amounts separated by spaces', () => {
            const validated = service.validateAiResult({
                replies: [{ text: 'Tổng chi phí là 900 000 đồng ạ.' }],
                intent: 'hỏi_giá',
                confidence: 0.8,
            }, null, []);

            expect(validated.replies[0].text).not.toContain('900 000 đồng');
            expect(validated.replies[0].text).toContain('[giá]');
        });

        it('canonicalizes an AI price that matches the authoritative quote', () => {
            const quoteResult = authoritativeQuote();
            const result = {
                replies: [{ text: 'Giá 500.000đ cho 500 cái' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            const validated = service.validateAiResult(result, quoteResult, []);

            expect(validated.replies[0].text).toContain('Báo giá hệ thống');
            expect(validated.replies[0].text).toContain('Tổng: 500.000đ');
            expect((validated.replies[0].text.match(/500\.000đ/g) || [])).toHaveLength(1);
        });

        it('removes a conflicting AI price and keeps only the authoritative total', () => {
            const result = {
                replies: [{ text: 'Giá bên mình là 900.000đ cho 500 cái ạ.' }],
                intent: 'hỏi_giá',
                confidence: 0.95,
            };

            const validated = service.validateAiResult(result, authoritativeQuote(), []);

            expect(validated.replies[0].text).not.toContain('900.000đ');
            expect(validated.replies[0].text).toContain('Tổng: 500.000đ');
            expect((validated.replies[0].text.match(/Báo giá hệ thống/g) || [])).toHaveLength(1);
        });

        it('does not trust a stale total when the quote requires manual review', () => {
            const manualQuote = authoritativeQuote({
                total: 500000,
                requiresManualQuote: true,
                source: 'none',
                reason: 'Thiếu định mức',
            });
            const result = {
                replies: [{ text: 'Giá dự kiến 900.000đ ạ.' }],
                intent: 'hỏi_giá',
                confidence: 0.95,
            };

            const validated = service.validateAiResult(result, manualQuote, []);

            expect(validated.replies[0].text).not.toContain('900.000đ');
            expect(validated.replies[0].text).not.toContain('500.000đ');
            expect(validated.replies[0].text).not.toContain('Báo giá hệ thống');
            expect(validated.replies[0].text).toContain('Nhân viên');
            expect(validated.confidence).toBe(0.7);
        });

        it('does not trust a positive total without an explicit pricing provenance', () => {
            const staleQuote = authoritativeQuote({ source: undefined });
            const validated = service.validateAiResult({
                replies: [{ text: 'Giá 900.000đ ạ.' }],
                intent: 'hỏi_giá',
                confidence: 0.95,
            }, staleQuote, []);

            expect(validated.replies[0].text).not.toContain('900.000đ');
            expect(validated.replies[0].text).not.toContain('Tổng: 500.000đ');
            expect(validated.replies[0].text).toContain('Nhân viên');
        });

        it('does not trust a quote with a malformed breakdown', () => {
            const staleQuote = authoritativeQuote({
                breakdown: [{ item: 'In', detail: '', cost: Number.NaN }],
            });
            const validated = service.validateAiResult({
                replies: [{ text: 'Giá 900.000đ ạ.' }],
                intent: 'hỏi_giá',
                confidence: 0.95,
            }, staleQuote, []);

            expect(validated.replies[0].text).not.toContain('900.000đ');
            expect(validated.replies[0].text).not.toContain('Báo giá hệ thống');
        });

        it('keeps quantities and dimensions when no currency claim exists', () => {
            const text = 'Bạn cần 500 cái, kích thước 9×5,4cm và in 2 mặt đúng không ạ?';
            const validated = service.validateAiResult({
                replies: [{ text }],
                intent: 'hỏi_sản_phẩm',
                confidence: 0.8,
            }, null, []);

            expect(validated.replies[0].text).toBe(text);
        });

        it('should STILL strip prices even when a pricing catalog is present (no calculated total)', () => {
            const result = {
                replies: [{ text: 'Giá khoảng 500.000đ đến 1.000.000đ nhé' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            // Trước đây có catalog → tin giá LLM tự viết (kẽ hở). Nay CHỈ tin total tính thật:
            // không có quoteResult.total → mọi giá bịa vẫn bị thay [giá].
            const validated = service.validateAiResult(result, null, []);
            expect(validated.replies[0].text).not.toContain('500.000đ');
            expect(validated.replies[0].text).not.toContain('1.000.000đ');
            expect(validated.replies[0].text).toContain('[giá]');
            // Kèm ghi chú nhân viên sẽ báo giá chính xác
            expect(validated.replies[0].text).toContain('Nhân viên');
        });
    });

    // ─── Verified price append ───

    describe('verified price append', () => {
        it('should append system price block when verified quote and price not in AI text', () => {
            const quoteResult = authoritativeQuote({
                total: 2500000,
                unitPrice: 5000,
                breakdown: [
                    { item: 'In offset', detail: '', cost: 1500000 },
                    { item: 'Cán mờ', detail: '', cost: 1000000 },
                ],
            });

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

        it('should replace an AI-authored price with exactly one canonical block', () => {
            const quoteResult = authoritativeQuote({
                total: 2500000,
                unitPrice: 5000,
                breakdown: [
                    { item: 'In', detail: '', cost: 1500000 },
                    { item: 'Gia công', detail: '', cost: 1000000 },
                ],
            });

            const result = {
                replies: [{ text: 'Giá 2.500.000đ cho namecard' }],
                intent: 'hỏi_giá',
                confidence: 0.9,
            };
            const validated = service.validateAiResult(result, quoteResult, []);

            const priceCount = (validated.replies[0].text.match(/2\.500\.000đ/g) || []).length;
            expect(priceCount).toBe(1);
            expect((validated.replies[0].text.match(/Báo giá hệ thống/g) || [])).toHaveLength(1);
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
            const quoteResult = authoritativeQuote({
                total: 100000,
                breakdown: [{ item: 'x', detail: '', cost: 100000 }],
            });
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
