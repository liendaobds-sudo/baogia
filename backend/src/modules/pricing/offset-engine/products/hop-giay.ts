/**
 * Hộp giấy — báo giá offset (bù hao theo công đoạn / cascade).
 *
 *  - Số con/tờ suy từ KÍCH THƯỚC TRẢI THỰC vs khổ giấy lớn.
 *  - Bù hao theo công đoạn: in & cán theo TỜ; bế/dán/đóng gói theo SỐ CON (cấu hình được, basis đổi được).
 *  - Định mức hao mỗi công đoạn lấy từ `d.wasteStages` (bảng mốc riêng + makeready).
 */
import { PricingData, QuoteLine, QuoteResult, OffsetPricingError, numParam } from '../pricing-data';
import { giaGiay, timKhoIn, pickRate, chiPhiEpKim, soConTrenKho, docKichThuocCm } from '../lookups';
import { resolveSoCon } from '../imposition-selector';
import { tongHopKetQua } from '../totals';
import { buildWaste, stageCostAt, extraProcessingLines } from './_waste-stages';
import { flatDielineSize, nestOnSheet, BoxType } from '../../dieline';

export interface HopGiayInput {
    type: 'hop_giay';
    cao: number;
    rong: number;
    hong: number;
    materialCode: string;
    soMatIn: 1 | 2;
    soLuong: number;
    khoIn: string;
    soBoKem?: number; // tuỳ chọn — mặc định 1 (form không hỏi)
    soMau: number;    // số màu in (= số bản kẽm/bộ)
    vatTuBeMat: string;
    be: boolean;
    danHop: 'khong' | 'tc' | 'auto';
    boi2Lop: boolean;
    dongGoi: boolean;
    epKimViTri: string;
    thietKe?: number;
    chietKhauRate?: number;
    vatRate?: number;
    /** Loại khuôn bế chuẩn (BẮT BUỘC) — khổ trải tính bằng engine dieline (chính xác). */
    boxType: BoxType;
    /** Độ dày vật liệu (mm) cho dieline; mặc định 0.5. */
    matThickness?: number;
    /** Gia công thêm (mã processing_options scope_offset, ngoài tập lõi) — cộng thêm. */
    extraProcessing?: string[];
}

const phi = (code: string, d: PricingData): number =>
    d.phiCoDinh.find((p) => p.code === code)?.giaTri ?? 0;

/**
 * Số bài in (tờ xả) cắt được từ MỘT tờ giấy NHẬP — nguồn khổ tờ nhập ưu tiên bản ghi VẬT TƯ.
 *
 * Vì sao (audit 2026-08-29): `giaTo = giaGiay(materialCode)` là đơn giá MỘT tờ nguyên khổ của
 * chính vật tư đó. Nếu số tờ lại chia theo `kho.khoGiayLon` (một khổ khác, có thể không tồn tại
 * trong danh mục giấy) thì "số lượng" và "đơn giá" đến từ hai nguồn khác nhau ⇒ tiền giấy sai.
 *
 * Thứ tự nguồn:
 *  1. `material.sheetWidth × sheetHeight` (cùng bản ghi cấp giá) — chuẩn.
 *  2. `pressPerParentFallback` suy từ `kho.khoGiayLon` — chỉ khi vật tư không khai khổ.
 *
 * Trả thêm `source` + `mismatch` để đính vào meta/log, giúp admin phát hiện dữ liệu lệch.
 */
function resolveParentSheetPerPress(
    materialCode: string,
    kho: { khoIn: string; khoGiayLon: string },
    d: PricingData,
    pressPerParentFallback: number,
): { pressPerParent: number; source: 'material' | 'khoGiayLon'; mismatch: boolean } {
    const press = docKichThuocCm(kho.khoIn);
    const mat = d.materials.find(
        (m) => m.code === materialCode || (m.aliases ?? []).includes(materialCode),
    );
    const matW = Number(mat?.sheetWidth);
    const matH = Number(mat?.sheetHeight);
    const hasMatSheet = Number.isFinite(matW) && Number.isFinite(matH) && matW > 0 && matH > 0;

    if (!press || !hasMatSheet) {
        return { pressPerParent: pressPerParentFallback, source: 'khoGiayLon', mismatch: false };
    }

    // Cùng công thức grid như `pressPerParent` của selector (xả = cắt, KHÔNG trừ nhíp),
    // thử cả hai hướng đặt bài in trên tờ nhập.
    const fit = (pw: number, ph: number) =>
        Math.floor(matW / pw) * Math.floor(matH / ph);
    const perParent = Math.max(fit(press.w, press.h), fit(press.h, press.w));

    const parentCfg = docKichThuocCm(kho.khoGiayLon);
    const mismatch = !!parentCfg
        && !(Math.abs(parentCfg.w - matW) < 0.01 && Math.abs(parentCfg.h - matH) < 0.01)
        && !(Math.abs(parentCfg.w - matH) < 0.01 && Math.abs(parentCfg.h - matW) < 0.01);

    if (perParent <= 0) {
        // Bài in KHÔNG cắt được từ khổ giấy đã chọn ⇒ dữ liệu sai, không được âm thầm dùng
        // fallback (sẽ ra giá thấp hơn thực tế).
        throw new OffsetPricingError(
            `Khổ bài in "${kho.khoIn}" không cắt được từ khổ giấy của vật tư "${materialCode}" ` +
            `(${matW}×${matH}cm). Chọn khổ in khác hoặc sửa khổ giấy của vật tư.`,
        );
    }

    return { pressPerParent: perParent, source: 'material', mismatch };
}

