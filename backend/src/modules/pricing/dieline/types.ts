// ============================================================
// Core Type Definitions — Parametric Dieline Generator
// ============================================================

/** Điểm 2D với tọa độ đã được snap tolerance */
export interface Point2D {
    x: number;
    y: number;
}

/** Loại nét vẽ */
export type PathTag = 'CUT' | 'CREASE' | 'BLEED';

/** Loại đoạn đường */
export type SegmentType = 'line' | 'arc' | 'bezier';

/** Đoạn đường cơ bản */
export interface PathSegment {
    /** Danh sách điểm (2 điểm cho line, nhiều điểm cho arc nội suy) */
    points: Point2D[];
    /** Tag phân loại: CUT (cắt), CREASE (cấn), BLEED (tràn lề) */
    tag: PathTag;
    /** Loại đoạn: line, arc hoặc bezier */
    type: SegmentType;
    /** 4 điểm điều khiển Cubic Bezier [P0, CP1, CP2, P3] (chỉ dùng khi type='bezier') */
    controlPoints?: [Point2D, Point2D, Point2D, Point2D];
}

/** Mặt phẳng (Panel) trong bản vẽ bế */
export interface Panel {
    /** Tên mặt (VD: 'front', 'left', 'tuck_top') */
    name: string;
    /** Nhãn hiển thị tiếng Việt */
    label: string;
    /** Danh sách đường viền của mặt */
    paths: PathSegment[];
    /** Tên panel cha trong cây động học (null nếu là gốc) */
    parent: string | null;
    /** Cạnh bản lề / trục gập (2 điểm đầu-cuối) */
    pivotEdge: [Point2D, Point2D] | null;
    /** Góc gập mục tiêu khi fold_progress=1 (độ, VD: 90, -90, 180) */
    foldAngle: number;
    /** Hướng gập: 1 = gập lên (dương Y), -1 = gập xuống (âm Y) */
    foldDirection: 1 | -1;
}

/** Mô hình khuôn bế hoàn chỉnh */
export interface DielineModel {
    /** Tên mẫu hộp */
    name: string;
    /** Mã tiêu chuẩn (VD: 'ECMA-A20.20') */
    standardCode: string;
    /** Mô tả tiếng Việt */
    description: string;
    /** Danh sách mặt phẳng */
    panels: Panel[];
    /** Tất cả đường vẽ (phẳng, chưa gập) */
    allPaths: PathSegment[];
    /** Bounding box */
    boundingBox: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        width: number;
        height: number;
    };
    /** Thông số đầu vào */
    params: BoxParams;
    /** Cảnh báo về kích thước / khả năng sản xuất */
    warnings?: string[];
}

/** Thông số hộp đầu vào */
export interface BoxParams {
    /** Chiều dài lọt lòng (mm) */
    L: number;
    /** Chiều rộng / hông lọt lòng (mm) */
    W: number;
    /** Chiều cao / chiều sâu lọt lòng (mm) */
    D: number;
    /** Độ dày vật liệu (mm) */
    T: number;
    /** Dung sai an toàn (mm), mặc định 0.5 */
    C: number;
    /** Rộng mép dán keo (mm), mặc định 15 */
    G: number;
    /** Chiều cao tai đút (mm), mặc định 15 */
    TH: number;
    /** Vị trí tai dán: 'left' hoặc 'right', mặc định 'left' */
    glueSide: 'left' | 'right';
    /** Loại hộp: 'rte' = Reverse Tuck End, 'slb' = Snap-Lock Bottom, 'gable' = Gable Box, 'paper_bag' = Túi giấy SOS, 'cup_sleeve' = Bọc ly, 'mailer' = Mailer Box FEFCO 0427, 'pizza' = Pizza Box FEFCO 0426 */
    boxType: 'rte' | 'slb' | 'gable' | 'paper_bag' | 'cup_sleeve' | 'mailer' | 'pizza' | 'envelope' | 'tray';
    /** Thứ tự panel: 'WLWL' = Hông→Mặt→Hông→Lưng, 'LWLW' = Mặt→Hông→Lưng→Hông */
    panelOrder: 'WLWL' | 'LWLW';
    /** Chiều cao phần tay cầm vượt khỏi cạnh trên thân hộp (mm), mặc định 40 */
    HH: number;
    /** Chiều rộng lỗ quai xách (mm), 0 = tự động theo công thức (2/5 × AB) */
    HW: number;
    /** Chiều cao lỗ quai xách (mm), 0 = tự động theo công thức (1/2 × h2) */
    HHL: number;
    /** Hình dạng lỗ quai: 'oval' hoặc 'roundRect' */
    handleShape: 'oval' | 'roundRect';
    /** Vị trí lỗ quai: 'bottom' (sát đáy) | 'center' (giữa) */
    handleY: 'bottom' | 'center';
    /** Chiều cao phần tay cầm (mm), 0 = tự động (0.9 × W/2) */
    HFH: number;
    /** Số cặp lồi-lõm đáy gài (0 = tự động theo L: <150→1, 150-250→2, ≥250→3) */
    SLP: number;
    /** Rộng lưỡi khóa nắp (mm), mặc định 15 */
    LTW: number;
    /** Cao lưỡi khóa nắp (mm), mặc định 20 */
    LTH: number;
    /** Bật/tắt lưỡi khóa nắp */
    lockTab: boolean;

