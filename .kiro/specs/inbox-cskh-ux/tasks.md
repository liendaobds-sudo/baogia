# Implementation Plan: inbox-cskh-ux

## Overview

Spec này sửa lỗi chức năng/dữ liệu, an toàn (XSS), nhất quán phản hồi và a11y cho module Inbox/CSKH theo 16 requirement đã duyệt. Toàn bộ thay đổi ở **frontend** (TypeScript, Next.js + React Query); **không** đổi schema PostgreSQL (`synchronize=false`), **không** đổi API hiện có, giữ FrozenRouteGuard, cấu trúc route, RBAC gating và logic pricing.

Cách tiếp cận: trích xuất logic thuần vào `inbox/_lib/` (`sanitizeMarkdown`, `conversationSearch`, `optimistic`, `constants`) để vừa an toàn vừa kiểm thử property-based bằng **fast-check** (≥100 iteration, tag `Feature: inbox-cskh-ux, Property {n}`); sau đó nối dây vào Inbox_Hook và các component, tái dùng hạ tầng UX đã có (`ToastProvider`/`useToast`, `ConfirmModal`, `DeleteConfirmModal`, `formatVND`, `useDebouncedValue`) — không tạo lại.

Quy ước gộp file: các sửa đổi trên CÙNG một file được gộp vào một task để tránh xung đột; các file độc lập tách task riêng để chạy song song theo wave.

## Tasks

- [ ] 1. Lớp hàm thuần `inbox/_lib/` + property tests
  - [x] 1.1 Implement `sanitizeMarkdown.ts`
    - Tạo `frontend/src/app/(app)/inbox/_lib/sanitizeMarkdown.ts` với `escapeHtml(text)`, `renderSafeBold(text)` (escape HTML trước, rồi chuyển cặp `**...**` đã escape thành `<strong>...</strong>`), và `stripMarkdown(text)`
    - Pure, không I/O; kết quả `renderSafeBold` không chứa thẻ thực thi ngoài `<strong>`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x]* 1.2 Viết property test cho `sanitizeMarkdown`
    - **Property 1: Render gợi ý AI an toàn (chống XSS)** và **Property 2: Escape HTML idempotent**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - File `frontend/src/app/(app)/inbox/_lib/sanitizeMarkdown.test.ts`; generator chuỗi tùy ý gồm `<script>`, `&`, `"`, `'`, cặp `**`; fast-check ≥100 iteration; tag `Feature: inbox-cskh-ux, Property 1` và `Property 2`

  - [x] 1.3 Implement `conversationSearch.ts`
    - Tạo `frontend/src/app/(app)/inbox/_lib/conversationSearch.ts` với `matchesSearch(conv, query)`: khớp không phân biệt hoa thường theo tên hiển thị, nội dung tin nhắn cuối, số điện thoại, externalId; query rỗng → `true`
    - Pure; chỉ làm việc trên dữ liệu đã tải (Loaded_Conversations), không gọi API
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x]* 1.4 Viết property test cho `conversationSearch`
    - **Property 4: Khớp tìm kiếm đa trường, không phân biệt hoa thường**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - File `frontend/src/app/(app)/inbox/_lib/conversationSearch.test.ts`; generator hội thoại + chọn trường + substring đổi hoa thường, kèm case phủ định; fast-check ≥100 iteration; tag `Feature: inbox-cskh-ux, Property 4`

  - [x] 1.5 Implement `optimistic.ts`
    - Tạo `frontend/src/app/(app)/inbox/_lib/optimistic.ts` với `runOptimistic<T>({ queryClient, queryKey, apply, commit, onError })`: chụp snapshot cache, áp `apply`, chạy `commit`; nếu `commit` ném lỗi → khôi phục snapshot + gọi `onError`, trả `false`; thành công → trả `true`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x]* 1.6 Viết property test cho `runOptimistic`
    - **Property 3: Rollback optimistic khôi phục trạng thái khi thất bại**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - File `frontend/src/app/(app)/inbox/_lib/optimistic.test.ts`; generator trạng thái cache + hàm `apply`; nhánh `commit` thành công và `commit` ném lỗi; dùng `QueryClient` thật hoặc store giả lập; fast-check ≥100 iteration; tag `Feature: inbox-cskh-ux, Property 3`

  - [x] 1.7 Implement `constants.ts`
    - Tạo `frontend/src/app/(app)/inbox/_lib/constants.ts` export `STICKER_URLS` (danh sách URL sticker hiện hardcode trong ChatArea); tái dùng `AUTO_DISMISS_MS` từ `lib/ui/toast.tsx` (không khai báo trùng)
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 2. Checkpoint — Đảm bảo property tests hàm thuần pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Inbox_Hook — báo lỗi, rollback, bỏ dialog native (`_hooks/useInboxLogic.ts`)
  - [x] 3.1 Sửa `useInboxLogic` để báo lỗi + rollback + bỏ alert/confirm
    - Thêm tham số `toast: ToastApi`; thay mọi `catch { /* ignore */ }` bằng `console.error` + `toast.show('error', ...)` cho `addNote`, `togglePinNote`, `transferConversation`, `collabActions.add/remove/toggleAccess`, `updateStatus`, `updatePriority`
    - Chuyển `toggleTag`, `togglePinConversation`, `markAsUnread`, `markAllRead` sang dùng `runOptimistic` (rollback + toast khi lỗi)
    - Thay `alert()` trong `recallMessage`, `pinMessage`, `starMessage`, `deleteLocalMessage`, `deleteNote` bằng `toast.show('error', ...)`
    - `deleteConversation`: bỏ `confirm()` native (xác nhận do UI/Delete_Confirm_Modal đảm nhiệm); báo lỗi qua toast khi xóa thất bại
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 5.3, 5.4_

  - [x]* 3.2 Viết unit test cho `useInboxLogic`
    - Mock `authFetch` lỗi cho `toggleTag`/`addNote`/`markAllRead` → assert `toast.show('error', ...)` và `console.error` được gọi; với action optimistic, cache được khôi phục về trạng thái trước
    - File `frontend/src/app/(app)/inbox/_hooks/useInboxLogic.spec.ts`
    - _Requirements: 1.1, 1.2, 2.2, 2.3_

