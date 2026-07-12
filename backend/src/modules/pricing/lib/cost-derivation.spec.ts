/**
 * Test helper thuần cost-derivation (tầng 3): suy giá vốn thuần/tờ từ 5 thành phần.
 * Khẳng định: từng thành phần đúng công thức phân bổ, 2 mặt ×1.5 máy / ×1.3 công,
 * tổng = Σ5, và TUYỆT ĐỐI không có markup (tổng == cộng thô, không nhân %).
 *
 * Run: npx jest --testPathPatterns=cost-derivation.spec
 */

import {
    machineCostPerSheet,
    laborCostPerSheet,
    overheadCostPerSheet,
    inkCostPerSheet,
    deriveTierCost,
    machineCostPerSqm,
    laborCostPerSqm,
    overheadCostPerSqm,
    deriveLfCost,
    inkSizeFactor,
    PrinterCostProfile,
} from './cost-derivation';

// Hồ sơ máy mẫu — số tròn để tính tay dễ.
const profile: PrinterCostProfile = {
    machineValue: 1_200_000_000,   // 1.2 tỷ
    depreciationYears: 5,
    sheetsPerMonth: 100_000,
    electricityPerHour: 50_000,
    sheetsPerHour: 1_000,
    staffCount: 3,
    avgSalaryMonthly: 12_000_000,
    rentMonthly: 20_000_000,
    utilitiesMonthly: 5_000_000,
    otherMonthly: 5_000_000,
};

describe('cost-derivation — thành phần chi phí/tờ', () => {
    it('machineCostPerSheet = khấu hao/sản-lượng-tháng + điện/sản-lượng-giờ', () => {
        // khấu hao = 1.2tỷ / (5×12) / 100000 = 1.2e9/60/1e5 = 200
        // điện     = 50000 / 1000 = 50
        expect(machineCostPerSheet(profile)).toBeCloseTo(250, 6);
    });

    it('laborCostPerSheet = (staff × lương) / sản-lượng-tháng', () => {
        // (3 × 12tr) / 100000 = 36e6/1e5 = 360
        expect(laborCostPerSheet(profile)).toBeCloseTo(360, 6);
    });

    it('overheadCostPerSheet = (thuê+tiện ích+khác) / sản-lượng-tháng', () => {
        // (20+5+5)tr / 100000 = 30e6/1e5 = 300
        expect(overheadCostPerSheet(profile)).toBeCloseTo(300, 6);
    });

    it('inkCostPerSheet = ml/tờ × giá/ml × hệ số khổ × số mặt', () => {
        // 0.5 × 500 × 1 × 2 = 500
        expect(inkCostPerSheet({ mlPerSheet: 0.5, pricePerMl: 500 }, 1, 2)).toBeCloseTo(500, 6);
    });

    it('ink null → 0', () => {
        expect(inkCostPerSheet(null, 1, 2)).toBe(0);
    });

    it('sản lượng 0 → không chia cho 0 (kẹp về 1), không NaN/Infinity', () => {
        const bad: PrinterCostProfile = { ...profile, sheetsPerMonth: 0, sheetsPerHour: 0 };
        expect(Number.isFinite(machineCostPerSheet(bad))).toBe(true);
        expect(Number.isFinite(laborCostPerSheet(bad))).toBe(true);
        expect(Number.isFinite(overheadCostPerSheet(bad))).toBe(true);
    });
});

describe('deriveTierCost — tổng 5 thành phần, không markup', () => {
    it('1 mặt: tổng = giấy + mực + máy + công + overhead', () => {
        const r = deriveTierCost({
            paperCost: 300,
            ink: { mlPerSheet: 0.5, pricePerMl: 500 },
            printer: profile,
            sizeFactor: 1,
            sides: 1,
        });
        // giấy 300, mực 0.5×500×1×1=250, máy 250, công 360, overhead 300
        expect(r.paperCost).toBeCloseTo(300, 6);
        expect(r.inkCost).toBeCloseTo(250, 6);
        expect(r.machineCost).toBeCloseTo(250, 6);
        expect(r.laborCost).toBeCloseTo(360, 6);
        expect(r.overheadCost).toBeCloseTo(300, 6);
        expect(r.total).toBeCloseTo(1460, 6);
        // Không markup: tổng đúng bằng cộng thô 5 thành phần.
        expect(r.total).toBeCloseTo(r.paperCost + r.inkCost + r.machineCost + r.laborCost + r.overheadCost, 6);
    });

    it('2 mặt: máy ×1.5, công ×1.3, mực ×2 (số mặt); giấy/overhead giữ nguyên', () => {
        const r = deriveTierCost({
            paperCost: 300,
            ink: { mlPerSheet: 0.5, pricePerMl: 500 },
            printer: profile,
            sizeFactor: 1,
            sides: 2,
        });
        // mực 0.5×500×1×2 = 500; máy 250×1.5=375; công 360×1.3=468; overhead 300; giấy 300
        expect(r.inkCost).toBeCloseTo(500, 6);
        expect(r.machineCost).toBeCloseTo(375, 6);
        expect(r.laborCost).toBeCloseTo(468, 6);
        expect(r.overheadCost).toBeCloseTo(300, 6);
        expect(r.total).toBeCloseTo(300 + 500 + 375 + 468 + 300, 6);
    });

    it('không có máy (printer null) → máy/công/overhead = 0, tổng = giấy + mực', () => {
        const r = deriveTierCost({ paperCost: 300, ink: { mlPerSheet: 0.5, pricePerMl: 500 }, sides: 1 });
        expect(r.machineCost).toBe(0);
        expect(r.laborCost).toBe(0);
        expect(r.overheadCost).toBe(0);
        expect(r.total).toBeCloseTo(550, 6); // 300 + 250
    });

    it('chỉ giấy (không mực, không máy) → tổng = giấy', () => {
        const r = deriveTierCost({ paperCost: 420, sides: 1 });
        expect(r.total).toBeCloseTo(420, 6);
    });
});

