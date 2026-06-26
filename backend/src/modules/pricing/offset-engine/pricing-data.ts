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
    priceVAT: number;
    priceNoVAT: number;
    sheetWidth: number;
    sheetHeight: number;
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
    [key: string]: number;
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
    soKem?: number;          // số kẽm
    loaiKem?: string;        // 'Kẽm nhỏ' | 'Kẽm lớn'
    // Hình học (cm) cho preview bình bài — có thể thiếu nếu không suy được.
    sheetW?: number;
    sheetH?: number;
    itemW?: number;
    itemH?: number;
    // Khuôn bế (dieline) — khi báo giá hộp dùng engine dieline cho khổ trải.
    dielineStdCode?: string;   // mã tiêu chuẩn (vd 'ECMA-A20.20')
    dielineWarnings?: string[]; // cảnh báo kích thước/khả năng sản xuất
}

export class OffsetPricingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OffsetPricingError';
    }
}
