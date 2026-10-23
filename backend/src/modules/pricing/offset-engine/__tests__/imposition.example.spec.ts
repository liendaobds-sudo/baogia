/**
 * Unit (example) tests cho `imposeUnified` — Imposition_Service.
 *
 * ─── CẬP NHẬT 2026-08-29 (audit) ───
 * Các con số kỳ vọng dưới đây đã được tính LẠI theo quy ước hình học đã sửa. Ba thay đổi và
 * lý do (chi tiết trong `imposition.ts` → `imposeOnTarget`):
 *
 *  1. **Nhíp ở cạnh DÀI**: tờ được chuẩn hoá về landscape trước khi trừ lề. Trước đây nhíp bị
 *     trừ theo chiều THỨ HAI của chuỗi khổ, nên `790×1090` và `1090×790` — cùng một tờ giấy —
 *     cho số con khác nhau (đo được: 8 vs 6 trên khổ 43×65). Nesting engine (nguồn của preview)
 *     đã ép `sheetOrientation: 'landscape'` từ trước.
 *  2. **`max(bottom, gripper)` thay vì `bottom + gripper`**: dải nhíp CHÍNH LÀ phần lề dưới bị
 *     kẹp; cộng dồn là trừ hai lần cùng một dải giấy.
 *  3. **Snap bảo toàn**: vùng in làm tròn XUỐNG, con làm tròn LÊN (trước đây `Math.round` cả hai
 *     ⇒ số con cao hơn năng lực thật ⇒ giá dưới chi phí).
 *
 * Bằng chứng đây là hướng đúng: `imposition-nesting-parity.spec.ts` chứng minh `imposeUnified`
 * NAY khớp `nestRectOnSheet` trên toàn bộ khổ in của bảng giá — chính là mục tiêu
 * "giá ≡ preview ≡ sản lượng máy in thực tế" của spec offset-imposition-gripper-unification.
 *
 * Công thức tham chiếu (mm nguyên), với `long = max(W,H)`, `short = min(W,H)`:
 *   usableW = floor(long  − left − right)
 *   usableH = floor(short − top  − max(bottom, gripper))
 *   trên mỗi trục: n = floor((usable + gutter) / (item + gutter))
 *
 * _Requirements: 2.1, 2.5, 2.6_
 */
import { imposeUnified, ImpositionInput } from '../imposition';
import { MarginConfig, OffsetPricingError } from '../pricing-data';

/** Margin_Config vật lý chuẩn (mm) — khớp DEFAULT_NESTING_CONFIG: lề 10mm, gripper 12mm, gutter 3mm. */
const PHYSICAL: MarginConfig = {
    left: 10,
    right: 10,
    top: 10,
    bottom: 10,
    gripper: 12,
    gutter: 3,
};

