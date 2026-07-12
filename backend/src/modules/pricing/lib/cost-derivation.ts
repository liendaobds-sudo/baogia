/**
 * cost-derivation — suy GIÁ VỐN THUẦN/tờ của định mức in nhanh từ 5 thành phần chi phí (tầng 3).
 *
 * price_per_sheet (giá vốn thuần) = giấy + mực + máy + công + overhead.
 * TUYỆT ĐỐI KHÔNG cộng markup ở đây — markup áp MỘT LẦN ở facade (calculateSellingPrice).
 * Nếu nhét lời vào đây → markup chồng markup (×1.5 ×1.5). Đây là lằn ranh cứng.
 *
 * Máy + công + overhead lấy từ HỒ SƠ CHI PHÍ PER-MÁY (bảng printers, tầng 3), không còn
 * singleton production_costs. Công thức phân bổ giữ nguyên bản gốc (generatePricingTiers):
 *   - máy      = khấu hao/sản lượng tháng + điện/sản lượng giờ
 *   - công     = (số nhân công × lương tháng) / sản lượng tháng
 *   - overhead = (thuê + tiện ích + khác) / sản lượng tháng
 *   - 2 mặt: máy ×1.5, công ×1.3 (giấy/overhead/mực không nhân theo hệ số mặt ở máy/công).
 */

/** Hồ sơ chi phí một máy in (khớp cột printers tầng 3). */
export interface PrinterCostProfile {
    machineValue?: number | null;          // giá máy
    depreciationYears?: number | null;     // số năm khấu hao
    sheetsPerMonth?: number | null;        // sản lượng tháng (tờ) — mẫu số khi cost_basis='sheet'
    electricityPerHour?: number | null;    // điện/giờ
    sheetsPerHour?: number | null;         // sản lượng giờ (tờ) — mẫu số điện khi 'sheet'
    staffCount?: number | null;            // số nhân công
    avgSalaryMonthly?: number | null;      // lương tháng/người
    rentMonthly?: number | null;           // thuê/tháng
    utilitiesMonthly?: number | null;      // tiện ích/tháng
    otherMonthly?: number | null;          // chi phí khác/tháng
    // Khổ lớn (tầng 3, 2026-07-09): mẫu số phân bổ theo m² thay vì tờ.
    sqmPerMonth?: number | null;           // sản lượng tháng (m²) — mẫu số khi cost_basis='sqm'
    sqmPerHour?: number | null;            // sản lượng giờ (m²) — mẫu số điện khi 'sqm'
    costBasis?: string | null;             // 'sheet' | 'sqm' — đơn vị phân bổ chi phí máy/công/overhead
}

/** Cấu hình mực theo loại in (khớp ink_costs). */
export interface InkConfig {
    mlPerSheet?: number | null;   // ml mực / tờ
    pricePerMl?: number | null;   // giá / ml
}

export interface TierCostBreakdown {
    paperCost: number;
    inkCost: number;
    machineCost: number;
    laborCost: number;
    overheadCost: number;
    total: number; // = Σ 5 thành phần (giá vốn thuần, CHƯA markup)
}

const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
    return Number.isFinite(n) ? n : 0;
};

/** Chi phí MÁY/tờ = khấu hao phân bổ theo sản lượng tháng + điện phân bổ theo sản lượng giờ. */
export function machineCostPerSheet(p: PrinterCostProfile): number {
    const machineValue = num(p.machineValue);
    const years = Math.max(1, num(p.depreciationYears) || 1);
    const perMonth = Math.max(1, num(p.sheetsPerMonth) || 1);
    const perHour = Math.max(1, num(p.sheetsPerHour) || 1);
    const depreciation = machineValue / (years * 12) / perMonth;
    const electricity = num(p.electricityPerHour) / perHour;
    return depreciation + electricity;
}

/** Chi phí CÔNG/tờ = (số nhân công × lương tháng) / sản lượng tháng. */
export function laborCostPerSheet(p: PrinterCostProfile): number {
    const perMonth = Math.max(1, num(p.sheetsPerMonth) || 1);
    return (num(p.staffCount) * num(p.avgSalaryMonthly)) / perMonth;
}

/** Chi phí OVERHEAD/tờ = (thuê + tiện ích + khác) / sản lượng tháng. */
export function overheadCostPerSheet(p: PrinterCostProfile): number {
    const perMonth = Math.max(1, num(p.sheetsPerMonth) || 1);
    return (num(p.rentMonthly) + num(p.utilitiesMonthly) + num(p.otherMonthly)) / perMonth;
}

/**
 * Hệ số khổ cho chi phí MỰC — khổ lớn tốn nhiều mực hơn. Bảng cứng theo tên khổ (giữ từ
 * generator gốc: A3=1 làm chuẩn). Không khớp → 1. Tra bằng cách tìm token khổ trong tên
 * (vd "A4 (210×297)" → 'A4'). Chỉ áp cho mực, không cho giấy/máy/công.
 */
const INK_SIZE_FACTORS: Record<string, number> = { A3: 1, A4: 0.5, A5: 0.25, A6: 0.125, B3: 1.1, B4: 0.55 };
export function inkSizeFactor(paperSizeName?: string | null): number {
    if (!paperSizeName) return 1;
    const upper = paperSizeName.toUpperCase();
    for (const key of Object.keys(INK_SIZE_FACTORS)) {
        if (upper.includes(key)) return INK_SIZE_FACTORS[key];
    }
    return 1;
}