    /** Chiều cao tai phụ bụi (mm), 0 = tự động theo công thức min(L/2-1, W+T) */
    DFH: number;

    // ── Paper Bag params ──
    /** Chiều cao gấp đáy (mm), 0 = tự động (W/2 + 10) */
    BF: number;
    /** Bán kính lỗ xỏ dây quai (mm), 0 = tự động (2.5mm) */
    HR: number;
    /** Khoảng cách lỗ quai từ mép trên (mm), 0 = tự động (25mm) */
    HM: number;
    /** Khoảng cách giữa 2 lỗ quai cùng mặt (mm), 0 = tự động */
    HS: number;
    /** Bật/tắt lỗ xỏ dây quai */
    handleHoles: boolean;

    // ── Cup Sleeve params ──
    /** Đường kính miệng nhỏ (mm), mặc định 70 */
    cupD1: number;
    /** Đường kính miệng lớn (mm), mặc định 80 */
    cupD2: number;
    /** Chiều cao ly (mm), mặc định 90 */
    cupH: number;
    /** % bao phủ chu vi (100 = trọn vòng), mặc định 100 */
    cupCoverage: number;
    /** Loại chiều cao: 'slant' = chiều xiên, 'vertical' = chiều đứng */
    cupHeightType: 'slant' | 'vertical';
    /** Vị trí vạt dán: 'right' | 'left' | 'none' */
    cupFlapPosition: 'right' | 'left' | 'none';

    // ── Envelope params ──
    /** Rộng bì thư lọt lòng (mm), mặc định 220 */
    envW: number;
    /** Cao bì thư lọt lòng (mm), mặc định 110 */
    envH: number;
    /** Cao nắp dán seal flap (mm), 0 = tự động */
    envFH: number;
    /** Rộng tai hông side flap (mm), 0 = tự động */
    envSF: number;
    /** Dạng nắp dán: 'straight' | 'pointed' | 'rounded' */
    envFlapShape: 'straight' | 'pointed' | 'rounded';
    /** Kiểu bì: 'wallet' (nắp dọc) | 'pocket' (nắp ngang) */
    envStyle: 'wallet' | 'pocket';
    /** Bật/tắt cửa sổ trong suốt */
    envWindow: boolean;
    /** Rộng cửa sổ (mm) */
    envWindowW: number;
    /** Cao cửa sổ (mm) */
    envWindowH: number;
    /** Vị trí X cửa sổ từ mép trái front panel (mm) */
    envWindowX: number;
    /** Vị trí Y cửa sổ từ mép dưới front panel (mm) */
    envWindowY: number;

    // ── Matchbox Tray (Hộp diêm / Khay) params ──
    /** Rộng lưỡi thụt tai khóa vách (mm), mặc định 15 */
    trayTongueW: number;
    /** Rộng mí dán keo của vỏ bao (mm), mặc định 15. Độc lập với dầm khay (G). */
    sleeveGlue: number;
}

/** Giá trị mặc định cho BoxParams */
export const DEFAULT_PARAMS: BoxParams = {
    L: 100,
    W: 60,
    D: 200,
    T: 0.5,
    C: 0.5,
    G: 15,
    TH: 15,
    glueSide: 'left',
    boxType: 'rte',
    panelOrder: 'WLWL',
    HH: 0,
    HW: 0,
    HHL: 0,
    handleShape: 'oval',
    handleY: 'bottom',
    HFH: 0,
    SLP: 0,
    LTW: 15,
    LTH: 20,
    lockTab: true,
    DFH: 0,
    BF: 0,
    HR: 0,
    HM: 0,
    HS: 0,
    handleHoles: true,
    cupD1: 70,
    cupD2: 80,
    cupH: 90,
    cupCoverage: 100,
    cupHeightType: 'slant',
    cupFlapPosition: 'right',
    envW: 220,
    envH: 110,
    envFH: 0,
    envSF: 0,
    envFlapShape: 'pointed',
    envStyle: 'wallet',
    envWindow: false,
    envWindowW: 90,
    envWindowH: 45,
    envWindowX: 15,
    envWindowY: 15,
    trayTongueW: 15,
    sleeveGlue: 15,
};

/** Thông tin metadata của loại hộp (để build thư viện) */
export interface BoxTemplate {
    id: string;
    name: string;
    nameVi: string;
    standardCode: string;
    description: string;
    descriptionVi: string;
    /** Hàm sinh dieline từ thông số */
    generate: (params: BoxParams) => DielineModel;
}