describe('imposeUnified — ca gripper 12mm trên khổ 79×109 (số con đã biết)', () => {
    // Khổ 79×109 cm → 790×1090 mm. Con A4 210×297 mm.
    //   long = 1090, short = 790
    //   usableW = 1090 − 10 − 10                 = 1070
    //   usableH = 790 − 10 − max(10, 12)         = 768
    //   0°:  cols = floor((1070+3)/(210+3)) = floor(1073/213) = 5
    //        rows = floor((768+3)/(297+3))  = floor(771/300)  = 2   → 10 con
    //   90°: cols = floor(1073/300) = 3, rows = floor(771/213) = 3  → 9 con
    //   ⇒ chọn 0° (10 ≥ 9), soConToLon = 10.
    const input: ImpositionInput = {
        itemWmm: 210,
        itemHmm: 297,
        sheetWmm: 790,
        sheetHmm: 1090,
        // Khổ bài in = nửa tờ (395×545mm).
        //   long = 545, short = 395
        //   usableW = 545 − 20 = 525, usableH = 395 − 10 − 12 = 373
        //   0°:  floor(528/213)=2 × floor(376/300)=1 = 2
        //   90°: floor(528/300)=1 × floor(376/213)=1 = 1  → soConBaiIn = 2
        pressWmm: 395,
        pressHmm: 545,
        margins: PHYSICAL,
    };

    it('soConToLon = 10 với hướng 0° (nhíp ở cạnh dài, không cộng dồn lề dưới)', () => {
        const r = imposeUnified(input);
        expect(r.soConToLon).toBe(10);
        expect(r.orientation).toBe(0);
    });

    it('số con KHÔNG đổi khi đảo thứ tự ghi khổ (bất biến trục nhíp)', () => {
        const swapped = imposeUnified({ ...input, sheetWmm: 1090, sheetHmm: 790 });
        expect(swapped.soConToLon).toBe(imposeUnified(input).soConToLon);
    });

    it('soConBaiIn = 2 trên khổ bài in nửa tờ', () => {
        const r = imposeUnified(input);
        expect(r.soConBaiIn).toBe(2);
    });

    it('vùng in khả dụng: 1070 × 768 (nhíp thay lề dưới, không cộng thêm)', () => {
        const r = imposeUnified(input);
        expect(r.usableArea.width).toBe(1070);
        expect(r.usableArea.height).toBe(768);
    });

    it('số vị trí con trả về bằng số con/tờ lớn (để preview vẽ đúng)', () => {
        const r = imposeUnified(input);
        expect(r.positions).toHaveLength(r.soConToLon);
    });
});

describe('imposeUnified — sản phẩm vừa khít vùng in', () => {
    // Muốn vùng in = 210×285mm với PHYSICAL (lề 10, gripper 12):
    //   long  = 210 + left + right          = 230
    //   short = 285 + top + max(bottom,gripper) = 285 + 10 + 12 = 307
    // ⇒ tờ 307×230 (long = 307? không) — chọn tờ sao cho long = 307, short = 230:
    //   usableW = 307 − 20 = 287, usableH = 230 − 22 = 208 ⇒ vùng in 287×208.
    // Để "vừa khít" ta lấy đúng vùng in làm kích thước con: 287×208.
    const input: ImpositionInput = {
        itemWmm: 287,
        itemHmm: 208,
        sheetWmm: 230,
        sheetHmm: 307,
        margins: PHYSICAL,
    };

    it('con lấp đầy vùng in → đúng 1 con, hướng 0°', () => {
        const r = imposeUnified(input);
        expect(r.usableArea).toEqual({ width: 287, height: 208 });
        expect(r.soConToLon).toBe(1);
        expect(r.orientation).toBe(0);
        expect(r.positions).toEqual([{ x: 10, y: 10, w: 287, h: 208 }]);
    });

    it('con lớn hơn vùng in 1mm ở CẢ hai hướng → 0 con', () => {
        const r = imposeUnified({ ...input, itemWmm: 288, itemHmm: 209 });
        expect(r.soConToLon).toBe(0);
    });
});

describe('imposeUnified — sản phẩm quá khổ (vùng in ≤ 0)', () => {
    it('nhíp nuốt hết cạnh ngắn (usableH ≤ 0) → ném OffsetPricingError', () => {
        const input: ImpositionInput = {
            itemWmm: 50,
            itemHmm: 50,
            // short = 10 ⇒ 10 − 10(top) − 12(gripper) < 0
            sheetWmm: 790,
            sheetHmm: 10,
            margins: PHYSICAL,
        };
        expect(() => imposeUnified(input)).toThrow(OffsetPricingError);
        expect(() => imposeUnified(input)).toThrow(/vùng in khả dụng ≤ 0/);
    });

    it('lề trái+phải vượt cạnh dài (usableW ≤ 0) → ném OffsetPricingError', () => {
        const input: ImpositionInput = {
            itemWmm: 50,
            itemHmm: 50,
            // long = 15 ⇒ 15 − 10 − 10 < 0 (short = 8 cũng ≤ 0)
            sheetWmm: 15,
            sheetHmm: 8,
            margins: { left: 10, right: 10, top: 0, bottom: 0, gripper: 0, gutter: 3 },
        };
        expect(() => imposeUnified(input)).toThrow(OffsetPricingError);
    });
});
