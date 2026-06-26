# Requirements Document

## Introduction

Tài liệu này định nghĩa yêu cầu cho việc **hợp nhất phương pháp in (print method unification)** của hệ ZeplaoPrint — nền tảng báo giá/CSKH cho ngành in ấn (backend NestJS + frontend Next.js).

**Vấn đề gốc:** Hệ hiện coi "phương pháp in" (in nhanh/digital vs offset) như thể là "loại sản phẩm". Hệ quả là đẻ ra **hai engine báo giá tách rời** (hai "silo"):

- **In nhanh (digital):** route `POST /pricing/calculate`, type ∈ {loose, bound, large_format}; dùng catalog sản phẩm linh hoạt `unified_products`; ràng buộc cấu hình theo từng sản phẩm nằm trong trình sửa sản phẩm.
- **Offset:** route `POST /pricing/offset/calculate`, có 5 **loại cứng** nhúng trong code {to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay}; cấu hình ở trang "Cấu Hình Loại Offset"; có engine khuôn bế (dieline) + xếp bài + VAT/chiết khấu riêng.

Hai silo này dẫn tới hai catalog, hai cấu hình, hai luồng báo giá song song → UI/UX khó hiểu, khó bảo trì, dễ lệch giá giữa hai nhánh.

**Mục tiêu:** Hợp nhất In nhanh ↔ Offset thành **một công cụ báo giá chuẩn**, trên bốn trụ cột: (1) cờ "Năng lực sản xuất" bật/tắt từng phương pháp ở cấp đơn vị; (2) tách rạch ròi bốn tầng Sản phẩm / Thông số / Phương pháp in / Giá, dùng chung tài nguyên không nhân đôi; (3) một luồng báo giá hợp nhất; (4) so sánh giá đa phương pháp với điểm hoà vốn (north star nghiệp vụ).

**Nguyên tắc xuyên suốt:** KHÔNG đập đi xây lại — hai engine hiện đang chạy (offset có golden test, digital có facade) phải được **bọc và di trú dần**, không phá vỡ giá đang đúng. "Mọi thứ cấu hình được" — không gán cứng VAT/chiết khấu/markup/định mức. Lộ trình chia **theo phase** để mỗi phase độc lập giao được, rủi ro tăng dần.

Tài liệu này đặc tả **hành vi nghiệp vụ mong muốn** ("what"); chi tiết kỹ thuật (mô hình dữ liệu, API, thuật toán điểm hoà vốn) để dành cho giai đoạn Design.

## Glossary

