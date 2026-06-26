# Requirements Document

## Introduction

Tài liệu này định nghĩa yêu cầu cho việc **tái quy hoạch sản phẩm (product rescope)** của hệ ZeplaoPrint. Đây là một spec **định hướng/scoping**, không phải một tính năng code đơn lẻ. Mục tiêu là đưa sản phẩm về đúng trục **Chăm sóc khách hàng (CSKH) + Báo giá**, rút gọn phần "thịt ERP" còn sót, và xác lập ranh giới rõ ràng giữa hai app dùng chung một backend.

Hệ ZeplaoPrint gồm hai app gắn chặt, chạy trên cùng một backend NestJS (PostgreSQL `zeplao_erp`, schema `public`):

1. **Cổng gặp khách (CSKH/Chat)** — mặt tiền tiếp xúc khách hàng: Inbox (Zalo cá nhân + OA), Contacts/CRM, Knowledge Base (RAG), AI suggestions, mini báo giá trong hội thoại, Reports, Super-admin. Frontend tại `frontend/src/app/(app)/`.
2. **Bộ não bên trong (Báo Giá)** — engine xử lý/tính giá: tính giá digital/offset/large-format/bound, Vật tư, Định mức, Sản phẩm, Khách hàng, Cài đặt, Quản trị. Frontend tại `frontend/src/app/pricing/`.

Định hướng của chủ dự án: **thiên về CSKH + Báo giá, chưa đi sâu ERP**. Dự án trước đây là một ERP quá lớn, khó tiếp cận khách hàng phổ thông (chủ shop in nhỏ); đã nhiều lần rút gọn và cần tiếp tục quy hoạch lại cho đúng trục, đồng thời bảo toàn dữ liệu và khả năng bật lại các phần đã ẩn.

Phạm vi tài liệu này là **xác lập quyết định phân loại và nguyên tắc rút gọn** (đặc tả "what" — phạm vi giữ/ẩn/gỡ, tiêu chí, ranh giới, ràng buộc). Việc thực thi từng thao tác ẩn/gỡ cụ thể sẽ được chi tiết hóa ở giai đoạn Design và Tasks.

## Glossary

- **Hệ_Thống (System)**: Toàn bộ hệ ZeplaoPrint, gồm hai app frontend và backend NestJS dùng chung.
- **App_CSKH**: App "Cổng gặp khách" — frontend tại `frontend/src/app/(app)/`, phục vụ giao tiếp và chăm sóc khách hàng.
- **App_BaoGia**: App "Bộ não bên trong" — frontend tại `frontend/src/app/pricing/`, phục vụ tính giá và quản lý dữ liệu giá.
- **Backend_Dùng_Chung**: Backend NestJS dùng chung cho cả hai app, kết nối PostgreSQL `zeplao_erp` schema `public`.
- **Tính_Năng_Lõi (Core)**: Tính năng thuộc trục CSKH + Báo giá, được giữ lại và tiếp tục phát triển.
- **Tính_Năng_Phụ (ERP-Residual)**: Tính năng thuộc phần "thịt ERP" còn sót, ứng viên để đóng băng/ẩn/gỡ.
- **Người_Quy_Hoạch (Maintainer)**: Người ra quyết định phân loại phạm vi và thực hiện rút gọn (chủ dự án hoặc developer được uỷ quyền).
- **Chủ_Shop**: Người dùng cuối là chủ shop in phổ thông, không rành kỹ thuật/ERP.
- **NV_CSKH**: Nhân viên chăm sóc khách hàng, vận hành Inbox và báo giá nhanh.
- **Trạng_Thái_Đóng_Băng (Frozen)**: Trạng thái một tính năng bị ẩn khỏi giao diện/menu nhưng code, route backend và dữ liệu vẫn được giữ nguyên, có thể bật lại.
- **Trạng_Thái_Gỡ_Bỏ (Removed)**: Trạng thái một tính năng bị xoá khỏi codebase, chỉ thực hiện sau khi đã đóng băng và xác nhận an toàn.
- **Đăng_Ký_Phạm_Vi (Scope Registry)**: Bản ghi/tài liệu liệt kê mọi tính năng kèm phân loại (Lõi / Đóng băng / Gỡ bỏ) và lý do.
- **Multi_Tenant**: Khả năng phục vụ nhiều khách thuê (tenant) trên schema riêng; hiện đã hợp nhất về single-schema `public`, middleware tenant đã tắt.
- **RBAC**: Cơ chế phân quyền theo vai trò (`auth`, `rbac` modules).
- **Snapshot_Schema**: Bản chụp schema PostgreSQL tái lập tại `backend/db/schema.postgres.sql`, sinh từ DB thật.
- **Nguồn_Schema**: Nguồn sự thật của schema dữ liệu = TypeORM entities + Snapshot_Schema.
- **Endpoint_Không_Auth**: Route backend hiện không yêu cầu xác thực (ví dụ một số route public/quick).
- **Báo_Giá_Đơn_Hàng**: Một thực thể duy nhất trong hệ, lưu trên bảng `quotes`, được phục vụ bởi controller `/erp/orders` (`GET /erp/orders`); báo giá và đơn hàng là cùng một thực thể với các trạng thái vòng đời draft→submit→approve→send→accept→complete→cancel/clone, không phải hai tính năng tách rời. Tuy vẫn là một thực thể duy nhất ở backend, thực thể này nay được **trình bày qua hai route/điểm điều hướng riêng** ở frontend để phục vụ điều hướng và tách quyền RBAC trong tương lai: khung nhìn Báo giá tại route `/pricing/quotes` và khung nhìn Đơn hàng tại route `/pricing/orders`. Cả hai route đều đọc từ `GET /erp/orders` với tham số `status` và lọc phía client, không thêm bảng hay endpoint backend mới.

