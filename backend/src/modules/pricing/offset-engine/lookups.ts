/**
 * Các hàm tra cứu/tính chi phí THUẦN của EngineOffset (không I/O, nhận PricingData).
 *
 * Bám sát `báo giá/PRICING_SPEC.md` mục 2 và mục 5 (sáu "bẫy" khi port).
 *
 * _Requirements: 2, 3, 4, 5, 6, 7, 8, 9, 10_
 */
import {
    PricingData,
    GiaCongTier,
    LoaiKem,
    OffsetPricingError,
} from './pricing-data';

/**
 * 2.1 — Tra đơn giá giấy theo code hoặc alias. Ném lỗi nếu không có.
 *
 * LƯU Ý ĐƠN VỊ: trả `priceVAT` = cột `materials.pricePerSheet` admin nhập. Theo quy ước nhập liệu
 * của xưởng, giá này là giá GỐC CHƯA gồm VAT (dù tên trường có chữ "VAT" — đặt tên lịch sử, gây
 * hiểu nhầm). VAT được cộng ĐÚNG MỘT LẦN ở `totals.ts` theo mức VAT trên UI báo giá → KHÔNG double-VAT.
 */
export function giaGiay(code: string, d: PricingData): number {
    const m = d.materials.find(
        (x) => x.code === code || (x.aliases ?? []).includes(code),
    );
    if (!m) throw new OffsetPricingError(`Mã vật liệu không tồn tại: ${code}`);
    return m.priceVAT;
}

/**
 * 5 (bẫy #1) — Chuẩn hóa chuỗi khổ về dạng thống nhất "Acm x Bcm".
 * Xử lý "43 x 65cm" (fixed_sizes) ≡ "43cm x 65cm" (kho_in).
 */
export function chuanHoaKho(s: string): string {
    if (!s) return '';
    const m = s.match(/([\d.]+)\s*(?:cm)?\s*[x×]\s*([\d.]+)\s*(?:cm)?/i);
    if (!m) return s.trim().toLowerCase().replace(/\s+/g, ' ');
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    return `${a}cm x ${b}cm`;
}

/** Tra bản ghi kho_in theo khổ (đã chuẩn hóa). */
export function timKhoIn(khoBinh: string, d: PricingData) {
    const target = chuanHoaKho(khoBinh);
    return d.khoIn.find((k) => chuanHoaKho(k.khoIn) === target) ?? null;
}

/**
 * Trích kích thước (cm) từ chuỗi khổ bất kỳ: lấy 2 số đầu tiên.
 * Ví dụ "65cm x 86cm" → {w:65,h:86}; "14.8cm x 20.5cm (tờ rơi...)" → {w:14.8,h:20.5}.
 * Trả null nếu không tách được — dùng cho preview, không ảnh hưởng tính giá.
 */
export function docKichThuocCm(s: string): { w: number; h: number } | null {
    if (!s) return null;
    const m = s.match(/([\d.]+)\s*(?:cm)?\s*[x×]\s*([\d.]+)/i);
    if (!m) return null;
    const w = parseFloat(m[1]);
    const h = parseFloat(m[2]);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    return { w, h };
}

/** 9 — Diện tích m² của khổ in (tra kho_in sau chuẩn hóa). Ném lỗi nếu không khớp. */
export function dienTichKho(khoBinh: string, d: PricingData): number {
    const rec = timKhoIn(khoBinh, d);
    if (!rec) throw new OffsetPricingError(`Khổ không tra cứu được: ${khoBinh}`);
    return rec.dienTichM2;
}

/**
 * 2.2 — Chọn đơn giá theo bậc bằng MocSoLuong (KHÔNG theo min/max của tiers).
 * Tìm ngưỡng lớn nhất ≤ sl, lấy phần tử cùng vị trí trong tiers (giới hạn ở cuối dãy).
 */
export function pickRate(
    sl: number,
    tiers: { price: number | null }[],
    mocSoLuong: number[],
): number {
    let idx = 0;
    for (let i = 0; i < mocSoLuong.length; i++) {
        if (sl >= mocSoLuong[i]) idx = i;
    }
    const tier = tiers[Math.min(idx, tiers.length - 1)];
    return tier?.price ?? 0;
}

