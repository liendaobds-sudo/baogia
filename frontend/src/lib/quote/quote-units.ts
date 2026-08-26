/**
 * Mirror FE của backend/src/modules/pricing/lib/quote-units.ts.
 * Giữ logic resolve đơn vị số lượng đồng bộ giữa mapItem (client) và save (server).
 * Khi sửa: cập nhật CẢ HAI file.
 */

export type QuantityBasis =
    | 'piece'
    | 'sheet'
    | 'book'
    | 'board'
    | 'sqm'
    | 'set'
    | 'roll';

export const UNIT_LABELS_VI: Record<QuantityBasis, string> = {
    piece: 'cái',
    sheet: 'tờ',
    book: 'cuốn',
    board: 'tấm',
    sqm: 'm²',
    set: 'bộ',
    roll: 'cuộn',
};

export const QUANTITY_BASIS_OPTIONS: ReadonlyArray<{ basis: QuantityBasis; label: string }> = (
    Object.keys(UNIT_LABELS_VI) as QuantityBasis[]
).map((basis) => ({ basis, label: UNIT_LABELS_VI[basis] }));

const UNIT_ALIASES: Record<string, QuantityBasis> = {
    piece: 'piece',
    cai: 'piece',
    'cái': 'piece',
    con: 'piece',
    sp: 'piece',
    sheet: 'sheet',
    to: 'sheet',
    'tờ': 'sheet',
    book: 'book',
    cuon: 'book',
    'cuốn': 'book',
    quyen: 'book',
    'quyển': 'book',
    board: 'board',
    tam: 'board',
    'tấm': 'board',
    sqm: 'sqm',
    m2: 'sqm',
    'm²': 'sqm',
    set: 'set',
    bo: 'set',
    'bộ': 'set',
    roll: 'roll',
    'cuộn': 'roll',
};

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
    unit?: string | null;
    productUnit?: string | null;
    quoteType?: string | null;
    itemType?: string | null;
}

export interface ResolvedQuoteUnits {
    basis: QuantityBasis;
    unit: string;
}

function parseUnitString(raw: string | null | undefined): ResolvedQuoteUnits | null {
    if (raw == null) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
    const basis = UNIT_ALIASES[key];
    if (basis) return { basis, unit: UNIT_LABELS_VI[basis] };
    return { basis: 'piece', unit: trimmed };
}

export function resolveQuoteUnits(input: ResolveQuoteUnitsInput): ResolvedQuoteUnits {
    const fromClient = parseUnitString(input.unit);
    if (fromClient) return fromClient;
    const fromProduct = parseUnitString(input.productUnit);
    if (fromProduct) return fromProduct;
    const basis = defaultBasisForQuoteType(input.quoteType || input.itemType);
    return { basis, unit: UNIT_LABELS_VI[basis] };
}

export function resolveUnitLabel(input: ResolveQuoteUnitsInput): string {
    return resolveQuoteUnits(input).unit;
}
