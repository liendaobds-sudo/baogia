/**
 * PricingData — cấu trúc dữ liệu cung cấp toàn bộ hằng số và bảng tra cứu cho EngineOffset.
 *
 * Nạp từ ConfigStore (DB) lúc chạy, hoặc nạp trực tiếp từ `./data/*.json` mặc định khi golden test.
 * Các interface dưới đây ánh xạ 1-1 với cấu trúc dữ liệu bảng giá offset.
 *
 * _Requirements: 1.1, 1.5_
 */

export interface OffsetMaterial {
    code: string;
    aliases: string[];
    materialName: string;
    type: string;
    gsm: number | null;
    /** Đơn giá giấy GỐC CHƯA gồm VAT (tên trường có "VAT" là lịch sử). VAT cộng 1 lần ở totals theo UI. Nguồn: materials.pricePerSheet. */
    priceVAT: number;
    priceNoVAT: number;
    sheetWidth: number;
    sheetHeight: number;
    /**
     * Vai trò khổ giấy offset (self-ref materials): `'parent'` = khổ nhập (giá `priceNoVAT` nhập tay) |
     * `'child'` = khổ xả (giá DẪN XUẤT = giá cha / số bài in cắt được, tính sẵn ở config-store lúc nạp) |
     * `null` = vật tư giấy thường (không phân vai trò). Engine KHÔNG cần đọc field này — giá con đã
     * được dẫn sẵn vào `priceNoVAT` — nhưng giữ để hiển thị/suy diễn nếu cần.
     */
    sheetRole?: 'parent' | 'child' | null;
    /** Chỉ khổ xả: id vật tư khổ NHẬP nguồn (self-ref) — dùng dẫn giá con. Giá đã dẫn sẵn vào `priceNoVAT`. */
    parentMaterialId?: number | null;
}

export type LoaiKem = 'Kẽm nhỏ' | 'Kẽm lớn';

export interface KhoIn {
    khoIn: string;
    chiaTo: string;
    soConBaiIn: number;
    soConToLon: number;
    khoGiayLon: string;
    dienTichM2: number;
    loaiKem: LoaiKem;
    // Lề/gripper (cm) của khổ giấy — trừ vào vùng in khi dàn khuôn động. Thiếu = 0 (dùng khe hở phẳng).
    marginLeft?: number;
    marginRight?: number;
    marginTop?: number;
    marginBottom?: number;
    // Cắn-nhíp (gripper, cm) cộng vào MỘT cạnh; thiếu → params.Gripper_Cm (mặc định 1.2).
    gripperCm?: number;
    // Khe hở giữa các con (gutter, cm); thiếu → params.Gutter_Cm (mặc định 0.3).
    gutterCm?: number;
}

/**
 * MarginConfig — bộ thông số lề tay-kê / cắn-nhíp / gutter đã chuẩn hóa về MILIMET (mm).
 * Là đơn vị nội bộ chuẩn của Imposition_Service; chuyển đổi cm→mm đúng một lần ở biên vào.
 */
export interface MarginConfig {
    left: number;    // mm
    right: number;   // mm
    top: number;     // mm
    bottom: number;  // mm
    gripper: number; // mm — cộng vào MỘT cạnh (cạnh nhíp)
    gutter: number;  // mm — khe giữa các con
}

export interface FixedSizeToRoi {
    kichThuoc: string;
    khoIn: string;
    khoGiayLon: string;
    soConBaiIn: number;
    soConToLon: number;
}

export interface FixedSizeBiThu {
    kichThuoc: string;
    khoIn: string;
    khoGiayLon: string;
    soConBaiIn: number;
    soConKhoGiayLon: number;
    loai: 'bithu' | 'folder';
}

export type BillingMode = 'minCharge' | 'perUnit' | 'external';

export interface GiaCongTier {
    min: number;
    max: number | null;
    price: number | null;
}

export interface GiaCong {
    code: string;
    congDoan: string;
    ghiChu?: string | null;
    tiers: GiaCongTier[];
    billingMode: BillingMode;
    minChargeParam: string | null;
    moqParam: string;
}

export interface KemRow {
    soKem: number;
    donGia: number;
}

export interface VatTuBeMat {
    ten: string;
    donGiaKg: number;
    soMat: '1 mặt' | '2 mặt' | null;
}

export interface EpKimRow {
    viTri: string;
    duoi100: number;
    tu100_499: number;
    tu500_999: number;
    tren1000: number;
}

export interface HaoHutRow {
    mocSoLuong: number;
    tyLe: number;
}

export interface PhiCoDinh {
    code: string;
    ten: string;
    giaTri: number;
    ghiChu?: string | null;
}

