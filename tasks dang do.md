# Implementation Plan: quote-page-ux

## Overview

Spec này cải thiện UI/UX cho module `App_BaoGia` theo 11 requirement đã duyệt, đồng thời sửa các lỗi đúng đắn dữ liệu phát hiện trong audit. Phần lớn thay đổi ở **frontend**; chỉ hai thay đổi backend **tối thiểu, an toàn schema** (`synchronize=false`, không thêm/sửa bảng/cột): B1 mở rộng `CreateQuoteDto` với các field optional, B2 cho `findAllQuotes` nhận `status` đa trị (`= ANY`) tương thích ngược.

Ngôn ngữ hiện thực: **TypeScript** (khớp Next.js frontend + NestJS backend). Hàm thuần đặt tại `frontend/src/lib/` (`viewToStatuses`, `validateQuoteDraft`, `formatVND`) để kiểm thử property-based bằng **fast-check** (≥100 iteration mỗi property, tag `Feature: quote-page-ux, Property {n}`). UX dùng chung ở cấp app (`ToastProvider`, `ConfirmModal`). Mỗi bước xây dựng trên bước trước và kết thúc bằng việc nối dây vào `QuoteOrderListView`, luồng tạo, và component `CustomerInfo` dùng chung.

Nguyên tắc xuyên suốt: không đổi logic tính giá và schema; tái dùng pure function sẵn có (`statusGroup`, `filterByView`); giữ `FrozenRouteGuard`, cấu trúc hai route, và ẩn/hiện nút theo RBAC.

## Tasks

- [x] 1. Hàm thuần dùng chung + property tests
  - [x] 1.1 Implement `viewToStatuses` trong `quote-view.ts`
    - Bổ sung `viewToStatuses(view: ViewKey): string[]` vào `frontend/src/lib/scope/quote-view.ts`, dùng lại `QUOTE_STATUSES` / `ORDER_STATUSES` hiện có: `'quote'` → toàn bộ `QUOTE_STATUSES`, `'order'` → toàn bộ `ORDER_STATUSES`, `'all'` → `[]`
    - Pure, không mutate, không I/O
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x]* 1.2 Viết property test cho `viewToStatuses`
    - **Property 1: viewToStatuses nhất quán với statusGroup (phân hoạch hai chiều)**
    - **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
    - File `frontend/src/lib/scope/quote-view.test.ts`; fast-check, ≥100 iteration; tag `Feature: quote-page-ux, Property 1`

  - [x] 1.3 Implement `validateQuoteDraft` trong `lib/quote/validate.ts`
    - Tạo `frontend/src/lib/quote/validate.ts` với `QuoteDraft`, `QuoteDraftErrors`, `validateQuoteDraft(draft)` (tên toàn whitespace ⇒ lỗi `customerName`; `itemsCount <= 0` ⇒ lỗi `items`) và helper `isQuoteDraftValid`
    - Pure, trả object lỗi rỗng ⇔ hợp lệ
    - _Requirements: 5.1, 5.3, 5.4_

  - [x]* 1.4 Viết property test cho `validateQuoteDraft`
    - **Property 2: validateQuoteDraft hợp lệ ⇔ không có trường bắt buộc trống**
    - **Validates: Requirements 5.1, 5.3, 5.4**
    - File `frontend/src/lib/quote/validate.test.ts`; generator `customerName` (chuỗi tùy ý + toàn whitespace) và `itemsCount` (số nguyên ≥ 0); fast-check, ≥100 iteration; tag `Feature: quote-page-ux, Property 2`

  - [x] 1.5 Implement `formatVND` trong `lib/format/currency.ts`
    - Tạo `frontend/src/lib/format/currency.ts` với `formatVND(amount)`: làm tròn về số nguyên đồng, nhóm hàng nghìn `vi-VN`, một ký hiệu duy nhất `' ₫'`; xử lý input không hữu hạn về `0`
    - _Requirements: 7.1, 7.2_

  - [x]* 1.6 Viết property test cho `formatVND`
    - **Property 3: formatVND xác định, một ký hiệu, và parse lại được**
    - **Validates: Requirements 7.1, 7.2**
    - File `frontend/src/lib/format/currency.test.ts`; generator số hữu hạn (0, âm, lớn, thập phân); fast-check, ≥100 iteration; tag `Feature: quote-page-ux, Property 3`

  - [x] 1.7 Implement hook `useDebouncedValue`
    - Tạo `frontend/src/lib/hooks/useDebouncedValue.ts`: `useDebouncedValue<T>(value, delay = 300)` trả giá trị trễ, dọn timeout khi value/delay đổi hoặc unmount
    - _Requirements: 8.1, 8.2_

  - [x]* 1.8 Viết unit test cho `useDebouncedValue` (fake timers)
    - Dùng jest fake timers: nhiều cập nhật trong `< delay` chỉ emit giá trị cuối **một lần** sau khi yên ≥ delay
    - File `frontend/src/lib/hooks/useDebouncedValue.test.ts`
    - _Requirements: 8.1, 8.2_

