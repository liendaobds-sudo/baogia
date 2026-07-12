/**
 * cost-helpers — quy đổi đơn vị MUA → đơn vị CƠ SỞ của vật tư, cho luồng nhập kho.
 *
 * Ngành in mua theo LÔ (ram/kg/cuộn), nhưng giá vốn + tồn kho tính theo ĐƠN VỊ CƠ SỞ
 * (tờ cho vật tư `sheet`, m² cho vật tư `roll`). Helper này ra `conversion_factor` =
 * số đơn vị cơ sở trong 1 đơn vị mua, để: quantity_cơ_sở = purchase_qty × factor,
 * và unit_cost_base = giá_lô ÷ factor.
 *
 * Một khung, nguồn hệ số khác nhau:
 *   - ram → tờ:   hệ số cố định, nhập tay (mặc định 500). Không suy được từ vật tư.
 *   - kg → tờ:    suy từ gsm + khổ tờ: 1 tờ nặng (gsm × dài_m × rộng_m / 1000) kg
 *                 → factor = 1 / khối_lượng_1_tờ.
 *   - cuộn → m²:  suy từ khổ cuộn: 1 cuộn = roll_width(m) × roll_length(m) m².
 *   - mét → m²:   suy từ khổ cuộn: 1 mét dài = roll_width(m) × 1 m².
 *   - mua thẳng theo ĐV cơ sở (sheet/sqm): factor = 1 (giữ hành vi cũ).
 */

export interface ConversionMaterialFields {
    materialFormat?: string | null; // 'sheet' | 'roll'
    gsm?: number | null;
    width?: number | null;  // mm (khổ tờ)
    height?: number | null; // mm (khổ tờ)
    rollWidth?: number | null;  // m (khổ cuộn)
    rollLength?: number | null; // m (chiều dài cuộn)
}

export interface ConversionResult {
    factor: number;      // số ĐV cơ sở / 1 ĐV mua
    baseUnit: 'sheet' | 'sqm';
    error?: string;      // lý do không suy được factor (thiếu gsm/khổ...)
}

/** Đơn vị cơ sở theo dạng vật tư. */
export function baseUnitOf(materialFormat?: string | null): 'sheet' | 'sqm' {
    return materialFormat === 'roll' ? 'sqm' : 'sheet';
}

/**
 * Giá vốn bình quân gia quyền: (giá_cũ×SL_cũ + giá_mới×SL_mới) / tổng_SL, làm tròn 2 số.
 * Tổng SL ≤ 0 → trả giá mới (không có tồn cũ để bình quân). Nguồn công thức duy nhất —
 * `pricing.service.calculateWeightedAvgCost` delegate về đây để không trùng lặp.
 */
export function weightedAvgCost(oldCost: number, oldQty: number, newPrice: number, newQty: number): number {
    const totalQty = oldQty + newQty;
    if (totalQty <= 0) return newPrice;
    const totalValue = (oldCost * oldQty) + (newPrice * newQty);
    return Math.round((totalValue / totalQty) * 100) / 100;
}

/**
 * Tính hệ số quy đổi. `factorOverride` chỉ dùng cho ram (hệ số cố định người dùng gõ);
 * kg/cuộn/mét luôn tự suy từ vật tư (không tin override để tránh lệch).
 */
export function computeConversionFactor(
    material: ConversionMaterialFields,
    purchaseUnit: string,
    factorOverride?: number | null,
): ConversionResult {
    const baseUnit = baseUnitOf(material.materialFormat);
    const unit = (purchaseUnit || '').toLowerCase().trim();

    // Mua thẳng theo đơn vị cơ sở.
    if (unit === 'sheet' || unit === 'tờ' || unit === 'to') return { factor: 1, baseUnit };
    if (unit === 'sqm' || unit === 'm2' || unit === 'm²') return { factor: 1, baseUnit };

    // Ram → tờ: hệ số cố định (nhập tay, mặc định 500).
    if (unit === 'ram' || unit === 'ream') {
        const f = factorOverride && factorOverride > 0 ? factorOverride : 500;
        return { factor: f, baseUnit: 'sheet' };
    }

    // Kg → tờ: suy từ gsm + khổ tờ.
    if (unit === 'kg') {
        const gsm = Number(material.gsm) || 0;
        const wMm = Number(material.width) || 0;
        const hMm = Number(material.height) || 0;
        if (gsm <= 0 || wMm <= 0 || hMm <= 0) {
            return { factor: 0, baseUnit: 'sheet', error: 'Cần gsm + khổ tờ (rộng/cao) để quy đổi kg → tờ.' };
        }
        // Khối lượng 1 tờ (kg) = gsm(g/m²) × diện tích(m²) / 1000. Diện tích = (w/1000)×(h/1000).
        const areaM2 = (wMm / 1000) * (hMm / 1000);
        const kgPerSheet = (gsm * areaM2) / 1000;
        if (kgPerSheet <= 0) return { factor: 0, baseUnit: 'sheet', error: 'Khối lượng tờ tính ra 0.' };
        return { factor: 1 / kgPerSheet, baseUnit: 'sheet' };
    }

    // Cuộn → m²: diện tích 1 cuộn = khổ cuộn × chiều dài.
    if (unit === 'roll' || unit === 'cuộn' || unit === 'cuon') {
        const w = Number(material.rollWidth) || 0;
        const l = Number(material.rollLength) || 0;
        if (w <= 0 || l <= 0) {
            return { factor: 0, baseUnit: 'sqm', error: 'Cần khổ cuộn + chiều dài cuộn để quy đổi cuộn → m².' };
        }
        return { factor: w * l, baseUnit: 'sqm' };
    }

    // Mét dài → m²: chỉ cần khổ cuộn.
    if (unit === 'met' || unit === 'mét' || unit === 'm') {
        const w = Number(material.rollWidth) || 0;
        if (w <= 0) return { factor: 0, baseUnit: 'sqm', error: 'Cần khổ cuộn để quy đổi mét → m².' };
        return { factor: w, baseUnit: 'sqm' };
    }

    // Đơn vị lạ → không quy đổi (factor 1), coi như mua thẳng ĐV cơ sở.
    return { factor: 1, baseUnit };
}
