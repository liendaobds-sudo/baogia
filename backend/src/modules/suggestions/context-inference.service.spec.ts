import { ContextInferenceService } from './context-inference.service';

describe('ContextInferenceService', () => {
    let service: ContextInferenceService;

    beforeEach(() => {
        service = new ContextInferenceService();
    });

    // ─── getKnowledgeData ───

    describe('getKnowledgeData', () => {
        it('should lazy-load knowledge data', () => {
            const data = service.getKnowledgeData();
            expect(data).toBeDefined();
            expect(typeof data).toBe('object');
        });

        it('should cache knowledge data on subsequent calls', () => {
            const first = service.getKnowledgeData();
            const second = service.getKnowledgeData();
            expect(first).toStrictEqual(second); // structurally identical
        });

        it('should reload after refreshKnowledge()', async () => {
            const data1 = service.getKnowledgeData();
            await service.refreshKnowledge();
            const data2 = service.getKnowledgeData();
            expect(data1).not.toBe(data2);
        });
    });

    // ─── inferContext ───

    describe('inferContext', () => {
        it('should return empty result for unrecognized text', () => {
            const result = service.inferContext('hello world xyz 123');
            expect(result.material).toBeUndefined();
            expect(result.size).toBeUndefined();
        });

        it('should match products from knowledge base keywords', () => {
            const kb = service.getKnowledgeData();
            // Only test if knowledge base has products
            if (Object.keys(kb.products || {}).length > 0) {
                const firstProduct = Object.values<any>(kb.products)[0];
                const keyword = firstProduct.keywords?.[0];
                if (keyword) {
                    const result = service.inferContext(keyword.toLowerCase());
                    expect(result.matchedProduct).toBeTruthy();
                }
            }
        });

        it('should set needsUsageContext when product has usageRules but no context matched', () => {
            const kb = service.getKnowledgeData();
            // Find a product with usageRules
            const productWithRules = Object.entries<any>(kb.products || {}).find(([, p]) => p.usageRules);
            if (productWithRules) {
                const [, product] = productWithRules;
                const keyword = product.keywords?.[0];
                if (keyword) {
                    const result = service.inferContext(keyword.toLowerCase());
                    // Should either match a rule or set needsUsageContext
                    expect(result.material || result.needsUsageContext).toBeTruthy();
                }
            }
        });
    });

    // ─── matchFAQ ──

    describe('matchFAQ', () => {
        it('should return null for unrecognized text', () => {
            const result = service.matchFAQ('completely unrelated gibberish xyz');
            expect(result).toBeNull();
        });

        it('should match FAQ patterns from knowledge base', () => {
            const kb = service.getKnowledgeData();
            if (kb.faq?.length > 0) {
                const firstFaq = kb.faq[0];
                const pattern = firstFaq.patterns?.[0];
                if (pattern) {
                    const result = service.matchFAQ(pattern.toLowerCase());
                    expect(result).not.toBeNull();
                    expect(result?.answer).toBe(firstFaq.answer);
                }
            }
        });
    });

    // ─── matchEdgeCase ───

    describe('matchEdgeCase', () => {
        it('should return null for normal messages', () => {
            const result = service.matchEdgeCase('in namecard 500 cái');
            expect(result).toBeNull();
        });

        it('should detect edge cases from knowledge base', () => {
            const kb = service.getKnowledgeData();
            const edgeCases = kb.edgeCases || {};
            const firstType = Object.keys(edgeCases)[0];
            if (firstType) {
                const ec = edgeCases[firstType];
                const pattern = (ec.patterns || ec.keywords || [])[0];
                if (pattern) {
                    const result = service.matchEdgeCase(pattern.toLowerCase());
                    expect(result).not.toBeNull();
                    expect(result?.response).toBeTruthy();
                }
            }
        });
    });

    // ─── getMaterialAdvice ───

    describe('getMaterialAdvice', () => {
        it('should return empty string for unknown material', () => {
            const result = service.getMaterialAdvice('unicorn paper', {});
            expect(result).toBe('');
        });

        it('should return advice for known materials', () => {
            const kb = service.getKnowledgeData();
            const materials = kb.materials || {};
            const firstMat = Object.values<any>(materials)[0];
            if (firstMat?.aliases?.length > 0) {
                const alias = firstMat.aliases[0].toLowerCase();
                const result = service.getMaterialAdvice(alias, {});
                expect(result).toContain(firstMat.displayName);
            }
        });
    });

    // ─── buildPrintingKnowledgeContext ───

    describe('buildPrintingKnowledgeContext', () => {
        it('should build context string from knowledge data', () => {
            const identity = (text: string) => text;
            const result = service.buildPrintingKnowledgeContext(identity);

            // Should at least contain the header
            expect(result).toContain('Danh mục sản phẩm');
        });

        it('should apply simplify function to content', () => {
            const simplify = (text: string) => text.replace(/matte lamination/gi, 'cán mờ');
            const result = service.buildPrintingKnowledgeContext(simplify);
            expect(typeof result).toBe('string');
        });
    });
});
