export interface LayoutItem {
    x: number;
    y: number;
    width: number;
    height: number;
    rotated: boolean;
}

export interface LayoutStrategyResult {
    itemsPerSheet: number;
    usedWidth: number;
    usedHeight: number;
    placements: LayoutItem[];
    efficiency: number;
    layoutType: string;
}

export interface FullLayoutResult extends LayoutStrategyResult {
    usableWidth: number;
    usableHeight: number;
}

const TOLERANCE = 1e-9;

function emptyResult(): LayoutStrategyResult {
    return {
        itemsPerSheet: 0,
        usedWidth: 0,
        usedHeight: 0,
        efficiency: 0,
        layoutType: 'none',
        placements: []
    };
}

function calculateStrategy(areaW: number, areaH: number, itemW: number, itemH: number, gapH: number, gapV: number, rotated: boolean): LayoutStrategyResult {
    const cols = Math.floor((areaW + gapH) / (itemW + gapH));
    const rows = Math.floor((areaH + gapV) / (itemH + gapV));

    if (cols <= 0 || rows <= 0) return emptyResult();

    const count = cols * rows;
    const usedW = cols * itemW + (cols - 1) * gapH;
    const usedH = rows * itemH + (rows - 1) * gapV;

    const placements: LayoutItem[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            placements.push({
                x: c * (itemW + gapH),
                y: r * (itemH + gapV),
                width: itemW,
                height: itemH,
                rotated: rotated
            });
        }
    }

    return {
        itemsPerSheet: count,
        usedWidth: usedW,
        usedHeight: usedH,
        placements: placements,
        efficiency: Number(((count * itemW * itemH) / (areaW * areaH) * 100).toFixed(2)),
        layoutType: rotated ? 'rotated-grid' : 'grid'
    };
}

function calculateMixedStrategy(areaW: number, areaH: number, mainW: number, mainH: number, gapH: number, gapV: number, mainRotated: boolean): LayoutStrategyResult {
    const mainCols = Math.floor((areaW + gapH) / (mainW + gapH));
    const mainRows = Math.floor((areaH + gapV) / (mainH + gapV));

    if (mainCols <= 0 || mainRows <= 0) return emptyResult();

    const mainCount = mainCols * mainRows;
    const mainUsedW = mainCols * mainW + (mainCols - 1) * gapH;
    const mainUsedH = mainRows * mainH + (mainRows - 1) * gapV;

    const origW = mainRotated ? mainH : mainW;
    const origH = mainRotated ? mainW : mainH;

    let placements: LayoutItem[] = [];
    for (let r = 0; r < mainRows; r++) {
        for (let c = 0; c < mainCols; c++) {
            placements.push({
                x: c * (mainW + gapH),
                y: r * (mainH + gapV),
                width: mainW,
                height: mainH,
                rotated: mainRotated
            });
        }
    }

    const remW = areaW - mainUsedW - gapH;
    const remH = areaH - mainUsedH - gapV;

    let sideCount = 0;
    let sidePlacements: LayoutItem[] = [];

    if (remW > 0) {
        const sideNormal = calculateStrategy(remW, areaH, origW, origH, gapH, gapV, false);
        const sideRotated = calculateStrategy(remW, areaH, origH, origW, gapH, gapV, true);

        if (sideRotated.itemsPerSheet > sideNormal.itemsPerSheet && sideRotated.itemsPerSheet > 0) {
            sideCount = sideRotated.itemsPerSheet;
            sidePlacements = sideRotated.placements.map(p => ({
                ...p,
                x: p.x + mainUsedW + gapH,
                y: p.y
            }));
        } else if (sideNormal.itemsPerSheet > 0) {
            sideCount = sideNormal.itemsPerSheet;
            sidePlacements = sideNormal.placements.map(p => ({
                ...p,
                x: p.x + mainUsedW + gapH,
                y: p.y
            }));
        }
    }

    let bottomCount = 0;
    let bottomPlacements: LayoutItem[] = [];

    if (remH > 0) {
        const bottomNormal = calculateStrategy(areaW, remH, origW, origH, gapH, gapV, false);
        const bottomRotated = calculateStrategy(areaW, remH, origH, origW, gapH, gapV, true);

        if (bottomRotated.itemsPerSheet > bottomNormal.itemsPerSheet && bottomRotated.itemsPerSheet > 0) {
            bottomCount = bottomRotated.itemsPerSheet;
            bottomPlacements = bottomRotated.placements.map(p => ({
                ...p,
                x: p.x,
                y: p.y + mainUsedH + gapV
            }));
        } else if (bottomNormal.itemsPerSheet > 0) {
            bottomCount = bottomNormal.itemsPerSheet;
            bottomPlacements = bottomNormal.placements.map(p => ({
                ...p,
                x: p.x,
                y: p.y + mainUsedH + gapV
            }));
        }
    }

    if (sideCount > bottomCount) {
        return {
            itemsPerSheet: mainCount + sideCount,
            usedWidth: 0, usedHeight: 0, // Ignored in mixed for grouping bounds later
            placements: [...placements, ...sidePlacements],
            efficiency: Number((((mainCount + sideCount) * origW * origH) / (areaW * areaH) * 100).toFixed(2)),
            layoutType: 'mixed-side'
        };
    } else if (bottomCount > 0) {
        return {
            itemsPerSheet: mainCount + bottomCount,
            usedWidth: 0, usedHeight: 0,
            placements: [...placements, ...bottomPlacements],
            efficiency: Number((((mainCount + bottomCount) * origW * origH) / (areaW * areaH) * 100).toFixed(2)),
            layoutType: 'mixed-bottom'
        };
    }

    return {
        itemsPerSheet: mainCount,
        usedWidth: mainUsedW,
        usedHeight: mainUsedH,
        placements: placements,
        efficiency: Number(((mainCount * origW * origH) / (areaW * areaH) * 100).toFixed(2)),
        layoutType: mainRotated ? 'rotated-grid' : 'grid'
    };
}

