/**
 * Bì thư + Folder (khổ cố định) — báo giá offset (bù hao theo công đoạn).
 * Số con/tờ lấy từ bảng khổ cố định. Kẽm folder×2 (folder + in 2 mặt).
 */
import { PricingData, QuoteLine, QuoteResult, OffsetPricingError, KhoIn } from '../pricing-data';
import { giaGiay, dienTichKho, pickRate, docKichThuocCm, timKhoIn } from '../lookups';
import { resolveSoCon, SoConOutcome } from '../imposition-selector';
import { tongHopKetQua } from '../totals';
import { buildWaste, stageCostAt, extraProcessingLines } from './_waste-stages';

export interface BiThuFolderInput {
    type: 'bi_thu_folder';
    // Chế độ KHỔ TĨNH: chọn kích thước có sẵn.
    kichThuoc?: string;
    // Chế độ NHẬP KÍCH THƯỚC (động): khổ in + kích thước phẳng (cm) + loại.
    khoIn?: string;
    rong?: number;
    cao?: number;
    loai?: 'bithu' | 'folder';
    materialCode: string;
    soMatIn: 1 | 2;
    soLuong: number;
    kemType?: 'Kẽm nhỏ' | 'Kẽm lớn'; // tuỳ chọn — mặc định suy từ khổ in
    soKemIn: number;                  // số màu in (= số bản kẽm)
    vatTuBeMat: string;
    khuon: boolean;
    be: boolean;
    thanhPhamDan: 'khong' | 'tc' | 'may';
    dongGoi: boolean;
    thietKe?: number;
    chietKhauRate?: number;
    vatRate?: number;
    /** Gia công thêm (mã processing_options scope_offset, ngoài tập lõi) — cộng thêm. */
    extraProcessing?: string[];
}

const phi = (code: string, d: PricingData): number => d.phiCoDinh.find((p) => p.code === code)?.giaTri ?? 0;