- **Hệ_Thống (System):** Toàn bộ hệ ZeplaoPrint, gồm frontend Next.js và backend NestJS dùng chung.
- **Công_Cụ_Báo_Giá (Quoting Tool):** Công cụ báo giá hợp nhất — đích đến của spec này, thay cho hai luồng báo giá song song hiện tại.
- **Phương_Pháp_In (Print Method):** Cách thức sản xuất quyết định công thức tính giá. Tập ban đầu gồm In_Nhanh và Offset; có thể mở rộng (ví dụ Khổ_Lớn) trong tương lai. KHÔNG phải là một loại sản phẩm.
- **In_Nhanh (Digital):** Phương pháp in kỹ thuật số hiện tại, phục vụ qua engine `POST /pricing/calculate` (type loose/bound/large_format).
- **Offset:** Phương pháp in offset hiện tại, phục vụ qua engine `POST /pricing/offset/calculate` (5 loại to_roi/bi_thu_folder/sp_khac/hop_giay/tui_giay).
- **Khổ_Lớn (Large Format):** Phương pháp in khổ lớn, là ứng viên mở rộng tương lai của tập Phương_Pháp_In.
- **Đơn_Vị (Unit):** Một nhà in/công ty sử dụng hệ. Mỗi Đơn_Vị có cấu hình năng lực sản xuất riêng. Một cài đặt có thể phục vụ một hoặc nhiều Đơn_Vị.
- **Cờ_Năng_Lực (Capability Flag):** Thiết lập cấp Đơn_Vị bật hoặc tắt một Phương_Pháp_In cụ thể. Mỗi cặp (Đơn_Vị, Phương_Pháp_In) có đúng một trạng thái bật/tắt.
- **Phương_Pháp_Khả_Dụng (Enabled Method):** Một Phương_Pháp_In có Cờ_Năng_Lực đang bật cho Đơn_Vị hiện hành.
- **Sản_Phẩm (Product):** Vật được bán (danh thiếp, tờ rơi, hộp giấy, túi giấy...), định nghĩa **độc lập với phương pháp in** (method-agnostic).
- **Thông_Số (Specification):** Tham số dùng chung của một báo giá không phụ thuộc phương pháp: kích thước, số lượng, giấy/vật tư, gia công.
- **Plugin_Phương_Pháp (Method Plugin):** Thành phần tính giá cho đúng một Phương_Pháp_In, nhận Sản_Phẩm + Thông_Số và trả Giá. Bọc engine hiện có (digital facade, offset engine) thay vì viết lại.
- **Tài_Nguyên_Dùng_Chung (Shared Resource):** Dữ liệu nền dùng cho mọi Phương_Pháp_In: vật tư, khổ giấy, gia công, hệ màu. KHÔNG được nhân đôi theo từng engine.
- **Configurator:** Màn hình nhập Thông_Số tương ứng với một Phương_Pháp_In để tạo báo giá.
- **Cổng_Tạo_Báo_Giá (Quote Entry Point):** Điểm vào duy nhất để bắt đầu một báo giá hợp nhất.
- **Bộ_So_Sánh_Giá (Price Comparator):** Thành phần tính giá theo nhiều Phương_Pháp_In cho cùng Sản_Phẩm + Thông_Số + số lượng và đề xuất phương án rẻ hơn.
- **Điểm_Hoà_Vốn (Break-even Point):** Mức số lượng mà tại đó chi phí của hai Phương_Pháp_In bằng nhau; dưới mức này một phương pháp rẻ hơn, trên mức này phương pháp kia rẻ hơn.
- **Đăng_Ký_Phạm_Vi (Scope Registry):** Artefact dữ liệu hiện có (`frontend/src/lib/scope/`) phân loại tính năng và là nguồn sự thật để suy dẫn menu.
- **Trình_Phân_Giải_IA (IA Resolver):** Hàm thuần hiện có suy dẫn menu hiển thị từ Đăng_Ký_Phạm_Vi và phạm vi áp dụng.
- **Golden_Test:** Bộ test khoá hành vi/giá hiện đang đúng, dùng để phát hiện lệch giá khi thay đổi.
- **Admin:** Vai trò chủ nhà in hoặc quản trị viên cấu hình năng lực sản xuất, Tài_Nguyên_Dùng_Chung và tham số giá cho Đơn_Vị.
- **NV_Báo_Giá:** Nhân viên tạo báo giá cho khách.
- **Khách:** Khách hàng nhận báo giá; trong một số luồng có thể là người xem kết quả báo giá.
- **VAT:** Thuế giá trị gia tăng, một giá trị chung cấp báo giá (thuộc mục khách hàng), áp đồng nhất trên giá sau chiết khấu.
- **Chiết_Khấu (Discount):** Khoản giảm trừ trên giá bán trước thuế, cấu hình được.

## Requirements

### Requirement 1: Cờ Năng lực sản xuất cấp Đơn vị

**User Story:** Là Admin, tôi muốn bật/tắt từng phương pháp in cho Đơn vị của mình, để Đơn vị chỉ làm in nhanh hoặc chỉ làm offset không phải thấy phần không liên quan.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL lưu trữ một Cờ_Năng_Lực bật/tắt cho mỗi cặp (Đơn_Vị, Phương_Pháp_In), với đúng một trạng thái cho mỗi cặp.
2. WHEN Admin bật Cờ_Năng_Lực của một Phương_Pháp_In cho một Đơn_Vị, THE Hệ_Thống SHALL ghi nhận Phương_Pháp_In đó là Phương_Pháp_Khả_Dụng cho Đơn_Vị đó.
3. WHEN Admin tắt Cờ_Năng_Lực của một Phương_Pháp_In cho một Đơn_Vị, THE Hệ_Thống SHALL loại Phương_Pháp_In đó khỏi tập Phương_Pháp_Khả_Dụng của Đơn_Vị đó.
4. THE Hệ_Thống SHALL hỗ trợ ba cấu hình Đơn_Vị: chỉ bật In_Nhanh, chỉ bật Offset, và bật cả hai.
5. WHERE tập Phương_Pháp_In có thể mở rộng, THE Hệ_Thống SHALL cho phép thêm Phương_Pháp_In mới (ví dụ Khổ_Lớn) vào cơ chế Cờ_Năng_Lực mà không thay đổi định nghĩa Sản_Phẩm.
6. IF Admin cố tắt Cờ_Năng_Lực của Phương_Pháp_In cuối cùng đang bật của một Đơn_Vị đã có ít nhất một Phương_Pháp_Khả_Dụng, THEN THE Hệ_Thống SHALL từ chối thao tác và thông báo rằng không thể tắt Phương_Pháp_Khả_Dụng cuối cùng của Đơn_Vị đang vận hành.
7. WHERE một Đơn_Vị vừa được tạo, THE Hệ_Thống SHALL cho phép Đơn_Vị tồn tại với không Phương_Pháp_In nào được bật, để Admin bật các Phương_Pháp_In sau đó.
8. WHEN Admin thay đổi một Cờ_Năng_Lực, THE Hệ_Thống SHALL áp dụng trạng thái mới cho các lần truy cập menu, Cổng_Tạo_Báo_Giá, cấu hình Sản_Phẩm và so sánh giá kế tiếp của Đơn_Vị đó.

