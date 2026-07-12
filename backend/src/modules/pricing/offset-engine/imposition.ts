/**
 * Imposition_Service — hàm thuần (PURE), nguồn sự thật DUY NHẤT cho số con/tờ của EngineOffset.
 *
 * Module này KHÔNG có I/O, KHÔNG import DB và KHÔNG gọi `dieline/nesting.ts`; nó nhận tham số
 * đã chuẩn hóa và trả kết quả tất định. Đơn vị nội bộ chuẩn là MILIMET (mm) — chuyển đổi cm→mm
 * đúng một lần ở biên vào (xem `resolveMarginConfig`).
 *
 * Thành phần:
 *   - `resolveMarginConfig` (task 2.1) — suy Margin_Config (mm) cho một Kho_In từ nguồn cấu hình.
 *   - `imposeUnified`        (task 2.3) — mô hình dàn khuôn vật lý có lề/gripper/gutter (bổ sung sau).
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 2.5, 2.6_
 */
import {
    KhoIn,
    MarginConfig,
    OffsetPricingError,
    Params,
} from './pricing-data';

/** Gripper mặc định (cm) khi cả Kho_In lẫn Params đều thiếu — 1.2cm = 12mm (Req 1.3). */
const DEFAULT_GRIPPER_CM = 1.2;
/** Gutter mặc định (cm) khi cả Kho_In lẫn Params đều thiếu — 0.3cm = 3mm (Req 1.3). */
const DEFAULT_GUTTER_CM = 0.3;
/** Hệ số đổi đơn vị cm → mm (Req 1.5). */
const CM_TO_MM = 10;

/** Tập trường Kho_In cần để suy Margin_Config; `khoIn` chỉ dùng cho thông điệp lỗi. */
export type KhoMarginInput = Pick<
    KhoIn,
    | 'khoIn'
    | 'marginLeft'
    | 'marginRight'
    | 'marginTop'
    | 'marginBottom'
    | 'gripperCm'
    | 'gutterCm'
>;

/** Đọc một giá trị cm dạng SỐ hữu hạn; trả `undefined` nếu không phải số (để dùng cùng `??`). */
function cmValue(v: number | string | undefined): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Lấy Margin_Config (mm) cho một Kho_In từ nguồn cấu hình quản trị, áp mặc định gripper/gutter
 * khi thiếu. KHÔNG có hằng số mã hóa cứng nào khác lọt vào (Req 1.1).
 *
 * Quy tắc (Req 1.2, 1.3, 1.5):
 *   - left/right/top/bottom = `kho.margin*` (cm) × 10; cạnh thiếu → 0.
 *   - gripper = (kho.gripperCm ?? params.Gripper_Cm ?? 1.2) × 10.
 *   - gutter  = (kho.gutterCm  ?? params.Gutter_Cm  ?? 0.3) × 10.
 *
 * @throws OffsetPricingError nếu bất kỳ giá trị Margin_Config nào < 0, nêu rõ khổ in + thông số (Req 1.6).
 */
export function resolveMarginConfig(kho: KhoMarginInput, params: Params): MarginConfig {
    const gripperCm = cmValue(kho.gripperCm) ?? cmValue(params.Gripper_Cm) ?? DEFAULT_GRIPPER_CM;
    const gutterCm = cmValue(kho.gutterCm) ?? cmValue(params.Gutter_Cm) ?? DEFAULT_GUTTER_CM;

    const margins: MarginConfig = {
        left: (kho.marginLeft ?? 0) * CM_TO_MM,
        right: (kho.marginRight ?? 0) * CM_TO_MM,
        top: (kho.marginTop ?? 0) * CM_TO_MM,
        bottom: (kho.marginBottom ?? 0) * CM_TO_MM,
        gripper: gripperCm * CM_TO_MM,
        gutter: gutterCm * CM_TO_MM,
    };

    // Req 1.6 — giá trị âm bị từ chối bằng lỗi mô tả rõ khổ in + field sai.
    const khoLabel = kho.khoIn || '(không rõ khổ)';
    (Object.keys(margins) as Array<keyof MarginConfig>).forEach((field) => {
        if (margins[field] < 0) {
            throw new OffsetPricingError(
                `Khổ in ${khoLabel}: thông số lề/gripper/gutter âm: ${field}=${margins[field]}mm`,
            );
        }
    });

    return margins;
}

/* ────────────────────────────────────────────────────────────────────────────
 * imposeUnified (task 2.3) — mô hình dàn khuôn vật lý, snap mm, 2 hướng
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Epsilon snap khi chuyển sang mm nguyên: hấp thụ nhiễu biểu diễn float (vd 43.4999999 → 43.5)
 * trước khi `Math.round`, để cùng input luôn cho cùng số ô bất kể thứ tự phép tính float (Req 2.6, 10.4).
 */
