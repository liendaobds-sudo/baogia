/**
 * Logic định tuyến thuần cho Cổng_Tạo_Báo_Giá (Quote Entry Point) — Task 7.3/7.4.
 *
 * Tách quyết định định tuyến (pure decision) ra khỏi trang
 * `frontend/src/app/pricing/quotes/start/page.tsx` để kiểm thử được bằng
 * property test (Property 6). Hàm KHÔNG có side-effect: nhận tập
 * `applicableMethods` (= Phương_Pháp_Khả_Dụng ∩ áp dụng được cho sản phẩm) và
 * trả quyết định luồng.
 *
 * Quy tắc định tuyến theo số phương pháp áp dụng được:
 *   - 0  ⇒ `none`   : không có phương pháp khả dụng → thông báo (Req 4.3).
 *   - 1  ⇒ `auto`   : auto-chọn phương pháp đó, vào THẲNG Configurator,
 *                     bỏ bước chọn (Req 4.4).
 *   - ≥2 ⇒ `choose` : bắt NV chọn rõ một phương pháp HOẶC chế độ so sánh trước
 *                     khi vào Configurator, không tự bỏ qua (Req 4.5). Không
 *                     auto-chọn ⇒ `selectedMethod = null` (trạng thái chưa chọn
 *                     hợp lệ — Req 4.3).
 *
 * _Requirements: 4.4, 4.5_
 */

import type { MethodId } from '@/lib/scope/types';

/** Chế độ luồng entry point theo số phương pháp khả dụng. */
export type EntryRoutingMode = 'none' | 'auto' | 'choose';

/** Quyết định định tuyến thuần cho một sản phẩm đã chọn. */
export interface EntryRoutingDecision {
    /** Chế độ luồng: không có / vào thẳng / bắt chọn. */
    mode: EntryRoutingMode;
    /**
     * Phương pháp được auto-chọn khi `mode === 'auto'`; `null` ở các chế độ khác
     * (chưa chọn — Req 4.3).
     */
    selectedMethod: MethodId | null;
}

/**
 * Quyết định luồng entry point theo số Phương_Pháp_Khả_Dụng áp dụng được.
 *
 * Thuần (pure): chỉ phụ thuộc số phần tử của `applicableMethods`.
 *
 * @param applicableMethods Phương pháp khả dụng & áp dụng được cho sản phẩm.
 * @returns Quyết định `{ mode, selectedMethod }`.
 */
export function decideEntryRouting(
    applicableMethods: readonly MethodId[],
): EntryRoutingDecision {
    const methods = applicableMethods ?? [];

    if (methods.length === 0) {
        return { mode: 'none', selectedMethod: null };
    }
    if (methods.length === 1) {
        return { mode: 'auto', selectedMethod: methods[0] };
    }
    return { mode: 'choose', selectedMethod: null };
}