export interface Params {
    MOQ_GiaCong: number;
    MOQ_BinhBai_Nho: number;
    MOQ_BinhBai_Lon: number;
    GiaMin_XLBM: number;
    GiaMin_Be: number;
    GiaMin_DanHop: number;
    GiaMin_DongGoi: number;
    TyLe_VAT: number;
    TyLe_ChietKhau: number;
    TyLe_ChietKhau_Max: number;
    /** Nguồn imposition mặc định cho giá xuất ra (Req 6.1). Thiếu → 'legacy'. */
    ImpositionSource?: 'legacy' | 'unified';
    /** Bật chạy song song Legacy_Grid + Imposition_Service để đối chiếu (Req 5). 0|1. */
    ShadowMode?: number;
    /** Gripper mặc định (cm) khi Kho_In thiếu (Req 1.3). Mặc định 1.2 (=12mm). */
    Gripper_Cm?: number;
    /** Gutter mặc định (cm) khi Kho_In thiếu (Req 1.3). Mặc định 0.3 (=3mm). */
    Gutter_Cm?: number;
    [key: string]: number | string | undefined;
}

export interface PricingData {
    materials: OffsetMaterial[];
    khoIn: KhoIn[];
    fixedSizes: { toRoi: FixedSizeToRoi[]; biThuFolder: FixedSizeBiThu[] };
    giaCong: GiaCong[];
    kem: {
        kemNho: KemRow[];
        kemLon: KemRow[];
        vatTuBeMat: VatTuBeMat[];
        donGia1Kem: { kemNho: number; kemLon: number };
    };
    epKim: { tiers: string[]; rows: EpKimRow[] };
    tyLe: { haoHut: HaoHutRow[]; params: Params; mocSoLuong: number[] };
    phiCoDinh: PhiCoDinh[];
    /**
     * Định mức BÙ HAO THEO CÔNG ĐOẠN. Mỗi công đoạn có bảng MỐC SỐ LƯỢNG RIÊNG
     * (số lượng → tỉ lệ hao) + makeready cố định. Khóa theo mã công đoạn:
     * IN, CAN, XLBM, BE, DAN, TP, CATXEN, DONGGOI. Nếu thiếu → engine dùng mặc định
     * (IN theo đường cong `tyLe.haoHut`; còn lại 0).
     */
    wasteStages?: Record<string, WasteStageConfig>;
    /**
     * Cấu hình form báo giá THEO LOẠI SẢN PHẨM (whitelist tài nguyên + mặc định + ẩn/khoá field).
     * Khóa theo loại: to_roi | bi_thu_folder | sp_khac | hop_giay | tui_giay.
     * CHỈ ảnh hưởng UI form (frontend) — engine KHÔNG dùng để tính giá. Thiếu → form hiển thị đầy đủ.
     */
    productConfig?: Record<string, OffsetProductConfig>;
}

/**
 * Cấu hình form theo một loại sản phẩm offset. Mọi mảng allowed* rỗng/thiếu = cho phép TẤT CẢ.
 * `defaults` điền sẵn giá trị field; `hidden` ẩn field; `locked` hiển thị nhưng khoá (read-only).
 */
export interface OffsetProductConfig {
    allowedMaterials?: string[];   // mã giấy in (OffsetMaterial.code)
    allowedVatTuBeMat?: string[];  // tên vật tư bề mặt (VatTuBeMat.ten)
    allowedEpKim?: string[];       // vị trí ép kim (EpKimRow.viTri)
    allowedKhoIn?: string[];       // khổ in (KhoIn.khoIn)
    allowedKichThuoc?: string[];   // kích thước cố định (FixedSize.kichThuoc)
    allowedBoxTypes?: string[];    // loại khuôn bế cho phép (BoxType: rte/slb/gable/mailer/pizza...)
    defaults?: Record<string, string | number | boolean>;
    hidden?: string[];             // tên field bị ẩn
    locked?: string[];             // tên field bị khoá (read-only)
}

/** Một bậc hao theo số lượng: từ `from` (≥) áp tỉ lệ `rate` (phân số 0..1). */
export interface WasteStageTier {
    from: number;
    rate: number;
}

/** Cấu hình hao của một công đoạn: basis (theo tờ/con) + makeready cố định + bảng mốc số lượng riêng. */
export interface WasteStageConfig {
    /** Đơn vị tính hao: 'sheet' (theo tờ in) | 'piece' (theo số con thành phẩm). Thiếu → mặc định theo công đoạn. */
    basis?: 'sheet' | 'piece';
    makeready: number;
    tiers: WasteStageTier[];
}