export function tinhBiThuFolder(input: BiThuFolderInput, d: PricingData): QuoteResult {
    if (!input.soLuong || input.soLuong < 1) throw new OffsetPricingError('Số lượng đặt hàng phải >= 1');

    const sl = input.soLuong;
    const soMat = input.soMatIn;

    // Hai chế độ song song: khổ TĨNH (tra bảng) hoặc NHẬP kích thước (dàn khuôn động).
    // Số con/tờ lấy từ NGUỒN DUY NHẤT `resolveSoCon` (selector): legacy = imposeFromKhoIn + fallback
    // bảng tĩnh (tái lập hành vi golden); unified = imposeUnified (lề/gripper/gutter). `soConOutcome`
    // giữ kết quả cuối cùng để đính meta (impositionSource/shadow/positions/marginConfig) cho parity.
    let soCon: number, soConBaiIn: number, khoBinh: string, khoGiayLon: string, isFolder: boolean;
    let itemW: number | undefined, itemH: number | undefined;
    let soConOutcome: SoConOutcome | undefined;
    if (input.kichThuoc) {
        const fs = d.fixedSizes.biThuFolder.find((x) => x.kichThuoc === input.kichThuoc);
        if (!fs) throw new OffsetPricingError(`Kích thước bì thư/folder không tồn tại: ${input.kichThuoc}`);
        khoBinh = fs.khoIn; khoGiayLon = fs.khoGiayLon; isFolder = fs.loai === 'folder';
        const it = docKichThuocCm(input.kichThuoc); itemW = it?.w; itemH = it?.h;
        // Dàn khuôn qua selector trên khổ mặc định của size (fallback số bảng nếu không tính được).
        const recFs = timKhoIn(fs.khoIn, d);
        const khoFs: KhoIn = recFs
            ? { ...recFs, khoIn: fs.khoIn, khoGiayLon: fs.khoGiayLon }
            : { khoIn: fs.khoIn, chiaTo: '', soConBaiIn: fs.soConBaiIn, soConToLon: fs.soConKhoGiayLon, khoGiayLon: fs.khoGiayLon, dienTichM2: 0, loaiKem: 'Kẽm lớn' };
        const sc = resolveSoCon({
            itemWcm: itemW, itemHcm: itemH, kho: khoFs, data: d,
            fallbackToLon: fs.soConKhoGiayLon, fallbackBaiIn: fs.soConBaiIn,
        });
        soCon = sc.soConToLon; soConBaiIn = sc.soConBaiIn; soConOutcome = sc;
        // Audit 2026-08-29: nhánh khổ TĨNH thiếu guard `> 0` (nhánh nhập kích thước đã có).
        // `soCon = 0` ⇒ tiền giấy 0; `soConBaiIn = 0` ⇒ `luotIn = Infinity` ⇒ báo giá rác.
        if (!(soCon > 0) || !(soConBaiIn > 0)) {
            throw new OffsetPricingError(
                `Khổ "${fs.khoIn}" của kích thước "${input.kichThuoc}" chưa xác định được số con/tờ ` +
                '(cần bổ sung "số con/bài in" và "số con/khổ giấy lớn" cho khổ này).',
            );
        }
        // Người dùng chọn khổ in cụ thể (preview/gợi ý) → dùng khổ đó & dàn khuôn lại theo kích thước
        // phẳng để báo giá đổi realtime. Không chọn (khoIn rỗng) → giữ khổ mặc định của size (golden).
        if (input.khoIn && itemW && itemH) {
            const khoChon = timKhoIn(input.khoIn, d);
            if (khoChon) {
                const ov = resolveSoCon({ itemWcm: itemW, itemHcm: itemH, kho: khoChon, data: d });
                if (ov.soConToLon > 0 && ov.soConBaiIn > 0) {
                    soCon = ov.soConToLon; soConBaiIn = ov.soConBaiIn;
                    khoBinh = khoChon.khoIn; khoGiayLon = khoChon.khoGiayLon;
                    soConOutcome = ov;
                }
            }
        }
    } else {
        if (!input.khoIn) throw new OffsetPricingError('Cần chọn khổ in khi nhập kích thước tùy chỉnh');
        if (!input.rong || !input.cao || input.rong <= 0 || input.cao <= 0) throw new OffsetPricingError('Cần nhập kích thước (rộng × cao) hợp lệ');
        const kho = timKhoIn(input.khoIn, d);
        if (!kho) throw new OffsetPricingError(`Khổ in không tồn tại: ${input.khoIn}`);
        const sc = resolveSoCon({ itemWcm: input.rong, itemHcm: input.cao, kho, data: d });
        if (!(sc.soConToLon > 0) || !(sc.soConBaiIn > 0)) throw new OffsetPricingError('Kích thước sản phẩm quá lớn cho khổ in đã chọn');
        soCon = sc.soConToLon; soConBaiIn = sc.soConBaiIn; khoBinh = kho.khoIn; khoGiayLon = kho.khoGiayLon; isFolder = input.loai === 'folder';
        soConOutcome = sc;
        itemW = input.rong; itemH = input.cao;
    }

    // Loại kẽm SUY từ khổ in (không hỏi người dùng).
    const kemType = timKhoIn(khoBinh, d)?.loaiKem ?? input.kemType ?? 'Kẽm lớn';
    const params = d.tyLe.params;
    const MOQ = params.MOQ_GiaCong;

    const w = buildWaste(d, sl, soCon, [
        { code: 'IN', defaultBasis: 'sheet' },
        { code: 'CAN', defaultBasis: 'sheet' },
        { code: 'XLBM', defaultBasis: 'piece' },
        { code: 'BE', defaultBasis: 'piece' },
        { code: 'TP', defaultBasis: 'piece' },
        { code: 'DONGGOI', defaultBasis: 'piece' },
    ]);
    const sheetsGross = w.sheetsGross;
    const sheetsAtCan = w.q('CAN') || w.sheetsNet;
    const pcs = (c: string) => w.q(c) || sl;

    const luotIn = (sl / soConBaiIn) * soMat;

    const cpGiay = giaGiay(input.materialCode, d) * sheetsGross;
    const don1Kem = kemType === 'Kẽm lớn' ? d.kem.donGia1Kem.kemLon : d.kem.donGia1Kem.kemNho;
    const don1KemAdj = isFolder && soMat === 2 ? don1Kem * 2 : don1Kem;
    const cpLamKem = don1KemAdj * input.soKemIn;

    let cpCanMang = 0;
    const vtbm = d.kem.vatTuBeMat.find((v) => v.ten === input.vatTuBeMat);
    if (input.vatTuBeMat && input.vatTuBeMat !== 'Không') {
        if (!vtbm) throw new OffsetPricingError(`Vật tư bề mặt không tồn tại: ${input.vatTuBeMat}`);
        cpCanMang = dienTichKho(khoBinh, d) * vtbm.donGiaKg * soMat * sheetsAtCan;
    }
    const cpKhuon = input.khuon ? phi('Gia_Khuon', d) : 0;

    const bang = kemType === 'Kẽm lớn' ? d.kem.kemLon : d.kem.kemNho;
    const giaGocBinhBai = (bang.find((k) => k.soKem === input.soKemIn) ?? bang[bang.length - 1]).donGia;
    const moqBinhBai = params.MOQ_BinhBai_Nho;
    const cpBinhBai = luotIn <= moqBinhBai ? giaGocBinhBai : (luotIn * giaGocBinhBai) / moqBinhBai;
    // Tách rõ 2 phần (tổng = cpBinhBai): Lên bài = công gốc (trọn gói canh máy); Chạy máy = phần vượt MOQ.
    const cpLenBai = giaGocBinhBai;
    const cpChayMay = Math.max(0, cpBinhBai - giaGocBinhBai);

    const cpBe = input.be ? stageCostAt('BE', sl, pcs('BE'), d) : 0;
    let cpTP = 0;
    if (input.thanhPhamDan === 'tc') cpTP = stageCostAt('TP_TC', sl, pcs('TP'), d);
    else if (input.thanhPhamDan === 'may') {
        const tpmay = d.giaCong.find((g) => g.code === 'TP_MAY')!;
        const rate = pickRate(sl, tpmay.tiers, d.tyLe.mocSoLuong);
        cpTP = sl < MOQ ? rate : rate * pcs('TP');
    }
    const cpDongGoi = input.dongGoi ? stageCostAt('DONGGOI', sl, pcs('DONGGOI'), d) : 0;

    let cpXLBM = 0;
    if (vtbm && input.vatTuBeMat !== 'Không') {
        const xlbm = d.giaCong.find((g) => g.code === 'XLBM')!;
        const rate = pickRate(sl, xlbm.tiers, d.tyLe.mocSoLuong) * (vtbm.soMat === '2 mặt' ? 2 : 1);
        cpXLBM = sl < MOQ ? params.GiaMin_XLBM : rate * pcs('XLBM');
    }
    // Phí thiết kế là giá CHƯA VAT (như mọi dòng chi phí); VAT cộng sau ở tổng theo % báo giá.
    const cpThietKe = input.thietKe ?? phi('Gia_ThietKe', d);

    const lines: QuoteLine[] = [
        { label: 'Chi phí giấy', amount: cpGiay },
        { label: 'Làm kẽm', amount: cpLamKem },
        { label: 'Vật tư bề mặt (cán màng)', amount: cpCanMang },
        { label: 'Khuôn', amount: cpKhuon },
        { label: 'Lên bài (canh máy)', amount: cpLenBai },
        { label: 'In (chạy máy)', amount: cpChayMay },
        { label: 'Bế', amount: cpBe },
        { label: 'Thành phẩm dán', amount: cpTP },
        { label: 'Đóng gói', amount: cpDongGoi },
        { label: 'Gia công bề mặt (XLBM)', amount: cpXLBM },
        { label: 'Thiết kế', amount: cpThietKe },
    ];
    // Base chiết khấu = SẢN XUẤT + THIẾT KẾ. Audit 2026-08-29: BỔ SUNG `cpThietKe` — đây là
    // sản phẩm DUY NHẤT trong 5 loại offset thiếu phí thiết kế trong base, trong khi hợp đồng
    // `totals.ts` và 4 sản phẩm còn lại (to_roi, sp_khac, hop_giay, tui_giay) đều tính.
    // Ảnh hưởng golden: fixture bi_thu_folder truyền `thietKe: 0` ⇒ cpThietKe = 0 ⇒ số pin KHÔNG đổi.
    const baseSXTK = cpBinhBai + cpBe + cpTP + cpDongGoi + cpXLBM + cpThietKe;
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
        impositionSource: soConOutcome?.source,
        ...(soConOutcome?.shadow ? { shadow: soConOutcome.shadow } : {}),
        ...(soConOutcome?.positions ? { positions: soConOutcome.positions } : {}),
        ...(soConOutcome?.marginConfig ? { marginConfig: soConOutcome.marginConfig } : {}),
    };
    return res;
}
