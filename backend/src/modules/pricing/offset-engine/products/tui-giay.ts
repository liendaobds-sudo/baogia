/**
 * Túi giấy (khổ tùy chỉnh) — báo giá offset (bù hao theo công đoạn).
 *
 *  - Khổ trải: cao = C+mí+hông×0.85; rộng = R×2+H×2+1.5; dán nối dùng (cao, rộng/2+1.5).
 *  - "Bài in" chọn từ bảng xếp con; số con/bài qua hàm xếp con (khe hở 0.3cm); dán nối thì /2.
 *  - giấy theo TỜ gross; cán theo tỷ lệ tờ; XLBM/bế/TP túi/đóng gói theo SỐ CON. Dây xách/thùng/kẽm gốc.
 */
import { PricingData, QuoteLine, QuoteResult, OffsetPricingError, KhoIn, MarginConfig, Params, numParam } from '../pricing-data';
import { giaGiay, dienTichKho, pickRate, docKichThuocCm, soConTrenKho, chuanHoaKho } from '../lookups';
import { tongHopKetQua } from '../totals';
import { buildWaste, stageCostAt, extraProcessingLines } from './_waste-stages';
import { ImpositionSource, readImpositionSource } from '../imposition-selector';
import { ItemPosition, imposeUnified, resolveMarginConfig } from '../imposition';

/** Hệ số đổi đơn vị cm → mm (Imposition_Service làm việc bằng mm). */
const CM_TO_MM = 10;

export interface TuiGiayInput {
    type: 'tui_giay';
    soLuong: number;
    cao: number;
    rong: number;
    hong: number;
    mi: number;
    materialCode: string;
    baiIn?: string;   // tuỳ chọn — mặc định auto chọn bài in tối ưu theo kích thước
    soKem: number;
    vatTuBeMat: string;
    dayXach: { loai: 'khong' | '1' | '2'; donGia: number };
    thungCaton: { sl: number; donGia: number };
    dongGoi: boolean;
    thietKe?: number;
    chietKhauRate?: number;
    vatRate?: number;
    /** Gia công thêm (mã processing_options scope_offset, ngoài tập lõi) — cộng thêm. */
    extraProcessing?: string[];
}

interface NestOption {
    label: string;
    numW: number;
    numH: number;
    heSo: number;
    khoArea: string;
    danNoi: boolean;
    kemLon: boolean;
    /**
     * Bản ghi khổ in nguồn (khi sinh ĐỘNG từ `d.khoIn`) — cung cấp lề/gripper/gutter cho
     * primitive `imposeUnified` ở chế độ `unified`. Thiếu (bảng tĩnh) → dùng lề mặc định từ params.
     */
    kho?: KhoIn;
}

/**
 * Bảng "bài in" túi mặc định — CHỈ dùng làm fallback khi nhà in
 * chưa cấu hình khổ giấy. Nguồn chính là `buildTuiOptions()` sinh từ khổ giấy cấu hình.
 */
export const TUI_NEST_OPTIONS: NestOption[] = [
    { label: '36 x 72cm', numW: 35, numH: 70, heSo: 3, khoArea: '36cm x 72cm', danNoi: false, kemLon: false },
    { label: '39.5 x 54cm', numW: 38.5, numH: 53, heSo: 4, khoArea: '39.5cm x 54cm', danNoi: false, kemLon: false },
    { label: '43 x 65cm', numW: 42, numH: 64, heSo: 2, khoArea: '43cm x 65cm', danNoi: false, kemLon: false },
    { label: '52 x 72cm', numW: 50, numH: 70, heSo: 2, khoArea: '52cm x 72cm', danNoi: false, kemLon: false },
    { label: '28 x 60cm', numW: 27, numH: 59, heSo: 6, khoArea: '28cm x 60cm', danNoi: false, kemLon: false },
    { label: '65 x 86cm', numW: 64, numH: 85, heSo: 1, khoArea: '65cm x 86cm', danNoi: false, kemLon: true },
    { label: '54 x 79cm', numW: 53, numH: 78, heSo: 2, khoArea: '54cm x 79cm', danNoi: false, kemLon: true },
    { label: '39.5 x 54cm (dán nối)', numW: 38.5, numH: 53, heSo: 4, khoArea: '39.5cm x 54cm', danNoi: true, kemLon: false },
    { label: '43 x 65cm (dán nối)', numW: 42, numH: 64, heSo: 2, khoArea: '43cm x 65cm', danNoi: true, kemLon: false },
    { label: '52 x 72cm (dán nối)', numW: 50, numH: 70, heSo: 2, khoArea: '52cm x 72cm', danNoi: true, kemLon: false },
    { label: '28 x 60cm (dán nối)', numW: 27, numH: 59, heSo: 6, khoArea: '28cm x 60cm', danNoi: true, kemLon: false },
];