### Requirement 2: Menu và điều hướng phản ứng theo Cờ Năng lực

**User Story:** Là Admin của một Đơn vị chỉ làm in nhanh, tôi muốn mọi phần liên quan tới offset được ẩn khỏi giao diện, để nhân viên không bị rối và không vào nhầm luồng không dùng tới.

#### Acceptance Criteria

1. THE Trình_Phân_Giải_IA SHALL suy dẫn các mục menu liên quan tới một Phương_Pháp_In dựa trên Cờ_Năng_Lực của Đơn_Vị hiện hành.
2. WHILE một Phương_Pháp_In không thuộc tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành, THE Hệ_Thống SHALL ẩn các mục menu, Cổng_Tạo_Báo_Giá và màn cấu hình dành riêng cho Phương_Pháp_In đó khỏi giao diện của Đơn_Vị đó.
3. THE Hệ_Thống SHALL tái sử dụng Đăng_Ký_Phạm_Vi và Trình_Phân_Giải_IA hiện có để suy dẫn menu theo năng lực, thay vì xây mới một cơ chế ẩn menu riêng.
4. IF NV_Báo_Giá điều hướng trực tiếp tới route của một Phương_Pháp_In không khả dụng cho Đơn_Vị hiện hành, THEN THE Hệ_Thống SHALL chặn truy cập và chuyển hướng về Cổng_Tạo_Báo_Giá hợp nhất.
5. IF một mục menu của Phương_Pháp_In không khả dụng vẫn hiển thị do lỗi hệ thống hoặc tình huống tranh chấp, THEN THE Hệ_Thống SHALL cho phép mục đó hiển thị và áp dụng cơ chế chặn truy cập tại Requirement 2.4 khi người dùng cố sử dụng Phương_Pháp_In đó.
6. WHEN tập Phương_Pháp_Khả_Dụng của Đơn_Vị thay đổi, THE Hệ_Thống SHALL cập nhật menu suy dẫn để chỉ hiển thị các mục thuộc Phương_Pháp_Khả_Dụng, và SHALL giữ nguyên các luồng báo giá đang mở mà không tự động thay đổi chúng.

### Requirement 3: Tách bốn tầng Sản phẩm / Thông số / Phương pháp in / Giá

**User Story:** Là Admin, tôi muốn định nghĩa sản phẩm một lần độc lập với phương pháp in, để không phải duy trì hai catalog song song và tránh lệch dữ liệu.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL định nghĩa Sản_Phẩm độc lập với Phương_Pháp_In, sao cho một Sản_Phẩm không gắn cứng vào một engine tính giá duy nhất.
2. THE Hệ_Thống SHALL mô hình hoá Thông_Số (kích thước, số lượng, giấy/vật tư, gia công) như tầng dùng chung được tham chiếu bởi mọi Phương_Pháp_In.
3. THE Hệ_Thống SHALL mô hình hoá mỗi Phương_Pháp_In như một Plugin_Phương_Pháp nhận Sản_Phẩm và Thông_Số rồi trả về Giá.
4. THE Hệ_Thống SHALL giữ Tài_Nguyên_Dùng_Chung (vật tư, khổ giấy, gia công, hệ màu) ở một nguồn duy nhất cho mỗi khái niệm, không nhân đôi theo từng Phương_Pháp_In.
5. WHEN Admin cập nhật một Tài_Nguyên_Dùng_Chung, THE Hệ_Thống SHALL phản ánh thay đổi đó cho mọi Plugin_Phương_Pháp tham chiếu tài nguyên đó.
6. WHERE một Plugin_Phương_Pháp được thêm hoặc thay đổi, THE Hệ_Thống SHALL không yêu cầu sửa định nghĩa Sản_Phẩm hay tầng Thông_Số dùng chung.

