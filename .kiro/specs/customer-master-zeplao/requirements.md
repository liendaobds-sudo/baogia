# Requirements Document

> ⚠️ **ĐÃ ĐỔI HƯỚNG (2026-06-21).** Hướng ban đầu của tài liệu này — lấy bảng chat
> `contacts` làm master và để `customers` tham chiếu qua `customers.contact_id` + "Kênh_Thủ_Công"
> giả — đã bị **HUỶ** vì sai khái niệm: `contacts` là **danh bạ chat** (đoạn chat/nhóm chat),
> không phải hồ sơ khách hàng. Việc nhét khách vào bảng chat làm bẩn Inbox.
>
> **Mô hình đúng đã triển khai:** bảng **`customers` là nguồn khách hàng duy nhất** (độc lập, đã có
> sẵn đầy đủ trường: tên/SĐT/MST/công nợ/nhóm giá/RFM/lifecycle). Zeplao **bổ sung màn hình
> "Khách hàng"** (`/(app)/customers`) đọc cùng API `GET /erp/customers` mà App Báo giá dùng — hai app
> dùng chung một nguồn. Mục **"Danh bạ liên hệ" được ẩn khỏi menu** (trùng Inbox, giống Zalo;
> route/bảng `contacts` giữ nguyên cho Inbox). KHÔNG còn `customers.contact_id`, kênh `manual`,
> bảng `customer_link_conflicts`, hay `CustomerDirectoryService` — toàn bộ đã được gỡ.
>
> Các yêu cầu bên dưới giữ lại để tham khảo lịch sử; phần nào nói về "contacts làm master / Khoá_Liên_Kết
> contact_id / Kênh_Thủ_Công" **không còn hiệu lực**.

## Introduction

Tài liệu này định nghĩa yêu cầu để **Zeplao (App CSKH) trở thành nguồn sự thật duy nhất (master) cho dữ liệu định danh và hồ sơ khách hàng**, còn **App Báo giá lấy/tham chiếu thông tin khách hàng từ Zeplao** thay vì duy trì một bản ghi khách hàng tách rời, có thể phân kỳ.

Hiện trạng đã được kiểm chứng từ codebase (NestJS + Next.js, dùng chung backend, PostgreSQL):

- Tồn tại **hai mô hình khách hàng tách rời, KHÔNG liên kết**:
  - `Contact` (bảng `contacts`, PK UUID) — phía Zeplao/CSKH. Khoá theo (channel, externalUserId). Giữ định danh Zalo, hồ sơ AI (memoryFacts, customerProfile), pipeline CRM, hội thoại, lịch hẹn, phone, email, tags, source, assignedUserId.
  - `Customer` (bảng `customers`, PK integer, 34 cột) — phía Báo giá/ERP. Giữ mã KH (`code` KHxxxx), `taxCode`, `bankAccount`, `billingAddress`, `creditLimit`, `currentDebt`, `lifecycleStage`, điểm RFM (`rfm_*`), `priceGroupId`. Liên kết với `quotes.customer_id`.
- **Không có khoá liên kết** giữa `contacts` và `customers` — cùng một người có thể tồn tại thành hai bản ghi rời nhau.
- Cầu nối cũ `CustomerSyncController` đã **chết**: gọi `pricingApi.get('/customers')` / `post('/customers')` nhưng các hàm này nay là stub trả `{}` ("HTTP is disabled") sau khi pricing được gộp in-process.
- CRUD khách hàng thật đang chạy qua `ErpCustomersController` (route `/erp/customers`) gọi `CustomersService`. Màn hình Báo giá tại `frontend/src/app/pricing/customers/`; màn hình Contacts CSKH tại `frontend/src/app/(app)/contacts/`.
- Báo giá/đơn hàng BẮT BUỘC gắn vào một thực thể khách hàng giao dịch mang `taxCode`, công nợ/hạn mức, RFM, nhóm giá — những trường mà `Contact` không có. Do đó liên kết báo giá ↔ khách và các trường tài chính này phải được bảo toàn.

Spec này bổ trợ cho spec `product-rescope-cskh-quote` (tách trục CSKH và Báo giá).

