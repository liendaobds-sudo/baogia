/**
 * Unit (example) tests cho `imposeUnified` — Imposition_Service.
 *
 * Đây là các CA CỤ THỂ (example-based), bổ trợ cho property tests:
 *   - Ca gripper 12mm trên khổ 79×109 (790×1090mm) → số con/tờ ĐÃ BIẾT (tính tay từ công thức).
 *   - Ca sản phẩm VỪA KHÍT vùng in → đúng 1 con, hướng 0°.
 *   - Ca sản phẩm QUÁ KHỔ (gripper nuốt hết bề cao → vùng in ≤ 0) → ném OffsetPricingError.
 *
 * Công thức tham chiếu (mm nguyên): trên mỗi trục, n = floor((usable + gutter) / (item + gutter)).
 *   usableW = sheetW − left − right
 *   usableH = sheetH − top − bottom − gripper
 *
 * _Requirements: 2.1, 2.5_
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
    //   usableW = 790 − 10 − 10            = 770
    //   usableH = 1090 − 10 − 10 − 12      = 1058
    //   0°:  cols = floor((770+3)/(210+3)) = floor(773/213) = 3
    //        rows = floor((1058+3)/(297+3)) = floor(1061/300) = 3   → 9 con
    //   90°: cols = floor(773/300) = 2, rows = floor(1061/213) = 4  → 8 con
    //   ⇒ chọn 0° (9 ≥ 8), soConToLon = 9.
    const input: ImpositionInput = {
        itemWmm: 210,
        itemHmm: 297,
        sheetWmm: 790,
        sheetHmm: 1090,
        // Khổ bài in = nửa tờ (395×545mm) để kiểm tra soConBaiIn đã biết.
        //   usableW = 395 − 20 = 375, usableH = 545 − 20 − 12 = 513
        //   0°:  floor(378/213)=1 × floor(516/300)=1 = 1
        //   90°: floor(378/300)=1 × floor(516/213)=2 = 2  → soConBaiIn = 2
        pressWmm: 395,
        pressHmm: 545,
        margins: PHYSICAL,
    };

    it('soConToLon = 9 với hướng 0° (gripper 12mm trừ vào bề cao)', () => {
        const r = imposeUnified(input);
        expect(r.soConToLon).toBe(9);
        expect(r.orientation).toBe(0);
    });

    it('soConBaiIn = 2 trên khổ bài in nửa tờ', () => {
        const r = imposeUnified(input);
        expect(r.soConBaiIn).toBe(2);
    });

    it('vùng in khả dụng trừ đúng lề + gripper (usableH = 1090 − 20 − 12 = 1058)', () => {
        const r = imposeUnified(input);
        expect(r.usableArea.width).toBe(770);
        expect(r.usableArea.height).toBe(1058);
    });

    it('số vị trí con trả về bằng số con/tờ lớn (để preview vẽ đúng)', () => {
        const r = imposeUnified(input);
        expect(r.positions).toHaveLength(9);
    });
});

describe('imposeUnified — sản phẩm vừa khít vùng in', () => {
    // Khổ 230×317mm với lề 10 + gripper 12 ⇒ vùng in = 210×285mm.
    // Con đúng bằng vùng in (210×285) ⇒ đúng 1 con, hướng 0°
    //   0°:  floor((210+3)/(210+3)) × floor((285+3)/(285+3)) = 1 × 1 = 1
    //   90°: floor(213/288)=0 ⇒ 0 con
    const input: ImpositionInput = {
        itemWmm: 210,
        itemHmm: 285,
        sheetWmm: 230,
        sheetHmm: 317,
        margins: PHYSICAL,
    };

    it('con lấp đầy vùng in → đúng 1 con, hướng 0°', () => {
        const r = imposeUnified(input);
        expect(r.soConToLon).toBe(1);
        expect(r.orientation).toBe(0);
        expect(r.usableArea).toEqual({ width: 210, height: 285 });
        expect(r.positions).toEqual([{ x: 10, y: 10, w: 210, h: 285 }]);
    });

    it('con lớn hơn vùng in 1mm → 0 con (không vừa khít nữa)', () => {
        const r = imposeUnified({ ...input, itemWmm: 211 });
        expect(r.soConToLon).toBe(0);
    });
});

describe('imposeUnified — sản phẩm quá khổ (vùng in ≤ 0)', () => {
    it('gripper nuốt hết bề cao (usableH ≤ 0) → ném OffsetPricingError', () => {
        const input: ImpositionInput = {
            itemWmm: 50,
            itemHmm: 50,
            sheetWmm: 790,
            sheetHmm: 10, // 10 − 12 (gripper) = −2 ≤ 0
            margins: PHYSICAL,
        };
        expect(() => imposeUnified(input)).toThrow(OffsetPricingError);
        expect(() => imposeUnified(input)).toThrow(/vùng in khả dụng ≤ 0/);
    });

    it('lề trái+phải vượt bề rộng (usableW ≤ 0) → ném OffsetPricingError', () => {
        const input: ImpositionInput = {
            itemWmm: 50,
            itemHmm: 50,
            sheetWmm: 15,
            sheetHmm: 500,
            margins: { left: 10, right: 10, top: 0, bottom: 0, gripper: 0, gutter: 3 },
        };
        expect(() => imposeUnified(input)).toThrow(OffsetPricingError);
    });
});