/** 2.3 — Tính chi phí một công đoạn theo billingMode. */
export function chiPhiGiaCong(code: string, sl: number, d: PricingData): number {
    const rec = d.giaCong.find((g) => g.code === code);
    if (!rec) throw new OffsetPricingError(`Công đoạn không tồn tại: ${code}`);
    if (rec.billingMode === 'external') {
        // Ép kim tính bằng chiPhiEpKim — không dùng hàm này.
        return 0;
    }
    const rate = pickRate(sl, rec.tiers as GiaCongTier[], d.tyLe.mocSoLuong);
    const moq = d.tyLe.params[rec.moqParam] ?? d.tyLe.params.MOQ_GiaCong;
    if (rec.billingMode === 'minCharge') {
        if (sl < moq) {
            const minVal = rec.minChargeParam ? d.tyLe.params[rec.minChargeParam] : 0;
            return minVal ?? 0;
        }
        return rate * sl;
    }
    // perUnit
    return rate * sl;
}

/** 2.5 — Ép kim, đơn vị hỗn hợp (duoi100 trọn gói; còn lại đơn giá/cái).
 *  Ngưỡng số lượng (mặc định 100/500/1000) cấu hình được qua params EpKim_Moc1/2/3. */
export function chiPhiEpKim(viTri: string, sl: number, d: PricingData): number {
    if (!viTri || viTri === 'Không') return 0;
    const row = d.epKim.rows.find((r) => r.viTri === viTri);
    if (!row) throw new OffsetPricingError(`Vị trí ép kim không tồn tại: ${viTri}`);
    const m1 = d.tyLe.params.EpKim_Moc1 || 100;
    const m2 = d.tyLe.params.EpKim_Moc2 || 500;
    const m3 = d.tyLe.params.EpKim_Moc3 || 1000;
    if (sl < m1) return row.duoi100; // trọn gói, KHÔNG nhân SL
    if (sl < m2) return row.tu100_499 * sl;
    if (sl < m3) return row.tu500_999 * sl;
    return row.tren1000 * sl;
}

/** 2.4 — Chi phí làm kẽm = đơn giá 1 kẽm (theo loại) × số kẽm. */
export function chiPhiLamKem(loaiKem: LoaiKem, soKem: number, d: PricingData): number {
    const don = loaiKem === 'Kẽm lớn' ? d.kem.donGia1Kem.kemLon : d.kem.donGia1Kem.kemNho;
    return don * soKem;
}

/** 2.4 — Chi phí bình bài: dưới MOQ trả giá gốc; trên MOQ scale theo lượt in. */
export function chiPhiBinhBai(
    loaiKem: LoaiKem,
    soKem: number,
    luotIn: number,
    d: PricingData,
): number {
    const bang = loaiKem === 'Kẽm lớn' ? d.kem.kemLon : d.kem.kemNho;
    const row = bang.find((k) => k.soKem === soKem) ?? bang[bang.length - 1];
    const giaGoc = row?.donGia ?? 0;
    const moq = loaiKem === 'Kẽm lớn' ? d.tyLe.params.MOQ_BinhBai_Lon : d.tyLe.params.MOQ_BinhBai_Nho;
    if (luotIn <= moq) return giaGoc;
    return (luotIn * giaGoc) / moq;
}

/** Bước 5 (tờ rơi) — Chi phí vật tư bề mặt (cán màng) theo diện tích × kg × số mặt × số tờ. */
export function chiPhiCanMang(
    khoBinh: string,
    vatTuBeMat: string,
    soMatIn: number,
    soToLon: number,
    d: PricingData,
): number {
    if (!vatTuBeMat || vatTuBeMat === 'Không') return 0;
    const vt = d.kem.vatTuBeMat.find((v) => v.ten === vatTuBeMat);
    if (!vt) throw new OffsetPricingError(`Vật tư bề mặt không tồn tại: ${vatTuBeMat}`);
    const dienTich = dienTichKho(khoBinh, d);
    return dienTich * vt.donGiaKg * soMatIn * soToLon;
}