**Phạm vi:** đặc tả *what* — Zeplao là master, cách Báo giá đọc/tham chiếu, khoá liên kết chống trùng, bảo toàn trường tài chính và liên kết báo giá, di trú dữ liệu legacy, hành vi khi master không sẵn sàng, phân quyền tạo/đọc, và thay cầu đồng bộ đã chết bằng cơ chế hoạt động. Việc chọn cơ chế cụ thể (một bảng hợp nhất / hai bảng có khoá liên kết / master-replica có sync; in-process vs event) sẽ chốt ở giai đoạn Design.

### Quyết định đã chốt

- **Khi master không sẵn sàng:** Hệ_Thống CHẶN việc tra cứu/gắn khách mới và hiển thị lỗi rõ ràng (Yêu cầu 8).
- **(A — đã chốt) Quyền tạo:** Bản_Ghi_Định_Danh được tạo và sở hữu tại Zeplao master; khi Báo giá cần một khách chưa có trong master, Hệ_Thống tạo bản ghi master tại Zeplao rồi mới gắn — đảm bảo luôn chỉ có một master (Yêu cầu 6).
- **(B — đã chốt) Khách chỉ có ở Báo giá (legacy):** quá trình di trú backfill tạo Bản_Ghi_Định_Danh master tương ứng để mọi Bản_Ghi_Giao_Dịch đều liên kết về master; trong giai đoạn chuyển tiếp vẫn cho phép khách "chỉ Báo giá" hoạt động (Yêu cầu 7).
- **(C — đã chốt) Định danh khách phi-Zalo:** Bản_Ghi_Định_Danh master (`contacts`) ràng buộc NOT NULL `(channel_id, external_user_id)`. Với khách không đến từ Zalo (vãng lai/đặt trực tiếp), Hệ_Thống dùng một Kênh_Thủ_Công (channel "manual") và sinh `external_user_id` ổn định (theo số điện thoại đã chuẩn hoá), để mọi khách — kể cả phi-Zalo — đều có đúng một master mà không phải thêm bảng định danh thứ ba (Yêu cầu 11).
- **(D — đã chốt) Bảo toàn quan hệ báo giá:** Khoá_Liên_Kết là `customers.contact_id` (UUID) trỏ về `contacts`; `quotes.customer_id` (integer → `customers.id`) GIỮ NGUYÊN để không phá liên kết báo giá/đơn/công nợ hiện có. Danh tính đọc sống qua JOIN, không sao chép, nên không phát sinh phân kỳ.

## Glossary

- **Hệ_Thống (System)**: Toàn bộ hệ ZeplaoPrint gồm hai app frontend và backend NestJS dùng chung.
- **Zeplao**: App CSKH/Inbox (`frontend/src/app/(app)/`) — đóng vai trò **nguồn master** cho dữ liệu định danh và hồ sơ khách hàng.
- **App_BaoGia**: App Báo giá (`frontend/src/app/pricing/`) — bên **tiêu thụ** dữ liệu khách hàng từ Zeplao và lập báo giá/đơn hàng.
- **Backend_Dùng_Chung**: Backend NestJS dùng chung cho cả hai app.
- **Bản_Ghi_Định_Danh**: Bản ghi master chứa dữ liệu định danh + hồ sơ khách hàng do Zeplao sở hữu (hiện thân hiện tại là `Contact`/bảng `contacts`).
- **Bản_Ghi_Giao_Dịch**: Bản ghi khách hàng giao dịch dùng để gắn báo giá/đơn hàng, chứa các Trường_Tài_Chính (hiện thân hiện tại là `Customer`/bảng `customers`).
- **Khoá_Liên_Kết**: Trường liên kết duy nhất nối Bản_Ghi_Giao_Dịch với đúng một Bản_Ghi_Định_Danh master (ví dụ `customers.contact_id`).
- **Trường_Định_Danh**: Tập trường định danh/hồ sơ do master làm chủ: tên hiển thị, số điện thoại, email, hồ sơ khách hàng, tags, source.
- **Trường_Tài_Chính**: Tập trường giao dịch chỉ tồn tại phía Bản_Ghi_Giao_Dịch: `code`, `taxCode`, `bankAccount`, `billingAddress`, `creditLimit`, `currentDebt`, `lifecycleStage`, `rfmR`, `rfmF`, `rfmM`, `rfmScore`, `rfmSegment`, `priceGroupId`.
- **Cầu_Đồng_Bộ**: Cơ chế hoạt động thay thế `CustomerSyncController` đã chết, để Báo giá lấy/tham chiếu dữ liệu khách từ master.
- **Kênh_Thủ_Công**: Một channel "manual/trực tiếp" trong bảng `channels` dùng để gắn các Bản_Ghi_Định_Danh của khách phi-Zalo, thoả ràng buộc NOT NULL `(channel_id, external_user_id)` của `contacts`.
- **Liên_Kết_Báo_Giá**: Quan hệ giữa một báo giá/đơn hàng (`quotes`) và Bản_Ghi_Giao_Dịch qua `quotes.customer_id`.
- **NV_CSKH**: Nhân viên chăm sóc khách hàng, vận hành Zeplao.
- **Chủ_Shop**: Người dùng cuối là chủ shop in phổ thông.
- **Người_Quy_Hoạch (Maintainer)**: Người ra quyết định về mô hình dữ liệu và thực hiện di trú/đối soát (chủ dự án hoặc developer được uỷ quyền).