// ── Khổ lớn: mẫu số m², 4 thành phần, không mực/không số mặt ──

// Hồ sơ máy khổ lớn: sản lượng đo theo m² (sqm_per_month/hour), số tròn để tính tay.
const lfProfile: PrinterCostProfile = {
    machineValue: 600_000_000,   // 600tr
    depreciationYears: 5,
    sqmPerMonth: 10_000,          // 10.000 m²/tháng
    electricityPerHour: 30_000,
    sqmPerHour: 50,               // 50 m²/giờ
    staffCount: 2,
    avgSalaryMonthly: 10_000_000,
    rentMonthly: 15_000_000,
    utilitiesMonthly: 3_000_000,
    otherMonthly: 2_000_000,
    costBasis: 'sqm',
};

describe('cost-derivation khổ lớn — thành phần/m²', () => {
    it('machineCostPerSqm = khấu hao/sản-lượng-tháng-m² + điện/sản-lượng-giờ-m²', () => {
        // khấu hao = 600tr / (5×12) / 10000 = 6e8/60/1e4 = 1000
        // điện     = 30000 / 50 = 600
        expect(machineCostPerSqm(lfProfile)).toBeCloseTo(1600, 6);
    });

    it('laborCostPerSqm = (staff × lương) / sản-lượng-tháng-m²', () => {
        // (2 × 10tr) / 10000 = 2e7/1e4 = 2000
        expect(laborCostPerSqm(lfProfile)).toBeCloseTo(2000, 6);
    });

    it('overheadCostPerSqm = (thuê+tiện ích+khác) / sản-lượng-tháng-m²', () => {
        // (15+3+2)tr / 10000 = 2e7/1e4 = 2000
        expect(overheadCostPerSqm(lfProfile)).toBeCloseTo(2000, 6);
    });

    it('sản lượng m² = 0 → không chia 0 (kẹp về 1), không NaN', () => {
        const bad: PrinterCostProfile = { ...lfProfile, sqmPerMonth: 0, sqmPerHour: 0 };
        expect(Number.isFinite(machineCostPerSqm(bad))).toBe(true);
        expect(Number.isFinite(laborCostPerSqm(bad))).toBe(true);
        expect(Number.isFinite(overheadCostPerSqm(bad))).toBe(true);
    });
});

describe('deriveLfCost — tổng 4 thành phần/m², không markup', () => {
    it('tổng = vật liệu + máy + công + overhead', () => {
        const r = deriveLfCost({ materialCost: 5000, printer: lfProfile });
        // vật liệu 5000, máy 1600, công 2000, overhead 2000
        expect(r.materialCost).toBeCloseTo(5000, 6);
        expect(r.machineCost).toBeCloseTo(1600, 6);
        expect(r.laborCost).toBeCloseTo(2000, 6);
        expect(r.overheadCost).toBeCloseTo(2000, 6);
        expect(r.total).toBeCloseTo(10600, 6);
        // Không markup: tổng = cộng thô 4 thành phần.
        expect(r.total).toBeCloseTo(r.materialCost + r.machineCost + r.laborCost + r.overheadCost, 6);
    });

    it('không có máy (printer null) → chỉ vật liệu', () => {
        const r = deriveLfCost({ materialCost: 5000 });
        expect(r.machineCost).toBe(0);
        expect(r.laborCost).toBe(0);
        expect(r.overheadCost).toBe(0);
        expect(r.total).toBeCloseTo(5000, 6);
    });
});

// ── inkSizeFactor: bảng hệ số khổ cho mực (A3=1 chuẩn). Trước chỉ chạm gián tiếp A4 qua suggest. ──
describe('inkSizeFactor — tra hệ số khổ theo tên', () => {
    it('các khổ chuẩn: A3=1, A4=0.5, A5=0.25, A6=0.125, B3=1.1, B4=0.55', () => {
        expect(inkSizeFactor('A3')).toBeCloseTo(1, 6);
        expect(inkSizeFactor('A4')).toBeCloseTo(0.5, 6);
        expect(inkSizeFactor('A5')).toBeCloseTo(0.25, 6);
        expect(inkSizeFactor('A6')).toBeCloseTo(0.125, 6);
        expect(inkSizeFactor('B3')).toBeCloseTo(1.1, 6);
        expect(inkSizeFactor('B4')).toBeCloseTo(0.55, 6);
    });

    it('tìm token khổ TRONG tên đầy đủ (vd "A4 (210×297)") → 0.5', () => {
        expect(inkSizeFactor('A4 (210×297)')).toBeCloseTo(0.5, 6);
        expect(inkSizeFactor('Khổ A3 SRA3')).toBeCloseTo(1, 6);
    });

    it('không khớp khổ nào / null → mặc định 1', () => {
        expect(inkSizeFactor('Khổ lạ')).toBeCloseTo(1, 6);
        expect(inkSizeFactor(null)).toBeCloseTo(1, 6);
        expect(inkSizeFactor(undefined)).toBeCloseTo(1, 6);
        expect(inkSizeFactor('')).toBeCloseTo(1, 6);
    });
});
