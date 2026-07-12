/**
 * Pricing Contract Tests — Jest port of PHP PricingContractTest.php
 *
 * These tests verify that NestJS pricing functions produce IDENTICAL results
 * to the PHP implementation. All 28 test cases must pass.
 *
 * Run: npx jest --testPathPattern=pricing.service.spec
 */

import { PricingService } from './pricing.service';

describe('PricingService — Contract Tests', () => {
    let service: PricingService;

    beforeAll(() => {
        // Create service without DB repos (pure function tests only)
        service = new PricingService(null as any, null as any);
    });

    // ================================================================
    // 1. calculateGridLayout — Items per sheet
    // ================================================================

    describe('calculateGridLayout', () => {
        const cases: [string, number, number, number, number, number, number, number, number][] = [
            // [label, paperW, paperH, itemW, itemH, gapH, gapV, expectedItems, minEfficiency]
            ['namecard_on_A3', 430, 300, 90, 54, 2, 2, 23, 60.0],
            ['namecard_on_SRA3', 450, 310, 90, 54, 2, 2, 24, 60.0],
            ['A4_on_SRA3', 450, 310, 210, 297, 2, 2, 2, 50.0],
            ['A5_on_A3', 430, 300, 148, 210, 2, 2, 4, 48.0],
            ['sticker_5x5_on_A3', 430, 300, 50, 50, 2, 2, 40, 30.0],
            ['zero_item', 430, 300, 0, 0, 2, 2, 0, 0.0],
            ['oversized_item', 430, 300, 500, 400, 2, 2, 0, 0.0],
            ['exact_fit', 200, 100, 100, 100, 0, 0, 2, 90.0],
        ];

        test.each(cases)('%s', (label, pW, pH, iW, iH, gH, gV, expected, minEff) => {
            const result = service.calculateGridLayout(pW, pH, iW, iH, gH, gV);
            expect(result.itemsPerSheet).toBe(expected);
            expect(result.efficiency).toBeGreaterThanOrEqual(minEff);
        });
    });

    // ================================================================
    // 2. calculateStaggeredLayout — Circle/honeycomb packing
    // ================================================================

    describe('calculateStaggeredLayout', () => {
        test('round 5cm on A3 — at least 35 items', () => {
            const r = service.calculateStaggeredLayout(430, 300, 50, 50, 2, 2);
            expect(r.itemsPerSheet).toBeGreaterThanOrEqual(35);
            expect(r.efficiency).toBeGreaterThan(0);
        });

        test('round 3cm on A3 — at least 80 items', () => {
            const r = service.calculateStaggeredLayout(430, 300, 30, 30, 2, 2);
            expect(r.itemsPerSheet).toBeGreaterThanOrEqual(80);
        });

        test('zero item — returns 0', () => {
            const r = service.calculateStaggeredLayout(430, 300, 0, 0, 2, 2);
            expect(r.itemsPerSheet).toBe(0);
        });

        test('staggered >= grid for circles', () => {
            const grid = service.calculateGridLayout(430, 300, 50, 50, 2, 2);
            const stag = service.calculateStaggeredLayout(430, 300, 50, 50, 2, 2);
            expect(stag.itemsPerSheet).toBeGreaterThanOrEqual(grid.itemsPerSheet);
        });
    });

    // ================================================================
    // 3. calculateWasteSheets — Waste/spoilage calculation
    // ================================================================

    describe('calculateWasteSheets', () => {
        const defaultConfig: Record<string, string> = {
            waste_include_in_quote: '1',
            waste_digital_percent: '1',
            waste_offset_percent: '3',
            waste_lamination_percent: '1',
            waste_die_cut_percent: '2',
            waste_binding_percent: '2',
            waste_minimum_sheets: '10',
        };

        test('digital, no process: result >= 101 and <= 115', () => {
            const r = service.calculateWasteSheets(100, defaultConfig, 'digital', []);
            expect(r).toBeGreaterThanOrEqual(101);
            expect(r).toBeLessThanOrEqual(115);
        });

        test('digital with lamination: >= 102', () => {
            const r = service.calculateWasteSheets(100, defaultConfig, 'digital', ['can_mo']);
            expect(r).toBeGreaterThanOrEqual(102);
        });

        test('offset: >= 103', () => {
            const r = service.calculateWasteSheets(100, defaultConfig, 'offset', []);
            expect(r).toBeGreaterThanOrEqual(103);
        });

        test('offset with die-cut: >= 105', () => {
            const r = service.calculateWasteSheets(100, defaultConfig, 'offset', ['be']);
            expect(r).toBeGreaterThanOrEqual(105);
        });

        test('small batch — minimum waste kicks in', () => {
            const r = service.calculateWasteSheets(20, defaultConfig, 'digital', []);
            expect(r).toBeGreaterThanOrEqual(21);
            expect(r).toBeLessThanOrEqual(35);
        });

        test('waste disabled — returns exact sheets', () => {
            const r = service.calculateWasteSheets(100, { ...defaultConfig, waste_include_in_quote: '0' }, 'digital', []);
            expect(r).toBe(100);
        });
    });

    // ================================================================
    // 4. calculateSellingPrice — Markup/margin pricing
    // ================================================================

    describe('calculateSellingPrice', () => {
        test('markup 50% of 1000 = 1500', () => {
            expect(service.calculateSellingPrice(1000, {
                pricing_method: 'markup', default_markup: '50', min_margin: '20', price_rounding: '100',
            })).toBe(1500);
        });

        test('markup 100% of 500 = 1000', () => {
            expect(service.calculateSellingPrice(500, {
                pricing_method: 'markup', default_markup: '100', min_margin: '20', price_rounding: '100',
            })).toBe(1000);
        });

        test('margin 30% of 1000 → rounded to 1500', () => {
            expect(service.calculateSellingPrice(1000, {
                pricing_method: 'margin', default_markup: '30', min_margin: '20', price_rounding: '100',
            })).toBe(1500);
        });

        test('zero cost = 0', () => {
            expect(service.calculateSellingPrice(0, {
                pricing_method: 'markup', default_markup: '50', min_margin: '20', price_rounding: '100',
            })).toBe(0);
        });

        test('rounding to 500', () => {
            expect(service.calculateSellingPrice(1000, {
                pricing_method: 'markup', default_markup: '50', min_margin: '20', price_rounding: '500',
            })).toBe(1500);
        });

        test('min margin override: markup 5% → min margin 20% → 1300', () => {
            expect(service.calculateSellingPrice(1000, {
                pricing_method: 'markup', default_markup: '5', min_margin: '20', price_rounding: '100',
            })).toBe(1300);
        });
    });

    // ================================================================
    // 5. calculateWeightedAvgCost — Inventory costing
    // ================================================================

    describe('calculateWeightedAvgCost', () => {
        test('equal quantities: (100×10 + 200×10) / 20 = 150', () => {
            expect(service.calculateWeightedAvgCost(100, 10, 200, 10)).toBe(150);
        });

        test('first import (no existing stock)', () => {
            expect(service.calculateWeightedAvgCost(0, 0, 500, 100)).toBe(500);
        });

        test('small new batch: ≈ 101.82', () => {
            expect(service.calculateWeightedAvgCost(100, 100, 120, 10)).toBe(101.82);
        });

        test('same price stays same', () => {
            expect(service.calculateWeightedAvgCost(200, 50, 200, 50)).toBe(200);
        });
    });

    // ================================================================
    // 6. getProcessingCost — P1 (quoting "priceType") + P2a (per_m2)
    //    Regression guards cho audit báo giá in kỹ thuật số.
    // ================================================================

    describe('getProcessingCost', () => {
        function buildService(queryImpl: (sql: string, params: any[]) => Promise<any[]>) {
            const calls: { sql: string; params: any[] }[] = [];
            const manager = {
                query: jest.fn((sql: string, params: any[]) => {
                    calls.push({ sql, params });
                    return queryImpl(sql, params);
                }),
            };
            const tierRepo: any = { manager };
            return { svc: new PricingService(tierRepo, null as any), calls };
        }

        test('P1: truy vấn processing_options PHẢI trích dẫn "priceType" (chống Postgres case-fold)', async () => {
            const { svc, calls } = buildService(async (sql) => {
                if (sql.includes('processing_options')) return [{ id: 5, name: 'Cán màng', price: '100', priceType: 'per_sheet' }];
                return [];
            });
            await svc.getProcessingCost(5, 'single', 1, 100, 50);
            const procCall = calls.find((c) => c.sql.includes('processing_options'));
            expect(procCall).toBeDefined();
            // Nếu bỏ dấu nháy, Postgres fold thành `pricetype` → "column does not exist".
            expect(procCall!.sql).toContain('"priceType"');
        });

        test('P2a: per_m2 = đơn giá × diện tích tờ (m²) × số tờ × số mặt', async () => {
            const { svc } = buildService(async (sql) => {
                if (sql.includes('processing_options')) return [{ id: 7, name: 'Phủ UV', price: '1000', priceType: 'per_m2' }];
                if (sql.includes('paper_sizes')) return [{ width: '450', height: '320' }];
                return [];
            });
            // Diện tích tờ = 450×320/1e6 = 0.144 m²; 10 tờ, 1 mặt → 1000 × 0.144 × 10 = 1440
            const r = await svc.getProcessingCost(7, 'single', 1, 100, 10);
            expect(r.priceType).toBe('per_m2');
            expect(r.cost).toBeCloseTo(1440, 5);
        });

        test('per_sheet: tính theo số tờ × số mặt (double → ×2)', async () => {
            const { svc } = buildService(async (sql) => {
                if (sql.includes('processing_options')) return [{ id: 5, name: 'Cán màng', price: '100', priceType: 'per_sheet' }];
                return [];
            });
            const r = await svc.getProcessingCost(5, 'double', 1, 100, 48);
            expect(r.cost).toBe(9600); // 100 × 48 × 2
        });

        test('không tìm thấy option → cost 0', async () => {
            const { svc } = buildService(async () => []);
            const r = await svc.getProcessingCost(999, 'single', 1, 100, 50);
            expect(r.cost).toBe(0);
            expect(r.name).toBe('Unknown');
        });
    });

    // ================================================================
    // 7. hasAnyTier — phân biệt "có định mức" vs "chưa cấu hình"
    //    Dùng để CHẶN báo giá loose/bound khi vật tư chưa có tier
    //    (thay vì getPricingTierByMaterial âm thầm trả 0 → thiếu tiền giấy).
    // ================================================================

    describe('hasAnyTier', () => {
        function buildService(findImpl: (where: any) => Promise<any>) {
            const tierRepo: any = { findOne: jest.fn(({ where }: any) => findImpl(where)) };
            return { svc: new PricingService(tierRepo, null as any), tierRepo };
        }

        test('vật tư CÓ ít nhất 1 định mức → true', async () => {
            const { svc, tierRepo } = buildService(async () => ({ pricePerSheet: 1000 }));
            await expect(svc.hasAnyTier(42)).resolves.toBe(true);
            expect(tierRepo.findOne).toHaveBeenCalledWith({ where: { materialId: 42 } });
        });

        test('vật tư KHÔNG có định mức nào → false (để caller chặn)', async () => {
            const { svc } = buildService(async () => null);
            await expect(svc.hasAnyTier(99)).resolves.toBe(false);
        });
    });
});
