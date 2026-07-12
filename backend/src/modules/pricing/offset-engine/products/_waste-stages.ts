/**
 * Helper dùng chung cho các sản phẩm offset (bù hao theo công đoạn).
 *
 * MỖI CÔNG ĐOẠN có bảng MỐC SỐ LƯỢNG RIÊNG (số lượng → % hao) + makeready riêng — KHÔNG dùng
 * một đường cong chung. Tra tỉ lệ theo mốc lớn nhất ≤ số lượng đơn (giống bậc giá).
 *
 * Mặc định khi công đoạn chưa cấu hình:
 *  - IN: makeready 100 tờ, tỉ lệ chạy theo đường cong `tyLe.haoHut` (để không vỡ hành vi cũ).
 *  - Các công đoạn khác: 0 (chỉ tính khi admin nhập bảng mốc cho công đoạn đó).
 *
 * Giữ NGUYÊN ngữ nghĩa giá từng dòng như V1; chỉ thay SỐ LƯỢNG bằng số lượng đã cascade.
 *
 * _Tài liệu: docs/offset-waste-model.md_
 */
import { PricingData, GiaCongTier, WasteStageConfig, QuoteLine, numParam } from '../pricing-data';
import { pickRate, haoHut as haoHutCurve } from '../lookups';
import { StageWaste, cascadeProduct, qtyOf } from '../waste-cascade';

export const IN_DEFAULT_MAKEREADY = 100;

const stageCfg = (d: PricingData, code: string): WasteStageConfig | undefined => d.wasteStages?.[code];

/** Makeready (số cố định) của công đoạn; mặc định `def`. */
export function stageMakeready(d: PricingData, code: string, def = 0): number {
    const c = stageCfg(d, code);
    return c && Number.isFinite(c.makeready) ? c.makeready : def;
}

/**
 * Tỉ lệ hao của một công đoạn tại số lượng `sl`, tra theo BẢNG MỐC RIÊNG của công đoạn.
 * Mốc lớn nhất ≤ sl. Nếu công đoạn chưa có bảng: IN → đường cong haoHut; còn lại → 0.
 */
export function wasteRate(d: PricingData, code: string, sl: number): number {
    const c = stageCfg(d, code);
    if (c?.tiers?.length) {
        const sorted = [...c.tiers].sort((a, b) => a.from - b.from);
        let rate = sorted[0].rate;
        for (const t of sorted) if (sl >= t.from) rate = t.rate;
        return rate > 0 ? rate : 0;
    }
    return code === 'IN' ? haoHutCurve(sl, d) : 0;
}

/** Chuỗi công đoạn theo TỜ: pha giấy → in → cán (mỗi công đoạn tra bảng mốc riêng). */
export function sheetStages(d: PricingData, sl: number): StageWaste[] {
    return [
        { code: 'GIAY', basis: 'sheet', makeready: 0, rate: 0 },
        { code: 'IN', basis: 'sheet', makeready: stageMakeready(d, 'IN', IN_DEFAULT_MAKEREADY), rate: wasteRate(d, 'IN', sl) },
        { code: 'CAN', basis: 'sheet', makeready: stageMakeready(d, 'CAN', 0), rate: wasteRate(d, 'CAN', sl) },
    ];
}

/** Một công đoạn 'piece' (bế/dán/gấp/cắt/đóng gói/XLBM) — tra bảng mốc riêng theo `code`. */
export const pieceStage = (d: PricingData, sl: number, code: string): StageWaste => ({
    code,
    basis: 'piece',
    makeready: stageMakeready(d, code, 0),
    rate: wasteRate(d, code, sl),
});

/** Basis hiệu lực của công đoạn: ưu tiên cấu hình người dùng, nếu thiếu dùng `defaultBasis`. */
export function effectiveBasis(d: PricingData, code: string, defaultBasis: 'sheet' | 'piece'): 'sheet' | 'piece' {
    const b = stageCfg(d, code)?.basis;
    return b === 'sheet' || b === 'piece' ? b : defaultBasis;
}

/** Định nghĩa công đoạn của một sản phẩm (theo THỨ TỰ SẢN XUẤT) + basis mặc định. */
export interface StageDef { code: string; defaultBasis: 'sheet' | 'piece'; }

