/**
 * Tờ rơi / tờ gấp / letter (khổ cố định) — báo giá offset (bù hao theo công đoạn).
 *
 *  - giấy/cán theo TỜ; XLBM/bế/gấp/cắt/đóng gói theo SỐ CON (basis đổi được, định mức theo mốc riêng).
 *  - Số con/tờ lấy từ bảng khổ cố định (định mức tờ rơi). Kẽm/bình bài/khuôn theo công thức gốc.
 */
import { PricingData, QuoteLine, QuoteResult, OffsetPricingError, KhoIn } from '../pricing-data';
import { giaGiay, dienTichKho, pickRate, chiPhiLamKem, chiPhiBinhBai, docKichThuocCm, timKhoIn } from '../lookups';
import { resolveSoCon, SoConOutcome } from '../imposition-selector';
import { tongHopKetQua } from '../totals';
import { buildWaste, stageCostAt, extraProcessingLines } from './_waste-stages';

export interface ToRoiInput {
    type: 'to_roi';
    // Chế độ KHỔ TĨNH: chọn 1 kích thước có sẵn (định mức tờ rơi).
    kichThuoc?: string;
    // Chế độ NHẬP KÍCH THƯỚC (động): khổ in + kích thước thành phẩm phẳng (cm).
    khoIn?: string;
    rong?: number;
    cao?: number;
    materialCode: string;
    soMatIn: 1 | 2;
    soLuong: number;
    kemType?: 'Kẽm nhỏ' | 'Kẽm lớn'; // tuỳ chọn — mặc định suy từ khổ in
    soKemIn: number;                  // số màu in (= số bản kẽm)
    vatTuBeMat: string;
    khuon: boolean;
    be: boolean;
    thanhPhamGap: 'khong' | 'tc' | 'may';
    catXen: boolean;
    dongGoi: boolean;
    thietKe?: number;
    chietKhauRate?: number;
    vatRate?: number;
    /** Gia công thêm (mã processing_options scope_offset, ngoài tập lõi) — cộng thêm. */
    extraProcessing?: string[];
}

const phi = (code: string, d: PricingData): number => d.phiCoDinh.find((p) => p.code === code)?.giaTri ?? 0;

