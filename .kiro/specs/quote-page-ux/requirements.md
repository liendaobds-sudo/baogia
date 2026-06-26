# Requirements Document

## Introduction

Tài liệu này mô tả các yêu cầu cải thiện trải nghiệm người dùng (UI/UX) cho các trang Báo giá của module `App_BaoGia`, dựa trên một đợt rà soát (audit) UI/UX. Phạm vi gồm hai khu vực:

1. **Trang Danh sách / Chi tiết Báo giá** — component dùng chung `frontend/src/app/pricing/_components/QuoteOrderListView.tsx`, được hai route `/pricing/quotes` (Báo giá) và `/pricing/orders` (Đơn hàng) tái sử dụng.
2. **Luồng Tạo Báo giá** — `frontend/src/app/pricing/quotes/new/page.tsx` cùng `QuoteConfigurator` và `CustomerInfoSidebar`.

Mục tiêu là làm cho hệ thống nhanh, ít thao tác, phản hồi rõ ràng cho mô hình xưởng in nhỏ, đồng thời sửa các lỗi đúng đắn dữ liệu (data correctness) phát hiện trong audit.

Tài liệu này **không** thay đổi logic tính giá (pricing calculation) và **không** thay đổi schema cơ sở dữ liệu. Mọi thay đổi tập trung ở frontend; trường hợp duy nhất được phép chạm backend là khi cần điều hòa (reconcile) endpoint tạo báo giá về đúng nguồn được bảo vệ bởi RBAC, và khi đó thay đổi phải tối thiểu và an toàn schema (`synchronize=false`, không thêm/sửa cột hoặc bảng).

### Ràng buộc kế thừa từ các spec liên quan

- **`product-rescope-cskh-quote`**: giữ nguyên `FrozenRouteGuard`, cấu trúc hai route `/pricing/quotes` và `/pricing/orders`, scope registry, và cơ chế `statusGroup` / `filterByView` (`frontend/src/lib/scope/quote-view.ts`).
- **`rbac-quote-order-access`**: giữ nguyên `PermissionsGuard` trên surface `/erp/orders`, và việc ẩn/hiện các nút hành động cam kết theo quyền qua `usePermissions` / `hasPermission`.

## Glossary

- **App_BaoGia**: Module Báo giá của hệ thống, gồm trang danh sách/chi tiết và luồng tạo báo giá.
- **Trang_Danh_Sách_BG**: Màn hình danh sách kèm chi tiết, hiện thực bởi component dùng chung `QuoteOrderListView.tsx`, dùng cho cả route `/pricing/quotes` và `/pricing/orders`.
- **Trang_Tạo_BG**: Màn hình tạo/sửa báo giá tại `frontend/src/app/pricing/quotes/new/page.tsx`, gồm `QuoteConfigurator` và khu nhập thông tin khách hàng.
- **Khung_Nhìn**: Bộ lọc trình bày trên Trang_Danh_Sách_BG, gồm ba giá trị `quote` (Báo giá), `order` (Đơn hàng), `all` (Tất cả), ánh xạ qua hàm `statusGroup` / `filterByView`.
- **Nguồn_Báo_Giá**: Nguồn dữ liệu báo giá chuẩn (canonical), tức surface `/erp/orders` được bảo vệ bởi `PermissionsGuard`; là nguồn mà Trang_Danh_Sách_BG đọc và là nơi báo giá mới phải được ghi vào.
- **Thông_Báo**: Thông báo không chặn thao tác (toast / non-blocking notification) hiển thị kết quả thành công hoặc lỗi.
- **Hộp_Thoại_Xác_Nhận**: Hộp thoại trong ứng dụng (in-app modal / confirmation) dùng cho hành động nghiệp vụ cần nhập liệu hoặc xác nhận (ví dụ lý do từ chối, lý do hủy), thay cho hộp thoại trình duyệt gốc (`alert` / `prompt`).
- **Thành_Phần_Thông_Tin_Khách**: Component dùng chung duy nhất chứa UI nhập thông tin khách hàng, thay cho hai bản trùng lặp hiện tại (khối inline trong `new/page.tsx` và `CustomerInfoSidebar.tsx`).
- **Bộ_Định_Dạng_Tiền_Tệ**: Hàm định dạng tiền tệ dùng chung, áp dụng nhất quán cho cả danh sách và luồng tạo.
- **PricingLayout**: Layout bao quanh các trang Báo giá, chứa sidebar điều hướng của module pricing.
- **quote.create / quote.approve / order.approve**: Các khóa quyền (permission) RBAC liên quan tạo và cam kết báo giá/đơn hàng.