const SNAP_EPS = 1e-6;

/**
 * Chuẩn hóa một độ dài (mm) về SỐ NGUYÊN mm với epsilon snap. Đây là cơ chế tất định cốt lõi:
 * mọi phép `floor` đếm ô sau đó chạy trên số nguyên nên không nhạy thứ tự cộng/trừ float (Req 2.6, 10.4).
 */
function snapMm(v: number): number {
    return Math.round(v + (v >= 0 ? SNAP_EPS : -SNAP_EPS));
}

/** Input cho `imposeUnified` — mọi kích thước theo MILIMET (mm). */
export interface ImpositionInput {
    /** Bề rộng con (mm). */
    itemWmm: number;
    /** Bề cao con (mm). */
    itemHmm: number;
    /** Bề rộng khổ giấy lớn (mm). */
    sheetWmm: number;
    /** Bề cao khổ giấy lớn (mm). */
    sheetHmm: number;
    /** Bề rộng khổ bài in (mm) — để tính `soConBaiIn`; thiếu → chỉ tính `soConToLon`. */
    pressWmm?: number;
    /** Bề cao khổ bài in (mm). */
    pressHmm?: number;
    /** Margin_Config (mm) — lề/gripper/gutter (xem `resolveMarginConfig`). */
    margins: MarginConfig;
}

