/**
 * Layout Parity Test
 * 
 * Verifies that the frontend layout-engine.ts and the backend
 * PricingService.calculateGridLayout() produce identical itemsPerSheet
 * values for a comprehensive set of inputs.
 * 
 * This is the "contract test" that eliminates the risk of FE/BE layout
 * divergence without requiring a shared NPM package.
 */

// Import FE layout engine
import { calculateGridLayout as feGrid, calculateStaggeredLayout as feStaggered } from '../_utils/layout-engine';

// ─── Inline BE algorithm (exact copy from pricing.service.ts — UPDATED with mixed strategy) ───
function beGridCount(areaW: number, areaH: number, iW: number, iH: number, gapH: number, gapV: number) {
    const cols = Math.floor((areaW + gapH) / (iW + gapH));
    const rows = Math.floor((areaH + gapV) / (iH + gapV));
    const count = cols > 0 && rows > 0 ? cols * rows : 0;
    const usedW = cols > 0 ? cols * iW + (cols - 1) * gapH : 0;
    const usedH = rows > 0 ? rows * iH + (rows - 1) * gapV : 0;
    return { count, usedW, usedH };
}

function beMixedCount(areaW: number, areaH: number, mainW: number, mainH: number, gapH: number, gapV: number, origW: number, origH: number): number {
    const main = beGridCount(areaW, areaH, mainW, mainH, gapH, gapV);
    if (main.count <= 0) return 0;
    const remW = areaW - main.usedW - gapH;
    const remH = areaH - main.usedH - gapV;
    let sideCount = 0;
    if (remW > 0) {
        sideCount = Math.max(beGridCount(remW, areaH, origW, origH, gapH, gapV).count, beGridCount(remW, areaH, origH, origW, gapH, gapV).count);
    }
    let bottomCount = 0;
    if (remH > 0) {
        bottomCount = Math.max(beGridCount(areaW, remH, origW, origH, gapH, gapV).count, beGridCount(areaW, remH, origH, origW, gapH, gapV).count);
    }
    return main.count + Math.max(sideCount, bottomCount);
}

function beGridLayout(printableWidth: number, printableHeight: number, itemWidth: number, itemHeight: number, gapH = 2, gapV = 2) {
    if (itemWidth <= 0 || itemHeight <= 0) return { itemsPerSheet: 0, efficiency: 0 };
    const s1 = beGridCount(printableWidth, printableHeight, itemWidth, itemHeight, gapH, gapV).count;
    const s2 = beGridCount(printableWidth, printableHeight, itemHeight, itemWidth, gapH, gapV).count;
    const s3 = beMixedCount(printableWidth, printableHeight, itemWidth, itemHeight, gapH, gapV, itemWidth, itemHeight);
    const s4 = beMixedCount(printableWidth, printableHeight, itemHeight, itemWidth, gapH, gapV, itemWidth, itemHeight);
    const itemsPerSheet = Math.max(s1, s2, s3, s4);
    const sheetArea = printableWidth * printableHeight;
    const usedArea = itemsPerSheet * itemWidth * itemHeight;
    const efficiency = sheetArea > 0 ? Math.round((usedArea / sheetArea) * 1000) / 10 : 0;
    return { itemsPerSheet, efficiency };
}

function beStaggeredCore(usableW: number, usableH: number, itemW: number, itemL: number, gapH: number, gapV: number): number {
    const rx = itemW / 2;
    const ry = itemL / 2;
    if (usableW < itemW || usableH < itemL) return 0;
    const stepX = itemW + gapH;
    const stepY = Math.sqrt(3) * (ry + gapV / 2);
    const cols = Math.floor(usableW / stepX);
    const rows = Math.floor(usableH / stepY);
    let count = 0;
    for (let row = 0; row <= rows; row++) {
        const isOddRow = row % 2 !== 0;
        const numItemsInRow = isOddRow ? Math.floor((usableW - stepX / 2) / stepX) : cols;
        for (let col = 0; col < numItemsInRow; col++) {
            let x = col * stepX + rx;
            if (isOddRow) x += stepX / 2;
            const y = row * stepY + ry;
            if (x - rx < 0 || x + rx > usableW || y - ry < 0 || y + ry > usableH) continue;
            count++;
        }
    }
    return count;
}

