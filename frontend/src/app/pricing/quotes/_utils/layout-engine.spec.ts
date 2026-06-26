/**
 * Unit tests for layout-engine.ts
 * 
 * These tests verify the core paper-cutting algorithms that determine
 * how many items fit on a sheet and overall print efficiency.
 * Incorrect results here = incorrect pricing = lost money.
 */
import { calculateGridLayout, calculateStaggeredLayout } from '../_utils/layout-engine';

describe('layout-engine: calculateGridLayout', () => {
    // Standard A3 sheet dimensions (mm)
    const A3 = { w: 420, h: 297 };
    const MARGINS = { ml: 5, mr: 5, mt: 5, mb: 5 };

    it('should calculate correct items per sheet for standard business cards on A3', () => {
        // Business card: 90x54mm, gap 2mm
        const result = calculateGridLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            90, 54, 2, 2
        );

        expect(result.itemsPerSheet).toBeGreaterThan(0);
        // 410 usable width / 92 = 4 cols normal
        // 287 usable height / 56 = 5 rows normal → 20 items
        // But rotated might be better: 410/56=7 cols × 287/92=3 rows = 21
        // Mixed strategies can yield even more
        expect(result.itemsPerSheet).toBeGreaterThanOrEqual(20);
        expect(result.placements).toHaveLength(result.itemsPerSheet);
        expect(result.efficiency).toBeGreaterThan(0);
        expect(result.efficiency).toBeLessThanOrEqual(100);
    });

    it('should return 0 items when product is larger than usable area', () => {
        const result = calculateGridLayout(
            100, 100,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            200, 200, 0, 0
        );

        expect(result.itemsPerSheet).toBe(0);
        expect(result.placements).toHaveLength(0);
    });

    it('should return 0 items for zero-dimension product', () => {
        const result = calculateGridLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            0, 0, 2, 2
        );

        expect(result.itemsPerSheet).toBe(0);
    });

    it('should handle square items correctly', () => {
        // 50x50mm stickers on A3
        const result = calculateGridLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            50, 50, 2, 2
        );

        // Usable: 410x287, item+gap: 52x52
        // Normal: floor(410/52)*floor(287/52) = 7*5 = 35
        expect(result.itemsPerSheet).toBeGreaterThanOrEqual(35);
        // All placements should be within usable bounds
        result.placements.forEach(p => {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.x + p.width).toBeLessThanOrEqual(result.usableWidth + 0.01);
            expect(p.y + p.height).toBeLessThanOrEqual(result.usableHeight + 0.01);
        });
    });

    it('should try rotated layout and pick the better one', () => {
        // Elongated item: 200x30mm on A3
        const result = calculateGridLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            200, 30, 2, 2
        );

        // The engine should consider both orientations
        // Normal: floor(412/202)*floor(289/32) = 2*9 = 18
        // Rotated: floor(412/32)*floor(289/202) = 12*1 = 12
        // Mixed should get more
        expect(result.itemsPerSheet).toBeGreaterThanOrEqual(18);
    });

    it('should produce valid usableWidth and usableHeight', () => {
        const result = calculateGridLayout(
            A3.w, A3.h,
            10, 15, 8, 12,
            90, 54, 2, 2
        );

        expect(result.usableWidth).toBe(A3.w - 10 - 15); // 395
        expect(result.usableHeight).toBe(A3.h - 8 - 12); // 277
    });

    it('should handle zero gaps correctly', () => {
        const result = calculateGridLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            90, 54, 0, 0
        );

        // Without gaps, should fit more items than with gaps
        const resultWithGaps = calculateGridLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            90, 54, 2, 2
        );

        expect(result.itemsPerSheet).toBeGreaterThanOrEqual(resultWithGaps.itemsPerSheet);
    });

    it('should fit exactly 1 item when product matches usable area', () => {
        const result = calculateGridLayout(
            100, 100,
            0, 0, 0, 0,
            100, 100, 0, 0
        );

        expect(result.itemsPerSheet).toBe(1);
        expect(result.placements[0].x).toBe(0);
        expect(result.placements[0].y).toBe(0);
    });
});

describe('layout-engine: calculateStaggeredLayout', () => {
    const A3 = { w: 420, h: 297 };
    const MARGINS = { ml: 5, mr: 5, mt: 5, mb: 5 };

    it('should calculate staggered layout for round items', () => {
        // 40x40mm circular stickers on A3
        const result = calculateStaggeredLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            40, 40, 2, 2
        );

        expect(result.itemsPerSheet).toBeGreaterThan(0);
        expect(result.placements).toHaveLength(result.itemsPerSheet);
        // Staggered layout for circles often yields more than grid
    });

    it('should return 0 for items too large', () => {
        const result = calculateStaggeredLayout(
            100, 100,
            5, 5, 5, 5,
            200, 200, 0, 0
        );

        expect(result.itemsPerSheet).toBe(0);
    });

    it('should keep all placements within usable bounds', () => {
        const result = calculateStaggeredLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            30, 30, 3, 3
        );

        result.placements.forEach(p => {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.x + p.width).toBeLessThanOrEqual(result.usableWidth + 0.01);
            expect(p.y + p.height).toBeLessThanOrEqual(result.usableHeight + 0.01);
        });
    });

    it('should handle zero-dimension items', () => {
        const result = calculateStaggeredLayout(
            A3.w, A3.h,
            MARGINS.ml, MARGINS.mr, MARGINS.mt, MARGINS.mb,
            0, 0, 2, 2
        );

        expect(result.itemsPerSheet).toBe(0);
    });
});

describe('layout-engine: cross-validation', () => {
    it('efficiency should never exceed 100%', () => {
        const sizes = [
            [90, 54], [50, 50], [148, 210], [200, 30], [297, 210], [40, 40], [20, 20]
        ];

        sizes.forEach(([w, h]) => {
            const grid = calculateGridLayout(420, 297, 5, 5, 5, 5, w, h, 2, 2);
            const stag = calculateStaggeredLayout(420, 297, 5, 5, 5, 5, w, h, 2, 2);

            if (grid.itemsPerSheet > 0) {
                expect(grid.efficiency).toBeLessThanOrEqual(100);
                expect(grid.efficiency).toBeGreaterThan(0);
            }
            if (stag.itemsPerSheet > 0) {
                expect(stag.efficiency).toBeLessThanOrEqual(100);
                expect(stag.efficiency).toBeGreaterThan(0);
            }
        });
    });

    it('smaller gaps should yield >= items compared to larger gaps', () => {
        const noGap = calculateGridLayout(420, 297, 5, 5, 5, 5, 90, 54, 0, 0);
        const smallGap = calculateGridLayout(420, 297, 5, 5, 5, 5, 90, 54, 2, 2);
        const largeGap = calculateGridLayout(420, 297, 5, 5, 5, 5, 90, 54, 10, 10);

        expect(noGap.itemsPerSheet).toBeGreaterThanOrEqual(smallGap.itemsPerSheet);
        expect(smallGap.itemsPerSheet).toBeGreaterThanOrEqual(largeGap.itemsPerSheet);
    });
});