/** Kết quả báo giá dùng chung cho mọi loại sản phẩm. */
export interface QuoteLine {
    label: string;
    qty?: number;
    unitPrice?: number;
    amount: number;
}

export interface QuoteResult {
    lines: QuoteLine[];
    tongChuaVAT: number;
    haoHut: number;
    vat: number;
    tongGomVAT: number;
    chietKhau: number;
    khachTra: number;
    donGia1SP: number;
    /** Dữ liệu bình bài/sản xuất phục vụ preview + thống kê (không ảnh hưởng giá). */
    meta?: QuoteMeta;
    /** Cảnh báo cấu hình (không chặn tính): vd trường đang dùng nhưng chưa whitelist. */
    warnings?: string[];
}

/**
 * QuoteMeta — số liệu bình bài/in để frontend vẽ preview offset và hiển thị thống kê.
 * Tất cả tùy chọn; bổ sung dần khi tích hợp thêm loại preview.
 */
export interface QuoteMeta {
    khoBinh?: string;        // khổ bình / bài in (chuỗi gốc)
    khoGiayLon?: string;     // khổ giấy lớn (chuỗi gốc)
    soConBaiIn?: number;     // số con / khổ bình (bài in)
    soConToLon?: number;     // số con / tờ giấy lớn
    soToLon?: number;        // số tờ giấy lớn cần in
    luotIn?: number;         // lượt in
    soKem?: number;          // tổng số bản kẽm
    soBoKem?: number;        // số bộ kẽm (1 = tự trở, 2 = bắt đôi)
    loaiKem?: string;        // 'Kẽm nhỏ' | 'Kẽm lớn'
    // Hình học (cm) cho preview bình bài — có thể thiếu nếu không suy được.
    sheetW?: number;
    sheetH?: number;
    itemW?: number;
    itemH?: number;
    // Khuôn bế (dieline) — khi báo giá hộp dùng engine dieline cho khổ trải.
    dielineStdCode?: string;   // mã tiêu chuẩn (vd 'ECMA-A20.20')
    dielineWarnings?: string[]; // cảnh báo kích thước/khả năng sản xuất
    // Imposition thống nhất — parity giá ≡ preview ≡ PDF (Req 2, 5, 6, 10).
    impositionSource?: 'legacy' | 'unified';   // nguồn đã dùng cho So_Con này
    marginConfig?: MarginConfig;               // mm — để preview vẽ vùng in/gripper
    positions?: Array<{ x: number; y: number; w: number; h: number }>; // mm — vị trí con TRÊN TỜ LỚN để preview
    // Khổ BÀI IN (press sheet) — preview hộp vẽ theo mức này (khớp soConBaiIn dùng cho giá).
    pressW?: number;           // cm — bề rộng khổ bài in
    pressH?: number;           // cm — bề cao khổ bài in
    pressPositions?: Array<{ x: number; y: number; w: number; h: number }>; // mm — vị trí con trên khổ bài in
    pressUsableArea?: { width: number; height: number };                    // mm — vùng in khả dụng khổ bài in
    /**
     * Số bài in (tờ xả) cắt được từ MỘT tờ giấy nhập — cơ sở quy đổi số tờ khi đếm tiền giấy.
     * Thêm 2026-08-29 để `soConToLon` truy vết được: `soConToLon = soConBaiIn × pressPerParent`.
     */
    pressPerParent?: number;
    /** Khổ tờ nhập lấy từ đâu: bản ghi vật tư (chuẩn) hay `paper_sizes.kho_giay_lon` (fallback). */
    parentSheetSource?: 'material' | 'khoGiayLon';
    /** true khi `kho_giay_lon` của khổ in KHÁC khổ giấy của vật tư đã chọn (dữ liệu cần sửa). */
    parentSheetMismatch?: boolean;
    shadow?: {                                  // chỉ khi ShadowMode bật (Req 5.2)
        legacyToLon: number;
        unifiedToLon: number;
        legacyBaiIn: number;
        unifiedBaiIn: number;
        deltaToLon: number;
    };
}

export class OffsetPricingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OffsetPricingError';
    }
}

/**
 * Đọc một tham số dạng SỐ (hữu hạn) từ `Params`. Index signature của `Params` đã được nới rộng
 * sang `number | string | undefined` để chứa `ImpositionSource` (chuỗi); helper này thu hẹp lại về
 * `number` cho các tham số số được truy cập qua khóa động/khóa chưa khai báo. Trả `undefined` nếu
 * giá trị không phải số hữu hạn (để gọi cùng `?? default` hoặc `|| default`).
 */
export function numParam(params: Params, key: string): number | undefined {
    const v = params[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