## Requirements

### Requirement 1: Mục tiêu sản phẩm và đối tượng người dùng

**User Story:** Là chủ dự án, tôi muốn xác định rõ mục tiêu sản phẩm và đối tượng người dùng sau rút gọn, để mọi quyết định phạm vi đều phục vụ đúng trục CSKH + Báo giá.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL tài liệu hoá mục tiêu sản phẩm là phục vụ hai trục chính: chăm sóc khách hàng và báo giá.
2. THE Hệ_Thống SHALL xác định hai nhóm người dùng chính là Chủ_Shop và NV_CSKH.
3. THE Người_Quy_Hoạch SHALL định nghĩa Tính_Năng_Lõi là tính năng phục vụ trực tiếp Chủ_Shop hoặc NV_CSKH trong trục CSKH hoặc Báo giá, và Tính_Năng_Phụ là tính năng không thoả định nghĩa đó.
4. WHERE một tính năng không phục vụ trực tiếp Chủ_Shop hoặc NV_CSKH trong trục CSKH hoặc Báo giá, THE Người_Quy_Hoạch SHALL xếp tính năng đó vào nhóm Tính_Năng_Phụ.
5. THE Hệ_Thống SHALL định nghĩa tiêu chí thành công của việc rút gọn gồm: tổng số mục điều hướng trên menu chính mỗi app sau rút gọn nhỏ hơn nghiêm ngặt so với baseline trước rút gọn, VÀ 100% mục còn lại thuộc Tính_Năng_Lõi.
6. WHEN đánh giá kết quả rút gọn, THE Người_Quy_Hoạch SHALL kiểm chứng rằng Chủ_Shop hoàn thành trọn vẹn luồng tiếp nhận khách và tạo được đúng một báo giá mà không truy cập bất kỳ Tính_Năng_Phụ nào.
7. IF còn ít nhất một mục Tính_Năng_Phụ hiển thị trên menu chính sau rút gọn, THEN THE Người_Quy_Hoạch SHALL ghi nhận kết quả là KHÔNG ĐẠT và lập danh sách các mục vi phạm.

### Requirement 2: Phân định phạm vi Lõi và Phụ

**User Story:** Là Người_Quy_Hoạch, tôi muốn có tiêu chí rõ ràng để quyết định một tính năng thuộc nhóm Lõi hay Phụ, để việc phân loại nhất quán và có thể kiểm chứng.

#### Acceptance Criteria

