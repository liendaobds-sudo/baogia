// ============================================================
// Nesting wrapper — dàn khuôn bế lên khổ in (bình bản thông minh).
// Bọc calculateNesting (port từ printsolutions) để dùng cho tính giá offset
// (số con/tờ tối ưu) + preview (vị trí từng khuôn trên tờ).
// ============================================================
import { BoxParams, DEFAULT_PARAMS } from './types';
import { computeBoundingBox } from './utils';
import { generateDieline } from './flat-dieline';
import { calculateNesting } from './nestingEngine';
import { NestingConfig, DEFAULT_NESTING_CONFIG, NestingResult } from './nestingTypes';

export interface DielineNesting extends NestingResult {
    /** Bounding box khuôn (mm) trong toạ độ gốc khuôn — để frontend vẽ paths. */
    bbox: { minX: number; minY: number; width: number; height: number };
}

/**
 * Dàn khuôn (boxType + L/W/D mm) lên một khổ in (mm) bằng nesting thông minh.
 * Trả số con/tờ + vị trí từng khuôn + bbox khuôn. Dùng chung cho giá & preview.
 */
export function nestOnSheet(
    params: Partial<BoxParams>,
    sheetWmm: number,
    sheetHmm: number,
    overrides: Partial<NestingConfig> = {},
): DielineNesting {
    const full = { ...DEFAULT_PARAMS, ...params } as BoxParams;
    const model = generateDieline(full);
    const bb = computeBoundingBox(model.allPaths);
    const config: NestingConfig = {
        ...DEFAULT_NESTING_CONFIG,
        sheet: { width: sheetWmm, height: sheetHmm },
        nestingMode: 'smart',
        // Nhíp (cắn nhíp) nằm ở cạnh ĐÁY → ép tờ giấy nằm ngang (rộng = cạnh dài)
        // để nhíp LUÔN ở cạnh dài, không đổi hướng lung tung. Khuôn vẫn được xoay để tối ưu số con.
        sheetOrientation: 'landscape',
        ...overrides,
    };
    const res = calculateNesting({ width: bb.width, height: bb.height }, config, full);
    return { ...res, bbox: { minX: bb.minX, minY: bb.minY, width: bb.width, height: bb.height } };
}

export { calculateNesting } from './nestingEngine';
export type { NestingResult, PlacedDieline, NestingConfig } from './nestingTypes';
export { DEFAULT_NESTING_CONFIG, SHEET_PRESETS } from './nestingTypes';

/**
 * Dàn 1 HÌNH CHỮ NHẬT (sản phẩm phẳng: tờ rơi/bì thư/sp khác/túi) lên khổ in.
 * Dùng nesting lưới (grid, tự xoay 0°/90°), nhíp ở cạnh dài (landscape).
 */
export function nestRectOnSheet(
    itemWmm: number,
    itemHmm: number,
    sheetWmm: number,
    sheetHmm: number,
    overrides: Partial<NestingConfig> = {},
): DielineNesting {
    const config: NestingConfig = {
        ...DEFAULT_NESTING_CONFIG,
        sheet: { width: sheetWmm, height: sheetHmm },
        nestingMode: 'grid',
        rotation: 'auto',
        sheetOrientation: 'landscape',
        ...overrides,
    };
    const res = calculateNesting({ width: itemWmm, height: itemHmm }, config);
    return { ...res, bbox: { minX: 0, minY: 0, width: itemWmm, height: itemHmm } };
}