export function calculateGridLayout(
    paperW: number, paperH: number, 
    ml: number, mr: number, mt: number, mb: number, 
    itemW: number, itemH: number, 
    gapH: number, gapV: number
): FullLayoutResult {
    itemW = Number(itemW) || 0;
    itemH = Number(itemH) || 0;
    gapH = Number(gapH) || 0;
    gapV = Number(gapV) || 0;

    const usableWidth = paperW - ml - mr;
    const usableHeight = paperH - mt - mb;

    if (itemW <= TOLERANCE || itemH <= TOLERANCE ||
        usableWidth < Math.min(itemW, itemH) - TOLERANCE ||
        usableHeight < Math.min(itemW, itemH) - TOLERANCE) {
        return { ...emptyResult(), usableWidth, usableHeight };
    }

    const strategies: LayoutStrategyResult[] = [];

    // 1. Normal Grid
    strategies.push(calculateStrategy(usableWidth, usableHeight, itemW, itemH, gapH, gapV, false));
    // 2. Rotated Grid
    strategies.push(calculateStrategy(usableWidth, usableHeight, itemH, itemW, gapH, gapV, true));
    // 3. Mixed: Normal Main + Rotated Fill
    strategies.push(calculateMixedStrategy(usableWidth, usableHeight, itemW, itemH, gapH, gapV, false));
    // 4. Mixed: Rotated Main + Normal Fill
    strategies.push(calculateMixedStrategy(usableWidth, usableHeight, itemH, itemW, gapH, gapV, true));

    let bestLayout = strategies[0];
    strategies.forEach(s => {
        if (s.itemsPerSheet > bestLayout.itemsPerSheet) {
            bestLayout = s;
        }
    });

    return {
        ...bestLayout,
        usableWidth,
        usableHeight
    };
}

function calculateStaggeredCore(areaW: number, areaH: number, itemW: number, itemH: number, gapH: number, gapV: number, rotated: boolean): LayoutStrategyResult {
    const rx = itemW / 2;
    const ry = itemH / 2;

    if (areaW < itemW || areaH < itemH || itemW <= 0 || itemH <= 0) {
        return emptyResult();
    }

    const stepX = itemW + gapH;
    const stepY = Math.sqrt(3) * (ry + gapV / 2);
    const cols = Math.floor(areaW / stepX);
    const rows = Math.floor(areaH / stepY);

    let placements: LayoutItem[] = [];
    let maxX = 0;
    let maxY = 0;

    for (let row = 0; row <= rows; row++) {
        const isOddRow = row % 2 !== 0;
        const numItemsInRow = isOddRow
            ? Math.floor((areaW - stepX / 2) / stepX)
            : Math.floor(areaW / stepX);

        for (let col = 0; col < numItemsInRow; col++) {
            let cx = col * stepX + rx;
            if (isOddRow) cx += stepX / 2;
            const cy = row * stepY + ry;

            // Boundary check - ensure full item fits inside available area
            if (cx - rx < 0 || cx + rx > areaW || cy - ry < 0 || Math.abs(cy + ry - areaH) <= TOLERANCE && cy + ry > areaH || cy + ry > areaH) {
                continue;
            }

            const x = cx - rx;
            const y = cy - ry;
            
            placements.push({
                x, y,
                width: itemW,
                height: itemH,
                rotated
            });
            
            maxX = Math.max(maxX, x + itemW);
            maxY = Math.max(maxY, y + itemH);
        }
    }

    const count = placements.length;
    return {
        itemsPerSheet: count,
        usedWidth: maxX,
        usedHeight: maxY,
        placements: placements,
        efficiency: Number(((count * itemW * itemH) / (areaW * areaH) * 100).toFixed(2)),
        layoutType: rotated ? 'staggered-rotated' : 'staggered'
    };
}

export function calculateStaggeredLayout(
    paperW: number, paperH: number, 
    ml: number, mr: number, mt: number, mb: number, 
    itemW: number, itemH: number, 
    gapH: number, gapV: number
): FullLayoutResult {
    itemW = Number(itemW) || 0;
    itemH = Number(itemH) || 0;
    gapH = Number(gapH) || 0;
    gapV = Number(gapV) || 0;

    const usableWidth = paperW - ml - mr;
    const usableHeight = paperH - mt - mb;

    if (itemW <= TOLERANCE || itemH <= TOLERANCE ||
        usableWidth < Math.min(itemW, itemH) - TOLERANCE ||
        usableHeight < Math.min(itemW, itemH) - TOLERANCE) {
        return { ...emptyResult(), usableWidth, usableHeight };
    }

    const normal = calculateStaggeredCore(usableWidth, usableHeight, itemW, itemH, gapH, gapV, false);
    const rotated = calculateStaggeredCore(usableWidth, usableHeight, itemH, itemW, gapH, gapV, true);

    const bestLayout = (rotated.itemsPerSheet > normal.itemsPerSheet) ? rotated : normal;

    return {
        ...bestLayout,
        usableWidth,
        usableHeight
    };
}

