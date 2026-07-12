# Implementation Plan: Inbox Responsive + Theming

## Overview

Kế hoạch hiện thực `design.md`: thêm **Bố_Cục_Hẹp (single-column chuyển-view)** cho Inbox và **chuẩn hoá màu vai-trò về Design_Token**, giữ nguyên Bố_Cục_Rộng và toàn bộ chức năng. Ngôn ngữ: **TypeScript/React** (Next.js frontend). Phạm vi file: `frontend/src/app/(app)/inbox/**` + bổ sung token trong `frontend/src/app/globals.css`.

Nguyên tắc: tái dùng nguyên component hiện có (chỉ đổi cách bố trí), không đụng `useInboxLogic`/backend/API, mỗi bước chạy `tsc` + `jest inbox` giữ xanh. Task gắn `*` là test-only, có thể chạy tách.

## Tasks

- [x] 1. Hook phát hiện bố cục và chiều cao khả dụng
  - [x] 1.1 Tạo `useIsNarrow`
    - Tạo `frontend/src/app/(app)/inbox/_hooks/useIsNarrow.ts` dùng `matchMedia('(max-width: 1023.98px)')`, SSR-safe (guard `window`, mặc định `false`), listener `change` + cleanup
    - _Requirements: 1.1_
  - [x]* 1.2 Test `useIsNarrow`
    - **Property: phản ánh đúng ngưỡng + cập nhật khi `change`**
    - **Validates: Requirements 1.1**
    - Mock `matchMedia`; `renderHook`; bắn sự kiện `change` → giá trị đổi
  - [x] 1.3 Tạo `useViewportFit`
    - Tạo `frontend/src/app/(app)/inbox/_hooks/useViewportFit.ts`: đặt `height = innerHeight - rect.top` qua `requestAnimationFrame`; theo dõi `resize` + `ResizeObserver(document.body)`; guard môi trường thiếu API; cleanup
    - _Requirements: 1.5_

- [x] 2. Nút điều hướng cho Bố_Cục_Hẹp (ChatHeader + RightSidebar)
  - [x] 2.1 Thêm nút "Quay lại" vào `ChatHeader`
    - Thêm props `showBackButton?: boolean; onBack?: () => void`; render nút mũi tên trái đầu header khi bật; `role`/`aria-label="Quay lại danh sách"`, kích hoạt bằng click + Enter/Space
    - _Requirements: 2.3, 5.1_
  - [x] 2.2 Truyền tiếp qua `ChatArea`
    - `ChatArea` nhận `showBackButton?`, `onBack?` và chuyển xuống `ChatHeader`; không đổi logic khác
    - _Requirements: 2.3, 3.1_
  - [x] 2.3 Nút đóng khung thông tin ở `RightSidebar`
    - Prop `onCloseNarrow?: () => void`; khi có → hiển thị nút đóng (về Khung_Chat), aria + keyboard
    - _Requirements: 2.4, 5.1_
  - [x]* 2.4 Test nút Quay lại
    - **Property: nút có `aria-label` + kích hoạt bằng Enter/Space gọi `onBack`**
    - **Validates: Requirements 2.3, 5.1**

- [x] 3. Máy trạng thái chuyển khung (thuần, test được)
  - [x] 3.1 Tách logic `nextNarrowView`
    - Tạo `frontend/src/app/(app)/inbox/_lib/narrowView.ts`: hàm thuần `nextNarrowView(current, event)` với event `select|back|openInfo|closeInfo|clearSelected`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x]* 3.2 Test máy trạng thái
    - **Property: `list→chat→list` và `chat→info→chat` nghịch đảo; `clearSelected`→`list`**
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [x] 4. Ghép Bố_Cục_Hẹp vào `page.tsx`
  - [x] 4.1 Thêm state + wiring
    - Dùng `useIsNarrow`, `narrowView` (qua `nextNarrowView`), `useViewportFit(rootRef)`; ánh xạ `onSelect`→(hẹp) `chat`, toggle info→(hẹp) `info`; effect `!selectedId`→`list`
    - _Requirements: 1.4, 2.1, 2.2, 2.5_
  - [x] 4.2 Render 2 nhánh
    - `!isNarrow`: giữ NGUYÊN JSX 3 cột hiện tại (resize/lưu width/thu gọn). `isNarrow`: 1 cột, mỗi khung full-width ẩn/hiện bằng `hidden` (không unmount), ẩn separator; truyền `showBackButton/onBack/onCloseNarrow`
    - _Requirements: 1.2, 1.3, 2.5, 3.1, 3.4_
  - [x] 4.3 Chiều cao banner-safe
    - Root inbox `h-[100dvh]` + `useViewportFit`; mỗi khung `min-h-0` + overflow nội bộ (không cuộn kép)
    - _Requirements: 1.5_