- [x] 2. Thay đổi backend tối thiểu, an toàn schema
  - [x] 2.1 B1 — Mở rộng `CreateQuoteDto` với field optional
    - Thêm `vat_rate?`, `vat_amount?`, `shipping_fee?`, `grand_total?` (đều `@IsOptional() @Type(() => Number) @IsNumber()`) vào `CreateQuoteDto`; không động cột/bảng (cột đã tồn tại, service đã đọc)
    - _Requirements: 3.5, 11.3_

  - [x] 2.2 B2 — `findAllQuotes` nhận `status` đa trị (`= ANY`)
    - Trong `OrdersService.findAllQuotes`: tách `status` theo dấu phẩy; 1 trạng thái → giữ `q.status = CAST($n AS TEXT)`; nhiều trạng thái → `q.status = ANY($n::text[])`; rỗng → không lọc. Tương thích ngược 100%, chỉ logic truy vấn trên cột `status` sẵn có
    - _Requirements: 1.2, 1.3, 2.2, 2.3_

  - [x]* 2.3 Viết integration test cho B1 + B2
    - Kiểm `POST /erp/orders` chấp nhận payload có `vat_rate/vat_amount/shipping_fee/grand_total` (không còn 400 do `forbidNonWhitelisted`); `GET /erp/orders?status=a,b` trả bản ghi của cả hai trạng thái với phân trang nhất quán; xác nhận không phát sinh migration/đổi cột
    - _Requirements: 3.5, 11.3_

- [x] 3. Checkpoint — Đảm bảo tests hàm thuần + backend pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. UX primitives cấp app
  - [x] 4.1 Implement `ToastProvider` + `useToast` và mount vào layout
    - Tạo `frontend/src/lib/ui/toast.tsx` (React context, vùng thông báo `role="status"`/`aria-live="polite"`, tự ẩn sau ~4s); mount `ToastProvider` ở `frontend/src/app/pricing/layout.tsx` (hoặc app root) để cả danh sách và trang tạo dùng được
    - _Requirements: 4.2, 4.3, 4.5_

  - [x]* 4.2 Viết component test cho `ToastProvider`
    - Kiểm `show('success'|'error', msg)` render thông báo với accessible role; nhiều toast cùng lúc; tự ẩn theo thời gian
    - _Requirements: 4.2, 4.3, 4.5_

  - [x] 4.3 Implement `ConfirmModal`
    - Tạo `frontend/src/lib/ui/ConfirmModal.tsx` với props `open/title/requireReason/reasonLabel/confirmLabel/pending/onConfirm/onCancel`; ô nhập lý do khi `requireReason`, trạng thái `pending` disable nút xác nhận
    - _Requirements: 4.1_

  - [x]* 4.4 Viết component test cho `ConfirmModal`
    - Kiểm `requireReason` truyền lý do qua `onConfirm`; `pending` disable nút; `onCancel` đóng modal
    - _Requirements: 4.1_