### Requirement 4: Luồng báo giá hợp nhất

**User Story:** Là NV_Báo_Giá, tôi muốn một cổng tạo báo giá duy nhất nơi tôi chọn sản phẩm rồi chọn phương pháp in, để không phải nhớ vào trang nào cho digital và trang nào cho offset.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cung cấp một Cổng_Tạo_Báo_Giá duy nhất làm điểm vào cho mọi báo giá.
2. WHEN NV_Báo_Giá bắt đầu một báo giá tại Cổng_Tạo_Báo_Giá, THE Hệ_Thống SHALL cho chọn Sản_Phẩm trước khi chọn Phương_Pháp_In.
3. WHILE Đơn_Vị hiện hành có nhiều hơn một Phương_Pháp_Khả_Dụng, THE Hệ_Thống SHALL cho NV_Báo_Giá chọn một Phương_Pháp_In trong tập Phương_Pháp_Khả_Dụng hoặc chọn chế độ so sánh đa phương pháp, và SHALL cho phép báo giá ở trạng thái chưa chọn mà không bắt buộc chọn ngay.
4. IF Đơn_Vị hiện hành chỉ có đúng một Phương_Pháp_Khả_Dụng, THEN THE Hệ_Thống SHALL bỏ qua bước hỏi Phương_Pháp_In và đưa NV_Báo_Giá thẳng vào Configurator của Phương_Pháp_In đó.
5. WHILE Đơn_Vị hiện hành có từ hai Phương_Pháp_Khả_Dụng trở lên, THE Hệ_Thống SHALL yêu cầu NV_Báo_Giá chọn rõ một Phương_Pháp_In hoặc chế độ so sánh trước khi vào Configurator, không tự bỏ qua bước chọn.
6. WHEN NV_Báo_Giá đã chọn Sản_Phẩm và Phương_Pháp_In, THE Hệ_Thống SHALL hiển thị đúng Configurator tương ứng với Phương_Pháp_In đã chọn.
7. THE Hệ_Thống SHALL chỉ cho chọn các Phương_Pháp_In thuộc tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành tại Cổng_Tạo_Báo_Giá.

### Requirement 5: So sánh giá đa phương pháp và điểm hoà vốn

**User Story:** Là NV_Báo_Giá, tôi muốn xem giá của cả in nhanh lẫn offset cho cùng một đơn và biết phương án nào rẻ hơn theo số lượng, để tư vấn khách chọn đúng và không bỏ lỡ cơ hội tối ưu giá.

#### Acceptance Criteria

1. WHEN NV_Báo_Giá chọn chế độ so sánh cho một Sản_Phẩm với cùng một bộ Thông_Số và số lượng, THE Bộ_So_Sánh_Giá SHALL tính Giá theo từng Phương_Pháp_Khả_Dụng áp dụng được cho Sản_Phẩm đó.
2. WHEN Bộ_So_Sánh_Giá hoàn tất tính giá cho từ hai Phương_Pháp_In trở lên, THE Hệ_Thống SHALL chỉ ra Phương_Pháp_In có Giá thấp hơn cho số lượng đang xét.
3. WHERE hai Phương_Pháp_In có thể so sánh trên một dải số lượng, THE Bộ_So_Sánh_Giá SHALL xác định Điểm_Hoà_Vốn về số lượng giữa hai Phương_Pháp_In khi tồn tại trong dải đó.
4. THE Bộ_So_Sánh_Giá SHALL dùng cùng một bộ Thông_Số đầu vào cho mọi Phương_Pháp_In khi so sánh, không thay đổi Thông_Số giữa các phương pháp.
5. IF một Phương_Pháp_In không tính được Giá cho bộ Thông_Số đã cho, THEN THE Hệ_Thống SHALL loại Phương_Pháp_In đó khỏi kết quả so sánh và nêu lý do không khả dụng, đồng thời vẫn hiển thị kết quả của các Phương_Pháp_In còn lại.
6. IF chỉ có đúng một Phương_Pháp_Khả_Dụng áp dụng được cho Sản_Phẩm, THEN THE Hệ_Thống SHALL hiển thị Giá của phương pháp đó mà không trình bày bảng so sánh.

### Requirement 6: Bảo toàn giá đang đúng và di trú dần

