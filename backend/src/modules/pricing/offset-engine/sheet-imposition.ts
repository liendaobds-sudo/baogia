/**
 * Sheet imposition — hàm THUẦN tính số con/khổ theo HÌNH HỌC (GĐ B).
 *
 * Thay số tĩnh `so_con_to_lon`/`so_con_bai_in` nhập tay bằng số engine tự tính. Ba mức con,
 * ngữ nghĩa TÁCH BẠCH (xem project_offset_parent_child_sheet_model):
 *   - con/khổ xả     : dàn con (khuôn) lên bài in — CÓ nhíp/lề (tờ vào máy in). Dùng cho luotIn.
 *                      Tính ở nơi có khuôn thật (nestOnSheet), KHÔNG ở đây.
 *   - khổ xả/tờ nhập : `pressPerParent` — cắt tờ nhập ra bài in. KHÔNG nhíp (xả chỉ là cắt).
 *                      Khổ xả ≡ khổ nhập → 1 (in thẳng trên tờ nhập).
 *   - con/tờ nhập    : `conPerParentSheet` = con/khổ xả × khổ xả/tờ nhập. Dùng ĐẾM GIẤY
 *                      (giá = giá tờ nhập × số tờ nhập).
 *
 * Đơn vị: mm. Tất định (floor số nguyên + epsilon snap khe hở).
 */

const SNAP_EPS = 1e-6;

/** Đếm số miếng `n` trên một trục: n*item + (n-1)*gap ≤ avail. */
function countAxis(availMm: number, itemMm: number, gapMm: number): number {
    if (itemMm <= 0 || availMm < itemMm) return 0;
    const n = Math.floor((availMm + gapMm) / (itemMm + gapMm) + SNAP_EPS);
    return n > 0 ? n : 0;
}

/**
 * Số hình chữ nhật `itemW×itemH` xếp được trong khổ `areaW×areaH` — thử 2 hướng, chọn nhiều hơn.
 * `gap` = khe giữa các miếng (mm, mặc định 0). KHÔNG trừ lề/nhíp — caller tự trừ trước nếu cần.
 */
export function countRectInRect(
    itemW: number, itemH: number,
    areaW: number, areaH: number,
    gap = 0,
): number {
    if (itemW <= 0 || itemH <= 0 || areaW <= 0 || areaH <= 0) return 0;
    const fit0 = countAxis(areaW, itemW, gap) * countAxis(areaH, itemH, gap);
    const fit90 = countAxis(areaW, itemH, gap) * countAxis(areaH, itemW, gap);
    return Math.max(fit0, fit90);
}

/**
 * Số bài in (khổ xả) cắt được từ 1 tờ nhập. KHÔNG trừ nhíp (xả = cắt, không in).
 * Khổ xả ≡ khổ nhập (kể cả xoay) → 1 (in thẳng trên tờ nhập, không cắt).
 */
export function pressPerParent(
    pressW: number, pressH: number,
    parentW: number, parentH: number,
    cutGapMm = 0,
): number {
    if (pressW <= 0 || pressH <= 0 || parentW <= 0 || parentH <= 0) return 0;
    // Khổ xả trùng khổ nhập (cùng chiều hoặc xoay) → in thẳng, hệ số 1.
    const same = (pressW === parentW && pressH === parentH) || (pressW === parentH && pressH === parentW);
    if (same) return 1;
    return countRectInRect(pressW, pressH, parentW, parentH, cutGapMm);
}

/** con/tờ nhập = con/khổ xả × khổ xả/tờ nhập. 0 nếu mức nào = 0. */
export function conPerParentSheet(conPerPress: number, pressPerParentSheet: number): number {
    if (conPerPress <= 0 || pressPerParentSheet <= 0) return 0;
    return conPerPress * pressPerParentSheet;
}