/** Chi phí MỰC/tờ = ml/tờ × giá/ml × hệ số khổ × số mặt. */
export function inkCostPerSheet(ink: InkConfig | null | undefined, sizeFactor: number, sides: number): number {
    if (!ink) return 0;
    return num(ink.mlPerSheet) * num(ink.pricePerMl) * (num(sizeFactor) || 1) * (num(sides) || 1);
}

/**
 * Suy giá vốn thuần/tờ từ 5 thành phần. `sides` = 1|2; 2 mặt → máy ×1.5, công ×1.3.
 * Trả breakdown đầy đủ + tổng (KHÔNG markup). Làm tròn 2 số để hiển thị ổn định.
 */
export function deriveTierCost(input: {
    paperCost: number;
    ink?: InkConfig | null;
    printer?: PrinterCostProfile | null;
    sizeFactor?: number;
    sides?: number;
}): TierCostBreakdown {
    const sides = num(input.sides) || 1;
    const paper = num(input.paperCost);
    const ink = inkCostPerSheet(input.ink, input.sizeFactor ?? 1, sides);

    const profile = input.printer || {};
    let machine = machineCostPerSheet(profile);
    let labor = laborCostPerSheet(profile);
    const overhead = overheadCostPerSheet(profile);

    if (sides === 2) { machine *= 1.5; labor *= 1.3; }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const paperR = round2(paper), inkR = round2(ink), machineR = round2(machine), laborR = round2(labor), overheadR = round2(overhead);
    return {
        paperCost: paperR,
        inkCost: inkR,
        machineCost: machineR,
        laborCost: laborR,
        overheadCost: overheadR,
        total: round2(paperR + inkR + machineR + laborR + overheadR),
    };
}

// ════════════════════════════════════════════════════════════════════════
// KHỔ LỚN (tầng 3, 2026-07-09) — suy giá vốn thuần/m² từ 4 thành phần.
//
// Khác in nhanh ở 3 điểm do bản chất khổ lớn:
//   - Mẫu số phân bổ theo M² (sqm_per_month/sqm_per_hour), KHÔNG phải tờ.
//   - KHÔNG có "mực" tách riêng (mực máy phun nằm trong chi phí máy/vật tư).
//   - KHÔNG có hệ số "số mặt" (in 1 mặt bạt/decal).
// Vẫn giữ lằn ranh: KHÔNG markup ở đây (facade lo).
// ════════════════════════════════════════════════════════════════════════

export interface LfCostBreakdown {
    materialCost: number;
    machineCost: number;
    laborCost: number;
    overheadCost: number;
    total: number; // = Σ 4 thành phần / m² (giá vốn thuần, CHƯA markup)
}

/** Chi phí MÁY/m² = khấu hao phân bổ theo sản lượng tháng (m²) + điện phân bổ theo sản lượng giờ (m²). */
export function machineCostPerSqm(p: PrinterCostProfile): number {
    const machineValue = num(p.machineValue);
    const years = Math.max(1, num(p.depreciationYears) || 1);
    const perMonth = Math.max(1, num(p.sqmPerMonth) || 1);
    const perHour = Math.max(1, num(p.sqmPerHour) || 1);
    const depreciation = machineValue / (years * 12) / perMonth;
    const electricity = num(p.electricityPerHour) / perHour;
    return depreciation + electricity;
}

/** Chi phí CÔNG/m² = (số nhân công × lương tháng) / sản lượng tháng (m²). */
export function laborCostPerSqm(p: PrinterCostProfile): number {
    const perMonth = Math.max(1, num(p.sqmPerMonth) || 1);
    return (num(p.staffCount) * num(p.avgSalaryMonthly)) / perMonth;
}

/** Chi phí OVERHEAD/m² = (thuê + tiện ích + khác) / sản lượng tháng (m²). */
export function overheadCostPerSqm(p: PrinterCostProfile): number {
    const perMonth = Math.max(1, num(p.sqmPerMonth) || 1);
    return (num(p.rentMonthly) + num(p.utilitiesMonthly) + num(p.otherMonthly)) / perMonth;
}

/**
 * Suy giá vốn thuần/m² từ 4 thành phần (vật liệu + máy + công + overhead). KHÔNG mực, KHÔNG
 * số mặt, KHÔNG markup. `materialCost` = giá vốn vật liệu/m² (từ materials.cost_price, base m²).
 */
export function deriveLfCost(input: {
    materialCost: number;
    printer?: PrinterCostProfile | null;
}): LfCostBreakdown {
    const material = num(input.materialCost);
    const profile = input.printer || {};
    const machine = machineCostPerSqm(profile);
    const labor = laborCostPerSqm(profile);
    const overhead = overheadCostPerSqm(profile);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const materialR = round2(material), machineR = round2(machine), laborR = round2(labor), overheadR = round2(overhead);
    return {
        materialCost: materialR,
        machineCost: machineR,
        laborCost: laborR,
        overheadCost: overheadR,
        total: round2(materialR + machineR + laborR + overheadR),
    };
}