1. THE Người_Quy_Hoạch SHALL phân loại mỗi tính năng vào đúng một và chỉ một trong ba nhóm: Tính_Năng_Lõi, Trạng_Thái_Đóng_Băng, hoặc Trạng_Thái_Gỡ_Bỏ, sao cho không có tính năng nào bị bỏ sót hoặc gán nhiều hơn một nhóm trong Đăng_Ký_Phạm_Vi.
2. WHERE một tính năng phục vụ trực tiếp Inbox, Contacts/CRM, Knowledge Base, AI suggestions, mini báo giá, engine tính giá (digital/offset/large-format/bound), hoặc vòng đời báo giá ↔ đơn hàng (controller `/erp/orders` vận hành trên bảng `quotes`, các khung nhìn danh sách gọi `GET /erp/orders`, các trạng thái draft→submit→approve→send→accept→complete→cancel/clone), THE Người_Quy_Hoạch SHALL xếp tính năng đó vào Tính_Năng_Lõi, và SHALL mô hình hoá khung nhìn Báo giá và khung nhìn Đơn hàng thành **hai mục điều hướng Tính_Năng_Lõi riêng biệt** trên trục Báo giá trong Đăng_Ký_Phạm_Vi (mỗi mục có nav item và route riêng), dù cùng dựa trên một thực thể Báo_Giá_Đơn_Hàng.
3. WHERE một tính năng thuộc nhóm ERP nâng cao gồm quản lý kho và phiếu nhập-xuất (`materials.service.createInventorySlip`, `POST /erp/inventory`, modal `StockActionModal`), RFM scoring, production-cost, setup-fee, plate-pricing, hoặc cấu hình máy offset nâng cao, THE Người_Quy_Hoạch SHALL xếp tính năng đó vào nhóm ứng viên Trạng_Thái_Đóng_Băng.
4. WHERE một tính năng thuộc nhóm SaaS gồm Multi_Tenant, super-admin, subscription plans, hoặc payments, THE Người_Quy_Hoạch SHALL xếp tính năng đó vào nhóm ứng viên Trạng_Thái_Đóng_Băng và ghi trong Đăng_Ký_Phạm_Vi ít nhất một điều kiện bật lại được mô tả bằng tiêu chí có thể quan sát (điều kiện kích hoạt và kết quả mong đợi khi bật lại).
5. THE Người_Quy_Hoạch SHALL ghi lại trong Đăng_Ký_Phạm_Vi, cho mỗi tính năng, lý do phân loại gồm tối thiểu: nhóm được gán, tiêu chí phân loại được áp dụng (theo tiêu chí 2, 3 hoặc 4), và tham chiếu tới tính năng tương ứng.
6. IF một tính năng vừa phục vụ trục Lõi vừa phụ thuộc một thành phần Phụ, THEN THE Người_Quy_Hoạch SHALL ghi nhận phụ thuộc đó trong Đăng_Ký_Phạm_Vi và giữ thành phần Phụ ở Trạng_Thái_Đóng_Băng thay vì Trạng_Thái_Gỡ_Bỏ cho tới khi phụ thuộc được gỡ bỏ và ghi nhận là đã gỡ.
7. THE Đăng_Ký_Phạm_Vi SHALL liệt kê đầy đủ các trang Cài đặt hiện ẩn khỏi menu (`ai-quote`, `api-keys`, `api-docs`, `webhooks`, `product-configs`), mỗi trang kèm đúng một phân loại trong ba nhóm: Tính_Năng_Lõi, Trạng_Thái_Đóng_Băng, hoặc Trạng_Thái_Gỡ_Bỏ.
8. WHERE từng tồn tại một title-map mồ côi `/pricing/orders` trong `layout.tsx` không có trang thật tương ứng, THE Người_Quy_Hoạch SHALL ghi nhận rằng entry title-map mồ côi đó (chỉ là title-map, không có trang thật) đã được xếp vào Trạng_Thái_Gỡ_Bỏ và dọn dẹp như rác điều hướng; VÀ THE Người_Quy_Hoạch SHALL ghi nhận rằng path `/pricing/orders` nay được **tái lập như một trang Tính_Năng_Lõi thật** cho khung nhìn Đơn hàng (theo Requirement 8), sao cho việc tái lập này không mâu thuẫn với bước dọn dẹp title-map mồ côi trước đó và SHALL không ảnh hưởng tới API lõi `/erp/orders` thuộc Tính_Năng_Lõi của trục Báo giá.

