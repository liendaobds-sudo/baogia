/**
 * Sản phẩm khác (khổ in nhập trực tiếp, có ép kim) — báo giá offset (bù hao theo công đoạn).
 * Làm kẽm = đơn giá × số bộ × số màu; XLBM chỉ khi có cán; số con/tờ lấy từ kho_in.
 */
import { PricingData, QuoteLine, QuoteResult, OffsetPricingError } from '../pricing-data';
import { giaGiay, timKhoIn, pickRate, chiPhiEpKim, docKichThuocCm } from '../lookups';
import { resolveSoCon } from '../imposition-selector';
import { tongHopKetQua } from '../totals';
import { buildWaste, stageCostAt, extraProcessingLines } from './_waste-stages';

const phi = (code: string, d: PricingData): number => d.phiCoDinh.find((p) => p.code === code)?.giaTri ?? 0;

export interface SpKhacInput {
    type: 'sp_khac';
    khoIn: string;
    materialCode: string;
    soMatIn: 1 | 2;
    soLuong: number;
    // Kích thước thành phẩm phẳng (cm) — tuỳ chọn. Có thì tính số con/tờ ĐỘNG theo hình học;
    // không có thì dùng con số tĩnh của khổ in (`so_con_*`).
    rong?: number;
    cao?: number;
    soBoKem?: number; // tuỳ chọn — mặc định 1 (form không hỏi)
    soMau: number;    // số màu in (= số bản kẽm/bộ)
    vatTuBeMat: string;
    khuon?: number | boolean; // true → dùng phí khuôn cấu hình (Gia_Khuon); số → nhập tay
    be: boolean;
    thanhPham: 'khong' | 'tc' | 'may';
    catXen: boolean;
    dongGoi: boolean;
    epKimViTri: string;
    thietKe?: number;
    chietKhauRate?: number;
    vatRate?: number;
    /** Gia công thêm (mã processing_options scope_offset, ngoài tập lõi) — cộng thêm. */
    extraProcessing?: string[];
}

