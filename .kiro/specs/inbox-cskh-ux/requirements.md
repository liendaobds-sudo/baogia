# Requirements Document

## Introduction

Spec này cải thiện chất lượng chức năng, độ tin cậy dữ liệu, an toàn (XSS), tính nhất quán phản hồi và khả năng tiếp cận (a11y) cho module Inbox/CSKH của ZeplaoPrint. Phạm vi dựa trên kết quả audit đã được người dùng đồng ý, chia làm ba nhóm ưu tiên:

- **P1 — Lỗi chức năng & dữ liệu:** action nuốt lỗi âm thầm, optimistic update không rollback, nguy cơ XSS trong panel gợi ý AI, thay thế dialog trình duyệt native, thống nhất luồng xóa hội thoại, bỏ reload trang khi đồng bộ Zalo, mở rộng phạm vi tìm kiếm hội thoại.
- **P2 — Phản hồi & nhất quán:** trạng thái pending cho nút gửi gợi ý AI, định dạng tiền tệ nhất quán, tách hằng số khỏi giá trị hardcode, bổ sung khóa màu trạng thái còn thiếu, ghi nhận giới hạn phân trang tin nhắn.
- **P3 — A11y & responsive:** nhãn cho nút chỉ-icon, vai trò bàn phím cho phần tử `div` đóng vai nút, truyền nghĩa không chỉ bằng màu/emoji, ghi nhận giới hạn responsive desktop-only.

Toàn bộ thay đổi nằm ở **frontend** (Next.js). Backend là biên giới bảo mật thật; spec này KHÔNG đổi schema PostgreSQL (`synchronize=false`), KHÔNG tái cấu trúc API hiện có, và KHÔNG phá vỡ các đảm bảo hiện có (FrozenRouteGuard, cấu trúc route, RBAC gating, logic pricing). Hạ tầng UX đã có (`ToastProvider`/`useToast`, `ConfirmModal`, `formatVND`, `useDebouncedValue`) phải được TÁI DÙNG, không tạo lại. Tối ưu cho tiệm in nhỏ: ưu tiên giảm ma sát, tránh over-engineer.

## Glossary

- **Inbox**: Module hội thoại CSKH tại `frontend/src/app/(app)/inbox/`.
- **Inbox_Hook**: Hook `useInboxLogic` tại `_hooks/useInboxLogic.ts`, chứa các action gọi API và cập nhật cache React Query.
- **Inbox_Action**: Một hàm hành động trong Inbox_Hook (vd. `addNote`, `toggleTag`, `markAsUnread`).
- **Toast_System**: Hệ thống thông báo dùng chung `ToastProvider`/`useToast` tại `frontend/src/lib/ui/toast.tsx`.
- **Confirm_Modal**: Hộp thoại xác nhận dùng chung `ConfirmModal` tại `frontend/src/lib/ui/ConfirmModal.tsx`.
- **Delete_Confirm_Modal**: Modal xác nhận xóa hội thoại hiện có tại `_components/DeleteConfirmModal.tsx`.
- **App_Layout**: Layout của route group `(app)` tại `frontend/src/app/(app)/layout.tsx`.
- **Ai_Suggest_Panel**: Component `AiSuggestPanel` tại `_components/AiSuggestPanel.tsx` hiển thị gợi ý AI.
- **Markdown_Renderer**: Hàm `renderMarkdown` trong Ai_Suggest_Panel chuyển `**bold**` thành HTML.
- **Conversation_List**: Component `ConversationList` tại `_components/ConversationList.tsx`.
- **Chat_Area**: Component `ChatArea` tại `_components/ChatArea.tsx`.
- **Chat_Header**: Component `ChatHeader` tại `_components/ChatHeader.tsx`.
- **Mini_Quote_Panel**: Component `MiniQuotePanel` tại `inbox/MiniQuotePanel.tsx`.
- **Query_Cache**: Bộ nhớ đệm React Query lưu danh sách hội thoại, tin nhắn, ghi chú, participants.
- **Optimistic_Update**: Cập nhật Query_Cache ngay trước khi server phản hồi để UI phản hồi tức thì.
- **Format_VND**: Hàm `formatVND` tại `frontend/src/lib/format/currency.ts`.
- **Loaded_Conversations**: Tập hội thoại đã tải về client tại thời điểm tìm kiếm (giới hạn trang/limit hiện hành).
- **Sanitize_HTML**: Hàm thuần escape ký tự HTML đặc biệt trước khi render bold an toàn.
- **Status_Color_Map**: Bảng `STATUS_COLORS` ánh xạ trạng thái hội thoại sang màu trong Conversation_List.

