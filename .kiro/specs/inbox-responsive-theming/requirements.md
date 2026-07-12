# Requirements Document

## Introduction

Tài liệu này định nghĩa yêu cầu cho việc **làm responsive trang Inbox và chuẩn hoá màu về design token** của App_CSKH (ZeplaoPrint). Đây là bước tiếp nối của phiên audit UI/UX trang `/inbox`: hai hạng mục lớn còn lại là (1) **bố cục thích ứng cho màn hẹp/mobile** và (2) **thay màu hex cứng bằng CSS design token** để nền tảng có thể bật dark-mode và giữ nhất quán thị giác.

Trang Inbox hiện là bố cục 3 cột cố định bằng pixel (danh sách hội thoại · vùng chat · bảng thông tin) đặt tại `frontend/src/app/(app)/inbox/`. Bố cục này chỉ dùng tốt trên desktop rộng; ở màn ≤1024px vùng chat bị bóp và không có phương án 1 cột cho tablet/điện thoại. Ngoài ra nhiều component (đặc biệt `ConversationList`, `ChatHeader`) dùng mã màu hex cứng inline (`#005ae0`, `#606d7b`, `#eaebed`…) thay vì token trong `globals.css` (`--primary`, `--text-secondary`, `--border`…), khiến không thể theme và bảng màu lệch nhau.

Phạm vi tài liệu này là đặc tả **hành vi mong muốn** (what) của bố cục thích ứng và của việc chuẩn hoá màu, cùng các **ràng buộc không hồi quy**. Thiết kế kỹ thuật (breakpoint cụ thể, cấu trúc component, cách migrate token) và các Task sẽ được chi tiết ở giai đoạn Design/Tasks.

## Glossary

