/**
 * Lớp dựng payload tính giá DÙNG CHUNG cho cả hai bề mặt báo giá:
 * - Báo giá mini (chatbot, gọi POST /quote/pricing-calc)
 * - Báo giá chi tiết (trang /pricing, gọi POST /pricing/calculate)
 *
 * Mục tiêu: cùng một Đầu_Vào_Chuẩn_Hóa ⇒ cùng một payload ⇒ cùng một giá,
 * bất kể tính ở bề mặt nào. Đây là các HÀM THUẦN (pure), không I/O, không
 * đọc trạng thái ngoài. Mọi quy ước mặc định (gap, trừ-4-trang-bìa, quy đổi
 * đơn vị, định danh processing) chỉ tồn tại tại đây — single source of truth.
 *
 * _Requirements: 1.1, 1.2, 1.3, 2.x, 3.x, 4.x, 5.x_
 */

export class InvalidPayloadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidPayloadError';
    }
}

export type LengthUnit = 'mm' | 'cm' | 'm';

export interface Dimension {
    value: number;
    unit: LengthUnit;
}

export interface ProcessingInput {
    id?: number;
    name?: string;
    side?: string;
}

export interface AccessoryInput {
    id: number;
    qty: number;
    name?: string;
    price?: number;
}

export interface LooseInput {
    product_type: 'loose';
    material_id: number;
    paper_size_id?: number;
    quantity: number;
    item_width: Dimension;
    item_height: Dimension;
    print_side: string;
    print_type: string;
    shape: string;
    gap_h?: number; // mm; mặc định DEFAULT_GAP_MM nếu thiếu
    gap_v?: number; // mm; mặc định DEFAULT_GAP_MM nếu thiếu
    processing?: ProcessingInput[];
    accessories?: AccessoryInput[];
    product_name?: string;
}

export interface BoundSectionInput {
    material_id: number;
    paper_size_id: number;
    print_side: string;
    print_type: string;
    processing?: ProcessingInput[];
}

export interface BoundInput {
    product_type: 'bound';
    quantity: number;
    page_count: number;
    binding_type: string;
    cover: BoundSectionInput;
    inner: BoundSectionInput;
    accessories?: AccessoryInput[];
    product_name?: string;
}

export interface LargeFormatInput {
    product_type: 'large_format';
    material_id: number;
    quantity: number;
    width: Dimension;
    height: Dimension;
    print_type: string;
    processing?: ProcessingInput[];
    accessories?: AccessoryInput[];
    product_name?: string;
}

export type NormalizedInput = LooseInput | BoundInput | LargeFormatInput;

export type PricingPayload = Record<string, unknown>;

/** Gap dàn khuôn mặc định (mm) — thống nhất cho cả hai bề mặt. */
export const DEFAULT_GAP_MM = 2;
/** Số trang bìa trừ khỏi tổng để ra số trang ruột (bound). */
export const INNER_PAGE_OFFSET = 4;

/**
 * Quy đổi kích thước về mm theo đơn vị TƯỜNG MINH (không heuristic ngưỡng).
 * Giá trị không hữu hạn hoặc âm được coi là 0.
 */
export function toMillimeters(d: Dimension | undefined | null): number {
    const v = d ? Number(d.value) : 0;
    if (!Number.isFinite(v) || v < 0) return 0;
    switch (d!.unit) {
        case 'cm': return Math.round(v * 10);
        case 'm': return Math.round(v * 1000);
        case 'mm':
        default: return Math.round(v);
    }
}

/** Chuẩn hóa một mục processing: chỉ giữ các khóa có giá trị (id/name/side). */
function normalizeProcessing(items?: ProcessingInput[]): Array<Record<string, unknown>> {
    return (items ?? []).map((p) => {
        const o: Record<string, unknown> = {};
        if (p.id != null) o.id = p.id;
        if (p.name != null) o.name = p.name;
        if (p.side != null) o.side = p.side;
        return o;
    });
}

export function buildLoosePayload(input: LooseInput): PricingPayload {
    const payload: PricingPayload = {
        type: 'loose',
        product_type: 'loose',
        material_id: input.material_id,
        quantity: input.quantity,
        item_width: toMillimeters(input.item_width),
        item_height: toMillimeters(input.item_height),
        print_side: input.print_side,
        print_type: input.print_type,
        shape: input.shape,
        gap_h: input.gap_h ?? DEFAULT_GAP_MM,
        gap_v: input.gap_v ?? DEFAULT_GAP_MM,
        processing: normalizeProcessing(input.processing),
        accessories: input.accessories ?? [],
    };
    if (input.paper_size_id != null) payload.paper_size_id = input.paper_size_id;
    if (input.product_name != null) payload.product_name = input.product_name;
    return payload;
}

export function buildBoundPayload(input: BoundInput): PricingPayload {
    if (!input.cover || !input.inner) {
        throw new InvalidPayloadError('Báo giá hàng cuốn cần đủ thông tin bìa (cover) và ruột (inner)');
    }
    const innerPageCount = Math.max(0, (Number(input.page_count) || 0) - INNER_PAGE_OFFSET);
    const payload: PricingPayload = {
        type: 'bound',
        product_type: 'bound',
        quantity: input.quantity,
        page_count: input.page_count,
        binding_type: input.binding_type,
        cover: {
            material_id: input.cover.material_id,
            paper_size_id: input.cover.paper_size_id,
            print_side: input.cover.print_side,
            print_type: input.cover.print_type,
            ...(input.cover.processing ? { processing: normalizeProcessing(input.cover.processing) } : {}),
        },
        inner: [{
            material_id: input.inner.material_id,
            paper_size_id: input.inner.paper_size_id,
            print_side: input.inner.print_side,
            print_type: input.inner.print_type,
            page_count: innerPageCount,
            ...(input.inner.processing ? { processing: normalizeProcessing(input.inner.processing) } : {}),
        }],
        accessories: input.accessories ?? [],
    };
    if (input.product_name != null) payload.product_name = input.product_name;
    return payload;
}

export function buildLargeFormatPayload(input: LargeFormatInput): PricingPayload {
    const payload: PricingPayload = {
        type: 'large_format',
        product_type: 'large_format',
        material_id: input.material_id,
        quantity: input.quantity,
        width: toMillimeters(input.width),
        height: toMillimeters(input.height),
        print_type: input.print_type,
        processing: normalizeProcessing(input.processing),
        accessories: input.accessories ?? [],
    };
    if (input.product_name != null) payload.product_name = input.product_name;
    return payload;
}

/** Điểm vào chính: phân nhánh theo product_type. */
export function buildPricingPayload(input: NormalizedInput): PricingPayload {
    switch (input.product_type) {
        case 'bound': return buildBoundPayload(input);
        case 'large_format': return buildLargeFormatPayload(input);
        case 'loose': return buildLoosePayload(input);
        default: {
            const _exhaustive: never = input;
            throw new InvalidPayloadError(`product_type không hỗ trợ: ${String((_exhaustive as any)?.product_type)}`);
        }
    }
}