## Requirements

### Requirement 1: Zeplao là nguồn master cho dữ liệu định danh khách hàng

**User Story:** Là chủ dự án, tôi muốn Zeplao là nơi duy nhất quản lý định danh và hồ sơ khách hàng, để mọi nơi khác dùng chung một nguồn sự thật và không phân kỳ dữ liệu.

#### Acceptance Criteria

1. THE Zeplao SHALL là nơi sở hữu (master) toàn bộ Trường_Định_Danh của mỗi khách hàng.
2. WHEN một Trường_Định_Danh của một khách hàng được cập nhật, THE Zeplao SHALL ghi nhận thay đổi đó tại Bản_Ghi_Định_Danh master.
3. WHEN App_BaoGia hiển thị Trường_Định_Danh của một khách hàng, THE App_BaoGia SHALL lấy giá trị từ Bản_Ghi_Định_Danh master tương ứng.
4. THE Hệ_Thống SHALL duy trì đúng một Bản_Ghi_Định_Danh master cho mỗi khách hàng có thật.

### Requirement 2: Khoá liên kết chống trùng giữa định danh và giao dịch

**User Story:** Là Người_Quy_Hoạch dữ liệu, tôi muốn mỗi Bản_Ghi_Giao_Dịch liên kết tới đúng một Bản_Ghi_Định_Danh master, để cùng một người không bị nhân đôi thành hai bản ghi rời nhau.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cung cấp một Khoá_Liên_Kết nối mỗi Bản_Ghi_Giao_Dịch tới đúng một Bản_Ghi_Định_Danh master.
2. WHEN một Bản_Ghi_Giao_Dịch được tạo qua luồng chuẩn, THE Hệ_Thống SHALL gán Khoá_Liên_Kết trỏ tới Bản_Ghi_Định_Danh master tương ứng.
3. IF tồn tại hai hay nhiều Bản_Ghi_Giao_Dịch cùng trỏ tới một Bản_Ghi_Định_Danh master, THEN THE Hệ_Thống SHALL ghi nhận tình huống trùng lặp và báo cáo danh sách bản ghi vi phạm cho người vận hành.
4. WHILE một Bản_Ghi_Giao_Dịch đã có Khoá_Liên_Kết hợp lệ, THE Hệ_Thống SHALL trình bày Trường_Định_Danh của bản ghi đó từ Bản_Ghi_Định_Danh master được liên kết.

### Requirement 3: Báo giá tra cứu và tìm kiếm khách hàng từ master

**User Story:** Là NV_CSKH dùng App_BaoGia, tôi muốn tra cứu/tìm kiếm khách hàng theo dữ liệu từ Zeplao, để chọn đúng khách mà không nhập lại hay tạo bản trùng.

#### Acceptance Criteria