/** Vị trí một con trên khổ (mm) — để preview vẽ bình bài. */
export interface ItemPosition {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Kết quả `imposeUnified`. */
export interface ImpositionResult {
    /** Số con / tờ giấy lớn (hướng tối ưu). */
    soConToLon: number;
    /** Số con / khổ bài in (0 nếu không cung cấp `pressWmm`/`pressHmm`). */
    soConBaiIn: number;
    /** Hướng đặt con cho kết quả tối ưu trên tờ lớn: 0° hoặc 90°. */
    orientation: 0 | 90;
    /** Vùng in khả dụng của tờ lớn (mm) sau khi trừ lề + gripper. */
    usableArea: { width: number; height: number };
    /** Vị trí các con trên tờ lớn (mm) — theo hướng tối ưu, để preview. */
    positions: ItemPosition[];
    /** Vùng in khả dụng của khổ BÀI IN (mm) sau khi trừ lề + gripper; null nếu không có press. */
    pressUsableArea: { width: number; height: number } | null;
    /** Vị trí các con trên khổ BÀI IN (mm) — cùng công thức với `soConBaiIn`, để preview. */
    pressPositions: ItemPosition[];
}

/** Kết quả xếp con cho MỘT hướng trên một vùng in khả dụng. */
interface OrientationFit {
    count: number;
    cols: number;
    rows: number;
    itemW: number; // bề rộng con theo hướng này (mm nguyên)
    itemH: number; // bề cao con theo hướng này (mm nguyên)
}

/**
 * Đếm số ô trên một trục: số con `n` lớn nhất sao cho `n*item + (n-1)*gutter ≤ usable`
 * ⇔ `n ≤ (usable + gutter) / (item + gutter)`. Mọi tham số là mm nguyên nên `floor` là tất định;
 * `SNAP_EPS` chỉ để hấp thụ nhiễu chia float ở biên.
 */
function countAxis(usableMm: number, itemMm: number, gutterMm: number): number {
    if (itemMm <= 0 || usableMm < itemMm) return 0;
    const n = Math.floor((usableMm + gutterMm) / (itemMm + gutterMm) + SNAP_EPS);
    return n > 0 ? n : 0;
}

/** Xếp con cho một hướng (itemW × itemH) trên vùng in khả dụng (mm nguyên). */
function fitOrientation(
    usableW: number,
    usableH: number,
    itemW: number,
    itemH: number,
    gutter: number,
): OrientationFit {
    const cols = countAxis(usableW, itemW, gutter);
    const rows = countAxis(usableH, itemH, gutter);
    return { count: cols * rows, cols, rows, itemW, itemH };
}

/**
 * Dàn khuôn trên MỘT khổ đích (tờ lớn hoặc bài in): trừ lề (trái+phải khỏi bề rộng,
 * trên+dưới+gripper khỏi bề cao), thử hướng 0° và 90°, chọn hướng nhiều con hơn (tie → 0°).
 *
 * @param throwOnInvalid khi `true` (tờ lớn) → ném `OffsetPricingError` nếu vùng in ≤ 0;
 *   khi `false` (bài in tùy chọn) → trả count 0 thay vì ném.
 */
function imposeOnTarget(
    targetWmm: number,
    targetHmm: number,
    itemWmm: number,
    itemHmm: number,
    margins: MarginConfig,
    throwOnInvalid: boolean,
): { fit: OrientationFit; orientation: 0 | 90; usableW: number; usableH: number } | null {
    const usableW = snapMm(targetWmm - margins.left - margins.right);
    const usableH = snapMm(targetHmm - margins.top - margins.bottom - margins.gripper);

    if (usableW <= 0 || usableH <= 0) {
        if (throwOnInvalid) {
            throw new OffsetPricingError(
                `Khổ in ${targetWmm}×${targetHmm}mm: vùng in khả dụng ≤ 0 sau khi trừ lề/gripper ` +
                    `(usableW=${usableW}mm, usableH=${usableH}mm)`,
            );
        }
        return null;
    }

    const w = snapMm(itemWmm);
    const h = snapMm(itemHmm);
    const gutter = snapMm(margins.gutter);

    const fit0 = fitOrientation(usableW, usableH, w, h, gutter); // 0°
    const fit90 = fitOrientation(usableW, usableH, h, w, gutter); // 90°

    // Chọn hướng nhiều con hơn; hòa → 0° (tất định, Req 2.5).
    const use0 = fit0.count >= fit90.count;
    return {
        fit: use0 ? fit0 : fit90,
        orientation: use0 ? 0 : 90,
        usableW,
        usableH,
    };
}

/** Sinh vị trí các con (mm) cho preview, gốc tại (left, top), bước = item + gutter. */
function buildPositions(
    margins: MarginConfig,
    fit: OrientationFit,
    gutter: number,
): ItemPosition[] {
    const positions: ItemPosition[] = [];
    const startX = margins.left;
    const startY = margins.top;
    for (let r = 0; r < fit.rows; r++) {
        for (let c = 0; c < fit.cols; c++) {
            positions.push({
                x: startX + c * (fit.itemW + gutter),
                y: startY + r * (fit.itemH + gutter),
                w: fit.itemW,
                h: fit.itemH,
            });
        }
    }
    return positions;
}

/**
 * Tính số con/tờ theo mô hình dàn khuôn VẬT LÝ — nguồn sự thật duy nhất cho EngineOffset.
 *
 * - Trừ `left+right` khỏi bề rộng, `top+bottom+gripper` khỏi bề cao (gripper ở MỘT cạnh).
 * - Dùng `gutter` làm khe giữa các con; thử hướng 0° và 90°, chọn nhiều con hơn (tie → 0°).
 * - Tất định: chuẩn hóa mm về số nguyên với epsilon snap trước khi `floor` (Req 2.6, 10.4).
 * - `soConBaiIn` tính tương tự trên `pressWmm/pressHmm`; thiếu → 0.
 *
 * @throws OffsetPricingError nếu vùng in khả dụng của tờ lớn ≤ 0 (Req 1.6).
 */
export function imposeUnified(input: ImpositionInput): ImpositionResult {
    const { itemWmm, itemHmm, sheetWmm, sheetHmm, pressWmm, pressHmm, margins } = input;

    // Tờ giấy lớn — fail fast khi vùng in ≤ 0 (Req 1.6).
    const lon = imposeOnTarget(sheetWmm, sheetHmm, itemWmm, itemHmm, margins, true)!;
    const gutter = snapMm(margins.gutter);

    // Khổ bài in (tùy chọn) — không ném khi vùng in ≤ 0, chỉ trả 0 con.
    let soConBaiIn = 0;
    let pressUsableArea: { width: number; height: number } | null = null;
    let pressPositions: ItemPosition[] = [];
    if (
        typeof pressWmm === 'number' &&
        Number.isFinite(pressWmm) &&
        typeof pressHmm === 'number' &&
        Number.isFinite(pressHmm)
    ) {
        const bai = imposeOnTarget(pressWmm, pressHmm, itemWmm, itemHmm, margins, false);
        if (bai) {
            soConBaiIn = bai.fit.count;
            pressUsableArea = { width: bai.usableW, height: bai.usableH };
            pressPositions = buildPositions(margins, bai.fit, gutter);
        }
    }

    return {
        soConToLon: lon.fit.count,
        soConBaiIn,
        orientation: lon.orientation,
        usableArea: { width: lon.usableW, height: lon.usableH },
        positions: buildPositions(margins, lon.fit, gutter),
        pressUsableArea,
        pressPositions,
    };
}