export function tinhSpKhac(input: SpKhacInput, d: PricingData): QuoteResult {
    if (!input.soLuong || input.soLuong < 1) throw new OffsetPricingError('Số lượng đặt hàng phải >= 1');
    const kho = timKhoIn(input.khoIn, d);
    if (!kho) throw new OffsetPricingError(`Khổ in không tồn tại: ${input.khoIn}`);

    const sl = input.soLuong;
    const soMat = input.soMatIn;
    // Số con qua nguồn imposition thống nhất (selector). Mặc định 'legacy' tái lập hành vi cũ:
    // có kích thước → dàn khuôn hình học (ưu tiên); thiếu/quá khổ → fallback số con tĩnh của khổ in.
    const hasDims = !!(input.rong && input.cao && input.rong > 0 && input.cao > 0);
    const imposition = resolveSoCon({
        itemWcm: hasDims ? input.rong : undefined,
        itemHcm: hasDims ? input.cao : undefined,
        kho,
        data: d,
        fallbackToLon: kho.soConToLon,
        fallbackBaiIn: kho.soConBaiIn,
    });
    const soCon = imposition.soConToLon;
    const soConBaiIn = imposition.soConBaiIn;
    let itemW: number | undefined, itemH: number | undefined;
    if (hasDims) { itemW = input.rong; itemH = input.cao; }
    // (A3) Chặn chia-0: khổ chưa cấu hình số con (so_con rỗng) + không nhập kích thước → báo lỗi rõ.
    if (!(soCon > 0) || !(soConBaiIn > 0)) {
        throw new OffsetPricingError('Khổ in chưa cấu hình số con/tờ. Hãy nhập kích thước sản phẩm (rộng × cao) hoặc bổ sung "số con" cho khổ in.');
    }
    const params = d.tyLe.params;
    const MOQ = params.MOQ_GiaCong;

    const w = buildWaste(d, sl, soCon, [
        { code: 'IN', defaultBasis: 'sheet' },
        { code: 'CAN', defaultBasis: 'sheet' },
        { code: 'XLBM', defaultBasis: 'piece' },
        { code: 'BE', defaultBasis: 'piece' },
        { code: 'TP', defaultBasis: 'piece' },
        { code: 'CATXEN', defaultBasis: 'piece' },
        { code: 'DONGGOI', defaultBasis: 'piece' },
    ]);
    const sheetsGross = w.sheetsGross;
    const sheetsAtCan = w.q('CAN') || w.sheetsNet;
    const pcs = (c: string) => w.q(c) || sl;

    const luotIn = Math.ceil((sl / soConBaiIn) * soMat);

    const cpGiay = giaGiay(input.materialCode, d) * sheetsGross;
    const don1Kem = kho.loaiKem === 'Kẽm lớn' ? d.kem.donGia1Kem.kemLon : d.kem.donGia1Kem.kemNho;
    const cpLamKem = don1Kem * (input.soBoKem ?? 1) * input.soMau;

    let cpCanMang = 0;
    const vtbm = d.kem.vatTuBeMat.find((v) => v.ten === input.vatTuBeMat);
    if (input.vatTuBeMat && input.vatTuBeMat !== 'Không') {
        if (!vtbm) throw new OffsetPricingError(`Vật tư bề mặt không tồn tại: ${input.vatTuBeMat}`);
        cpCanMang = kho.dienTichM2 * vtbm.donGiaKg * soMat * sheetsAtCan;
    }
    const cpKhuon = typeof input.khuon === 'number' ? input.khuon : (input.khuon ? phi('Gia_Khuon', d) : 0);

    const bang = kho.loaiKem === 'Kẽm lớn' ? d.kem.kemLon : d.kem.kemNho;
    const giaGocBinhBai = (bang.find((k) => k.soKem === input.soMau) ?? bang[bang.length - 1]).donGia;
    const moqBinhBai = params.MOQ_BinhBai_Nho;
    const cpBinhBai = luotIn <= moqBinhBai ? giaGocBinhBai : giaGocBinhBai + ((luotIn - moqBinhBai) * giaGocBinhBai) / moqBinhBai;
    // Tách rõ 2 phần (tổng = cpBinhBai): Lên bài = đơn giá gốc (trọn gói canh máy); Chạy máy = phần vượt MOQ.
    const cpLenBai = giaGocBinhBai;
    const cpChayMay = Math.max(0, cpBinhBai - giaGocBinhBai);

    let cpXLBM = 0;
    if (vtbm && input.vatTuBeMat !== 'Không') {
        const xlbm = d.giaCong.find((g) => g.code === 'XLBM')!;
        const rate = pickRate(sl, xlbm.tiers, d.tyLe.mocSoLuong) * (vtbm.soMat === '2 mặt' ? 2 : 1);
        cpXLBM = sl < MOQ ? params.GiaMin_XLBM : rate * pcs('XLBM');
    }
    const cpBe = input.be ? stageCostAt('BE', sl, pcs('BE'), d) : 0;
    let cpTP = 0;
    if (input.thanhPham === 'tc') cpTP = stageCostAt('TP_TC', sl, pcs('TP'), d);
    else if (input.thanhPham === 'may') {
        const tpmay = d.giaCong.find((g) => g.code === 'TP_MAY')!;
        const rate = pickRate(sl, tpmay.tiers, d.tyLe.mocSoLuong);
        cpTP = sl < MOQ ? rate : rate * pcs('TP');
    }
    const cpCatXen = input.catXen ? stageCostAt('CATXEN', sl, pcs('CATXEN'), d) : 0;
    const cpDongGoi = input.dongGoi ? stageCostAt('DONGGOI', sl, pcs('DONGGOI'), d) : 0;
    const cpEpKim = chiPhiEpKim(input.epKimViTri, sl, d);
    const thietKe = input.thietKe ?? phi('Gia_ThietKe', d);
    // Phí thiết kế là giá CHƯA VAT (như mọi dòng chi phí); VAT cộng sau ở tổng theo % báo giá.
    const cpThietKe = thietKe;

    const lines: QuoteLine[] = [
        { label: 'Chi phí giấy', amount: cpGiay },
        { label: 'Làm kẽm', amount: cpLamKem },
        { label: 'Vật tư bề mặt (cán màng)', amount: cpCanMang },
        { label: 'Khuôn', amount: cpKhuon },
        { label: 'Lên bài (canh máy)', amount: cpLenBai },
        { label: 'In (chạy máy)', amount: cpChayMay },
        { label: 'Gia công bề mặt (XLBM)', amount: cpXLBM },
        { label: 'Bế', amount: cpBe },
        { label: 'Thành phẩm', amount: cpTP },
        { label: 'Cắt/xén', amount: cpCatXen },
        { label: 'Đóng gói', amount: cpDongGoi },
        { label: 'Ép kim', amount: cpEpKim },
        { label: 'Thiết kế', amount: cpThietKe },
    ];
    const baseSXTK = cpBinhBai + cpXLBM + cpBe + cpTP + cpCatXen + cpDongGoi + cpEpKim + cpThietKe;
    const extraLines = extraProcessingLines(input.extraProcessing, sl, d);
    lines.push(...extraLines);
    const baseSXTKFull = baseSXTK + extraLines.reduce((s, l) => s + l.amount, 0);
    const wasteInfo = giaGiay(input.materialCode, d) * (sheetsGross - w.sheetsNet);

    const sheet = docKichThuocCm(kho.khoGiayLon);
    const res = tongHopKetQua(lines, baseSXTKFull, sl, d, wasteInfo, input.chietKhauRate, input.vatRate);
    res.meta = {
        khoBinh: kho.khoIn, khoGiayLon: kho.khoGiayLon, soConBaiIn, soConToLon: soCon, soToLon: sheetsGross, luotIn,
        soKem: input.soMau, loaiKem: kho.loaiKem, sheetW: sheet?.w, sheetH: sheet?.h, itemW, itemH,
        impositionSource: imposition.source,
    };
    if (imposition.shadow) res.meta.shadow = imposition.shadow;
    if (imposition.positions) res.meta.positions = imposition.positions;
    if (imposition.marginConfig) res.meta.marginConfig = imposition.marginConfig;
    return res;
}