1. WHEN NV_CSKH tìm kiếm khách hàng trong App_BaoGia theo tên, số điện thoại hoặc email, THE App_BaoGia SHALL trả kết quả dựa trên dữ liệu định danh từ Bản_Ghi_Định_Danh master.
2. WHEN App_BaoGia hiển thị một kết quả tìm kiếm khách hàng, THE App_BaoGia SHALL hiển thị Trường_Định_Danh lấy từ master kèm chỉ báo trạng thái liên kết (đã liên kết Bản_Ghi_Giao_Dịch hay chưa).
3. WHEN NV_CSKH chọn một khách hàng từ kết quả tìm kiếm, THE App_BaoGia SHALL cung cấp khách hàng đó để gắn vào báo giá.
4. IF không có khách hàng nào khớp tiêu chí tìm kiếm, THEN THE App_BaoGia SHALL hiển thị thông báo không có kết quả và cung cấp lối tạo khách hàng mới theo Yêu cầu 6.

### Requirement 4: Gắn khách hàng vào báo giá và bảo toàn liên kết báo giá

**User Story:** Là NV_CSKH, tôi muốn gắn một khách hàng từ master vào báo giá và giữ nguyên liên kết đó, để báo giá/đơn hàng luôn truy được về đúng khách hàng giao dịch.

#### Acceptance Criteria

1. WHEN NV_CSKH gắn một khách hàng đã chọn vào một báo giá, THE Hệ_Thống SHALL thiết lập Liên_Kết_Báo_Giá tới Bản_Ghi_Giao_Dịch của khách hàng đó.
2. THE Hệ_Thống SHALL bảo toàn mọi Liên_Kết_Báo_Giá hiện có giữa `quotes` và Bản_Ghi_Giao_Dịch sau khi áp dụng tính năng master.
3. WHILE một báo giá đã có Liên_Kết_Báo_Giá, THE Hệ_Thống SHALL truy xuất được Trường_Định_Danh của khách hàng đó từ Bản_Ghi_Định_Danh master qua Khoá_Liên_Kết.
4. THE Hệ_Thống SHALL giữ Liên_Kết_Báo_Giá của một báo giá ổn định kể cả khi Trường_Định_Danh tại master được cập nhật sau đó.

### Requirement 5: Bảo toàn Trường_Tài_Chính và dữ liệu giao dịch

**User Story:** Là kế toán/chủ shop, tôi muốn mã số thuế, công nợ, hạn mức, RFM và nhóm giá được giữ nguyên, để nghiệp vụ tài chính và định giá theo khách không bị mất khi chuyển sang mô hình master.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL giữ toàn bộ Trường_Tài_Chính trên Bản_Ghi_Giao_Dịch.
2. WHEN một báo giá được lập cho một khách hàng có `priceGroupId`, THE App_BaoGia SHALL áp dụng nhóm giá đó từ Bản_Ghi_Giao_Dịch của khách hàng.
3. THE Hệ_Thống SHALL giữ giá trị `currentDebt`, `creditLimit` và các trường RFM (`rfmR`, `rfmF`, `rfmM`, `rfmScore`, `rfmSegment`) của mỗi Bản_Ghi_Giao_Dịch không đổi do việc áp dụng mô hình master.
4. THE Hệ_Thống SHALL cho phép cập nhật Trường_Tài_Chính qua App_BaoGia mà không ghi đè Trường_Định_Danh do master sở hữu.

### Requirement 6: Quyền tạo khách hàng và duy trì master duy nhất

**User Story:** Là chủ dự án, tôi muốn việc tạo khách hàng luôn tạo đúng một bản ghi master ở Zeplao, để không phát sinh khách hàng "mồ côi" chỉ tồn tại ở Báo giá.

> Giả định A (chờ xác nhận): định danh được tạo/sở hữu tại Zeplao; khi tạo từ Báo giá, Hệ_Thống tạo master ở Zeplao trước rồi gắn.

#### Acceptance Criteria