/**
 * Sinh danh sách "bài in" túi ĐỘNG từ khổ giấy nhà in cấu hình (`d.khoIn`) — bỏ phụ thuộc bảng tĩnh.
 *  - bài in = khổ in (kho.khoIn) trừ gripper; heSo = số bài in/tờ lớn (hình học, cắt sát gap 0);
 *    kemLon suy từ loaiKem; mỗi khổ tạo 2 phương án: thường + dán nối.
 * @param gripperCm lề mặc định mỗi trục khi khổ chưa khai báo lề (cm); mặc định từ params.Gripper_Cm (1).
 */
export function buildTuiOptions(d: PricingData, gripperCm?: number): NestOption[] {
    const grip = gripperCm ?? (Number(d.tyLe.params.Gripper_Cm) || 1);
    const out: NestOption[] = [];
    for (const kho of d.khoIn) {
        const bai = docKichThuocCm(kho.khoIn);
        if (!bai) continue;
        const lon = docKichThuocCm(kho.khoGiayLon);
        let heSo = lon ? soConTrenKho(lon.w, lon.h, bai.w, bai.h, 0) : 0;
        if (!(heSo > 0)) heSo = kho.soConBaiIn > 0 ? Math.round(kho.soConToLon / kho.soConBaiIn) : 1;
        if (!(heSo > 0)) heSo = 1;
        const mW = (kho.marginLeft ?? 0) + (kho.marginRight ?? 0);
        const mH = (kho.marginTop ?? 0) + (kho.marginBottom ?? 0);
        const numW = Math.max(0, bai.w - (mW || grip));
        const numH = Math.max(0, bai.h - (mH || grip));
        const kemLon = kho.loaiKem === 'Kẽm lớn';
        out.push({ label: kho.khoIn, numW, numH, heSo, khoArea: kho.khoIn, danNoi: false, kemLon, kho });
        out.push({ label: `${kho.khoIn} (dán nối)`, numW, numH, heSo, khoArea: kho.khoIn, danNoi: true, kemLon, kho });
    }
    return out;
}

/** Hệ số khổ trải túi — mặc định theo công thức gốc; có thể cấu hình qua params. */
export interface TuiCoef {
    /** Hệ số chiều cao gập đáy theo hông (mặc định 0.85). */
    gapDay: number;
    /** Mép dán hông cộng vào chiều rộng trải (cm, mặc định 1.5). */
    mepHong: number;
    /** Mép dán nối cộng vào nửa khổ khi dán nối (cm, mặc định 1.5). */
    mepNoi: number;
}
export const TUI_COEF_DEFAULT: TuiCoef = { gapDay: 0.85, mepHong: 1.5, mepNoi: 1.5 };

export function khoTraiTui(input: Pick<TuiGiayInput, 'cao' | 'rong' | 'hong' | 'mi'>, coef: TuiCoef = TUI_COEF_DEFAULT) {
    const caoTrai = input.cao + input.mi + input.hong * coef.gapDay;
    const rongTrai = input.rong * 2 + input.hong * 2 + coef.mepHong;
    const danNoiCao = caoTrai;
    const danNoiRong = rongTrai / 2 + coef.mepNoi;
    return { caoTrai, rongTrai, danNoiCao, danNoiRong };
}

/** Số con/bài cho một bài in (khe hở cấu hình, thử 2 chiều; dán nối thì /2). */
export function soConBai(opt: NestOption, kt: ReturnType<typeof khoTraiTui>, gap = 0.3): number {
    const a = opt.danNoi ? kt.danNoiCao : kt.caoTrai;
    const b = opt.danNoi ? kt.danNoiRong : kt.rongTrai;
    const base = Math.max(
        Math.floor(opt.numW / (a + gap)) * Math.floor(opt.numH / (b + gap)),
        Math.floor(opt.numW / (b + gap)) * Math.floor(opt.numH / (a + gap)),
    );
    return opt.danNoi ? base / 2 : base;
}

