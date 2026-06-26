// ============================================================
// Flat shapes — khuôn bế cho sản phẩm "phẳng" KHÔNG thuộc 7 loại hộp engine:
//   • rect     — cắt phẳng (tờ rơi, sản phẩm khác): hình chữ nhật.
//   • envelope — BÌ THƯ: thân + 4 nắp gấp (đường bế CUT + đường cấn CREASE).
//   • folder   — FOLDER/kẹp file: 2 tà gập theo sống lưng + nắp túi đáy.
//
// Trả về { paths, contourD, bbox } khớp định dạng controller dùng để render
// (CUT = nét cắt, CREASE = nét cấn gấp) + nesting (bbox = khổ trải thật).
// Đơn vị mm, hệ trục Y-hướng-lên (giống engine hộp); frontend tự lật Y khi vẽ.
// ============================================================
import { PathSegment, Point2D } from './types';
import { computeBoundingBox } from './utils';

export type FlatShape = 'rect' | 'envelope' | 'folder';

export interface FlatShapeResult {
    paths: PathSegment[];
    contourD: string;
    bbox: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
    standardCode: string;
}

const P = (x: number, y: number): Point2D => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
const cut = (a: Point2D, b: Point2D): PathSegment => ({ points: [a, b], tag: 'CUT', type: 'line' });
const crease = (a: Point2D, b: Point2D): PathSegment => ({ points: [a, b], tag: 'CREASE', type: 'line' });
const contourFrom = (pts: Point2D[]): string => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

/** Hình chữ nhật cắt phẳng (tờ rơi / sản phẩm khác). */
function rectShape(w: number, h: number): FlatShapeResult {
    const paths: PathSegment[] = [
        cut(P(0, 0), P(w, 0)), cut(P(w, 0), P(w, h)), cut(P(w, h), P(0, h)), cut(P(0, h), P(0, 0)),
    ];
    return {
        paths,
        contourD: `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`,
        bbox: { minX: 0, minY: 0, maxX: w, maxY: h, width: w, height: h },
        standardCode: 'CẮT PHẲNG',
    };
}

/**
 * Bì thư — thân (w×h) + 4 nắp gấp hình thang quanh thân.
 *  • Thân = 4 đường CẤN (CREASE) là trục gập của các nắp.
 *  • Nắp trái/phải/đáy/nắp dán = đường CẮT (CUT) hình thang; nắp trên (nắp dán) lớn nhất.
 */
function envelopeShape(w: number, h: number): FlatShapeResult {
    const sf = w * 0.30;          // rộng nắp hông
    const bf = h * 0.42;          // cao nắp đáy
    const tf = h * 0.52;          // cao nắp dán (lớn nhất)
    const tS = h * 0.12;          // vát nắp hông
    const tB = w * 0.12;          // vát nắp đáy
    const tT = w * 0.16;          // vát nắp dán

    // 4 góc thân
    const BL = P(0, 0), BR = P(w, 0), TR = P(w, h), TL = P(0, h);

    const paths: PathSegment[] = [];
    // Thân = 4 đường cấn (trục gập)
    paths.push(crease(BL, BR), crease(BR, TR), crease(TR, TL), crease(TL, BL));
    // Nắp đáy (xuống dưới)
    paths.push(cut(BL, P(tB, -bf)), cut(P(tB, -bf), P(w - tB, -bf)), cut(P(w - tB, -bf), BR));
    // Nắp phải
    paths.push(cut(BR, P(w + sf, tS)), cut(P(w + sf, tS), P(w + sf, h - tS)), cut(P(w + sf, h - tS), TR));
    // Nắp dán (lên trên)
    paths.push(cut(TR, P(w - tT, h + tf)), cut(P(w - tT, h + tf), P(tT, h + tf)), cut(P(tT, h + tf), TL));
    // Nắp trái
    paths.push(cut(TL, P(-sf, h - tS)), cut(P(-sf, h - tS), P(-sf, tS)), cut(P(-sf, tS), BL));

    // Đường viền ngoài (silhouette) để tô nền
    const contour = contourFrom([
        P(tB, -bf), P(w - tB, -bf), BR, P(w + sf, tS), P(w + sf, h - tS), TR,
        P(w - tT, h + tf), P(tT, h + tf), TL, P(-sf, h - tS), P(-sf, tS), BL,
    ]);
    const bb = computeBoundingBox(paths);
    return { paths, contourD: contour, bbox: bb, standardCode: 'BÌ THƯ' };
}

/**
 * Folder / kẹp tài liệu — 2 tà (trái + phải) gập theo SỐNG LƯNG ở giữa + nắp túi đáy của tà trước.
 *  • Tổng khổ trải = 2w (rộng) × h (cao); sống lưng = đường cấn dọc ở x=w.
 *  • Nắp túi (pocket) gập lên từ đáy tà phải.
 */
function folderShape(w: number, h: number): FlatShapeResult {
    const W2 = 2 * w;
    const pf = h * 0.30;          // cao nắp túi đáy
    const gt = w * 0.08;          // tà keo bên hông túi

    const paths: PathSegment[] = [];
    // Khung 2 tà
    paths.push(cut(P(0, 0), P(0, h)), cut(P(0, h), P(W2, h)), cut(P(W2, h), P(W2, 0)));
    // Đáy: tà trái cắt thẳng tới sống lưng, rồi nắp túi gập xuống dưới tà phải
    paths.push(cut(P(0, 0), P(w, 0)));
    paths.push(crease(P(w, 0), P(W2, 0)));                              // mép gập nắp túi
    paths.push(cut(P(w, 0), P(w + gt, -pf)), cut(P(w + gt, -pf), P(W2 - gt, -pf)), cut(P(W2 - gt, -pf), P(W2, 0)));
    // Sống lưng (đường cấn dọc giữa)
    paths.push(crease(P(w, 0), P(w, h)));

    const contour = contourFrom([
        P(0, 0), P(w, 0), P(w + gt, -pf), P(W2 - gt, -pf), P(W2, 0), P(W2, h), P(0, h),
    ]);
    const bb = computeBoundingBox(paths);
    return { paths, contourD: contour, bbox: bb, standardCode: 'FOLDER' };
}

/** Sinh khuôn phẳng theo loại. wMm/hMm là kích thước thành phẩm (mm). */
export function buildFlatShape(shape: FlatShape, wMm: number, hMm: number): FlatShapeResult {
    if (shape === 'envelope') return envelopeShape(wMm, hMm);
    if (shape === 'folder') return folderShape(wMm, hMm);
    return rectShape(wMm, hMm);
}