1. WHEN một khách hàng mới được tạo từ Zeplao, THE Zeplao SHALL tạo một Bản_Ghi_Định_Danh master cho khách hàng đó.
2. WHEN NV_CSKH tạo một khách hàng mới trong khi lập báo giá tại App_BaoGia, THE Hệ_Thống SHALL tạo một Bản_Ghi_Định_Danh master tại Zeplao và một Bản_Ghi_Giao_Dịch liên kết với master đó qua Khoá_Liên_Kết.
3. THE Hệ_Thống SHALL gán quyền tạo và sửa Trường_Định_Danh cho vai trò vận hành Zeplao.
4. THE Hệ_Thống SHALL cho phép vai trò vận hành App_BaoGia đọc Trường_Định_Danh và đọc/ghi Trường_Tài_Chính.
5. IF một thao tác cố tạo Bản_Ghi_Giao_Dịch mà không có Khoá_Liên_Kết tới một Bản_Ghi_Định_Danh master, THEN THE Hệ_Thống SHALL từ chối thao tác và trả về thông báo lỗi mô tả nguyên nhân.

### Requirement 7: Di trú và đối soát dữ liệu khách hàng legacy

**User Story:** Là Người_Quy_Hoạch dữ liệu, tôi muốn các bản ghi `customers` legacy được đối soát và liên kết về master, để chấm dứt tình trạng trùng/rời rạc hiện có.

> Giả định B (chờ xác nhận): backfill tạo Bản_Ghi_Định_Danh master cho khách "chỉ Báo giá"; giai đoạn chuyển tiếp vẫn cho khách "chỉ Báo giá" hoạt động.

#### Acceptance Criteria

1. WHEN quá trình di trú chạy, THE Hệ_Thống SHALL đối soát mỗi Bản_Ghi_Giao_Dịch legacy với Bản_Ghi_Định_Danh master theo tiêu chí khớp xác định (ưu tiên số điện thoại, sau đó email).
2. WHERE một Bản_Ghi_Giao_Dịch legacy khớp đúng một Bản_Ghi_Định_Danh master, THE Hệ_Thống SHALL gán Khoá_Liên_Kết tới master đó.
3. WHERE một Bản_Ghi_Giao_Dịch legacy không khớp Bản_Ghi_Định_Danh master nào, THE Hệ_Thống SHALL tạo một Bản_Ghi_Định_Danh master từ Trường_Định_Danh của bản ghi legacy và gán Khoá_Liên_Kết.
4. IF một Bản_Ghi_Giao_Dịch legacy khớp nhiều hơn một Bản_Ghi_Định_Danh master, THEN THE Hệ_Thống SHALL đánh dấu bản ghi đó là cần đối soát thủ công và đưa vào danh sách xung đột mà không tự gán Khoá_Liên_Kết.
5. THE Hệ_Thống SHALL bảo toàn toàn bộ Trường_Tài_Chính và Liên_Kết_Báo_Giá của mỗi Bản_Ghi_Giao_Dịch trong suốt quá trình di trú.
6. WHILE quá trình di trú chưa hoàn tất, THE App_BaoGia SHALL tiếp tục cho lập báo giá với các Bản_Ghi_Giao_Dịch chưa có Khoá_Liên_Kết.

### Requirement 8: Hành vi khi nguồn master không sẵn sàng

**User Story:** Là NV_CSKH, tôi muốn được báo lỗi rõ ràng khi không lấy được dữ liệu khách từ master, để không vô tình tạo khách trùng hay gắn sai.

> Đã chốt: chặn tra cứu/gắn khách mới và hiển thị lỗi rõ ràng.

#### Acceptance Criteria

1. IF nguồn master không sẵn sàng WHEN NV_CSKH tra cứu khách hàng trong App_BaoGia, THEN THE App_BaoGia SHALL chặn thao tác tra cứu và hiển thị thông báo lỗi nêu rõ nguồn khách hàng đang không sẵn sàng.
2. IF nguồn master không sẵn sàng WHEN NV_CSKH cố gắn một khách hàng mới vào báo giá, THEN THE App_BaoGia SHALL chặn thao tác gắn và hiển thị thông báo lỗi nêu rõ nguyên nhân.
3. WHILE nguồn master không sẵn sàng, THE App_BaoGia SHALL cho phép tiếp tục xem và chỉnh sửa các báo giá có khách hàng đã được gắn từ trước.
4. WHEN nguồn master trở lại sẵn sàng, THE App_BaoGia SHALL cho phép tra cứu và gắn khách hàng trở lại mà không cần thao tác khôi phục thủ công.

