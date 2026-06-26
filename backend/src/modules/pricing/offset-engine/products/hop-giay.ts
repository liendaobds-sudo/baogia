/**
 * Hộp giấy — báo giá offset (bù hao theo công đoạn / cascade).
 *
 *  - Số con/tờ suy từ KÍCH THƯỚC TRẢI THỰC vs khổ giấy lớn.
 *  - Bù hao theo công đoạn: in & cán theo TỜ; bế/dán/đóng gói theo SỐ CON (cấu hình được, basis đổi được).
 *  - Định mức hao mỗi công đoạn lấy từ `d.wasteStages` (bảng mốc riêng + makeready).
 */
import { PricingData, QuoteLine, QuoteResult, OffsetPricingError } from '../pricing-data';
import { giaGiay, timKhoIn, pickRate, chiPhiEpKim, soConTrenKho, docKichThuocCm } from '../lookups';
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
        T: input.matThickness ?? params.MatThickness_Mm ?? 0.5,
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
            { boxType: input.boxType, L: input.rong * 10, W: input.hong * 10, D: input.cao * 10, T: input.matThickness ?? params.MatThickness_Mm ?? 0.5 },
            khoInDims.w * 10, khoInDims.h * 10,
        );
        if (nest.countPerSheet > 0) { soCon = nest.countPerSheet; soConBaiInVal = nest.countPerSheet; }
    }
    if (!(soCon > 0)) soCon = khoGiay ? soConTrenKho(khoGiay.w, khoGiay.h, trai.ngang, trai.doc, params.Gap_Cm || 0.3) : 0;
    if (!(soCon > 0)) soCon = kho.soConToLon;
    if (!(soCon > 0)) throw new OffsetPricingError('Không xác định được số con/tờ cho hộp');
    // (A3) Chặn chia-0: cần số con/bài in (với boxType đã suy từ nesting ở trên).
    if (!(soConBaiInVal > 0)) throw new OffsetPricingError('Khổ in chưa cấu hình "số con/bài in". Vui lòng bổ sung cho khổ in này.');

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
    const pcsBe = w.q('BE') || sl;
    const pcsDan = w.q('DAN') || sl;
    const pcsDongGoi = w.q('DONGGOI') || sl;

    const luotIn = Math.ceil((sl / soConBaiInVal) * soMat);
    const MOQ = params.MOQ_GiaCong;

    const giaTo = giaGiay(input.materialCode, d);
    const cpGiay = giaTo * sheetsGross;

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
    const cpGiayBoi = input.boi2Lop ? giaTo * sheetsGross : 0;
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
    const baseSXTK = cpBinhBai + cpXLBM + cpBe + cpDanHop + cpBoi + cpDongGoi + cpEpKim + cpGiayBoi + cpThietKe;
    const extraLines = extraProcessingLines(input.extraProcessing, sl, d);
    lines.push(...extraLines);
    const baseSXTKFull = baseSXTK + extraLines.reduce((s, l) => s + l.amount, 0);
    const wasteInfo = giaTo * (sheetsGross - w.sheetsNet);

    const sheet = docKichThuocCm(kho.khoGiayLon);
    const res = tongHopKetQua(lines, baseSXTKFull, sl, d, wasteInfo, input.chietKhauRate, input.vatRate);
    res.meta = {
        khoBinh: kho.khoIn, khoGiayLon: kho.khoGiayLon, soConBaiIn: soConBaiInVal, soConToLon: soCon,
        soToLon: sheetsGross, luotIn, soKem: input.soMau, loaiKem: kho.loaiKem,
        sheetW: sheet?.w, sheetH: sheet?.h, itemW: trai.ngang, itemH: trai.doc,
        dielineStdCode, dielineWarnings,
    };
    return res;
}