- [x] 4. `inbox/page.tsx` — mount ToastProvider, nối toast, sync Zalo không reload
  - [x] 4.1 Bọc ToastProvider + truyền toast vào hook + sync Zalo invalidate
    - Bọc nội dung Inbox trong `ToastProvider`; trong component con (bên trong provider) lấy `const toast = useToast()` và gọi `useInboxLogic(token, authFetch, toast)`
    - Thay `alert()` + `window.location.reload()` của luồng sync Zalo bằng `toast.show(...)` + `queryClient.invalidateQueries({ queryKey: ['conversations'] })`; giữ nguyên hội thoại đang chọn và ô nhập liệu
    - _Requirements: 4.1, 6.1, 6.2, 6.3_

  - [ ]* 4.2 Viết component test cho sync Zalo
    - Mock `queryClient.invalidateQueries`; assert được gọi và `window.location.reload` KHÔNG được gọi; toast hiển thị kết quả
    - _Requirements: 6.1, 6.3_

- [ ] 5. `AiSuggestPanel.tsx` — render an toàn + pending + a11y
  - [x] 5.1 Render an toàn, trạng thái pending, aria-label
    - Thay `renderMarkdown` bằng `renderSafeBold` (từ `_lib/sanitizeMarkdown.ts`) cho `dangerouslySetInnerHTML`; dùng `stripMarkdown` dùng chung
    - Thêm state `pendingReplyKey` (`${suggestionId}:${index}`); nút "Gửi"/"Sửa & Gửi" `disabled` + nhãn "Đang gửi…" khi reply tương ứng đang gửi; chặn kích hoạt lại; khôi phục sau khi kết thúc
    - Thêm `aria-label` cho các nút
    - _Requirements: 3.1, 3.2, 3.3, 8.1, 8.2, 8.3, 13.1_

  - [x]* 5.2 Viết component test cho `AiSuggestPanel`
    - Promise điều khiển được: nút `disabled` khi pending, click thứ hai bị chặn, enable lại sau resolve; nút có accessible name; nội dung `<script>` không tạo thẻ thực thi
    - _Requirements: 8.1, 8.2, 13.1_

- [x] 6. `ConversationList.tsx` — tìm kiếm, màu trạng thái, a11y
  - [x] 6.1 Mở rộng tìm kiếm + hoàn thiện STATUS_COLORS + a11y + bỏ alert
    - Thay biểu thức lọc bằng `matchesSearch(conv, searchQuery)` (từ `_lib/conversationSearch.ts`)
    - Bổ sung `STATUS_COLORS.waiting_file` và mọi khóa có trong `STATUS_LABELS`; dùng fallback `STATUS_COLORS[status] ?? '#94a3b8'`
    - Thêm `aria-label`/`title` cho nút chỉ-icon; `role="button"`+`tabIndex`+`onKeyDown` (Enter/Space) cho `div` đóng vai nút (gồm nút sync Zalo); thêm nhãn văn bản/`aria-label` cho ưu tiên, SLA, trạng thái
    - Thay `alert('Chức năng chưa sẵn sàng')` bằng `toast.show('info', ...)` (qua prop/useToast)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 11.1, 11.2, 11.3, 13.1, 14.1, 14.2, 15.1, 15.2, 15.3_

  - [x]* 6.2 Viết test cho `ConversationList`
    - Unit: mọi khóa `STATUS_LABELS` có màu; trạng thái lạ → fallback. Component: tìm kiếm khớp tên/nội dung/SĐT; nút icon có accessible name; `div`-button kích hoạt bằng Enter/Space; priority/SLA/status có nhãn
    - _Requirements: 7.1, 11.1, 11.2, 11.3, 13.1, 14.2, 15.1, 15.2, 15.3_