- [x] 5. Chuẩn hoá màu về Design_Token
  - [x] 5.1 Bổ sung token vai-trò vào `globals.css`
    - Thêm `--brand-zalo`, `--brand-zalo-hover`, `--icon-muted`, `--surface-chat`, `--surface-input`, `--border-strong` vào `:root` với GIÁ TRỊ = hex hiện hữu (không hồi quy)
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 5.2 Thay Màu_Cứng vai-trò trong `ConversationList.tsx`
    - Đổi `#005ae0/#606d7b/#eaedf0/#e2e8f0…` sang token tương ứng; GIỮ `STATUS_COLORS`/`CRM_TAGS`/`PRIORITY_ICONS` dạng bảng tập trung
    - _Requirements: 4.1, 4.4, 4.5_
  - [x] 5.3 Thay Màu_Cứng vai-trò trong `ChatHeader.tsx` + `ChatArea.tsx`
    - Đổi `#005ae0/#eaebed/#e1e4ea/#7589a3…` sang token; giữ màu decorate một-lần nếu không thuộc vai-trò dùng chung
    - _Requirements: 4.1, 4.3, 4.5_

- [x] 6. Kiểm thử & xác minh tổng
  - [x] 6.1 Chạy test + typecheck
    - `npx tsc --noEmit` (frontend) sạch cho inbox; `npx jest inbox` xanh (gồm test mới); dán output thật
    - _Requirements: 3.3_
  - [ ] 6.2 Kiểm thủ công 2 bố cục
    - ≥1024px: 3 cột + resize/lưu width nguyên vẹn (Bất biến desktop). <1024px: chuyển khung list↔chat↔info, giữ nội dung soạn, không cuộn kép, banner-safe
    - _Requirements: 1.2, 1.3, 1.4, 2.5, 3.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1", "1.3", "2.1", "2.3", "3.1", "5.1"] },
    { "wave": 2, "tasks": ["1.2", "2.2", "2.4", "3.2", "5.2"] },
    { "wave": 3, "tasks": ["4.1", "5.3"] },
    { "wave": 4, "tasks": ["4.2"] },
    { "wave": 5, "tasks": ["4.3"] },
    { "wave": 6, "tasks": ["6.1"] },
    { "wave": 7, "tasks": ["6.2"] }
  ]
}
```

```
1.1 useIsNarrow ─────────────┐
1.3 useViewportFit ──────────┤
2.1 ChatHeader back ─┐        │
2.2 ChatArea passthrough ◄─ 2.1
2.3 RightSidebar close ──────┤
3.1 nextNarrowView ──────────┤
                             ▼
                    4.1 page state/wiring ─► 4.2 render 2 nhánh ─► 4.3 height banner-safe
                                                                        │
5.1 tokens globals.css ─► 5.2 ConversationList ─► 5.3 ChatHeader/ChatArea
                                                                        │
                                              (4.x + 5.x) ──────────────► 6.1 test/typecheck ─► 6.2 kiểm thủ công
```

- Test-only (`*`): 1.2 ⟵ 1.1 · 2.4 ⟵ 2.1/2.2 · 3.2 ⟵ 3.1. Có thể chạy ngay sau task nguồn.
- 5.x độc lập với 1–4 (có thể làm song song), nhưng 6.1 cần cả hai nhánh xong.

## Notes

- Không đổi backend/schema/API/`useInboxLogic` (Req 3.2, 6.3); chỉ thay cách bố trí + màu vai-trò.
- Token thêm mới GIỮ đúng giá trị hex hiện hữu → không hồi quy light-mode (Req 4.3). Dark-mode là follow-up (Req 6.1).
- `ChatArea` ẩn bằng `hidden` (không unmount) để bảo toàn nội dung đang soạn (Req 2.5).
- Bố_Cục_Rộng giữ nguyên JSX cũ để bảo toàn hành vi desktop (Req 3.4).