- [x] 5. Nối dây `QuoteOrderListView` (danh sách / chi tiết)
  - [x] 5.1 Truy vấn trạng thái theo Khung_Nhìn qua server + giữ `filterByView` làm lớp an toàn client
    - Trong `QuoteOrderListView.fetchQuotes`: `effectiveStatuses = statusFilter ? [statusFilter] : viewToStatuses(view)`; nếu khác rỗng set `params.status = effectiveStatuses.join(',')`; giữ `filterByView(quotes, view, q => q.status)` ở client như lớp an toàn cuối
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 5.2 Phân trang / tải thêm + reset trang khi đổi tiêu chí
    - Đọc `pagination` backend (`total/total_pages/has_prev/has_next`) vào state; render thanh phân trang hiển thị range `start–end / total` (`aria-live="polite"`) + nút Trước/Sau (disable theo `has_prev/has_next`); effect `setPage(1)` khi đổi `debouncedSearch/fromDate/toDate/statusFilter/view`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 5.3 Debounce ô tìm kiếm
    - `search` cập nhật tức thời cho input; `debouncedSearch = useDebouncedValue(search, 300)` đưa vào `params.keyword` và dependency của `fetchQuotes` để chỉ gọi một request sau khi ngừng gõ
    - _Requirements: 8.1, 8.2_

  - [x] 5.4 Thay `alert`/`prompt` bằng `ConfirmModal` + toast và `runLifecycle` với pending state
    - Gỡ toàn bộ `alert`/`prompt`; "Từ chối"/"Hủy" mở `ConfirmModal` với `requireReason`; bọc mọi action vòng đời (submit/approve/reject/send/accept/complete/cancel/clone) qua `runLifecycle` dùng `pendingAction` để disable + chặn double-click, toast thành công/lỗi, refetch detail + list
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.5 Accessibility cho danh sách / chi tiết
    - Thêm `aria-label`/nhãn văn bản cho mọi nút action (không chỉ emoji); badge trạng thái có text + màu; nút chỉ-icon (thu gọn, prev/next, xóa) có `aria-label` + `title`; giữ thứ tự Tab hợp lý
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 5.6 Dùng `formatVND` cho mọi hiển thị tiền tệ trong danh sách
    - Thay `formatCurrency = amount.toLocaleString('vi-VN') + ' đ'` bằng `formatVND` trong `QuoteOrderListView`
    - _Requirements: 7.1, 7.2_

  - [x] 5.7 Responsive list/detail (drawer trên màn nhỏ)
    - `md+`: hai pane song song như cũ; `< md`: list toàn chiều rộng, chọn dòng mở chi tiết dạng overlay/drawer với nút "Đóng"; dùng class responsive Tailwind + state `mobileDetailOpen`; giữ sidebar `PricingLayout` hoạt động
    - _Requirements: 10.1, 10.3_

  - [x] 5.8 Ẩn lối tạo báo giá khi thiếu quyền
    - Dùng `usePermissions().hasPermission('quote.create')`: chỉ render nút/entrypoint "Tạo mới" khi có quyền; giữ ẩn/hiện nút cam kết theo `quote.approve`/`order.approve` như hiện có
    - _Requirements: 3.4, 11.1_

  - [x]* 5.9 Viết component tests cho `QuoteOrderListView`
    - Phân trang: total>limit hiện control, bấm Sau → fetch `page+1`, đổi filter/view/search → reset page 1; ConfirmModal thay prompt + toast + pending chặn double-click; ẩn lối tạo theo quyền; accessible name cho nút action; badge có text
    - _Requirements: 1.1, 2.1, 2.3, 2.4, 3.4, 4.1, 4.4, 9.1, 9.2, 9.3_

- [x] 6. Checkpoint — Đảm bảo tests danh sách / chi tiết pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Điều hòa luồng tạo Báo giá (`new/page.tsx`)
  - [x] 7.1 Reconcile sang `POST /erp/orders` với ánh xạ payload
    - Thay `POST /quotes/save` bằng `POST /erp/orders`; ánh xạ state → `CreateQuoteDto` (`customer_name/customer_phone/customer_unit/tax_code/customer_address/customer_note/type/total/vat_rate/vat_amount/shipping_fee/grand_total`); `mapItem` **trải phẳng** `configParams` theo khóa snake_case của `QuoteItemDto` (không bọc `config_params`/`calculation_details`); KHÔNG đổi logic tính giá
    - _Requirements: 3.1, 3.2, 11.4_

  - [x] 7.2 Kiểm tra trường bắt buộc + lỗi inline + nút Lưu disabled
    - Dùng `validateQuoteDraft({ customerName, itemsCount })`; hiển thị lỗi inline dưới ô tên khách; nút "LƯU BÁO GIÁ" `disabled` khi `!isQuoteDraftValid(...)` hoặc đang lưu; bấm lưu lúc không hợp lệ → chặn
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 7.3 Toast thành công/lỗi (bỏ `alert`) + dùng `formatVND`
    - Gỡ `alert` trong `new/page.tsx`; toast thành công sau khi tạo (báo giá xuất hiện trong danh sách), toast lỗi đọc `message` từ phản hồi (gồm 400/403), không clear cart khi lỗi; thay `Intl.NumberFormat(... currency:'VND')` bằng `formatVND`
    - _Requirements: 4.2, 4.3, 7.1, 7.2_

  - [x]* 7.4 Viết component test cho luồng tạo
    - Kiểm gọi `POST /erp/orders` với payload đã ánh xạ (item trải phẳng); validation inline + nút Lưu disabled khi thiếu tên/hạng mục; toast thành công/lỗi
    - _Requirements: 3.1, 5.2, 5.3_

