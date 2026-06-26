/**
 * Bộ đọc envelope DÙNG CHUNG cho kết quả engine giá.
 *
 * Hai endpoint trả về hai dạng khác nhau cho cùng một engine:
 * - POST /pricing/calculate  → { success, data: {...} }
 * - POST /quote/pricing-calc → {...} (object kết quả trực tiếp; hoặc {requiresManualQuote})
 *
 * `readPricingResult` hấp thụ cả hai dạng và trả về một `NormalizedPricingResult`
 * thống nhất để hai bề mặt xử lý kết quả theo cùng một cách. Hàm thuần, không I/O.
 *
 * _Requirements: 6.1, 6.2, 6.3, 6.4_
 */

export interface NormalizedPricingResult {
    ok: boolean;
    total?: number;
    price_per_item?: number;
    breakdown?: Record<string, unknown>;
    leadtime?: { standardDays: number; expressDays?: number };
    warnings?: string[];
    error?: string;
    requiresManualQuote?: boolean;
    reason?: string;
    raw: unknown;
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

function pickNumber(o: Record<string, unknown>, ...keys: string[]): number | undefined {
    for (const k of keys) {
        const v = o[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    }
    return undefined;
}

/** Đọc một object kết quả "thô" (đã bóc envelope) thành dạng chuẩn hóa. */
function fromResultObject(data: Record<string, unknown>): NormalizedPricingResult {
    // Cần báo giá thủ công (cả hai engine đều có thể trả dạng này)
    if (data.requiresManualQuote === true) {
        return {
            ok: false,
            requiresManualQuote: true,
            reason: typeof data.reason === 'string' ? data.reason : undefined,
            raw: data,
        };
    }

    const total = pickNumber(data, 'total', 'grand_total', 'selling_subtotal');
    const pricePerItem = pickNumber(data, 'price_per_item', 'grand_total_per_item', 'selling_price_per_item', 'unitPrice');

    if (total === undefined) {
        return {
            ok: false,
            error: typeof data.error === 'string' ? data.error : 'Thiếu dữ liệu kết quả giá',
            raw: data,
        };
    }

    return {
        ok: true,
        total,
        price_per_item: pricePerItem,
        breakdown: isObject(data.breakdown) ? data.breakdown : undefined,
        leadtime: isObject(data.leadtime)
            ? (data.leadtime as NormalizedPricingResult['leadtime'])
            : undefined,
        warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : undefined,
        raw: data,
    };
}

export function readPricingResult(response: unknown): NormalizedPricingResult {
    if (!isObject(response)) {
        return { ok: false, error: 'unrecognized_response', raw: response };
    }

    // Dạng envelope { success, data }
    if ('success' in response) {
        if (response.success === true && isObject(response.data)) {
            return fromResultObject(response.data);
        }
        if (response.success === false) {
            return {
                ok: false,
                error: typeof response.error === 'string' ? response.error
                    : (typeof response.message === 'string' ? response.message : 'Tính giá thất bại'),
                raw: response,
            };
        }
        // success=true nhưng thiếu data
        return { ok: false, error: 'Thiếu dữ liệu kết quả giá', raw: response };
    }

    // Dạng object kết quả trực tiếp
    return fromResultObject(response);
}