## Requirements

### Requirement 1: Lọc Khung nhìn phản ánh đầy đủ bản ghi (P1)

**User Story:** Là nhân viên báo giá, tôi muốn khi chọn một Khung_Nhìn (Báo giá / Đơn hàng / Tất cả) thì thấy mọi bản ghi khớp với khung nhìn đó, để không bỏ sót đơn hàng chỉ vì chúng nằm ngoài trang đầu tiên.

#### Acceptance Criteria

1. WHEN người dùng chọn một Khung_Nhìn trên Trang_Danh_Sách_BG, THE App_BaoGia SHALL hiển thị mọi bản ghi từ Nguồn_Báo_Giá có trạng thái ánh xạ tới Khung_Nhìn đó theo `statusGroup`.
2. IF một bản ghi khớp với Khung_Nhìn đang chọn nhưng nằm ngoài trang dữ liệu hiện đang tải, THEN THE App_BaoGia SHALL bảo đảm bản ghi đó vẫn xuất hiện trong Khung_Nhìn (không bị ẩn do phân trang).
3. WHEN một Khung_Nhìn được chọn và cần dữ liệu trạng thái tương ứng, THE App_BaoGia SHALL yêu cầu tập trạng thái tương ứng từ Nguồn_Báo_Giá qua `GET /erp/orders` với tham số `status` nhóm theo Khung_Nhìn.
4. THE App_BaoGia SHALL giữ nguyên ánh xạ trạng thái–Khung_Nhìn hiện có (`QUOTE_STATUSES`, `ORDER_STATUSES`, và `statusGroup`) khi xác định bản ghi thuộc Khung_Nhìn nào.
5. WHILE Khung_Nhìn `all` đang được chọn, THE App_BaoGia SHALL hiển thị mọi bản ghi khớp bộ lọc tìm kiếm/ngày/trạng thái hiện hành mà không loại bỏ bản ghi nào dựa trên nhóm trạng thái.

### Requirement 2: Điều khiển phân trang / tải thêm (P1)

**User Story:** Là nhân viên báo giá, tôi muốn truy cập các bản ghi vượt ngoài trang đầu, để xem được toàn bộ lịch sử báo giá và đơn hàng.

#### Acceptance Criteria

1. WHERE tổng số bản ghi của Nguồn_Báo_Giá lớn hơn số bản ghi hiển thị trên một trang, THE App_BaoGia SHALL hiển thị điều khiển phân trang hoặc nút tải thêm cho phép truy cập các bản ghi ngoài trang đầu.
2. THE App_BaoGia SHALL hiển thị phạm vi bản ghi hiện tại và tổng số bản ghi trên Trang_Danh_Sách_BG.
3. WHEN người dùng kích hoạt điều khiển phân trang hoặc tải thêm, THE App_BaoGia SHALL nạp và hiển thị tập bản ghi tương ứng từ Nguồn_Báo_Giá.
4. WHEN người dùng thay đổi bộ lọc tìm kiếm, ngày, trạng thái hoặc Khung_Nhìn, THE App_BaoGia SHALL đặt lại vị trí phân trang về trang đầu.

### Requirement 3: Tính nhất quán và bảo mật khi lưu Báo giá (P1)

**User Story:** Là quản trị viên, tôi muốn báo giá mới được lưu qua đúng nguồn được bảo vệ RBAC giống danh sách, để báo giá vừa tạo hiển thị trong danh sách và chỉ người có quyền mới tạo được.

#### Acceptance Criteria

1. THE App_BaoGia SHALL ghi báo giá mới vào Nguồn_Báo_Giá chuẩn để báo giá vừa tạo xuất hiện trong Trang_Danh_Sách_BG.
2. WHEN một người dùng có quyền `quote.create` gửi yêu cầu tạo báo giá, THE App_BaoGia SHALL lưu báo giá thành công vào Nguồn_Báo_Giá.
3. IF một người dùng không có quyền `quote.create` cố gắng tạo báo giá, THEN THE App_BaoGia SHALL từ chối yêu cầu ở backend với mã trạng thái 403.
4. WHERE người dùng không có quyền `quote.create`, THE App_BaoGia SHALL ẩn lối tạo báo giá trên giao diện.
5. WHERE việc điều hòa endpoint tạo báo giá về Nguồn_Báo_Giá yêu cầu thay đổi backend, THE App_BaoGia SHALL giới hạn thay đổi ở mức tối thiểu và an toàn schema (`synchronize=false`, không thêm hoặc sửa bảng/cột).