/** 2.6 — Tỷ lệ hao hụt theo bậc số lượng (ngưỡng lớn nhất ≤ sl). */
export function haoHut(sl: number, d: PricingData): number {
    const rows = [...d.tyLe.haoHut].sort((a, b) => a.mocSoLuong - b.mocSoLuong);
    let tyLe = rows.length > 0 ? rows[0].tyLe : 0;
    for (const r of rows) {
        if (sl >= r.mocSoLuong) tyLe = r.tyLe;
    }
    return tyLe;
}

/**
 * 5 (mục 2) — Hàm xếp con tối ưu: số con bài trên một khổ giấy lớn,
 * thử cả 2 chiều, khe hở mặc định 0.3cm.
 */
export function soConTrenKho(
    khoW: number,
    khoH: number,
    baiW: number,
    baiH: number,
    gap = 0.3,
): number {
    if (khoW <= 0 || khoH <= 0 || baiW <= 0 || baiH <= 0) return 0;
    const a = Math.floor(khoW / (baiW + gap)) * Math.floor(khoH / (baiH + gap));
    const b = Math.floor(khoW / (baiH + gap)) * Math.floor(khoH / (baiW + gap));
    return Math.max(a, b);
}

/**
 * Dàn khuôn ĐỘNG theo hình học: tính số con/bài in (theo khổ in) và số con/tờ lớn
 * (theo khổ giấy lớn) cho một sản phẩm phẳng kích thước `baiW × baiH` (cm).
 *
 * Dùng cho chế độ "nhập kích thước" (tờ rơi/bì thư) và khi SP khác có kích thước —
 * thay cho con số tĩnh `so_con_*` cấu hình sẵn. Khe hở mặc định 0.3cm, thử cả 2 chiều.
 *
 * @param kho bản ghi khổ in (cần `khoIn` = khổ bài in, `khoGiayLon` = khổ giấy lớn).
 */
export function imposeFromKhoIn(
    kho: { khoIn: string; khoGiayLon: string; marginLeft?: number; marginRight?: number; marginTop?: number; marginBottom?: number },
    baiW: number,
    baiH: number,
    gap = 0.3,
): { soConBaiIn: number; soConToLon: number } {
    const bai = docKichThuocCm(kho.khoIn);
    const lon = docKichThuocCm(kho.khoGiayLon);
    // Trừ lề/gripper khỏi vùng in (thiếu = 0).
    const mW = (kho.marginLeft ?? 0) + (kho.marginRight ?? 0);
    const mH = (kho.marginTop ?? 0) + (kho.marginBottom ?? 0);
    const soConBaiIn = bai ? soConTrenKho(bai.w - mW, bai.h - mH, baiW, baiH, gap) : 0;
    const soConToLon = lon ? soConTrenKho(lon.w - mW, lon.h - mH, baiW, baiH, gap) : 0;
    return { soConBaiIn, soConToLon };
}

/**
 * Số con cho KHỔ TĨNH (tờ rơi/bì thư): TỰ TÍNH theo hình học từ kích thước thành phẩm +
 * khổ in/khổ giấy lớn — đồng bộ với In Nhanh và chế độ nhập tay, không phụ thuộc số con cứng.
 *
 * Fallback về số bảng định mức khi: thiếu kích thước hoặc hình học không tính được.
 */
export function soConKhoTinh(
    d: PricingData,
    tableBaiIn: number,
    tableToLon: number,
    khoInStr: string,
    khoGiayLonStr: string,
    itemW?: number,
    itemH?: number,
): { soConBaiIn: number; soConToLon: number } {
    if (!itemW || !itemH || itemW <= 0 || itemH <= 0) {
        return { soConBaiIn: tableBaiIn, soConToLon: tableToLon };
    }
    const rec = timKhoIn(khoInStr, d);
    const kho = {
        khoIn: khoInStr,
        khoGiayLon: khoGiayLonStr,
        marginLeft: rec?.marginLeft, marginRight: rec?.marginRight,
        marginTop: rec?.marginTop, marginBottom: rec?.marginBottom,
    };
    const imp = imposeFromKhoIn(kho, itemW, itemH, d.tyLe.params.Gap_Cm || 0.3);
    return {
        soConBaiIn: imp.soConBaiIn > 0 ? imp.soConBaiIn : tableBaiIn,
        soConToLon: imp.soConToLon > 0 ? imp.soConToLon : tableToLon,
    };
}