export function tinhHopGiay(input: HopGiayInput, d: PricingData): QuoteResult {
    if (!input.soLuong || input.soLuong < 1) {
        throw new OffsetPricingError('Số lượng đặt hàng phải >= 1');
    }
    const kho = timKhoIn(input.khoIn, d);
    if (!kho) throw new OffsetPricingError(`Khổ in không tồn tại: ${input.khoIn}`);

    const sl = input.soLuong;
    const soMat = input.soMatIn;
    const params = d.tyLe.params;

    // Số con/tờ từ kích thước trải THỰC vs khổ giấy lớn (lùi về số con khổ in nếu không suy được).
    // Khổ trải LUÔN tính chính xác bằng engine dieline theo khuôn bế đã chọn (BẮT BUỘC — Req bỏ ước lượng).
    if (!input.boxType) {
        throw new OffsetPricingError('Vui lòng chọn kiểu hộp (khuôn bế) cho hộp giấy.');
    }
    let dielineStdCode: string | undefined;
    let dielineWarnings: string[] | undefined;
    // hop-giay dùng cm; engine dieline dùng mm → quy đổi cm→mm (T giữ nguyên mm).
    const fd = flatDielineSize({
        boxType: input.boxType,
        L: input.rong * 10, W: input.hong * 10, D: input.cao * 10,
        T: input.matThickness ?? numParam(params, 'MatThickness_Mm') ?? 0.5,
    });
    const trai: { doc: number; ngang: number } = { ngang: fd.widthCm, doc: fd.heightCm };
    dielineStdCode = fd.standardCode;
    dielineWarnings = fd.warnings;
    const khoGiay = docKichThuocCm(kho.khoGiayLon);     // khổ giấy lớn (có thể null nếu dữ liệu thiếu)
    const khoInDims = docKichThuocCm(kho.khoIn);        // khổ in đang chọn (khớp preview)
    // Số con/tờ: DÀN KHUÔN trên KHỔ IN đang chọn (khớp tab "Xếp khuôn"), tự suy số con,
    // KHÔNG phụ thuộc khoGiayLon/soConBaiIn cấu hình (vài khổ thiếu dữ liệu).
    let soCon = 0;
    let soConBaiInVal = kho.soConBaiIn;
    if (khoInDims) {
        const nest = nestOnSheet(
            { boxType: input.boxType, L: input.rong * 10, W: input.hong * 10, D: input.cao * 10, T: input.matThickness ?? numParam(params, 'MatThickness_Mm') ?? 0.5 },
            khoInDims.w * 10, khoInDims.h * 10,
        );
        if (nest.countPerSheet > 0) { soCon = nest.countPerSheet; soConBaiInVal = nest.countPerSheet; }
    }
    if (!(soCon > 0)) soCon = khoGiay ? soConTrenKho(khoGiay.w, khoGiay.h, trai.ngang, trai.doc, numParam(params, 'Gap_Cm') || 0.3) : 0;
    if (!(soCon > 0)) soCon = kho.soConToLon;
    if (!(soCon > 0)) throw new OffsetPricingError('Không xác định được số con/tờ cho hộp');
    // (A3) Chặn chia-0: cần số con/bài in (với boxType đã suy từ nesting ở trên).
    if (!(soConBaiInVal > 0)) throw new OffsetPricingError('Khổ in chưa cấu hình "số con/bài in". Vui lòng bổ sung cho khổ in này.');

    // Nguồn So_Con thống nhất qua selector. Hộp giấy dùng KÍCH THƯỚC TRẢI (dieline) làm "con":
    // map khổ trải (cm) → itemWcm/itemHcm, truyền số con dieline ở trên làm fallback bảng tĩnh.
    // GIỮ NGUYÊN hình học dieline + hành vi giá legacy (số con nesting hiện tại) để golden không đổi;
    // CHỈ khi `ImpositionSource='unified'` mới để selector điều khiển số con/giá. `outcome` còn cấp
    // meta (impositionSource/shadow/positions/marginConfig) cho parity giá ≡ preview ≡ PDF.
    //
    // WIRING CHÚ Ý (hop_giay): Legacy path tính `soCon` = pieces per PRESS SHEET (qua nestOnSheet
    // trên `khoInDims`), dùng cho buildWaste. Unified `soConToLon` = pieces per LARGE SHEET (khác!).
    // Đúng: dùng `soConBaiIn` (pieces per press sheet) cho waste/pricing — khớp ngữ nghĩa legacy.
    // `soConToLon` (pieces per large sheet) chỉ ghi vào meta để preview hiển thị bình bài tờ lớn.
    const outcome = resolveSoCon({
        itemWcm: trai.ngang, itemHcm: trai.doc, kho, data: d,
        fallbackToLon: soCon, fallbackBaiIn: soConBaiInVal,
    });
    if (outcome.source === 'unified') {
        // hop_giay dùng press sheet cho waste — lấy soConBaiIn (pieces/press), không phải soConToLon.
        if (outcome.soConBaiIn > 0) { soCon = outcome.soConBaiIn; soConBaiInVal = outcome.soConBaiIn; }
    }

    // Bù hao theo công đoạn (basis động theo cấu hình người dùng).
    const defs = [
        { code: 'IN', defaultBasis: 'sheet' as const },
        { code: 'CAN', defaultBasis: 'sheet' as const },
        ...(input.be ? [{ code: 'BE', defaultBasis: 'piece' as const }] : []),
        ...(input.danHop !== 'khong' ? [{ code: 'DAN', defaultBasis: 'piece' as const }] : []),
        ...(input.dongGoi ? [{ code: 'DONGGOI', defaultBasis: 'piece' as const }] : []),
    ];
    const w = buildWaste(d, sl, soCon, defs);
    const sheetsGross = w.sheetsGross;
    const sheetsAtCan = w.q('CAN') || w.sheetsNet;
    // GĐ C — SỬA LỆCH ĐƠN VỊ GIẤY: `sheetsGross` đếm theo tờ XẢ (bài in, tờ vào máy) — đúng cho
    // IN/CAN/XLBM/lượt in. Nhưng GIẤY mua theo tờ NHẬP (`giaTo` = giá 1 tờ nhập). Quy về tờ nhập:
    // 1 tờ nhập xả ra `pressPerParent` bài in. Khổ xả ≡ khổ nhập (in thẳng) → pressPerParent=1 → không đổi.
    //
    // Audit 2026-08-29 — SỬA NGUỒN KHỔ TỜ NHẬP: `outcome.pressPerParent` suy từ
    // `kho.khoGiayLon` (cấu hình của khổ in), KHÔNG phải khổ giấy thật của vật tư đã chọn.
    // Với dữ liệu hiện tại, `khoIn = "28cm x 60cm"` khai `khoGiayLon = "84cm x 120cm"` trong khi
    // MỌI vật tư giấy chỉ có khổ 65×86 / 60×84 / 79×109 — không tồn tại tờ 84×120. Engine vì thế
    // chia số tờ theo một khổ KHÔNG TỒN TẠI (ppp = 6) rồi nhân với đơn giá tờ 65×86 ⇒ đếm THIẾU
    // giấy ~2 lần ⇒ báo giá dưới chi phí.
    //
    // Nguyên tắc mới: SỐ TỜ và ĐƠN GIÁ TỜ phải đến từ CÙNG MỘT nguồn — bản ghi vật tư
    // (`sheetWidth × sheetHeight` đi kèm `priceNoVAT`). Chỉ khi vật tư không khai khổ mới quay
    // về `khoGiayLon` như trước. Lệch giữa hai nguồn được log để admin sửa dữ liệu.
    const parentSheet = resolveParentSheetPerPress(input.materialCode, kho, d, outcome.pressPerParent ?? 0);
    const ppp = parentSheet.pressPerParent > 0 ? parentSheet.pressPerParent : 1;
    const parentGross = Math.ceil(sheetsGross / ppp);
    const parentNet = Math.ceil(w.sheetsNet / ppp);
    const pcsBe = w.q('BE') || sl;
    const pcsDan = w.q('DAN') || sl;
    const pcsDongGoi = w.q('DONGGOI') || sl;

    const luotIn = Math.ceil((sl / soConBaiInVal) * soMat);
    const MOQ = params.MOQ_GiaCong;

    const giaTo = giaGiay(input.materialCode, d);
    const cpGiay = giaTo * parentGross;

    const don1Kem = kho.loaiKem === 'Kẽm lớn' ? d.kem.donGia1Kem.kemLon : d.kem.donGia1Kem.kemNho;
    const cpLamKem = don1Kem * (input.soBoKem ?? 1) * input.soMau;

    let cpCanMang = 0;
    const vtbm = d.kem.vatTuBeMat.find((v) => v.ten === input.vatTuBeMat);
    if (input.vatTuBeMat && input.vatTuBeMat !== 'Không') {
        if (!vtbm) throw new OffsetPricingError(`Vật tư bề mặt không tồn tại: ${input.vatTuBeMat}`);
        cpCanMang = kho.dienTichM2 * vtbm.donGiaKg * soMat * sheetsAtCan;
    }

    const cpKhuon = phi('Gia_Khuon_Hop', d);

    const bang = kho.loaiKem === 'Kẽm lớn' ? d.kem.kemLon : d.kem.kemNho;
    const giaGocBinhBai = (bang.find((k) => k.soKem === input.soMau) ?? bang[bang.length - 1]).donGia;
    const moqBinhBai = params.MOQ_BinhBai_Nho;
    const cpBinhBai = luotIn <= moqBinhBai ? giaGocBinhBai : (luotIn * giaGocBinhBai) / moqBinhBai;
    // Tách rõ 2 phần (tổng = cpBinhBai): Lên bài = công gốc (trọn gói canh máy); Chạy máy = phần vượt MOQ.
    const cpLenBai = giaGocBinhBai;
    const cpChayMay = Math.max(0, cpBinhBai - giaGocBinhBai);

    let cpXLBM = 0;
    if (vtbm && input.vatTuBeMat !== 'Không') {
        const xlbm = d.giaCong.find((g) => g.code === 'XLBM')!;
        const rate = pickRate(sl, xlbm.tiers, d.tyLe.mocSoLuong) * (vtbm.soMat === '2 mặt' ? 2 : 1);
        cpXLBM = sl < MOQ ? params.GiaMin_XLBM : rate * sheetsAtCan;
    }

    const cpBe = input.be ? stageCostAt('BE', sl, pcsBe, d) : 0;

    let cpDanHop = 0;
    if (input.danHop === 'tc') cpDanHop = stageCostAt('TP_TC', sl, pcsDan, d);
    else if (input.danHop === 'auto') cpDanHop = stageCostAt('DANTD', sl, pcsDan, d);

    let cpBoi = 0;
    if (input.boi2Lop) {
        const boi = d.giaCong.find((g) => g.code === 'BOI')!;
        const rate = pickRate(sl, boi.tiers, d.tyLe.mocSoLuong);
        cpBoi = sl < MOQ ? rate : rate * sheetsGross;
    }

    const cpDongGoi = input.dongGoi ? stageCostAt('DONGGOI', sl, pcsDongGoi, d) : 0;
    const cpEpKim = chiPhiEpKim(input.epKimViTri, sl, d);
    const cpGiayBoi = input.boi2Lop ? giaTo * parentGross : 0;
    // Phí thiết kế là giá CHƯA VAT (như mọi dòng chi phí); VAT cộng sau ở tổng theo % báo giá.
    const cpThietKe = input.thietKe ?? phi('Gia_ThietKe', d);

    const lines: QuoteLine[] = [
        { label: 'Chi phí giấy', amount: cpGiay },
        { label: 'Làm kẽm', amount: cpLamKem },
        { label: 'Vật tư bề mặt (cán màng)', amount: cpCanMang },
        { label: 'Khuôn', amount: cpKhuon },
        { label: 'Lên bài (canh máy)', amount: cpLenBai },
        { label: 'In (chạy máy)', amount: cpChayMay },
        { label: 'Gia công bề mặt (XLBM)', amount: cpXLBM },
        { label: 'Bế', amount: cpBe },
        { label: 'Dán hộp', amount: cpDanHop },
        { label: 'GC bồi 2 lớp', amount: cpBoi },
        { label: 'Đóng gói', amount: cpDongGoi },
        { label: 'Ép kim', amount: cpEpKim },
        { label: 'Giấy bồi', amount: cpGiayBoi },
        { label: 'Thiết kế', amount: cpThietKe },
    ];
    // Base chiết khấu = SẢN XUẤT + THIẾT KẾ. Audit 2026-08-29: `cpGiayBoi` đã bị GỠ khỏi base —
    // đó là chi phí VẬT TƯ (dòng nhãn 'Giấy bồi' = giaTo × parentGross), mà hợp đồng ở
    // `totals.ts` ghi rõ "chiết khấu KHÔNG áp trên giấy/kẽm/vật tư". `cpBoi` (công gia công bồi)
    // vẫn nằm trong base vì đó là công đoạn sản xuất.
    // Ảnh hưởng golden: fixture hop_giay có `boi2Lop: false` ⇒ cpGiayBoi = 0 ⇒ số pin KHÔNG đổi.
    // Đơn hộp bồi 2 lớp thật sẽ có chiết khấu giảm đúng bằng `giaGiayBoi × TyLe_ChietKhau`.
    const baseSXTK = cpBinhBai + cpXLBM + cpBe + cpDanHop + cpBoi + cpDongGoi + cpEpKim + cpThietKe;
    const extraLines = extraProcessingLines(input.extraProcessing, sl, d);
    lines.push(...extraLines);
    const baseSXTKFull = baseSXTK + extraLines.reduce((s, l) => s + l.amount, 0);
    const wasteInfo = giaTo * (parentGross - parentNet);

    const sheet = docKichThuocCm(kho.khoGiayLon);
    /**
     * `meta.soConToLon` = số con trên MỘT TỜ NHẬP — đại lượng PDF và danh sách báo giá in ra
     * cạnh `soToLon` ("N con/tờ · M tờ in").
     *
     * Audit 2026-08-29: trước đây lấy `outcome.soConToLon` — con số `imposeUnified` tính ĐỘC LẬP
     * trên khổ `khoGiayLon`, KHÔNG phải cơ sở tính giá (giá hộp đi theo `soConBaiIn` × số bài in
     * trên tờ nhập). Hệ quả: PDF in "15 con/tờ · 110 tờ in" cho đơn 1.000 con (15 × 110 = 1.650)
     * — chứng từ tự mâu thuẫn. Nay dẫn xuất ĐÚNG từ cơ sở giá:
     *      soConToLon = soConBaiIn × (số bài in / tờ nhập)
     * nên luôn thoả `ceil(soLuong / soConToLon) ≤ soToLon`.
     */
    const metaSoConToLon = soConBaiInVal * ppp;
    const res = tongHopKetQua(lines, baseSXTKFull, sl, d, wasteInfo, input.chietKhauRate, input.vatRate);
    res.meta = {
        khoBinh: kho.khoIn, khoGiayLon: kho.khoGiayLon, soConBaiIn: soConBaiInVal, soConToLon: metaSoConToLon,
        soToLon: parentGross, luotIn, soKem: input.soMau, loaiKem: kho.loaiKem,
        sheetW: sheet?.w, sheetH: sheet?.h, itemW: trai.ngang, itemH: trai.doc,
        dielineStdCode, dielineWarnings,
        impositionSource: outcome.source,
        // Nguồn khổ TỜ NHẬP dùng để đếm giấy + cờ lệch dữ liệu (audit 2026-08-29). Hiển thị/chẩn
        // đoán: `mismatch = true` nghĩa là `paper_sizes.kho_giay_lon` khai khác khổ giấy của vật tư.
        pressPerParent: ppp,
        parentSheetSource: parentSheet.source,
        ...(parentSheet.mismatch ? { parentSheetMismatch: true } : {}),
        ...(outcome.shadow ? { shadow: outcome.shadow } : {}),
        ...(outcome.positions ? { positions: outcome.positions } : {}),
        ...(outcome.marginConfig ? { marginConfig: outcome.marginConfig } : {}),
        // Khổ BÀI IN (press sheet) — số + vị trí con dùng để TÍNH GIÁ; preview hộp vẽ theo mức này.
        ...(khoInDims ? { pressW: khoInDims.w, pressH: khoInDims.h } : {}),
        ...(outcome.pressPositions ? { pressPositions: outcome.pressPositions } : {}),
        ...(outcome.pressUsableArea ? { pressUsableArea: outcome.pressUsableArea } : {}),
    };
    return res;
}
