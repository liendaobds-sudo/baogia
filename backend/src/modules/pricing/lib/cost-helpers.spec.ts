import { computeConversionFactor, weightedAvgCost, baseUnitOf } from './cost-helpers';

describe('weightedAvgCost', () => {
    it('bình quân 2 lô giá khác nhau', () => {
        // 100 tờ @ 1000 + 100 tờ @ 2000 = 200 tờ @ 1500
        expect(weightedAvgCost(1000, 100, 2000, 100)).toBe(1500);
    });

    it('tồn cũ 0 → lấy giá lô mới', () => {
        expect(weightedAvgCost(0, 0, 1800, 500)).toBe(1800);
    });

    it('tổng SL ≤ 0 → trả giá mới (không chia 0)', () => {
        expect(weightedAvgCost(1000, -50, 2000, 0)).toBe(2000);
    });

    it('làm tròn 2 chữ số', () => {
        // (1000×3 + 1500×1) / 4 = 1125
        expect(weightedAvgCost(1000, 3, 1500, 1)).toBe(1125);
    });
});

describe('baseUnitOf', () => {
    it('roll → sqm, còn lại → sheet', () => {
        expect(baseUnitOf('roll')).toBe('sqm');
        expect(baseUnitOf('sheet')).toBe('sheet');
        expect(baseUnitOf(null)).toBe('sheet');
    });
});

describe('computeConversionFactor', () => {
    const sheetMat = { materialFormat: 'sheet', gsm: 300, width: 650, height: 860 };
    const rollMat = { materialFormat: 'roll', rollWidth: 1.52, rollLength: 50 };

    it('mua thẳng theo tờ → factor 1', () => {
        expect(computeConversionFactor(sheetMat, 'sheet').factor).toBe(1);
        expect(computeConversionFactor(sheetMat, 'tờ').factor).toBe(1);
    });

    it('ram → tờ: mặc định 500', () => {
        expect(computeConversionFactor(sheetMat, 'ram').factor).toBe(500);
    });

    it('ram → tờ: override người dùng gõ', () => {
        expect(computeConversionFactor(sheetMat, 'ram', 250).factor).toBe(250);
    });

    it('kg → tờ: suy từ gsm × khổ tờ', () => {
        // 1 tờ 650×860mm @300gsm = 300 × 0.65 × 0.86 / 1000 = 0.16770 kg
        // factor = 1 / 0.16770 ≈ 5.9631
        const r = computeConversionFactor(sheetMat, 'kg');
        expect(r.error).toBeUndefined();
        expect(r.factor).toBeCloseTo(5.9631, 3);
    });

    it('kg → tờ: thiếu gsm → error', () => {
        const r = computeConversionFactor({ materialFormat: 'sheet', width: 650, height: 860 }, 'kg');
        expect(r.factor).toBe(0);
        expect(r.error).toBeTruthy();
    });

    it('cuộn → m²: khổ cuộn × chiều dài', () => {
        // 1.52m × 50m = 76 m²
        expect(computeConversionFactor(rollMat, 'roll').factor).toBeCloseTo(76, 6);
    });

    it('cuộn → m²: thiếu chiều dài → error', () => {
        const r = computeConversionFactor({ materialFormat: 'roll', rollWidth: 1.52 }, 'roll');
        expect(r.factor).toBe(0);
        expect(r.error).toBeTruthy();
    });

    it('mét → m²: chỉ cần khổ cuộn', () => {
        expect(computeConversionFactor(rollMat, 'met').factor).toBeCloseTo(1.52, 6);
    });

    it('đơn vị lạ → factor 1 (mua thẳng ĐV cơ sở)', () => {
        expect(computeConversionFactor(sheetMat, 'thùng').factor).toBe(1);
    });
});