### Requirement 3: Quan hệ và ranh giới giữa hai app

**User Story:** Là NV_CSKH, tôi muốn hai app hoạt động như một thể thống nhất với ranh giới rõ ràng, để chuyển giữa cổng gặp khách và bộ não báo giá mượt mà mà không mất ngữ cảnh.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL coi App_CSKH và App_BaoGia là một thể thống nhất chia sẻ Backend_Dùng_Chung.
2. WHEN người dùng đã đăng nhập ở một app và phiên xác thực còn hiệu lực, THE Hệ_Thống SHALL cho phép truy cập app còn lại bằng cùng phiên đó mà không hiển thị màn hình đăng nhập lại.
3. IF phiên xác thực đã hết hiệu lực hoặc bị thu hồi khi người dùng chuyển app, THEN THE Hệ_Thống SHALL yêu cầu đăng nhập lại trước khi cho truy cập.
4. THE Hệ_Thống SHALL cung cấp điều hướng giữa App_CSKH và App_BaoGia trên mọi màn hình của mỗi app, tại cùng một vị trí cố định không thay đổi.
5. THE Hệ_Thống SHALL dùng chung một nguồn dữ liệu khách hàng (Customer) giữa hai app trên Backend_Dùng_Chung.
6. WHEN người dùng chuyển từ App_CSKH sang App_BaoGia trong ngữ cảnh một khách hàng, THE Hệ_Thống SHALL giữ nguyên ngữ cảnh Customer đó ở app đích.
7. WHEN một báo giá được tạo trong App_CSKH qua mini báo giá, THE Hệ_Thống SHALL lưu báo giá đó vào cùng nguồn dữ liệu mà App_BaoGia đọc, sao cho báo giá được truy xuất được trong lần đọc kế tiếp của App_BaoGia.
8. IF việc lưu báo giá từ App_CSKH thất bại, THEN THE Hệ_Thống SHALL không lưu một phần dữ liệu và SHALL hiển thị thông báo lỗi.
9. THE Hệ_Thống SHALL định nghĩa ranh giới trách nhiệm: App_CSKH chịu trách nhiệm giao tiếp và tiếp nhận yêu cầu khách, App_BaoGia chịu trách nhiệm tính giá và quản lý dữ liệu giá.
10. IF một thao tác trong App_CSKH cần kết quả tính giá, THEN THE App_CSKH SHALL gọi engine tính giá dùng chung thay vì tự tính giá độc lập.

### Requirement 4: Kiến trúc thông tin và điều hướng sau rút gọn

**User Story:** Là Chủ_Shop, tôi muốn menu mỗi app chỉ hiển thị các chức năng cần dùng, để tôi tiếp cận được mà không bị quá tải bởi tính năng ERP.

#### Acceptance Criteria

