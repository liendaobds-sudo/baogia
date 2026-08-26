/**
 * Nguồn sự thật duy nhất cho đơn vị số lượng báo giá (quantity basis).
 *
 * Phân biệt:
 *  - QuantityBasis / unit label: đơn vị BÁN / đếm SL trên báo giá (cái, tờ, cuốn, tấm, m²…)
 *  - "con/tờ" trong PDF offset: chỉ số imposition (meta.soConToLon), KHÔNG phải đơn vị bán
 *  - materials.price_unit / GC priceType: đơn giá gia công/vật tư — phạm vi khác
 *
 * Ưu tiên resolve: unit tường minh (client) → unit catalog SP → mặc định theo quote_type.
 */

export type QuantityBasis =
    | 'piece'   // cái / con / sp
    | 'sheet'   // tờ
    | 'book'    // cuốn / quyển
    | 'board'   // tấm (khổ lớn)
    | 'sqm'     // m²
    | 'set'     // bộ
    | 'roll';   // cuộn

/** Nhãn hiển thị chuẩn (VI) — dùng khi lưu quote_items.unit + PDF/UI. */
export const UNIT_LABELS_VI: Record<QuantityBasis, string> = {
    piece: 'cái',
    sheet: 'tờ',
    book: 'cuốn',
    board: 'tấm',
    sqm: 'm²',
    set: 'bộ',
    roll: 'cuộn',
};

/** Danh sách option cho form admin (value = basis, label = VI). */
export const QUANTITY_BASIS_OPTIONS: ReadonlyArray<{ basis: QuantityBasis; label: string }> = (
    Object.keys(UNIT_LABELS_VI) as QuantityBasis[]
).map((basis) => ({ basis, label: UNIT_LABELS_VI[basis] }));

/** Alias free-text → basis (lowercase, trim). */
const UNIT_ALIASES: Record<string, QuantityBasis> = {
    // piece
    piece: 'piece',
    cai: 'piece',
    'cái': 'piece',
    con: 'piece',
    sp: 'piece',
    'sản phẩm': 'piece',
    san_pham: 'piece',
    // sheet
    sheet: 'sheet',
    to: 'sheet',
    'tờ': 'sheet',
    // book
    book: 'book',
    cuon: 'book',
    'cuốn': 'book',
    quyen: 'book',
    'quyển': 'book',
    // board
    board: 'board',
    tam: 'board',
    'tấm': 'board',
    // sqm
    sqm: 'sqm',
    m2: 'sqm',
    'm²': 'sqm',
    'm^2': 'sqm',
    // set
    set: 'set',
    bo: 'set',
    'bộ': 'set',
    // roll
    roll: 'roll',
    cuon_giay: 'roll',
    'cuộn': 'roll',
};

/**
 * Mặc định theo quote_type / product_type / offset type.
 * Offset: to_roi → tờ; còn lại (hộp, túi, bì thư…) → cái.
 */
export function defaultBasisForQuoteType(quoteType: string | null | undefined): QuantityBasis {
    const t = String(quoteType || '').trim().toLowerCase();
    switch (t) {
        case 'bound':
        case 'sach':
        case 'catalog':
        case 'book':
            return 'book';
        case 'large_format':
        case 'lf':
        case 'kho_lon':
            return 'board';
        case 'to_roi':
        case 'flyer':
            return 'sheet';
        case 'loose':
        case 'offset':
        case 'bi_thu_folder':
        case 'sp_khac':
        case 'hop_giay':
        case 'tui_giay':
        default:
            return 'piece';
    }
}

export interface ResolveQuoteUnitsInput {
    /** Unit client gửi (quote item). */
    unit?: string | null;
    /** Unit catalog từ unified_products.unit. */
    productUnit?: string | null;
    /** quote_type / product_type / offset type (to_roi, loose, bound…). */
    quoteType?: string | null;
    /** item_type fallback khi không có quoteType. */
    itemType?: string | null;
}

export interface ResolvedQuoteUnits {
    basis: QuantityBasis;
    /** Nhãn VI canonical (hoặc free-text custom nếu không map được). */
    unit: string;
}

function normalizeKey(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseUnitString(raw: string | null | undefined): ResolvedQuoteUnits | null {
    if (raw == null) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;

    const key = normalizeKey(trimmed);
    const basis = UNIT_ALIASES[key];
    if (basis) {
        return { basis, unit: UNIT_LABELS_VI[basis] };
    }

    // Free-text custom (tenant tự đặt) — giữ nguyên, basis = piece
    return { basis: 'piece', unit: trimmed };
}

/**
 * Resolve đơn vị số lượng cho 1 dòng báo giá.
 * Ưu tiên: unit tường minh → productUnit catalog → default theo type.
 */
export function resolveQuoteUnits(input: ResolveQuoteUnitsInput): ResolvedQuoteUnits {
    const fromClient = parseUnitString(input.unit);
    if (fromClient) return fromClient;

    const fromProduct = parseUnitString(input.productUnit);
    if (fromProduct) return fromProduct;

    const basis = defaultBasisForQuoteType(input.quoteType || input.itemType);
    return { basis, unit: UNIT_LABELS_VI[basis] };
}

/** Helper: chỉ lấy nhãn VI (phổ biến khi ghi DB / PDF). */
export function resolveUnitLabel(input: ResolveQuoteUnitsInput): string {
    return resolveQuoteUnits(input).unit;
}