**User Story:** Là Admin, tôi muốn quá trình hợp nhất không làm thay đổi giá đang được tính đúng hôm nay, để không làm sai báo giá đang phục vụ khách.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL bọc engine In_Nhanh và engine Offset hiện có làm Plugin_Phương_Pháp, thay vì viết lại engine từ đầu.
2. WHEN một báo giá được tính qua Plugin_Phương_Pháp cho cùng Sản_Phẩm, Thông_Số và số lượng, THE Hệ_Thống SHALL trả về Giá khớp với engine tương ứng trước khi hợp nhất, trong dung sai bằng không cho các trường hợp đã được Golden_Test khoá.
3. WHERE một thay đổi chạm tới công thức tính giá, THE Hệ_Thống SHALL có Golden_Test bao phủ thay đổi đó trước khi áp dụng.
4. IF một thay đổi làm một Golden_Test thất bại ngoài dự kiến, THEN THE Hệ_Thống SHALL coi thay đổi đó là chưa đạt và không đưa vào nhánh phát hành cho tới khi được giải trình.

### Requirement 7: Mọi thứ cấu hình được

**User Story:** Là Admin, tôi muốn chỉnh được mọi tham số giá từ giao diện cấu hình, để thích ứng với máy móc và chính sách giá của Đơn vị mà không cần sửa code.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cho phép Admin cấu hình các tham số giá gồm VAT, Chiết_Khấu, markup và định mức, không gán cứng các giá trị này trong mã nguồn.
2. WHEN một Plugin_Phương_Pháp tính Giá, THE Plugin_Phương_Pháp SHALL đọc tham số VAT, Chiết_Khấu, markup và định mức từ cấu hình thay vì từ hằng số trong mã nguồn.
3. WHEN Admin cập nhật một tham số giá, THE Hệ_Thống SHALL dùng giá trị mới cho các lần tính Giá kế tiếp.
4. WHERE một tham số giá chưa được Admin đặt giá trị, THE Hệ_Thống SHALL đọc giá trị mặc định từ chính nguồn cấu hình (mặc định được nạp sẵn trong cấu hình) và đánh dấu rằng giá trị đang dùng là mặc định.

### Requirement 8: VAT chung cấp báo giá

**User Story:** Là NV_Báo_Giá, tôi muốn VAT được khai báo một lần ở mục khách hàng và áp đồng nhất cho cả báo giá, để mọi dòng sản phẩm trong báo giá nhất quán về thuế.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL lưu VAT như một giá trị chung cấp báo giá thuộc mục khách hàng, không khai báo riêng theo từng Phương_Pháp_In.
2. WHEN Hệ_Thống tính số tiền VAT của một báo giá, THE Hệ_Thống SHALL tính VAT trên giá sau Chiết_Khấu.
3. THE Hệ_Thống SHALL áp dụng cùng một giá trị VAT cho mọi dòng và mọi Phương_Pháp_In trong cùng một báo giá.
4. THE Hệ_Thống SHALL áp dụng VAT đúng một lần cho mỗi báo giá, không cộng VAT chồng VAT.

### Requirement 9: Lộ trình hợp nhất theo phase

**User Story:** Là Admin/chủ dự án, tôi muốn việc hợp nhất chia theo các phase giao được độc lập, để giảm rủi ro và có thể dừng/đánh giá sau mỗi phase.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL tổ chức việc hợp nhất theo bốn phase: Phase 1 — Cờ_Năng_Lực và kiến trúc thông tin (IA); Phase 2 — hợp nhất Cổng_Tạo_Báo_Giá; Phase 3 — hợp nhất mô hình Sản_Phẩm (đưa 5 loại offset vào catalog method-agnostic); Phase 4 — so sánh giá đa phương pháp.
2. THE Hệ_Thống SHALL gán mức rủi ro cố định cho từng phase theo thứ tự tăng dần: Phase 1 = THẤP, Phase 2 = TRUNG-THẤP, Phase 3 = TRUNG-CAO, Phase 4 = CAO.
3. WHEN một phase hoàn tất, THE Hệ_Thống SHALL ở trạng thái giao được mà không phụ thuộc vào việc hoàn tất các phase sau.
4. WHILE một phase chưa hoàn tất, THE Hệ_Thống SHALL giữ các luồng báo giá hiện có hoạt động cho người dùng.
5. WHERE Phase 3 đưa 5 loại offset vào catalog Sản_Phẩm method-agnostic, THE Hệ_Thống SHALL giữ Giá của các loại offset đó khớp với hành vi trước khi đưa vào catalog, theo Requirement 6.
6. IF Phase 3 không đưa đủ 5 loại offset vào catalog Sản_Phẩm method-agnostic, THEN THE Hệ_Thống SHALL coi việc tổ chức phase là chưa hoàn tất cho tới khi Phase 3 thoả nội dung quy định.