1. THE App_CSKH SHALL hiển thị trên menu chính chỉ các mục đã được phân loại Tính_Năng_Lõi của trục CSKH trong Đăng_Ký_Phạm_Vi, và SHALL không hiển thị bất kỳ mục nào thuộc Tính_Năng_Phụ hoặc ở Trạng_Thái_Đóng_Băng.
2. THE App_BaoGia SHALL hiển thị trên menu chính chỉ các mục đã được phân loại Tính_Năng_Lõi của trục Báo giá trong Đăng_Ký_Phạm_Vi, và SHALL không hiển thị bất kỳ mục nào thuộc Tính_Năng_Phụ hoặc ở Trạng_Thái_Đóng_Băng.
3. WHERE một tính năng ở Trạng_Thái_Đóng_Băng, THE Hệ_Thống SHALL ẩn mục điều hướng tương ứng khỏi menu chính của cả App_CSKH và App_BaoGia.
4. THE Hệ_Thống SHALL định nghĩa cấu trúc điều hướng mục tiêu (IA) cho mỗi app dưới dạng danh sách mục menu giữ lại, trong đó mỗi mục ánh xạ tới đúng một Tính_Năng_Lõi đã ghi trong Đăng_Ký_Phạm_Vi.
5. WHEN người dùng truy cập một app sau rút gọn, THE Hệ_Thống SHALL hiển thị trên menu chính một điểm vào riêng biệt, có nhãn văn bản nhận dạng, cho từng nhiệm vụ chính của trục tương ứng, sao cho mỗi nhiệm vụ chính được kích hoạt bằng đúng một thao tác chọn từ menu chính.
6. IF người dùng điều hướng trực tiếp tới route của một tính năng ở Trạng_Thái_Đóng_Băng, THEN THE Hệ_Thống SHALL hiển thị một thông báo cho biết tính năng hiện không khả dụng, SHALL không trả về lỗi chưa xử lý, và SHALL giữ nguyên phiên đăng nhập hiện tại của người dùng.
7. THE App_BaoGia SHALL hiển thị trên menu chính hai điểm vào riêng biệt trên trục Báo giá — một cho "Báo giá" (route `/pricing/quotes`) và một cho "Đơn hàng" (route `/pricing/orders`) — trong đó mỗi điểm vào ánh xạ tới đúng một Tính_Năng_Lõi riêng trong Đăng_Ký_Phạm_Vi, nhất quán với tiêu chí 4 (mỗi mục menu ↔ đúng một Tính_Năng_Lõi).

### Requirement 5: Nguyên tắc rút gọn an toàn

**User Story:** Là Người_Quy_Hoạch, tôi muốn rút gọn theo nguyên tắc an toàn "ẩn trước – gỡ sau", để không phá vỡ luồng đang chạy và luôn có thể hoàn tác.

#### Acceptance Criteria

1. WHEN rút gọn một Tính_Năng_Phụ, THE Người_Quy_Hoạch SHALL đưa tính năng đó về Trạng_Thái_Đóng_Băng trước, và SHALL không chuyển trực tiếp sang Trạng_Thái_Gỡ_Bỏ khi chưa qua Trạng_Thái_Đóng_Băng.
2. WHILE một tính năng ở Trạng_Thái_Đóng_Băng, THE Hệ_Thống SHALL giữ nguyên (không sửa đổi và không xoá) code, route backend và dữ liệu liên quan của tính năng đó.
3. WHEN đóng băng một tính năng, THE Hệ_Thống SHALL bảo toàn 100% bản ghi liên quan trong PostgreSQL, sao cho số lượng và nội dung bản ghi sau khi đóng băng bằng với trước khi đóng băng.
4. WHERE một tính năng đã ở Trạng_Thái_Đóng_Băng, THE Người_Quy_Hoạch SHALL bật lại được tính năng đó chỉ bằng thao tác cấu hình/bật trạng thái, không cần khôi phục dữ liệu từ sao lưu ngoài.
5. WHEN đóng băng một tính năng, THE Người_Quy_Hoạch SHALL kiểm chứng rằng các luồng Lõi (tiếp nhận khách, tạo báo giá) chạy end-to-end và hoàn tất thành công không phát sinh lỗi.
6. IF việc gỡ bỏ một tính năng làm ít nhất một luồng Lõi không thể hoàn tất thành công, THEN THE Người_Quy_Hoạch SHALL giữ tính năng đó ở Trạng_Thái_Đóng_Băng thay vì gỡ bỏ.
7. WHERE một tính năng được chuyển sang Trạng_Thái_Gỡ_Bỏ, THE Người_Quy_Hoạch SHALL tạo bản sao lưu code và dữ liệu liên quan và kiểm chứng bản sao lưu khôi phục được trước khi xoá.
8. THE Người_Quy_Hoạch SHALL ghi lại điều kiện và các bước bật lại cho mỗi tính năng ở Trạng_Thái_Đóng_Băng, bao gồm các bước bật lại cho từng tenant đối với Multi_Tenant.
9. IF việc kiểm chứng luồng Lõi sau khi đóng băng thất bại, THEN THE Người_Quy_Hoạch SHALL hoàn tác bước đóng băng và khôi phục tính năng về trạng thái ngay trước đó.

### Requirement 6: Ràng buộc kỹ thuật

