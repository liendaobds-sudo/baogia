/**
 * Method mapping — single source of truth for `quote_type → Phương_Pháp_In (methodId)`.
 *
 * Trước đây các hằng `DIGITAL_QUOTE_TYPES` / tập offset bị lặp ở nhiều nơi
 * (`quote.service.ts`, `digital-method.plugin.ts`, `offset-method.plugin.ts`).
 * Gom về MỘT nguồn để mọi Đường_Tính_Giá suy dẫn Phương_Pháp_In nhất quán
 * trước khi kiểm Cờ_Năng_Lực theo tenant.
 *
 * KHÔNG đổi giá trị (chỉ refactor) → không đổi hành vi giá/VAT.
 *
 * _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
 */
import { MethodId } from './types/method-plugin.types';

/** Loại sản phẩm phục vụ bởi phương pháp In_Nhanh (digital). */
export const DIGITAL_QUOTE_TYPES = ['loose', 'bound', 'large_format'] as const;

/** Loại sản phẩm phục vụ bởi phương pháp Offset. */
export const OFFSET_QUOTE_TYPES = [
    'to_roi',
    'bi_thu_folder',
    'sp_khac',
    'hop_giay',
    'tui_giay',
] as const;

/** Set tra cứu O(1) (dùng cho các nơi cần Set, vd cache guard). */
export const DIGITAL_QUOTE_TYPE_SET: ReadonlySet<string> = new Set(DIGITAL_QUOTE_TYPES);
export const OFFSET_QUOTE_TYPE_SET: ReadonlySet<string> = new Set(OFFSET_QUOTE_TYPES);

/**
 * Suy dẫn Phương_Pháp_In từ `quote_type`.
 * Trả `null` nếu loại không nhận dạng được (caller phải từ chối với lỗi
 * "không nhận dạng loại sản phẩm", tách bạch với lỗi "phương pháp bị tắt").
 *
 * _Requirements: 5.3, 5.4_
 */
export function resolveMethodForQuoteType(quoteType?: string | null): MethodId | null {
    if (!quoteType) return null;
    if (DIGITAL_QUOTE_TYPE_SET.has(quoteType)) return 'digital';
    if (OFFSET_QUOTE_TYPE_SET.has(quoteType)) return 'offset';
    return null;
}