- [x] 8. Hợp nhất `CustomerInfo` dùng chung
  - [x] 8.1 Build component `CustomerInfo` dùng chung
    - Tạo `frontend/src/app/pricing/_components/CustomerInfo.tsx` (chủ đề `indigo`), `forwardRef<CustomerInfoHandle>` giữ nguyên `getPayload()`/`setCustomerData()` và thêm `getDraftState()`; đủ trường (phân loại, mã KH, tên, điện thoại, đơn vị, MST, địa chỉ, email, người đại diện, ghi chú, VAT, phí giao hàng)
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 8.2 Thay khối inline + usages `CustomerInfoSidebar` và xóa bản trùng lặp
    - Thay khối inline trong `new/page.tsx` và các nơi dùng `CustomerInfoSidebar` bằng `CustomerInfo`; xóa file/khối trùng lặp; thống nhất tông indigo
    - _Requirements: 6.1, 6.2_

  - [x]* 8.3 Viết test cho `CustomerInfo`
    - Render đủ field; `getPayload()` trả đủ khóa `CustomerInfoPayload`; `getDraftState()` phản ánh `customerName`
    - _Requirements: 6.3_

- [x] 9. Checkpoint cuối — chạy toàn bộ test + build + tsc + hồi quy
  - Ensure all tests pass, ask the user if questions arise.
  - Chạy frontend tests (gồm property tests fast-check), backend build/tests, và `tsc` sạch
  - Chạy lại `test:scope` của frontend để xác nhận spec `product-rescope-cskh-quote` và `rbac-quote-order-access` không bị hồi quy; xác nhận không có migration/đổi cột sau B1/B2

## Notes

- Các task gắn `*` là tuỳ chọn (property tests, unit tests, component tests, integration tests) và có thể bỏ qua khi cần MVP nhanh; task hiện thực lõi không bao giờ gắn `*`.
- Mỗi leaf task tham chiếu tới sub-requirement cụ thể để truy vết.
- Property tests dùng fast-check, ≥100 iteration, tag theo định dạng `Feature: quote-page-ux, Property {n}`; chỉ áp dụng cho phần thuần (`viewToStatuses`, `validateQuoteDraft`, `formatVND`). `useDebouncedValue` dùng unit test với fake timers.
- Các tiêu chí RBAC backend (403), responsive, focus order, và bảo toàn cấu trúc route được phủ bằng component/integration/smoke (theo Testing Strategy của design).
- Hai thay đổi backend duy nhất (B1, B2) tối thiểu và an toàn schema: `synchronize=false`, không thêm/sửa bảng/cột, không migration mới.
- Các task chạm `QuoteOrderListView.tsx` (5.1–5.8) và `new/page.tsx` (7.1–7.3, 8.2) được tách thành các bước tuần tự ở các wave khác nhau để tránh xung đột cùng file.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5", "1.7", "2.1", "2.2", "4.1", "4.3", "8.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.6", "1.8", "2.3", "4.2", "4.4", "5.1", "7.1"] },
    { "id": 2, "tasks": ["5.2", "7.2"] },
    { "id": 3, "tasks": ["5.3", "7.3"] },
    { "id": 4, "tasks": ["5.4", "8.2"] },
    { "id": 5, "tasks": ["5.5", "7.4"] },
    { "id": 6, "tasks": ["5.6"] },
    { "id": 7, "tasks": ["5.7"] },
    { "id": 8, "tasks": ["5.8"] },
    { "id": 9, "tasks": ["5.9", "8.3"] }
  ]
}
```