export interface WasteBuildResult {
    sheetsGross: number;
    sheetsNet: number;
    /** qtyIn của một công đoạn (tra cả 2 chuỗi tờ/con); 0 nếu không có. */
    q: (code: string) => number;
}

/**
 * Dựng cascade cho sản phẩm với basis ĐỘNG theo cấu hình người dùng.
 * - Luôn có công đoạn GIAY (theo tờ) ở đầu chuỗi tờ → qtyIn = số tờ phải mua (sheetsGross).
 * - Mỗi công đoạn trong `defs` được xếp vào chuỗi TỜ hay CON theo basis hiệu lực.
 * - IN mặc định makeready 100 tờ; các công đoạn khác 0.
 */
export function buildWaste(d: PricingData, sl: number, soCon: number, defs: StageDef[]): WasteBuildResult {
    const giay: StageWaste = { code: 'GIAY', basis: 'sheet', makeready: 0, rate: 0 };
    const built: StageWaste[] = defs.map((def) => ({
        code: def.code,
        basis: effectiveBasis(d, def.code, def.defaultBasis),
        makeready: stageMakeready(d, def.code, def.code === 'IN' ? IN_DEFAULT_MAKEREADY : 0),
        rate: wasteRate(d, def.code, sl),
    }));
    const sheetStages: StageWaste[] = [giay, ...built.filter((s) => s.basis === 'sheet')];
    const pieceStages: StageWaste[] = built.filter((s) => s.basis === 'piece');
    const cas = cascadeProduct(sl, soCon, pieceStages, sheetStages);
    const q = (code: string): number => qtyOf(cas.sheetQty, code) || qtyOf(cas.pieceQty, code) || 0;
    return { sheetsGross: cas.sheetsGross, sheetsNet: cas.sheetsNet, q };
}

/** Giá một công đoạn: bậc đơn giá theo SL đơn hàng; nhân theo SỐ LƯỢNG THỰC (đã gồm bù hao). */
export function stageCostAt(code: string, slForTier: number, qtyCharged: number, d: PricingData): number {
    const rec = d.giaCong.find((g) => g.code === code);
    if (!rec) return 0;
    const rate = pickRate(slForTier, rec.tiers as GiaCongTier[], d.tyLe.mocSoLuong);
    const moq = numParam(d.tyLe.params, rec.moqParam) ?? d.tyLe.params.MOQ_GiaCong;
    if (rec.billingMode === 'minCharge') {
        if (slForTier < moq) return (rec.minChargeParam ? numParam(d.tyLe.params, rec.minChargeParam) : 0) ?? 0;
        return rate * qtyCharged;
    }
    return rate * qtyCharged; // perUnit
}

/**
 * Các mã công đoạn LÕI đã được từng sản phẩm xử lý riêng (qua field cố định) — KHÔNG đưa vào
 * danh sách "gia công thêm" để tránh tính trùng.
 */
export const CORE_PROCESSING_CODES = new Set<string>([
    'IN', 'CAN', 'GIAY', 'BE', 'CATXEN', 'DONGGOI', 'TP_TC', 'TP_MAY', 'TP_TUI', 'DANTD', 'BOI', 'XLBM',
]);

/**
 * GIA CÔNG THÊM (add-on) — định giá các công đoạn admin định nghĩa trong "Danh Mục Gia Công"
 * (processing_options scope_offset) mà KHÔNG nằm trong tập lõi. Mỗi mã → 1 dòng chi phí, tính
 * theo bậc đơn giá × số lượng (qua `stageCostAt`). Bỏ qua mã 'external' (vd ép kim — đã có field
 * riêng) và mã không có trong cấu hình. Rỗng ⇒ không thêm gì (bảo toàn giá cũ).
 */
export function extraProcessingLines(codes: string[] | undefined, sl: number, d: PricingData): QuoteLine[] {
    if (!codes?.length) return [];
    const out: QuoteLine[] = [];
    const seen = new Set<string>();
    for (const code of codes) {
        if (!code || seen.has(code)) continue;
        seen.add(code);
        const rec = d.giaCong.find((g) => g.code === code);
        if (!rec || rec.billingMode === 'external' || CORE_PROCESSING_CODES.has(code)) continue;
        const amount = stageCostAt(code, sl, sl, d);
        if (amount > 0) out.push({ label: rec.congDoan || code, amount });
    }
    return out;
}