/**
 * Số con/bài THỐNG NHẤT (chế độ `unified`) — áp Margin_Config (lề/gripper/gutter) qua primitive
 * `imposeUnified` thay khe hở phẳng, trên khổ bài in ĐẦY ĐỦ (`opt.khoArea`, KHÔNG dùng `numW/numH`
 * vì primitive tự trừ lề). Khổ trải túi (`khoTraiTui`) vẫn là kích thước con đặc thù — chỉ đổi
 * CÁCH XẾP CON lên khổ để tôn trọng ràng buộc máy in vật lý (Req 9.2, 9.3).
 *
 * Trả thêm `positions`/`marginConfig` (mm) cho parity preview. Lỗi hình học (vùng in ≤ 0 sau khi
 * trừ lề) → trả `count = 0` (không ném) để vòng tự chọn bài in không vỡ; fail-fast ở giá xảy ra
 * ở tầng cascade khi số con cuối = 0, đồng nhất hành vi flat-gap cũ.
 */
export function soConBaiUnified(
    opt: NestOption,
    kt: ReturnType<typeof khoTraiTui>,
    params: Params,
): { count: number; positions?: ItemPosition[]; marginConfig?: MarginConfig } {
    const press = docKichThuocCm(opt.khoArea);
    if (!press) return { count: 0 };
    const caoCon = opt.danNoi ? kt.danNoiCao : kt.caoTrai;   // chiều cao con (cm)
    const rongCon = opt.danNoi ? kt.danNoiRong : kt.rongTrai; // chiều rộng con (cm)
    const margins = resolveMarginConfig(opt.kho ?? { khoIn: opt.khoArea }, params);
    try {
        const imp = imposeUnified({
            itemWmm: rongCon * CM_TO_MM,
            itemHmm: caoCon * CM_TO_MM,
            sheetWmm: press.w * CM_TO_MM,
            sheetHmm: press.h * CM_TO_MM,
            margins,
        });
        const base = imp.soConToLon;
        return { count: opt.danNoi ? base / 2 : base, positions: imp.positions, marginConfig: margins };
    } catch (err) {
        if (err instanceof OffsetPricingError) return { count: 0, marginConfig: margins };
        throw err;
    }
}

const phi = (code: string, d: PricingData): number => d.phiCoDinh.find((p) => p.code === code)?.giaTri ?? 0;