## Requirements

### Requirement 1: Báo lỗi khi Inbox_Action thất bại

**User Story:** Là nhân viên CSKH, tôi muốn được thông báo khi một thao tác thất bại, để tôi biết thao tác chưa thành công và thử lại.

#### Acceptance Criteria

1. IF một Inbox_Action gọi API thất bại (phản hồi không thành công hoặc lỗi mạng), THEN THE Inbox_Hook SHALL hiển thị một thông báo lỗi qua Toast_System.
2. THE Inbox_Hook SHALL áp dụng hành vi báo lỗi này cho các Inbox_Action: `addNote`, `togglePinNote`, `transferConversation`, `collabActions.add`, `collabActions.remove`, `collabActions.toggleAccess`, `markAsUnread`, `togglePinConversation`, `toggleTag`, `markAllRead`, `updateStatus`, `updatePriority`.
3. WHEN một Inbox_Action thất bại, THE Inbox_Hook SHALL ghi nội dung lỗi vào console để phục vụ chẩn đoán.

### Requirement 2: Rollback Optimistic_Update khi thất bại

**User Story:** Là nhân viên CSKH, tôi muốn giao diện quay lại trạng thái đúng khi một thao tác thất bại, để dữ liệu hiển thị luôn khớp với máy chủ.

#### Acceptance Criteria

1. WHEN một Inbox_Action thực hiện Optimistic_Update, THE Inbox_Hook SHALL lưu lại ảnh chụp trạng thái Query_Cache trước khi thay đổi.
2. IF một Inbox_Action có Optimistic_Update gọi API thất bại, THEN THE Inbox_Hook SHALL khôi phục Query_Cache về ảnh chụp đã lưu trước khi thay đổi.
3. THE Inbox_Hook SHALL áp dụng cơ chế rollback này cho các Inbox_Action: `toggleTag`, `togglePinConversation`, `markAsUnread`, `markAllRead`.

### Requirement 3: Render gợi ý AI an toàn, chống XSS

**User Story:** Là nhân viên CSKH, tôi muốn nội dung gợi ý AI hiển thị an toàn, để mã độc nhúng trong văn bản không thể thực thi trong trình duyệt.

#### Acceptance Criteria

1. WHEN Ai_Suggest_Panel hiển thị văn bản gợi ý có chứa cú pháp `**đậm**`, THE Ai_Suggest_Panel SHALL hiển thị phần văn bản giữa cặp dấu sao dưới dạng in đậm.
2. WHEN Ai_Suggest_Panel hiển thị văn bản gợi ý có chứa ký tự HTML đặc biệt (`<`, `>`, `&`, `"`, `'`), THE Sanitize_HTML SHALL chuyển các ký tự đó thành thực thể HTML tương ứng trước khi render.
3. THE Sanitize_HTML SHALL trả về kết quả không chứa thẻ HTML thực thi nào ngoài thẻ `<strong>` được sinh ra từ cú pháp đậm hợp lệ.

### Requirement 4: Thay dialog trình duyệt native bằng Toast_System và Confirm_Modal

**User Story:** Là nhân viên CSKH, tôi muốn các thông báo và xác nhận hiển thị nhất quán trong giao diện ứng dụng, để trải nghiệm liền mạch và không bị chặn bởi popup trình duyệt.

#### Acceptance Criteria

1. THE Inbox SHALL thay thế mọi lời gọi `alert()` của trình duyệt bằng thông báo qua Toast_System.
2. THE Inbox SHALL thay thế mọi lời gọi `confirm()` của trình duyệt bằng Confirm_Modal.
3. THE Inbox SHALL áp dụng thay thế này cho các luồng: thu hồi tin nhắn, ghim tin nhắn, đánh dấu sao tin nhắn, xóa tin nhắn phía mình, xóa ghi chú, đồng bộ Zalo, gửi sticker lỗi, tập tin vượt quá kích thước cho phép, và gửi tin nhắn thất bại.
4. WHEN một thao tác cần xác nhận được khởi tạo, THE Confirm_Modal SHALL hiển thị cho đến khi người dùng xác nhận hoặc hủy.

### Requirement 5: Thống nhất luồng xóa hội thoại

**User Story:** Là nhân viên CSKH, tôi muốn xóa hội thoại theo một cách xác nhận thống nhất ở mọi nơi, để tránh nhầm lẫn và xóa nhầm.

#### Acceptance Criteria