### Requirement 4: Phản hồi hành động trong ứng dụng thay cho hộp thoại trình duyệt (P2)

**User Story:** Là nhân viên báo giá, tôi muốn các hành động nghiệp vụ dùng hộp thoại và thông báo trong ứng dụng thay cho hộp thoại trình duyệt gốc, để thao tác mượt, rõ ràng và không bị chặn.

#### Acceptance Criteria

1. WHEN người dùng thực hiện hành động cần nhập lý do (ví dụ từ chối, hủy), THE App_BaoGia SHALL hiển thị Hộp_Thoại_Xác_Nhận trong ứng dụng để thu thập dữ liệu thay cho `prompt` của trình duyệt.
2. WHEN một hành động vòng đời hoàn tất thành công, THE App_BaoGia SHALL hiển thị Thông_Báo thành công không chặn thao tác thay cho `alert` của trình duyệt.
3. IF một hành động vòng đời thất bại, THEN THE App_BaoGia SHALL hiển thị Thông_Báo lỗi mô tả nguyên nhân cho người dùng.
4. WHILE một hành động vòng đời đang xử lý, THE App_BaoGia SHALL hiển thị trạng thái chờ (pending) trên nút tương ứng và ngăn kích hoạt trùng lặp nút đó.
5. THE App_BaoGia SHALL bề mặt hóa (surface) kết quả thành công hoặc thất bại của mọi hành động vòng đời cho người dùng, không nuốt lỗi một cách im lặng.

### Requirement 5: Kiểm tra trường bắt buộc khi tạo Báo giá (P2)

**User Story:** Là nhân viên báo giá, tôi muốn được cảnh báo khi thiếu thông tin bắt buộc trước khi lưu, để tránh tạo báo giá thiếu dữ liệu khách hàng.

#### Acceptance Criteria

1. IF người dùng cố lưu báo giá khi tên khách hàng đang trống, THEN THE App_BaoGia SHALL chặn việc lưu.
2. WHEN một trường bắt buộc trống tại thời điểm lưu, THE App_BaoGia SHALL hiển thị thông báo kiểm tra ngay tại trường đó (inline validation).
3. WHILE bất kỳ trường bắt buộc nào đang trống, THE App_BaoGia SHALL phản ánh trạng thái không hợp lệ trên nút Lưu (vô hiệu hóa hoặc đánh dấu không hợp lệ).
4. WHEN mọi trường bắt buộc đã hợp lệ, THE App_BaoGia SHALL cho phép kích hoạt nút Lưu.

### Requirement 6: Hợp nhất UI thông tin khách hàng và thống nhất chủ đề màu (P3)

**User Story:** Là nhà phát triển và người dùng, tôi muốn chỉ một component thông tin khách hàng dùng chung với một chủ đề màu nhất quán, để tránh trùng lặp mã và lệch giao diện.

#### Acceptance Criteria

1. THE App_BaoGia SHALL sử dụng một Thành_Phần_Thông_Tin_Khách dùng chung duy nhất cho cả khối nhập thông tin khách hàng trong Trang_Tạo_BG và `CustomerInfoSidebar`.
2. THE Thành_Phần_Thông_Tin_Khách SHALL áp dụng một chủ đề màu nhất quán (giải quyết lệch giữa tông indigo và purple) trên mọi vị trí sử dụng.
3. THE Thành_Phần_Thông_Tin_Khách SHALL giữ nguyên các trường nhập liệu khách hàng hiện có (phân loại, mã KH, tên, điện thoại, đơn vị, mã số thuế, địa chỉ, email, người đại diện, ghi chú, VAT, phí giao hàng).

### Requirement 7: Định dạng tiền tệ nhất quán (P3)

**User Story:** Là người dùng, tôi muốn số tiền hiển thị nhất quán ở cả danh sách và luồng tạo, để đọc và đối chiếu giá dễ dàng.

#### Acceptance Criteria

