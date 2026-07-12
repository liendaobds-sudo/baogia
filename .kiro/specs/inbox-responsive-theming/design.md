# Design Document

## Overview

Thiết kế này hiện thực hoá `requirements.md`: (1) cho trang Inbox một **bố cục thích ứng** (giữ 3 cột trên desktop, chuyển 1 cột chuyển-view trên màn hẹp), và (2) **chuẩn hoá màu vai-trò về Design_Token** để chuẩn bị dark-mode và giữ nhất quán. Phạm vi giới hạn trong `frontend/src/app/(app)/inbox/**` và phần bổ sung token ở `frontend/src/app/globals.css`. Không đụng backend/API/`useInboxLogic`.

Nguyên tắc chủ đạo: **tái sử dụng nguyên các component hiện có** (`ConversationList`, `ChatArea`, `RightSidebar`) — chỉ thay đổi *cách bố trí/hiển thị* theo chế độ, không sửa logic bên trong. Nhờ vậy mọi chức năng (gửi tin, ảnh, reaction, gợi ý AI…) chạy y hệt ở cả hai bố cục (Req 3.1).

## Architecture

### Điểm_Ngắt
- Một Điểm_Ngắt duy nhất: **1024px** (`< 1024px` ⇒ Bố_Cục_Hẹp; `≥ 1024px` ⇒ Bố_Cục_Rộng). Dưới ngưỡng này tổng `sidebar + list(320) + chat + info(340)` khiến chat < ~360px (mốc từ audit).
- Phát hiện bằng hook `useIsNarrow()` dùng `window.matchMedia('(max-width: 1023.98px)')`, SSR-safe (khởi tạo lười, mặc định `false` khi SSR, lắng nghe `change`, cleanup listener).

### Hai nhánh render trong `InboxPageInner`
- **Bố_Cục_Rộng (`!isNarrow`)**: giữ NGUYÊN JSX hiện tại (left pane theo `leftWidth` + separator + `ChatArea` flex-1 + separator phải + right pane theo `rightWidth`), toàn bộ hành vi resize/lưu width/thu gọn giữ nguyên (Req 2.2, 3.4).
- **Bố_Cục_Hẹp (`isNarrow`)**: một cột, mỗi Khung_Nhìn full-width, ẩn/hiện bằng class `hidden` (KHÔNG unmount để bảo toàn state), ẩn các separator kéo-resize.

### Chiều cao khả dụng (banner-safe — Req 1.5)
- Root inbox mặc định `h-[100dvh]` (mobile-safe).
- Hook `useViewportFit(ref)`: sau mount + mỗi `resize`/thay đổi `body` (ResizeObserver), đo `rect.top` của root và đặt `height = window.innerHeight - rect.top`. Khi có banner impersonation (đẩy `top` xuống) inbox tự co vừa khít mà KHÔNG cần sửa `.main-content` trong `globals.css`. Fallback `100dvh` trước khi đo được.
- Mỗi khung dùng `min-h-0` + overflow nội bộ ⇒ chỉ vùng list/message cuộn (không cuộn kép).

### Luồng chuyển khung (state machine, chỉ khi `isNarrow`)
```
list --(chọn hội thoại)--> chat
chat --(nút Quay lại)-----> list
chat --(toggle thông tin)-> info
info --(nút đóng)---------> chat
* (selectedId bị clear) --> list
```

## Components and Interfaces

### `_hooks/useIsNarrow.ts` (mới)
```ts
export function useIsNarrow(query = '(max-width: 1023.98px)'): boolean;
```
Trả `true` khi viewport dưới Điểm_Ngắt. Dùng `matchMedia` + listener `change`.

### `_hooks/useViewportFit.ts` (mới)
```ts
export function useViewportFit(ref: React.RefObject<HTMLElement>): void;
```
Đặt `ref.current.style.height = (window.innerHeight - rect.top) + 'px'` qua `requestAnimationFrame`; theo dõi `resize` + `ResizeObserver(document.body)`; cleanup đầy đủ.

### `page.tsx` (sửa)
- Thêm `isNarrow = useIsNarrow()`, `narrowView` state (`'list'|'chat'|'info'`), `useViewportFit(rootRef)`.
- Ánh xạ: `onSelect(id)` → `actions.setSelectedId(id)` + (nếu hẹp) `setNarrowView('chat')`; toggle info → (hẹp) `setNarrowView('info')` thay vì `rightCollapsed`.
- Effect: khi `!selectedId` → `narrowView='list'`.
- Phân nhánh render Rộng/Hẹp như Architecture.