1. WHEN người dùng khởi tạo xóa hội thoại từ Chat_Area hoặc Chat_Header, THE Inbox SHALL hiển thị Delete_Confirm_Modal thay cho `confirm()` trình duyệt.
2. WHEN người dùng khởi tạo xóa hội thoại từ Conversation_List, THE Inbox SHALL hiển thị Delete_Confirm_Modal.
3. WHEN người dùng xác nhận xóa trong Delete_Confirm_Modal, THE Inbox_Hook SHALL gửi yêu cầu xóa hội thoại và cập nhật Query_Cache khi thành công.
4. IF yêu cầu xóa hội thoại thất bại, THEN THE Inbox_Hook SHALL hiển thị thông báo lỗi qua Toast_System.

### Requirement 6: Đồng bộ Zalo không tải lại trang

**User Story:** Là nhân viên CSKH, tôi muốn đồng bộ Zalo mà không mất trạng thái màn hình, để tiếp tục công việc liền mạch.

#### Acceptance Criteria

1. WHEN người dùng kích hoạt đồng bộ Zalo thành công, THE Inbox SHALL làm mới dữ liệu hội thoại bằng cách vô hiệu hóa truy vấn React Query thay cho việc tải lại trang.
2. THE Inbox SHALL giữ nguyên trạng thái màn hình hiện tại (hội thoại đang chọn, ô nhập liệu) sau khi đồng bộ Zalo hoàn tất.
3. WHEN đồng bộ Zalo hoàn tất, THE Inbox SHALL hiển thị kết quả qua Toast_System.

### Requirement 7: Mở rộng phạm vi tìm kiếm hội thoại

**User Story:** Là nhân viên CSKH, tôi muốn tìm hội thoại theo nhiều tiêu chí, để nhanh chóng tìm đúng khách hàng.

#### Acceptance Criteria

1. WHEN người dùng nhập từ khóa tìm kiếm trong Conversation_List, THE Conversation_List SHALL khớp từ khóa với tên hiển thị của liên hệ.
2. WHEN người dùng nhập từ khóa tìm kiếm, THE Conversation_List SHALL khớp từ khóa với nội dung tin nhắn cuối của hội thoại trong phạm vi Loaded_Conversations.
3. WHEN người dùng nhập từ khóa tìm kiếm, THE Conversation_List SHALL khớp từ khóa với số điện thoại hoặc định danh ngoài (externalId) của liên hệ trong phạm vi Loaded_Conversations.
4. THE Conversation_List SHALL thực hiện khớp tìm kiếm không phân biệt chữ hoa chữ thường.
5. WHERE việc lọc toàn bộ hội thoại phía máy chủ vượt phạm vi an toàn của spec, THE Conversation_List SHALL giới hạn tìm kiếm trong phạm vi Loaded_Conversations và không thay đổi hành vi API máy chủ.

### Requirement 8: Trạng thái pending cho nút gửi gợi ý AI

**User Story:** Là nhân viên CSKH, tôi muốn nút gửi gợi ý AI bị khóa khi đang xử lý, để tránh gửi trùng tin nhắn.

#### Acceptance Criteria

1. WHEN người dùng bấm nút "Gửi" hoặc "Sửa & Gửi" của một gợi ý AI, THE Ai_Suggest_Panel SHALL chuyển nút sang trạng thái đang xử lý và vô hiệu hóa nút đó.
2. WHILE một gợi ý AI đang được gửi, THE Ai_Suggest_Panel SHALL ngăn việc kích hoạt lại nút gửi cho cùng gợi ý đó.
3. WHEN thao tác gửi gợi ý AI kết thúc (thành công hoặc thất bại), THE Ai_Suggest_Panel SHALL khôi phục trạng thái cho phép thao tác tiếp theo phù hợp.

### Requirement 9: Định dạng tiền tệ nhất quán trong Mini_Quote_Panel

**User Story:** Là nhân viên CSKH, tôi muốn các số tiền hiển thị theo một định dạng thống nhất, để dễ đọc và tránh nhầm lẫn.

#### Acceptance Criteria

1. WHEN Mini_Quote_Panel hiển thị một số tiền, THE Mini_Quote_Panel SHALL định dạng số tiền đó bằng Format_VND.
2. THE Mini_Quote_Panel SHALL dùng cùng một ký hiệu tiền tệ thống nhất cho mọi số tiền hiển thị.

### Requirement 10: Tách hằng số khỏi giá trị hardcode

**User Story:** Là lập trình viên bảo trì, tôi muốn các giá trị cố định được khai báo thành hằng số có tên, để dễ đọc và dễ thay đổi.

#### Acceptance Criteria