**User Story:** Là developer, tôi muốn việc rút gọn tôn trọng các ràng buộc kỹ thuật hiện có của hệ, để không gây lỗi schema, phân quyền hay tích hợp.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL tiếp tục dùng một Backend_Dùng_Chung kết nối PostgreSQL `zeplao_erp` schema `public` cho cả hai app.
2. THE Người_Quy_Hoạch SHALL coi Nguồn_Schema là TypeORM entities kết hợp Snapshot_Schema tại `backend/db/schema.postgres.sql`.
3. THE Hệ_Thống SHALL giữ `synchronize` ở trạng thái tắt (false).
4. IF một thay đổi liên quan tới dữ liệu sẽ phá vỡ tương thích với entities hiện có (xoá hoặc đổi tên cột/bảng đang dùng, đổi kiểu cột không tương thích), THEN THE Người_Quy_Hoạch SHALL từ chối thay đổi đó và giữ nguyên schema.
5. THE Hệ_Thống SHALL áp dụng RBAC để kiểm soát truy cập các tính năng còn lại sau rút gọn, sao cho yêu cầu không có quyền bị từ chối truy cập.
6. WHERE một tính năng ở Trạng_Thái_Đóng_Băng có route backend, THE Hệ_Thống SHALL giữ route đó tồn tại nhưng được bảo vệ bởi RBAC hoặc cờ vô hiệu hoá, sao cho yêu cầu không có quyền bị từ chối truy cập.
7. WHEN viết hoặc sửa raw SQL, THE Người_Quy_Hoạch SHALL dùng cú pháp PostgreSQL và trích dẫn nháy kép cho identifier camelCase.
8. WHEN viết hoặc sửa raw SQL có so sánh cột `is_active`, THE Người_Quy_Hoạch SHALL dùng `= 1` cho cột kiểu smallint/integer và `= true` cho cột kiểu boolean theo kiểu cột thực tế.
9. THE Người_Quy_Hoạch SHALL giữ khả năng bật lại Multi_Tenant theo quy trình: gán `schema_name`, gọi `provisionTenantSchema`, bật `TenantSchemaMiddleware`, và chuyển TypeORM schema sang động.

### Requirement 7: Yêu cầu phi chức năng

**User Story:** Là Chủ_Shop, tôi muốn sản phẩm sau rút gọn đơn giản, an toàn và có thể hoàn tác, để tôi yên tâm sử dụng và chủ dự án yên tâm điều chỉnh.

#### Acceptance Criteria

1. WHEN một người dùng phổ thông chưa qua đào tạo ERP truy cập một app, THE Hệ_Thống SHALL cho phép tìm tới chức năng chính của trục tương ứng trong tối đa 3 lần nhấp và không cần tài liệu ngoài.
2. WHEN một tính năng được đóng băng hoặc gỡ bỏ, THE Hệ_Thống SHALL giữ thời gian phản hồi của các luồng Lõi không vượt quá baseline trước rút gọn cộng 5%.
3. WHEN hoàn tất một bước rút gọn, THE Người_Quy_Hoạch SHALL rà soát mọi Endpoint_Không_Auth còn lại và ghi vào Đăng_Ký_Phạm_Vi kèm phân loại rủi ro Cao/Trung bình/Thấp.
4. IF một Endpoint_Không_Auth để lộ dữ liệu nhạy cảm hoặc cho phép thao tác ghi, THEN THE Người_Quy_Hoạch SHALL bổ sung kiểm soát truy cập hoặc đưa endpoint đó về Trạng_Thái_Đóng_Băng, và ghi nhận hành động đã xử lý.
5. THE Hệ_Thống SHALL cho phép hoàn tác mỗi bước rút gọn thông qua bản ghi trong Đăng_Ký_Phạm_Vi và bản sao lưu tương ứng, khôi phục về trạng thái chức năng tương đương ngay trước bước đó.
6. THE Hệ_Thống SHALL bảo toàn nội dung các file cấu hình runtime không được phép di chuyển (`backend/ai-config.json`, `backend/.env`).
7. IF việc hoàn tác một bước rút gọn thất bại do thiếu hoặc hỏng bản sao lưu, THEN THE Hệ_Thống SHALL huỷ thao tác hoàn tác, giữ nguyên trạng thái hiện tại và báo lỗi.
8. IF một thao tác cố ghi, xoá hoặc di chuyển file cấu hình runtime cấm di chuyển, THEN THE Hệ_Thống SHALL chặn thao tác, giữ nguyên file và báo lỗi.