export function tinhToRoi(input: ToRoiInput, d: PricingData): QuoteResult {
    if (!input.soLuong || input.soLuong < 1) throw new OffsetPricingError('Số lượng đặt hàng phải >= 1');

    const sl = input.soLuong;
    const soMat = input.soMatIn;

    // Hai chế độ song song: khổ TĨNH (tra bảng) hoặc NHẬP kích thước (dàn khuôn động).
    let soCon: number, soConBaiIn: number, khoBinh: string, khoGiayLon: string;
    let itemW: number | undefined, itemH: number | undefined;
    let imposition: SoConOutcome | undefined;
    if (input.kichThuoc) {
        const fs = d.fixedSizes.toRoi.find((x) => x.kichThuoc === input.kichThuoc);
        if (!fs) throw new OffsetPricingError(`Kích thước tờ rơi không tồn tại: ${input.kichThuoc}`);
        khoBinh = fs.khoIn; khoGiayLon = fs.khoGiayLon;
        const it = docKichThuocCm(input.kichThuoc); itemW = it?.w; itemH = it?.h;
        // Số con: tự tính theo hình học từ kích thước + khổ in (fallback số bảng nếu không tính được)
        // qua nguồn imposition thống nhất (selector). Dùng margins của khổ in tra cứu được.
        const recFixed = timKhoIn(fs.khoIn, d);
        const khoFixed = {
            ...(recFixed ?? {}),
            khoIn: fs.khoIn, khoGiayLon: fs.khoGiayLon,
            soConBaiIn: fs.soConBaiIn, soConToLon: fs.soConToLon,
        } as KhoIn;
        imposition = resolveSoCon({
            itemWcm: itemW, itemHcm: itemH, kho: khoFixed, data: d,
            fallbackToLon: fs.soConToLon, fallbackBaiIn: fs.soConBaiIn,
        });
        soCon = imposition.soConToLon; soConBaiIn = imposition.soConBaiIn;
        // Người dùng chọn khổ in cụ thể (preview/gợi ý) → dùng khổ đó & dàn khuôn lại theo kích thước
        // phẳng để báo giá đổi realtime. Không chọn (khoIn rỗng) → giữ khổ mặc định của size (golden).
        if (input.khoIn && itemW && itemH) {
            const khoChon = timKhoIn(input.khoIn, d);
            if (khoChon) {
                const imp2 = resolveSoCon({ itemWcm: itemW, itemHcm: itemH, kho: khoChon, data: d });
                if (imp2.soConToLon > 0 && imp2.soConBaiIn > 0) {
                    soCon = imp2.soConToLon; soConBaiIn = imp2.soConBaiIn;
                    khoBinh = khoChon.khoIn; khoGiayLon = khoChon.khoGiayLon;
                    imposition = imp2;
                }
            }
        }
    } else {
        if (!input.khoIn) throw new OffsetPricingError('Cần chọn khổ in khi nhập kích thước tùy chỉnh');
        if (!input.rong || !input.cao || input.rong <= 0 || input.cao <= 0) throw new OffsetPricingError('Cần nhập kích thước (rộng × cao) hợp lệ');
        const kho = timKhoIn(input.khoIn, d);
        if (!kho) throw new OffsetPricingError(`Khổ in không tồn tại: ${input.khoIn}`);
        imposition = resolveSoCon({ itemWcm: input.rong, itemHcm: input.cao, kho, data: d });
        if (!(imposition.soConToLon > 0) || !(imposition.soConBaiIn > 0)) throw new OffsetPricingError('Kích thước sản phẩm quá lớn cho khổ in đã chọn');
        soCon = imposition.soConToLon; soConBaiIn = imposition.soConBaiIn; khoBinh = kho.khoIn; khoGiayLon = kho.khoGiayLon;
        itemW = input.rong; itemH = input.cao;
    }

    // Loại kẽm SUY từ khổ in (không hỏi người dùng); fallback input/khổ lớn.
    const kemType = timKhoIn(khoBinh, d)?.loaiKem ?? input.kemType ?? 'Kẽm lớn';
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

    const luotIn = Math.ceil(sl / soConBaiIn) * soMat;

    const cpGiay = giaGiay(input.materialCode, d) * sheetsGross;
    const cpLamKem = chiPhiLamKem(kemType, input.soKemIn, d);

    let cpCanMang = 0;
    const vtbm = d.kem.vatTuBeMat.find((v) => v.ten === input.vatTuBeMat);
    if (input.vatTuBeMat && input.vatTuBeMat !== 'Không') {
        if (!vtbm) throw new OffsetPricingError(`Vật tư bề mặt không tồn tại: ${input.vatTuBeMat}`);
        cpCanMang = dienTichKho(khoBinh, d) * vtbm.donGiaKg * soMat * sheetsAtCan;
    }
    const cpKhuon = input.khuon ? phi('Gia_Khuon', d) : 0;

    const giaGocBinhBai = chiPhiBinhBai(kemType, input.soKemIn, luotIn, d);
    const moqBinhBai = kemType === 'Kẽm lớn' ? params.MOQ_BinhBai_Lon : params.MOQ_BinhBai_Nho;
    const cpBinhBai = luotIn <= moqBinhBai ? giaGocBinhBai : giaGocBinhBai + ((luotIn - moqBinhBai) * giaGocBinhBai) / moqBinhBai;
    // Tách rõ 2 phần (tổng = cpBinhBai): Lên bài = công gốc (trọn gói canh máy); Chạy máy = phần vượt MOQ.
    const cpLenBai = giaGocBinhBai;
    const cpChayMay = Math.max(0, cpBinhBai - giaGocBinhBai);

    let cpXLBM = 0;
    if (vtbm && input.vatTuBeMat !== 'Không') {
        const xlbm = d.giaCong.find((g) => g.code === 'XLBM')!;
        const rate = pickRate(sl, xlbm.tiers, d.tyLe.mocSoLuong) * (vtbm.soMat === '2 mặt' ? 2 : 1);
        cpXLBM = sl < MOQ ? params.GiaMin_XLBM : rate * pcs('XLBM');
    }
    const cpBeReal = input.be ? stageCostAt('BE', sl, pcs('BE'), d) : 0;
    let cpTP = 0;
    if (input.thanhPhamGap === 'tc') cpTP = stageCostAt('TP_TC', sl, pcs('TP'), d);
    else if (input.thanhPhamGap === 'may') {
        const tpmay = d.giaCong.find((g) => g.code === 'TP_MAY')!;
        const rate = pickRate(sl, tpmay.tiers, d.tyLe.mocSoLuong);
        cpTP = sl < MOQ ? rate : rate * pcs('TP');
    }
    const cpCatXen = input.catXen ? stageCostAt('CATXEN', sl, pcs('CATXEN'), d) : 0;
    const cpDongGoi = input.dongGoi ? stageCostAt('DONGGOI', sl, pcs('DONGGOI'), d) : 0;
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
        { label: 'Bế', amount: cpBeReal },
        { label: 'Thành phẩm gấp', amount: cpTP },
        { label: 'Cắt/xén', amount: cpCatXen },
        { label: 'Đóng gói', amount: cpDongGoi },
        { label: 'Thiết kế', amount: cpThietKe },
    ];
    const baseSXTK = cpBinhBai + cpXLBM + cpBeReal + cpTP + cpCatXen + cpDongGoi + cpThietKe;
    const extraLines = extraProcessingLines(input.extraProcessing, sl, d);
    lines.push(...extraLines);
    const baseSXTKFull = baseSXTK + extraLines.reduce((s, l) => s + l.amount, 0);
    const wasteInfo = giaGiay(input.materialCode, d) * (sheetsGross - w.sheetsNet);

    const sheet = docKichThuocCm(khoGiayLon);
    const res = tongHopKetQua(lines, baseSXTKFull, sl, d, wasteInfo, input.chietKhauRate, input.vatRate);
    res.meta = {
        khoBinh, khoGiayLon, soConBaiIn, soConToLon: soCon, soToLon: sheetsGross, luotIn,
        soKem: input.soKemIn, loaiKem: kemType,
        sheetW: sheet?.w, sheetH: sheet?.h, itemW, itemH,
    };
    if (imposition) {
        res.meta.impositionSource = imposition.source;
        if (imposition.shadow) res.meta.shadow = imposition.shadow;
        if (imposition.positions) res.meta.positions = imposition.positions;
        if (imposition.marginConfig) res.meta.marginConfig = imposition.marginConfig;
    }
    return res;
}