1. THE Inbox SHALL khai báo danh sách URL sticker thành một hằng số có tên thay cho mảng nội tuyến trong JSX.
2. THE Inbox SHALL khai báo thời gian tự ẩn thông báo (magic number auto-dismiss) thành một hằng số có tên.
3. WHEN một thành phần Inbox cần một giá trị cố định đã được tách, THE thành phần đó SHALL tham chiếu hằng số có tên thay cho giá trị nội tuyến.

### Requirement 11: Hoàn thiện bảng màu trạng thái

**User Story:** Là nhân viên CSKH, tôi muốn mọi trạng thái hội thoại đều hiển thị màu, để nhận biết trạng thái nhất quán.

#### Acceptance Criteria

1. THE Status_Color_Map SHALL chứa một mục màu cho khóa trạng thái `waiting_file`.
2. THE Status_Color_Map SHALL chứa một mục màu cho mọi khóa trạng thái có trong bảng nhãn trạng thái của Conversation_List.
3. IF một hội thoại có trạng thái không tồn tại trong Status_Color_Map, THEN THE Conversation_List SHALL hiển thị màu mặc định an toàn thay vì màu không xác định.

### Requirement 12: Ghi nhận giới hạn phân trang tin nhắn

**User Story:** Là lập trình viên bảo trì, tôi muốn giới hạn tải tin nhắn được ghi nhận rõ ràng, để biết phạm vi hiện tại và rủi ro khi mở rộng.

#### Acceptance Criteria

1. THE Inbox_Hook SHALL ghi nhận trong tài liệu thiết kế rằng truy vấn tin nhắn giới hạn ở 100 bản ghi và chưa phân trang.
2. WHERE việc phân trang tin nhắn có thể thực hiện mà không phá vỡ hành vi hiện có, THE Inbox MAY bổ sung cơ chế tải thêm tin nhắn cũ như một cải thiện tùy chọn.

### Requirement 13: Nhãn cho nút chỉ-icon

**User Story:** Là người dùng dùng trình đọc màn hình, tôi muốn các nút chỉ-icon có nhãn mô tả, để biết chức năng của nút.

#### Acceptance Criteria

1. THE Inbox SHALL gán thuộc tính `aria-label` mô tả chức năng cho mọi nút chỉ chứa icon (không có nhãn văn bản hiển thị).

### Requirement 14: Vai trò bàn phím cho phần tử `div` đóng vai nút

**User Story:** Là người dùng thao tác bằng bàn phím, tôi muốn các phần tử bấm được có thể điều khiển bằng bàn phím, để dùng được mà không cần chuột.

#### Acceptance Criteria

1. WHERE một phần tử `div` được gắn `onClick` để đóng vai nút bấm, THE Inbox SHALL bổ sung `role="button"` và `tabIndex` cho phần tử đó hoặc chuyển nó sang phần tử `<button>`.
2. WHEN một phần tử `div` đóng vai nút bấm nhận tiêu điểm và người dùng nhấn phím Enter hoặc Space, THE Inbox SHALL kích hoạt cùng hành động như khi bấm chuột.

### Requirement 15: Truyền nghĩa không chỉ bằng màu hoặc emoji

**User Story:** Là người dùng (gồm người khiếm thị màu hoặc dùng trình đọc màn hình), tôi muốn thông tin ưu tiên và SLA có nhãn văn bản, để hiểu ý nghĩa không phụ thuộc màu sắc hay emoji.

#### Acceptance Criteria

1. WHEN Conversation_List hiển thị mức ưu tiên của hội thoại bằng màu hoặc emoji, THE Conversation_List SHALL kèm theo nhãn văn bản hoặc `aria-label` mô tả mức ưu tiên đó.
2. WHEN Conversation_List hiển thị cảnh báo SLA bằng màu hoặc emoji, THE Conversation_List SHALL kèm theo nhãn văn bản hoặc `aria-label` mô tả trạng thái SLA đó.
3. WHEN Conversation_List hiển thị trạng thái hội thoại bằng màu, THE Conversation_List SHALL kèm theo nhãn văn bản trạng thái tương ứng.

### Requirement 16: Ghi nhận giới hạn responsive desktop-only

**User Story:** Là lập trình viên bảo trì, tôi muốn giới hạn bố cục 3 cột kéo-thả chỉ dành cho desktop được ghi nhận, để biết phạm vi và ưu tiên cải thiện sau này.

#### Acceptance Criteria

1. THE Inbox SHALL ghi nhận trong tài liệu thiết kế rằng bố cục 3 cột kéo-thả hiện chỉ tối ưu cho desktop.
2. WHERE việc bổ sung responsive cho màn hình nhỏ được đưa vào phạm vi, THE Inbox MAY cải thiện bố cục cho màn hình nhỏ như một hạng mục tùy chọn ưu tiên thấp.