- **Hệ_Thống (System)**: Trang Inbox của App_CSKH tại `frontend/src/app/(app)/inbox/` cùng các component con của nó.
- **NV_CSKH**: Nhân viên chăm sóc khách hàng — người dùng chính của Inbox (đọc danh sách hội thoại, chat, xem thông tin khách).
- **Người_Phát_Triển (Maintainer)**: Developer thực hiện và bảo trì thay đổi.
- **Bố_Cục_Rộng (Wide Layout)**: Bố cục 3 cột hiện hành (danh sách · chat · thông tin) hiển thị đồng thời, dành cho màn hình rộng.
- **Bố_Cục_Hẹp (Narrow Layout)**: Bố cục 1 cột (single-column) cho màn hẹp, tại mỗi thời điểm chỉ hiển thị một Khung_Nhìn.
- **Khung_Nhìn (View)**: Một trong ba vùng của Inbox — Khung_Danh_Sách (danh sách hội thoại), Khung_Chat (hội thoại đang chọn), Khung_Thông_Tin (bảng thông tin/gợi ý bên phải).
- **Điểm_Ngắt (Breakpoint)**: Ngưỡng chiều rộng viewport để chuyển giữa Bố_Cục_Rộng và Bố_Cục_Hẹp.
- **Design_Token**: Biến CSS khai báo trong `globals.css` (`--primary`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border`, `--bg-*`, `--chat-*`…) đại diện cho giá trị màu/kiểu dùng chung.
- **Màu_Cứng (Hardcoded Color)**: Giá trị màu viết thẳng dạng hex/rgb trong mã component (inline style hoặc class tuỳ biến) thay vì tham chiếu Design_Token.
- **Chế_Độ_Tối (Dark Mode)**: Chủ đề giao diện nền tối; trong spec này là mục tiêu tương lai được **chuẩn bị sẵn** chứ chưa bật.
- **Hồi_Quy_Thị_Giác (Visual Regression)**: Sai khác giao diện ngoài ý muốn sau thay đổi (màu, khoảng cách, bố cục) so với trạng thái trước.
- **WCAG_AA**: Ngưỡng tương phản tối thiểu 4.5:1 cho chữ thường, 3:1 cho chữ lớn/UI, theo WCAG 2.1 mức AA.

## Requirements

### Requirement 1: Bố cục thích ứng theo chiều rộng viewport

**User Story:** Là NV_CSKH dùng máy tính bảng hoặc cửa sổ hẹp, tôi muốn Inbox tự điều chỉnh bố cục để vùng chat không bị bóp và vẫn thao tác được, để làm việc hiệu quả trên mọi kích thước màn hình.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL định nghĩa đúng một Điểm_Ngắt để phân định giữa Bố_Cục_Rộng và Bố_Cục_Hẹp.
2. WHERE chiều rộng viewport ≥ Điểm_Ngắt, THE Hệ_Thống SHALL hiển thị Bố_Cục_Rộng (ba Khung_Nhìn đồng thời) giữ nguyên hành vi hiện hành (kéo đổi độ rộng, lưu độ rộng, thu gọn Khung_Thông_Tin).
3. WHERE chiều rộng viewport < Điểm_Ngắt, THE Hệ_Thống SHALL chuyển sang Bố_Cục_Hẹp và tại mỗi thời điểm chỉ hiển thị đúng một Khung_Nhìn chiếm toàn bộ chiều rộng khả dụng.
4. WHEN viewport thay đổi kích thước vượt qua Điểm_Ngắt theo bất kỳ chiều nào, THE Hệ_Thống SHALL chuyển đổi giữa Bố_Cục_Rộng và Bố_Cục_Hẹp mà KHÔNG tải lại trang và KHÔNG mất hội thoại đang chọn.
5. THE Hệ_Thống SHALL chiếm đúng chiều cao khả dụng của vùng nội dung (không tạo cuộn kép, ô nhập tin luôn nằm trong viewport) ở cả hai bố cục, kể cả khi có banner impersonation phía trên.

### Requirement 2: Điều hướng giữa các Khung_Nhìn trong Bố_Cục_Hẹp

**User Story:** Là NV_CSKH trên màn hẹp, tôi muốn chuyển qua lại giữa danh sách, hội thoại và thông tin khách một cách rõ ràng, để không bị lạc và luôn quay lại được.

#### Acceptance Criteria

1. WHERE đang ở Bố_Cục_Hẹp và chưa chọn hội thoại, THE Hệ_Thống SHALL hiển thị Khung_Danh_Sách.
2. WHEN NV_CSKH chọn một hội thoại trong Bố_Cục_Hẹp, THE Hệ_Thống SHALL chuyển hiển thị sang Khung_Chat của hội thoại đó.
3. WHERE đang hiển thị Khung_Chat trong Bố_Cục_Hẹp, THE Hệ_Thống SHALL cung cấp một control quay lại Khung_Danh_Sách có nhãn/aria rõ ràng và thao tác được bằng bàn phím.
4. WHERE đang hiển thị Khung_Chat trong Bố_Cục_Hẹp, THE Hệ_Thống SHALL cung cấp control mở Khung_Thông_Tin; khi mở, Khung_Thông_Tin chiếm toàn màn và có control đóng để quay lại Khung_Chat.
5. WHEN chuyển đổi giữa các Khung_Nhìn trong Bố_Cục_Hẹp, THE Hệ_Thống SHALL giữ nguyên trạng thái đang soạn (nội dung ô nhập, ảnh đính kèm, tin đang trả lời) của hội thoại đang chọn.

### Requirement 3: Không hồi quy chức năng và desktop

**User Story:** Là Người_Phát_Triển, tôi muốn thay đổi responsive không phá vỡ bất kỳ chức năng hay bố cục desktop nào, để yên tâm phát hành.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL giữ nguyên toàn bộ chức năng hiện có (gửi tin, gửi ảnh/file/sticker, reaction, thu hồi, ghim, chọn nhiều, chuyển tiếp, gợi ý AI, ghi chú, chuyển hội thoại) hoạt động ở cả Bố_Cục_Rộng và Bố_Cục_Hẹp.
2. THE Hệ_Thống SHALL KHÔNG thay đổi hành vi hay hợp đồng dữ liệu của backend/logic nhắn tin (`useInboxLogic` và các API) như một phần của thay đổi bố cục.
3. WHEN chạy bộ test frontend hiện có của Inbox, THE Hệ_Thống SHALL giữ toàn bộ test đang xanh tiếp tục xanh (không hạ/ò bỏ assertion để "cho qua").
4. THE Hệ_Thống SHALL giữ nguyên hành vi Bố_Cục_Rộng ở màn hình ≥ Điểm_Ngắt so với trước thay đổi (kéo resize, lưu độ rộng, thu gọn phải, tương phản, a11y đã có).

### Requirement 4: Chuẩn hoá màu về Design_Token

**User Story:** Là Người_Phát_Triển, tôi muốn màu trong các component Inbox tham chiếu Design_Token thay vì Màu_Cứng, để bật dark-mode sau này và giữ bảng màu nhất quán.

#### Acceptance Criteria

1. THE Người_Phát_Triển SHALL thay các Màu_Cứng biểu thị vai trò dùng chung (màu nhấn/primary, chữ chính/phụ/mờ, viền, nền bề mặt, nền bong bóng chat) trong các component Inbox bằng Design_Token tương ứng trong `globals.css`.
2. WHERE một Design_Token phù hợp chưa tồn tại cho một vai trò màu cần thiết, THE Người_Phát_Triển SHALL bổ sung token mới vào `globals.css` kèm tên theo vai trò (không đặt tên theo giá trị màu).
3. THE Hệ_Thống SHALL giữ giao diện ở chế độ sáng (light) KHÔNG bị Hồi_Quy_Thị_Giác sau khi chuyển sang Design_Token (màu hiển thị tương đương trước đó).
4. WHERE một màu mang tính ngữ nghĩa trạng thái nghiệp vụ (màu trạng thái hội thoại, màu thẻ CRM, màu ưu tiên), THE Người_Phát_Triển MAY giữ ở một bảng ánh xạ tập trung thay vì token toàn cục, nhưng SHALL không để rải rác trùng lặp nhiều nơi.
5. THE Hệ_Thống SHALL bảo đảm mọi cặp màu chữ/nền dùng cho văn bản sau chuẩn hoá đạt tối thiểu WCAG_AA.

### Requirement 5: Accessibility xuyên suốt hai bố cục

**User Story:** Là NV_CSKH dùng bàn phím hoặc trình đọc màn hình, tôi muốn thao tác được ở cả hai bố cục, để không bị loại trừ trên thiết bị bất kỳ.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL bảo đảm mọi control điều hướng Khung_Nhìn trong Bố_Cục_Hẹp (chọn hội thoại, quay lại, mở/đóng thông tin) đều focus và kích hoạt được bằng bàn phím (Enter/Space) và có `aria-label`.
2. THE Hệ_Thống SHALL bảo đảm khi chuyển Khung_Nhìn trong Bố_Cục_Hẹp, tiêu điểm bàn phím (focus) được đưa tới vùng nội dung mới một cách hợp lý (không kẹt ở vùng đã ẩn).
3. THE Hệ_Thống SHALL giữ các cải tiến a11y đã có ở Bố_Cục_Rộng (dòng hội thoại là control bàn phím, separator có role/aria, nút hiện khi focus).

### Requirement 6: Ranh giới phạm vi (Non-goals)

**User Story:** Là chủ dự án, tôi muốn giới hạn phạm vi để thay đổi gọn và an toàn, để tránh phình việc.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL KHÔNG bật Chế_Độ_Tối trong phạm vi spec này; chỉ **chuẩn bị** nền tảng token để bật sau.
2. THE Hệ_Thống SHALL giới hạn phạm vi thay đổi trong các file thuộc `frontend/src/app/(app)/inbox/` và `globals.css` (thêm token); KHÔNG refactor các trang khác (`pricing/*`, `ai/*`) trong spec này.
3. THE Hệ_Thống SHALL KHÔNG thay đổi backend, schema, hay hợp đồng API.
4. WHERE phát sinh nhu cầu đổi hành vi ngoài phạm vi trên, THE Người_Phát_Triển SHALL ghi nhận là hạng mục follow-up thay vì mở rộng spec này.