- [x] 7. `ChatArea.tsx` — bỏ alert/confirm, dùng hằng số sticker, thống nhất xóa
  - [x] 7.1 Thay alert bằng toast, dùng STICKER_URLS, xóa hội thoại qua Delete_Confirm_Modal
    - Thay `alert()` (gửi sticker lỗi, file quá lớn, gửi tin thất bại, chọn ảnh sai loại) bằng `toast.show('error', ...)`; giữ khôi phục ô nhập khi gửi tin thất bại
    - Dùng `STICKER_URLS` (từ `_lib/constants.ts`) thay mảng URL nội tuyến
    - Xóa hội thoại từ khung chat: dùng `DeleteConfirmModal` (state mở/đóng + render) thay `confirm()`; xác nhận → gọi `deleteConversation`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.3, 10.1, 10.3_

  - [ ]* 7.2 Viết component test cho `ChatArea`
    - File quá lớn → toast lỗi, không `window.alert`; xóa hội thoại → `DeleteConfirmModal` hiển thị, `window.confirm` không gọi, confirm → gọi delete
    - _Requirements: 4.2, 5.1_

- [x] 8. `ChatHeader.tsx` — bỏ alert, a11y
  - [x] 8.1 Thay alert bằng toast + aria-label
    - Thay `alert()` (không gọi nhóm/video nhóm Zalo) bằng `toast.show('info'|'error', ...)`; thêm `aria-label` cho nút chỉ-icon
    - _Requirements: 4.1, 4.3, 13.1_

- [x] 9. `MiniQuotePanel.tsx` (+ `components/quote/*`) — định dạng tiền tệ nhất quán
  - [x] 9.1 Dùng `formatVND` cho mọi hiển thị tiền tệ
    - Thay `Number(...).toLocaleString('vi-VN') + 'đ'` và các biến thể bằng `formatVND` (từ `lib/format/currency.ts`) ở option phụ kiện/gia công và dòng đã chọn; KHÔNG đổi logic tính giá
    - _Requirements: 9.1, 9.2_

- [x] 10. Checkpoint cuối — chạy toàn bộ test + tsc + hồi quy
  - Ensure all tests pass, ask the user if questions arise.
  - Chạy frontend tests (gồm property tests fast-check) và `tsc` sạch; bỏ qua lỗi pre-existing `ChatArea.spec.tsx(18,17): TS2740`
  - Xác nhận không có thay đổi schema/API backend; FrozenRouteGuard, cấu trúc route, RBAC, logic pricing không bị ảnh hưởng

## Notes

- Các task gắn `*` là tùy chọn (property/unit/component tests) và có thể bỏ qua khi cần MVP nhanh; task hiện thực lõi không bao giờ gắn `*`.
- **Tình trạng test tùy chọn:** đã hoàn thành 1.2, 1.4, 1.6 (property, fast-check ≥100 iter), 3.2 (hook: báo lỗi + rollback), 5.2 (AiSuggestPanel: pending + render an toàn + a11y), 6.2 (ConversationList: tìm kiếm đa trường + role tab + nhãn trạng thái). 
- **Hoãn 4.2 và 7.2:** hai test này render trang Inbox đầy đủ / `ChatArea` vốn phụ thuộc nặng vào SocketProvider, emoji-picker, React Query và auth-context (theo quy ước hiện có, `ChatArea.spec.tsx` mock toàn bộ component). Viết test render thật sẽ rất giòn và giá trị thấp. Hành vi tương ứng (sync Zalo invalidate không reload — 4.1; file quá lớn → toast, dùng STICKER_URLS — 7.1) đã được hiện thực, kiểm tra `tsc` sạch và phủ gián tiếp bởi property test của `runOptimistic`/`sanitizeMarkdown`. Có thể bổ sung sau nếu thiết lập hạ tầng mock trang Inbox.
- Property tests dùng fast-check, ≥100 iteration, tag `Feature: inbox-cskh-ux, Property {n}`; chỉ áp dụng cho phần thuần (`sanitizeMarkdown`, `conversationSearch`, `optimistic`).
- Phần tích hợp UI, a11y, refactor hằng số và ghi nhận giới hạn (Req 12, 16) được phủ bằng component/unit/smoke test hoặc review.
- Mỗi file chỉ thuộc một task hiện thực để tránh xung đột: hook (3), page (4), AiSuggestPanel (5), ConversationList (6), ChatArea (7), ChatHeader (8), MiniQuotePanel (9).
- Các component dùng toast phụ thuộc ToastProvider được mount ở task 4.1.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.5", "1.7"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.6", "3.1", "5.1", "9.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "6.1", "7.1", "8.1"] },
    { "id": 4, "tasks": ["5.2", "6.2", "7.2"] },
    { "id": 5, "tasks": ["10"] }
  ]
}
```