export function tinhTuiGiay(input: TuiGiayInput, d: PricingData): QuoteResult {
    if (!input.soLuong || input.soLuong < 1) throw new OffsetPricingError('Số lượng đặt hàng phải >= 1');

    const sl = input.soLuong;
    const params = d.tyLe.params;
    const MOQ = params.MOQ_GiaCong;
    const gap = numParam(params, 'Gap_Cm') || 0.3;
    // Nguồn imposition (Req 6.1) — đọc theo CÙNG quy tắc selector. Mặc định an toàn 'legacy'
    // (giữ giá live + golden không đổi); 'unified' áp Margin_Config qua primitive imposeUnified.
    const source: ImpositionSource = readImpositionSource(params);
    const kt = khoTraiTui(input, {
        gapDay: numParam(params, 'Tui_HeSoGapDay') ?? TUI_COEF_DEFAULT.gapDay,
        mepHong: numParam(params, 'Tui_MepDanHong_Cm') ?? TUI_COEF_DEFAULT.mepHong,
        mepNoi: numParam(params, 'Tui_MepDanNoi_Cm') ?? TUI_COEF_DEFAULT.mepNoi,
    });

    /** Số con/bài theo nguồn đang chọn — dùng đồng nhất cho tự-chọn bài in VÀ tính giá. */
    const countOf = (o: NestOption): number =>
        source === 'unified' ? soConBaiUnified(o, kt, params).count : soConBai(o, kt, gap);

    // Bài in: nguồn ĐỘNG từ khổ giấy cấu hình (fallback bảng tĩnh nếu chưa cấu hình khổ nào).
    // Nếu loại 'tui_giay' có whitelist khổ in → chỉ duyệt trong các khổ cho phép (engine tôn trọng cấu hình).
    const candidates = (() => {
        const dyn = buildTuiOptions(d);
        const all = dyn.length ? dyn : TUI_NEST_OPTIONS;
        const allowed = d.productConfig?.['tui_giay']?.allowedKhoIn;
        if (allowed && allowed.length) {
            const set = new Set(allowed.map((s) => chuanHoaKho(s)));
            const filtered = all.filter((o) => set.has(chuanHoaKho(o.khoArea)));
            return filtered.length ? filtered : all; // tránh lọc đến rỗng
        }
        return all;
    })();
    // Dùng lựa chọn người dùng nếu có (khớp chính xác, sau đó khớp đã chuẩn hóa); nếu không, TỰ CHỌN tối ưu.
    let opt = input.baiIn
        ? (candidates.find((o) => o.label === input.baiIn) ?? candidates.find((o) => chuanHoaKho(o.label) === chuanHoaKho(input.baiIn!)))
        : undefined;
    if (input.baiIn && !opt) throw new OffsetPricingError(`Bài in túi không hợp lệ: ${input.baiIn}`);
    if (!opt) {
        opt = [...candidates]
            .sort((a, b) => (countOf(b) * b.heSo) - (countOf(a) * a.heSo))[0];
    }
    if (!opt) throw new OffsetPricingError('Không có bài in túi phù hợp');

    // Số con/bài theo nguồn đang chọn; ở 'unified' lấy thêm positions/marginConfig cho preview.
    let soConBaiVal: number;
    let positions: ItemPosition[] | undefined;
    let marginConfig: MarginConfig | undefined;
    if (source === 'unified') {
        const u = soConBaiUnified(opt, kt, params);
        soConBaiVal = u.count;
        positions = u.positions;
        marginConfig = u.marginConfig;
    } else {
        soConBaiVal = soConBai(opt, kt, gap);
    }
    const soCon = soConBaiVal * opt.heSo;
    if (!(soConBaiVal > 0) || !(opt.heSo > 0) || !(soCon > 0)) {
        throw new OffsetPricingError(
            'Kích thước túi không thể bình lên bài in đã chọn. Hãy chọn khổ khác hoặc giảm kích thước.',
        );
    }
    const luotIn = sl / soConBaiVal;
    const loaiKem = opt.kemLon ? 'Kẽm lớn' : 'Kẽm nhỏ';

    const w = buildWaste(d, sl, soCon, [
        { code: 'IN', defaultBasis: 'sheet' },
        { code: 'CAN', defaultBasis: 'sheet' },
        { code: 'XLBM', defaultBasis: 'piece' },
        { code: 'BE', defaultBasis: 'piece' },
        { code: 'TP', defaultBasis: 'piece' },
        { code: 'DONGGOI', defaultBasis: 'piece' },
    ]);
    const sheetsGross = w.sheetsGross;
    const sheetsNet = w.sheetsNet;
    const canFactor = sheetsNet > 0 ? (w.q('CAN') || sheetsNet) / sheetsNet : 1;
    const pcs = (c: string) => w.q(c) || sl;

    const giaTo = giaGiay(input.materialCode, d);
    const cpGiay = giaTo * sheetsGross;
    const don1Kem = opt.kemLon ? d.kem.donGia1Kem.kemLon : d.kem.donGia1Kem.kemNho;
    const cpLamKem = don1Kem * input.soKem;

    let cpCanMang = 0;
    const vtbm = d.kem.vatTuBeMat.find((v) => v.ten === input.vatTuBeMat);
    if (input.vatTuBeMat && input.vatTuBeMat !== 'Không') {
        if (!vtbm) throw new OffsetPricingError(`Vật tư bề mặt không tồn tại: ${input.vatTuBeMat}`);
        cpCanMang = dienTichKho(opt.khoArea, d) * vtbm.donGiaKg * luotIn * canFactor;
    }
    const cpKhuon = phi('Gia_Khuon', d);

    let cpDayXach = 0;
    if (input.dayXach.loai === '1') cpDayXach = input.dayXach.donGia * sl;
    else if (input.dayXach.loai === '2') cpDayXach = input.dayXach.donGia * 2 * sl;

    const bang = opt.kemLon ? d.kem.kemLon : d.kem.kemNho;
    const giaGocBinhBai = (bang.find((k) => k.soKem === input.soKem) ?? bang[bang.length - 1]).donGia;
    const moqBinhBai = opt.kemLon ? params.MOQ_BinhBai_Lon : params.MOQ_BinhBai_Nho;
    const cpBinhBai = luotIn <= moqBinhBai ? giaGocBinhBai : (luotIn * giaGocBinhBai) / moqBinhBai;
    // Tách rõ 2 phần (tổng = cpBinhBai): Lên bài = công gốc (trọn gói canh máy); Chạy máy = phần vượt MOQ.
    const cpLenBai = giaGocBinhBai;
    const cpChayMay = Math.max(0, cpBinhBai - giaGocBinhBai);

    let cpXLBM = 0;
    if (vtbm && input.vatTuBeMat !== 'Không') {
        const xlbm = d.giaCong.find((g) => g.code === 'XLBM')!;
        const rate = pickRate(sl, xlbm.tiers, d.tyLe.mocSoLuong) * (vtbm.soMat === '2 mặt' ? 2 : 1);
        cpXLBM = sl < MOQ ? params.GiaMin_XLBM : rate * pcs('XLBM');
    }
    const be = d.giaCong.find((g) => g.code === 'BE')!;
    const beRate = pickRate(sl, be.tiers, d.tyLe.mocSoLuong);
    const cpBe = sl < MOQ ? beRate : beRate * pcs('BE');

    const tptui = d.giaCong.find((g) => g.code === 'TP_TUI')!;
    const cpTP = pickRate(sl, tptui.tiers, d.tyLe.mocSoLuong) * pcs('TP');

    let cpDongGoi = 0;
    if (input.dongGoi) {
        const dg = d.giaCong.find((g) => g.code === 'DONGGOI')!;
        const rate = pickRate(sl, dg.tiers, d.tyLe.mocSoLuong);
        cpDongGoi = sl < MOQ ? rate : rate * pcs('DONGGOI');
    }
    const cpThung = input.thungCaton.donGia * input.thungCaton.sl;
    const thietKe = input.thietKe ?? phi('Gia_ThietKe', d);
    // Phí thiết kế là giá CHƯA VAT (như mọi dòng chi phí); VAT cộng sau ở tổng theo % báo giá.
    const cpThietKe = thietKe;

    const lines: QuoteLine[] = [
        { label: 'Chi phí giấy', amount: cpGiay },
        { label: 'Làm kẽm', amount: cpLamKem },
        { label: 'Vật tư bề mặt (cán màng)', amount: cpCanMang },
        { label: 'Khuôn', amount: cpKhuon },
        { label: 'Dây xách', amount: cpDayXach },
        { label: 'Lên bài (canh máy)', amount: cpLenBai },
        { label: 'In (chạy máy)', amount: cpChayMay },
        { label: 'Gia công bề mặt (XLBM)', amount: cpXLBM },
        { label: 'Bế', amount: cpBe },
        { label: 'Thành phẩm túi', amount: cpTP },
        { label: 'Đóng gói', amount: cpDongGoi },
        { label: 'Thùng caton', amount: cpThung },
        { label: 'Thiết kế', amount: cpThietKe },
    ];
    const baseSXTK = cpBinhBai + cpXLBM + cpBe + cpTP + cpDongGoi + cpThietKe;
    const extraLines = extraProcessingLines(input.extraProcessing, sl, d, sheetsGross);
    lines.push(...extraLines);
    const baseSXTKFull = baseSXTK + extraLines.reduce((s, l) => s + l.amount, 0);
    const wasteInfo = giaTo * (sheetsGross - sheetsNet);

    const sheet = docKichThuocCm(opt.khoArea);
    const res = tongHopKetQua(lines, baseSXTKFull, sl, d, wasteInfo, input.chietKhauRate, input.vatRate);
    res.meta = {
        khoBinh: opt.label, khoGiayLon: opt.khoArea, soConBaiIn: soConBaiVal, soConToLon: soCon, soToLon: sheetsGross, luotIn,
        soKem: input.soKem, loaiKem, sheetW: sheet?.w, sheetH: sheet?.h, itemW: kt.rongTrai, itemH: kt.caoTrai,
        impositionSource: source,
        ...(marginConfig ? { marginConfig } : {}),
        ...(positions ? { positions } : {}),
    };
    return res;
}