### Requirement 8: Tách Báo giá và Đơn hàng thành hai điểm điều hướng và hai route riêng

**User Story:** Là Chủ_Shop, tôi muốn "Báo giá" và "Đơn hàng" là hai mục điều hướng riêng với trang riêng, để dễ theo dõi và để sau này có thể phân quyền theo vai trò ai được tạo báo giá, ai được xem đơn hàng — mà không cần thêm bảng hay endpoint backend mới.

#### Acceptance Criteria

1. THE App_BaoGia SHALL trình bày "Báo giá" và "Đơn hàng" là hai điểm điều hướng riêng biệt trên menu chính, mỗi điểm ánh xạ tới đúng một Tính_Năng_Lõi riêng trên trục Báo giá trong Đăng_Ký_Phạm_Vi, dù cả hai cùng dựa trên một thực thể Báo_Giá_Đơn_Hàng.
2. THE App_BaoGia SHALL cung cấp một route frontend riêng cho danh sách Đơn hàng tại path `/pricing/orders` — là một trang thật — mặc định hiển thị nhóm trạng thái Đơn hàng (ví dụ `accepted`, `completed`); và SHALL giữ route danh sách Báo giá hiện có tại path `/pricing/quotes` mặc định hiển thị nhóm trạng thái Báo giá (ví dụ `draft`, `sent`).
3. WHEN người dùng truy cập trang danh sách Báo giá hoặc trang danh sách Đơn hàng, THE App_BaoGia SHALL nạp dữ liệu từ `GET /erp/orders` với tham số `status` và lọc phía client trên cùng nguồn dữ liệu Báo_Giá_Đơn_Hàng, và SHALL không gọi endpoint mới.
4. THE Hệ_Thống SHALL định nghĩa ánh xạ rõ ràng tập trạng thái thuộc nhóm "Báo giá" và tập trạng thái thuộc nhóm "Đơn hàng", sao cho hai nhóm rời nhau (mỗi trạng thái vòng đời thuộc tối đa một nhóm hiển thị mặc định).
5. WHEN người dùng truy cập một trong hai trang danh sách, THE App_BaoGia SHALL chỉ hiển thị các bản ghi Báo_Giá_Đơn_Hàng có trạng thái thuộc nhóm tương ứng của trang đó.
6. THE Hệ_Thống SHALL thực hiện thay đổi này mà không thêm bảng hoặc route backend mới, và SHALL không phá vỡ luồng tạo, duyệt và hoàn thành Báo_Giá_Đơn_Hàng hiện có.
7. THE App_BaoGia SHALL cung cấp trên các trang danh sách một bộ lọc trạng thái cho phép truy cập mọi trạng thái vòng đời (bao gồm các trạng thái ngoài nhóm mặc định của trang như `cancelled`, `expired`, `rejected`); IF một bản ghi Báo_Giá_Đơn_Hàng có trạng thái không thuộc nhóm mặc định của trang, THEN bản ghi đó SHALL vẫn truy cập được qua bộ lọc trạng thái để không ẩn mất dữ liệu vĩnh viễn. (Lưu ý: việc tách trình bày Báo giá ↔ Đơn hàng do hai mục điều hướng/route top-level đảm nhiệm; các trang KHÔNG còn bộ tab chuyển khung nhìn nội bộ "Báo giá | Đơn hàng | Tất cả" để tránh trùng lặp với menu.)
8. THE Hệ_Thống SHALL làm cho route Đơn hàng (`/pricing/orders`) và các route Báo giá/tạo báo giá có thể được bảo vệ độc lập bằng RBAC ở cấp route, sao cho quyền xem đơn hàng và quyền tạo báo giá có thể được kiểm soát riêng theo vai trò; chính sách vai trò thực tế CÓ THỂ là mặc định cho phép ở thời điểm hiện tại, nhưng seam kiểm soát truy cập ở cấp route SHALL tồn tại để chuẩn bị cho RBAC trong tương lai.