1. THE App_BaoGia SHALL dùng một Bộ_Định_Dạng_Tiền_Tệ dùng chung duy nhất cho mọi hiển thị tiền tệ trên Trang_Danh_Sách_BG và Trang_Tạo_BG.
2. THE App_BaoGia SHALL áp dụng một quy ước ký hiệu tiền tệ thống nhất cho mọi giá trị tiền tệ hiển thị.

### Requirement 8: Debounce ô tìm kiếm danh sách (P3)

**User Story:** Là nhân viên báo giá, tôi muốn ô tìm kiếm không gọi API theo từng phím gõ, để giảm tải và tránh giật khi nhập.

#### Acceptance Criteria

1. WHEN người dùng gõ liên tục vào ô tìm kiếm của Trang_Danh_Sách_BG, THE App_BaoGia SHALL trì hoãn (debounce) việc gọi Nguồn_Báo_Giá cho đến khi người dùng ngừng gõ trong khoảng thời gian trễ xác định.
2. WHEN người dùng ngừng gõ quá khoảng thời gian trễ xác định, THE App_BaoGia SHALL gửi đúng một yêu cầu tìm kiếm với từ khóa hiện hành.

### Requirement 9: Khả năng tiếp cận (Accessibility) (P3)

**User Story:** Là người dùng dùng bàn phím hoặc công nghệ hỗ trợ, tôi muốn các nút và trạng thái có nhãn rõ ràng, để thao tác mà không phụ thuộc vào biểu tượng hay màu sắc đơn thuần.

#### Acceptance Criteria

1. THE App_BaoGia SHALL cung cấp nhãn văn bản hoặc `aria-label` cho mọi nút hành động (không dùng riêng emoji làm nhãn).
2. THE App_BaoGia SHALL truyền đạt trạng thái bản ghi bằng văn bản kèm theo màu, không chỉ dựa vào màu sắc.
3. THE App_BaoGia SHALL cung cấp tên truy cập được (accessible name) hoặc tooltip cho các nút chỉ có biểu tượng.
4. WHEN người dùng điều hướng bằng phím Tab trên Trang_Danh_Sách_BG và Trang_Tạo_BG, THE App_BaoGia SHALL duy trì thứ tự tiêu điểm (focus order) hợp lý theo trình tự đọc.

### Requirement 10: Tính đáp ứng trên màn hình nhỏ (P3)

**User Story:** Là người dùng trên màn hình nhỏ hoặc hẹp, tôi muốn bố cục danh sách/chi tiết và bố cục tạo báo giá thích nghi gọn gàng, để dùng được trên thiết bị nhỏ mà không vỡ giao diện.

#### Acceptance Criteria

1. WHILE màn hình ở kích thước nhỏ hoặc hẹp, THE Trang_Danh_Sách_BG SHALL thích nghi bố cục hai khung danh sách/chi tiết (xếp chồng hoặc điều chỉnh) thay vì hiển thị song song cố định.
2. WHILE màn hình ở kích thước nhỏ hoặc hẹp, THE Trang_Tạo_BG SHALL thích nghi bố cục toàn màn hình mà không tràn hay vỡ nội dung.
3. WHILE bố cục đáp ứng đang áp dụng, THE App_BaoGia SHALL giữ nguyên hoạt động của sidebar trong PricingLayout.

### Requirement 11: Không suy giảm bảo mật và cấu trúc route (Non-functional)

**User Story:** Là quản trị viên, tôi muốn các cải tiến UI/UX không làm suy giảm bảo mật RBAC và cấu trúc route hiện có, để bảo toàn các spec đã ban hành.

#### Acceptance Criteria

1. THE App_BaoGia SHALL giữ nguyên việc ẩn/hiện các nút hành động cam kết theo quyền RBAC (`quote.approve`, `order.approve`) qua `usePermissions` / `hasPermission`.
2. THE App_BaoGia SHALL giữ nguyên hiệu lực của `FrozenRouteGuard` và cấu trúc hai route `/pricing/quotes` và `/pricing/orders`.
3. THE App_BaoGia SHALL giới hạn các thay đổi ở phạm vi frontend, ngoại trừ thay đổi backend tối thiểu và an toàn schema cần thiết để điều hòa endpoint tạo báo giá về Nguồn_Báo_Giá (theo Requirement 3).
4. THE App_BaoGia SHALL giữ nguyên logic tính giá (pricing calculation) và schema cơ sở dữ liệu hiện có, tái sử dụng các hàm thuần (pure functions) sẵn có khi khả thi.
