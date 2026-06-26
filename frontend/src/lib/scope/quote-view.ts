/**
 * Quote/Order View Filter — Requirement 8.
 *
 * Pure functions phục vụ việc tách trình bày "Báo giá" và "Đơn hàng" trong cùng
 * màn hình "Danh sách BG" (`frontend/src/app/pricing/quotes/page.tsx`).
 *
 * Nguyên tắc (Req 8.2, 8.5): lọc hoàn toàn **client-side** trên danh sách đã tải
 * từ `GET /erp/orders`; KHÔNG gọi endpoint mới, KHÔNG thêm bảng/route backend.
 *
 * Ánh xạ trạng thái (Req 8.3): hai tập `QUOTE_STATUSES` và `ORDER_STATUSES` **rời nhau**
 * (disjoint) — mỗi trạng thái vòng đời thuộc tối đa một nhóm hiển thị mặc định.
 * Mọi trạng thái ngoài hai tập đó (ví dụ `cancelled`, `expired`, `rejected`, chuỗi rỗng,
 * giá trị lạ) rơi vào nhóm `all` để không ẩn mất dữ liệu (Req 8.6).
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md`
 *
 * _Requirements: 8.2, 8.3, 8.5_
 */

import type { ViewKey } from './types';

/**
 * Tập trạng thái thuộc nhóm "Báo giá" — các trạng thái đầu vòng đời.
 *
 * Khớp vòng đời backend (`orders.service.ts`, `pricing-dashboard.service.ts`):
 * `draft → pending_approval → approved → sent`.
 *
 * _Requirements: 8.3_
 */
export const QUOTE_STATUSES = ['draft', 'pending_approval', 'approved', 'sent'] as const;

/**
 * Tập trạng thái thuộc nhóm "Đơn hàng" — các trạng thái đã chốt.
 *
 * Rời nhau với `QUOTE_STATUSES` (Req 8.3).
 *
 * _Requirements: 8.3_
 */
export const ORDER_STATUSES = ['accepted', 'completed'] as const;

/** Kiểu trạng thái thuộc nhóm "Báo giá". */
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
/** Kiểu trạng thái thuộc nhóm "Đơn hàng". */
export type OrderStatus = (typeof ORDER_STATUSES)[number];

// Tập tra cứu O(1); ép sang readonly string[] để so khớp với chuỗi tuỳ ý.
const QUOTE_SET: ReadonlySet<string> = new Set<string>(QUOTE_STATUSES);
const ORDER_SET: ReadonlySet<string> = new Set<string>(ORDER_STATUSES);

/**
 * Ánh xạ một trạng thái vòng đời tới nhóm hiển thị (`ViewKey`).
 *
 * - Trạng thái ∈ `QUOTE_STATUSES` → `'quote'`.
 * - Trạng thái ∈ `ORDER_STATUSES` → `'order'`.
 * - Mọi trạng thái khác (gồm `cancelled`, `expired`, `rejected`, `''`, giá trị lạ) → `'all'`.
 *
 * Vì hai tập rời nhau, một trạng thái không bao giờ vừa thuộc `'quote'` vừa thuộc `'order'`
 * (Req 8.3).
 *
 * @param status Trạng thái thô của bản ghi Báo_Giá_Đơn_Hàng.
 * @returns Nhóm hiển thị mặc định của trạng thái.
 *
 * _Requirements: 8.3_
 */
export function statusGroup(status: string): ViewKey {
  if (QUOTE_SET.has(status)) return 'quote';
  if (ORDER_SET.has(status)) return 'order';
  return 'all';
}

/**
 * Ánh xạ một khung nhìn (`ViewKey`) tới tập trạng thái cần yêu cầu từ Nguồn_Báo_Giá.
 *
 * Dùng để dựng tham số `status` cho `GET /erp/orders` khi tải dữ liệu theo Khung_Nhìn
 * (quote-page-ux Req 1.3), tái dùng đúng hai tập `QUOTE_STATUSES` / `ORDER_STATUSES`
 * đang chi phối `statusGroup` (Req 1.4):
 *
 * - View `'quote'` → toàn bộ `QUOTE_STATUSES` (Req 1.1).
 * - View `'order'` → toàn bộ `ORDER_STATUSES`.
 * - View `'all'`  → `[]` (không lọc theo trạng thái; mọi bản ghi đều thuộc — Req 1.5).
 *
 * Hàm thuần: trả về mảng mới mỗi lần gọi, không đột biến (mutate) hằng số nguồn và không I/O.
 *
 * @param view Khung nhìn hiện tại.
 * @returns Danh sách mã trạng thái thuộc khung nhìn (mảng mới); rỗng cho `'all'`.
 *
 * _Requirements: 1.1, 1.3, 1.4, 1.5_
 */
export function viewToStatuses(view: ViewKey): string[] {
  if (view === 'quote') return [...QUOTE_STATUSES];
  if (view === 'order') return [...ORDER_STATUSES];
  return [];
}

/**
 * Lọc danh sách bản ghi theo khung nhìn đã chọn — hoàn toàn client-side (Req 8.2, 8.5).
 *
 * - View `'all'`: trả về **mọi** bản ghi của danh sách gốc (giữ nguyên thứ tự),
 *   không bản ghi nào bị ẩn mất bất kể trạng thái (Req 8.6).
 * - View `'quote'` / `'order'`: chỉ giữ các bản ghi có `statusGroup(status)` bằng đúng
 *   view đó (Req 8.4).
 *
 * Hàm thuần, không đột biến (mutate) danh sách đầu vào và không gọi mạng.
 *
 * @typeParam T Kiểu bản ghi tuỳ ý (ví dụ `QuoteItem`).
 * @param records Danh sách bản ghi đã tải từ `GET /erp/orders`.
 * @param view Khung nhìn hiện tại.
 * @param getStatus Hàm trích trạng thái từ một bản ghi.
 * @returns Danh sách bản ghi thuộc khung nhìn (mảng mới).
 *
 * _Requirements: 8.2, 8.4, 8.5, 8.6_
 */
export function filterByView<T>(
  records: readonly T[],
  view: ViewKey,
  getStatus: (record: T) => string,
): T[] {
  if (view === 'all') return records.slice();
  return records.filter((record) => statusGroup(getStatus(record)) === view);
}