### Requirement 9: Thay Cầu_Đồng_Bộ đã chết bằng cơ chế hoạt động

**User Story:** Là developer, tôi muốn cầu nối khách hàng giữa hai app thật sự hoạt động, để thay cho `CustomerSyncController` hiện trả dữ liệu rỗng.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cung cấp một Cầu_Đồng_Bộ để App_BaoGia lấy được Trường_Định_Danh khách hàng từ Bản_Ghi_Định_Danh master.
2. WHEN App_BaoGia yêu cầu danh sách hoặc tìm kiếm khách hàng qua Cầu_Đồng_Bộ, THE Cầu_Đồng_Bộ SHALL trả dữ liệu định danh thực tế từ master thay vì kết quả rỗng.
3. THE Hệ_Thống SHALL loại bỏ hoặc thay thế đường dẫn `CustomerSyncController` gọi tới các stub trả `{}` để không còn lối lấy khách hàng trả về dữ liệu rỗng.
4. IF một yêu cầu qua Cầu_Đồng_Bộ thất bại, THEN THE Cầu_Đồng_Bộ SHALL trả về thông báo lỗi mô tả nguyên nhân thay vì trả thành công với dữ liệu rỗng.

### Requirement 10: Nhất quán dữ liệu định danh giữa hai app

**User Story:** Là NV_CSKH, tôi muốn dữ liệu định danh khách hiển thị nhất quán ở cả hai app, để mọi người làm việc trên cùng một thông tin.

#### Acceptance Criteria

1. WHEN Trường_Định_Danh của một khách hàng được cập nhật tại master, THE Hệ_Thống SHALL phản ánh giá trị cập nhật đó cho App_BaoGia trong các lần đọc tiếp theo.
2. THE Hệ_Thống SHALL trình bày cùng một giá trị Trường_Định_Danh cho một khách hàng tại Zeplao và tại App_BaoGia khi cả hai cùng đọc Bản_Ghi_Định_Danh master.
3. IF Trường_Định_Danh được chỉnh sửa ở App_BaoGia ngoài luồng cho phép, THEN THE Hệ_Thống SHALL từ chối thay đổi đó và giữ nguyên giá trị do master sở hữu.

### Requirement 11: Định danh khách phi-Zalo qua Kênh_Thủ_Công

**User Story:** Là NV_CSKH, tôi muốn khách không đến từ Zalo (vãng lai, đặt trực tiếp) cũng có một bản ghi master, để mọi khách đều được quản lý thống nhất ở Zeplao mà không cần tài khoản Zalo.

#### Acceptance Criteria

1. WHERE một khách hàng không có định danh Zalo, THE Hệ_Thống SHALL tạo Bản_Ghi_Định_Danh master cho khách đó gắn với một Kênh_Thủ_Công.
2. WHEN Hệ_Thống tạo một Bản_Ghi_Định_Danh master qua Kênh_Thủ_Công, THE Hệ_Thống SHALL sinh một `external_user_id` ổn định và duy nhất theo số điện thoại đã chuẩn hoá của khách.
3. IF một khách phi-Zalo không có số điện thoại, THEN THE Hệ_Thống SHALL sinh một `external_user_id` ổn định và duy nhất bằng định danh thay thế (ví dụ UUID) để vẫn thoả ràng buộc duy nhất của master.
4. THE Hệ_Thống SHALL bảo đảm tính duy nhất của Bản_Ghi_Định_Danh trên Kênh_Thủ_Công theo `external_user_id`, sao cho hai lần tạo cho cùng một số điện thoại đã chuẩn hoá không sinh hai master khác nhau.
5. WHEN một khách phi-Zalo sau này phát sinh hội thoại Zalo, THE Hệ_Thống SHALL cho phép đối soát Bản_Ghi_Định_Danh Kênh_Thủ_Công với định danh Zalo tương ứng theo quy trình đối soát ở Yêu cầu 7 mà không tạo master trùng.