function beStaggeredLayout(printableWidth: number, printableHeight: number, itemWidth: number, itemHeight: number, gapH = 2, gapV = 2) {
    if (itemWidth <= 0 || itemHeight <= 0) return { itemsPerSheet: 0, efficiency: 0 };
    const items1 = beStaggeredCore(printableWidth, printableHeight, itemWidth, itemHeight, gapH, gapV);
    const items2 = beStaggeredCore(printableWidth, printableHeight, itemHeight, itemWidth, gapV, gapH);
    const itemsPerSheet = Math.max(items1, items2);
    const sheetArea = printableWidth * printableHeight;
    const usedArea = itemsPerSheet * itemWidth * itemHeight;
    const efficiency = sheetArea > 0 ? Math.round((usedArea / sheetArea) * 1000) / 10 : 0;
    return { itemsPerSheet, efficiency };
}

// ─── Test Cases ───
interface TestCase {
    desc: string;
    paperW: number;
    paperH: number;
    marginL: number;
    marginR: number;
    marginT: number;
    marginB: number;
    itemW: number;
    itemH: number;
    gapH: number;
    gapV: number;
}

const testCases: TestCase[] = [
    { desc: 'Business card on A3', paperW: 420, paperH: 297, marginL: 5, marginR: 5, marginT: 5, marginB: 5, itemW: 90, itemH: 54, gapH: 2, gapV: 2 },
    { desc: 'Sticker on A4', paperW: 297, paperH: 210, marginL: 5, marginR: 5, marginT: 5, marginB: 5, itemW: 50, itemH: 50, gapH: 3, gapV: 3 },
    { desc: 'Flyer on SRA3', paperW: 450, paperH: 320, marginL: 5, marginR: 5, marginT: 5, marginB: 5, itemW: 210, itemH: 148, gapH: 2, gapV: 2 },
    { desc: 'Label 30x15 on A3', paperW: 420, paperH: 297, marginL: 3, marginR: 3, marginT: 3, marginB: 3, itemW: 30, itemH: 15, gapH: 1, gapV: 1 },
    { desc: 'Large item barely fitting', paperW: 320, paperH: 450, marginL: 10, marginR: 10, marginT: 10, marginB: 10, itemW: 145, itemH: 210, gapH: 2, gapV: 2 },
    { desc: 'Item too big for paper', paperW: 297, paperH: 210, marginL: 5, marginR: 5, marginT: 5, marginB: 5, itemW: 300, itemH: 200, gapH: 2, gapV: 2 },
    { desc: 'Zero gap', paperW: 420, paperH: 297, marginL: 0, marginR: 0, marginT: 0, marginB: 0, itemW: 105, itemH: 74.25, gapH: 0, gapV: 0 },
    { desc: 'Custom 500x700', paperW: 500, paperH: 700, marginL: 8, marginR: 8, marginT: 8, marginB: 8, itemW: 55, itemH: 85, gapH: 2, gapV: 2 },
    { desc: 'Tiny item on large sheet', paperW: 900, paperH: 640, marginL: 10, marginR: 10, marginT: 10, marginB: 10, itemW: 20, itemH: 20, gapH: 1, gapV: 1 },
    { desc: 'Square item no margins', paperW: 300, paperH: 300, marginL: 0, marginR: 0, marginT: 0, marginB: 0, itemW: 100, itemH: 100, gapH: 5, gapV: 5 },
];

describe('FE/BE Layout Parity Tests', () => {
    describe('Grid Layout', () => {
        testCases.forEach(tc => {
            test(`${tc.desc}: FE == BE itemsPerSheet`, () => {
                const usableW = tc.paperW - tc.marginL - tc.marginR;
                const usableH = tc.paperH - tc.marginT - tc.marginB;

                const feResult = feGrid(tc.paperW, tc.paperH, tc.marginL, tc.marginR, tc.marginT, tc.marginB, tc.itemW, tc.itemH, tc.gapH, tc.gapV);
                const beResult = beGridLayout(usableW, usableH, tc.itemW, tc.itemH, tc.gapH, tc.gapV);

                expect(feResult.itemsPerSheet).toBe(beResult.itemsPerSheet);
            });
        });
    });

    describe('Staggered Layout', () => {
        testCases.filter(tc => tc.itemW > 0 && tc.itemH > 0).forEach(tc => {
            test(`${tc.desc}: FE == BE itemsPerSheet`, () => {
                const usableW = tc.paperW - tc.marginL - tc.marginR;
                const usableH = tc.paperH - tc.marginT - tc.marginB;

                const feResult = feStaggered(tc.paperW, tc.paperH, tc.marginL, tc.marginR, tc.marginT, tc.marginB, tc.itemW, tc.itemH, tc.gapH, tc.gapV);
                const beResult = beStaggeredLayout(usableW, usableH, tc.itemW, tc.itemH, tc.gapH, tc.gapV);

                expect(feResult.itemsPerSheet).toBe(beResult.itemsPerSheet);
            });
        });
    });
});