### `_components/ChatHeader.tsx` (sửa)
- Thêm props tuỳ chọn: `showBackButton?: boolean; onBack?: () => void`.
- Khi `showBackButton`, render nút Quay lại (mũi tên trái) đầu header: `role=button`, `aria-label="Quay lại danh sách"`, kích hoạt bằng click/Enter/Space.

### `_components/ChatArea.tsx` (sửa)
- Nhận & truyền tiếp `showBackButton?`, `onBack?` xuống `ChatHeader`. Không đổi logic khác.

### `_components/RightSidebar.tsx` (sửa)
- Prop tuỳ chọn `onCloseNarrow?: () => void`; khi có, hiển thị nút đóng (quay về Khung_Chat) ở đầu panel.

### `globals.css` (thêm token — KHÔNG sửa quy tắc sẵn có)
Bổ sung vào `:root` các token vai-trò giữ đúng giá trị hiện hữu (Req 4.2, 4.3):
```css
--brand-zalo: #005ae0;        /* xanh hành động kiểu Zalo trong chat/list */
--brand-zalo-hover: #0047b3;
--icon-muted: #606d7b;        /* icon/label phụ trên toolbar list */
--surface-chat: #eaebed;      /* nền vùng tin nhắn */
--surface-input: #eaedf0;     /* nền ô tìm kiếm/nhập */
--border-strong: #e1e4ea;     /* viền toolbar/thanh nhập chat */
```

## Data Models

Spec này **không thêm/đổi mô hình dữ liệu backend** (Req 3.2, 6.3). Chỉ có state UI phía client:

```ts
// page.tsx (client-only, không persist)
type NarrowView = 'list' | 'chat' | 'info';
interface InboxLayoutState {
  isNarrow: boolean;      // dẫn xuất từ matchMedia
  narrowView: NarrowView; // chỉ có ý nghĩa khi isNarrow
  leftWidth: number;      // đã có — persist localStorage 'zh_inbox_left_w'
  rightWidth: number;     // đã có — persist localStorage 'zh_inbox_right_w'
  rightCollapsed: boolean;// đã có — dùng cho Bố_Cục_Rộng
}
```
Bảng màu ngữ nghĩa nghiệp vụ (`STATUS_COLORS`, `CRM_TAGS`, `PRIORITY_ICONS`) GIỮ nguyên dạng hằng số tập trung trong `ConversationList.tsx` (Req 4.4) — không chuyển thành token toàn cục.

## Correctness Properties

### Property 1: Không mất hội thoại khi đổi bố cục
Với mọi thay đổi `isNarrow`, `selectedId` không đổi.
**Validates: Requirements 1.4**

### Property 2: Bảo toàn nội dung soạn
`ChatArea` không bị unmount khi đổi `narrowView` ⇒ `replyText`/`pendingImage`/`replyingTo` giữ nguyên.
**Validates: Requirements 2.5**

### Property 3: Bất biến desktop
Khi `!isNarrow`, cây render và class của 3 pane bằng đúng bản trước thay đổi.
**Validates: Requirements 3.4**

### Property 4: Không hồi quy màu light
Mỗi Màu_Cứng được thay bằng token có GIÁ TRỊ BẰNG hex cũ ⇒ pixel màu không đổi.
**Validates: Requirements 4.3**

### Property 5: Đóng/mở khung là nghịch đảo
`list→chat→list` và `chat→info→chat` đưa về đúng khung xuất phát.
**Validates: Requirements 2.2, 2.3, 2.4**

## Error Handling

- `useIsNarrow`/`useViewportFit` chạy SSR: guard `typeof window !== 'undefined'`; giá trị mặc định an toàn (`isNarrow=false`, height fallback `100dvh`).
- `matchMedia`/`ResizeObserver` thiếu (môi trường test cũ): guard tồn tại trước khi gọi; nếu thiếu → không lỗi, dùng mặc định.
- Không nuốt lỗi logic nhắn tin: mọi xử lý gửi/nhận giữ nguyên trong `ChatArea`/`useInboxLogic` (ngoài phạm vi sửa).

## Testing Strategy

1. Test Inbox hiện có phải tiếp tục xanh, không hạ assertion (Req 3.3).
2. `useIsNarrow`: unit test với `matchMedia` mock → đúng `true/false` theo width + cập nhật khi `change`.
3. State machine chuyển khung: tách logic sang hàm/hook thuần, test `list→chat` (chọn), `chat→list` (back), `chat→info` (toggle), `clear selected → list`.
4. A11y: nút "Quay lại" có `aria-label` + kích hoạt bằng `keyDown` Enter/Space.
5. Không hồi quy màu: xác nhận giá trị token = hex cũ (kiểm thủ công light-mode; repo chưa có visual snapshot).
6. Verify lệnh: `npx tsc --noEmit` (frontend) sạch cho inbox; `npx jest inbox` xanh.
