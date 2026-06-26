# Requirements Document

## Introduction

Tài liệu này định nghĩa yêu cầu cho tính năng **Phân quyền truy cập theo vai trò cho Báo giá và Đơn hàng (RBAC)** của hệ ZeplaoPrint sau khi đã tái quy hoạch về trục **CSKH + Báo giá + Đơn hàng**.

Spec trước (`product-rescope-cskh-quote`) đã: (1) tách thực thể Báo_Giá_Đơn_Hàng thành **hai route/điểm điều hướng riêng** (`/pricing/quotes` và `/pricing/orders`), (2) đặt sẵn một **seam kiểm soát truy cập cấp route** ở frontend là `RouteAccessGuard` (hiện **permissive**, luôn cho qua), và (3) giữ `FrozenRouteGuard` + registry để chặn các tính năng đã đóng băng. Spec này **biến seam đó thành phân quyền được thực thi thật**, với **ranh giới bảo mật thật nằm ở backend**.

Bối cảnh vận hành: ZeplaoPrint nhắm tới **shop in nhỏ**, nên mô hình phân quyền tối ưu cho thực tế "ít người, nhiều việc": nguyên tắc **"mở việc hằng ngày, khóa việc cam kết"** — nhân viên CSKH được tự do làm việc thường nhật (hộp thư, tạo báo giá, xem đơn hàng để phục vụ khách), nhưng các hành động **cam kết/cấu hình** (duyệt báo giá, hoàn thành/huỷ đơn hàng, xoá báo giá, cài đặt, quản lý người dùng/vai trò) chỉ dành cho chủ shop và giám sát.

Hệ thống hiện trạng (đã khảo sát mã nguồn, các yêu cầu dưới đây không được mâu thuẫn):

- Backend NestJS, PostgreSQL `zeplao_erp` schema `public`, `synchronize=false` (không đổi schema phá vỡ; tái dùng bảng hiện có).
- `users.role` là một cột chuỗi đơn; enum `UserRole = super_admin | admin | supervisor | agent` (mặc định `agent`).
- Bảng `roles` (name, display_name, is_system, tenant_id) và `role_permissions` (role_id, permission:string) đã tồn tại; `RbacService` seed 4 vai trò hệ thống (admin, supervisor, agent, viewer) qua `DEFAULT_ROLE_PERMISSIONS`.
- Catalog `ALL_PERMISSIONS` đã có `quote.view/create/edit/delete/approve`, `order.view/create/edit/delete/approve`, cùng `inbox.*`, `customer.*`, `settings.*`, `user.*`, `role.*`, `report.*`, `pricing.*` (delimiter là `.`).
- Hai guard tồn tại: `RolesGuard` (`@Roles`) và `PermissionsGuard` (`@Permissions`). `jwt.strategy.ts` nạp `user.permissions` từ `role_permissions`; admin/super_admin nhận `['*']`; **khi lỗi DB nó FAIL-OPEN về `['*']`**.
- **Lỗ hổng hiện tại:** controller `/erp/orders` (`ErpOrdersController`, phục vụ cả báo giá lẫn đơn hàng) khai báo `PermissionsGuard` ở cấp class **nhưng KHÔNG route nào có `@Permissions`**, nên bất kỳ người dùng đã đăng nhập nào cũng list/create/approve/delete được.
- Frontend `auth-context` chỉ phơi `role: string` (không có `permissions`); seam `RouteAccessGuard` đang dùng **placeholder delimiter `:`** (`order:view`, `quote:create`) khác với catalog backend dùng `.`; layout `(app)/layout.tsx` hard-code nhãn "Quản trị viên"; form `admin/users` dùng từ vựng vai trò sai (`manager`, `staff`) so với enum.

Phạm vi spec này bao gồm: mô hình vai trò và hoà giải từ vựng, catalog quyền và ánh xạ vai trò→quyền cho split báo giá/đơn hàng, thực thi phân quyền ở backend (nguồn sự thật), gỡ bỏ fail-open kèm bảo đảm chống khoá nhầm, phơi quyền ra frontend và nối seam với năng lực thật, ẩn thao tác UI theo quyền, sửa nhãn vai trò, quan sát/ghi nhận từ chối truy cập, và các yêu cầu phi chức năng cho shop nhỏ.

## Glossary

- **Hệ_Thống (System)**: Toàn bộ hệ ZeplaoPrint gồm Backend_Dùng_Chung và hai app frontend.
- **Backend_Dùng_Chung**: Backend NestJS dùng chung, kết nối PostgreSQL `zeplao_erp` schema `public`; là **ranh giới bảo mật thật** của phân quyền.
- **Frontend**: Hai app Next.js (`frontend/src/app/(app)/` cho CSKH và `frontend/src/app/pricing/` cho Báo giá), nơi thực hiện kiểm soát truy cập **mức trải nghiệm (UX)**.
- **Vai_Trò (Role)**: Một trong các giá trị từ vựng chuẩn `super_admin`, `admin`, `supervisor`, `agent`, `viewer`; lưu ở cột `users.role` (kiểu chuỗi) và phản ánh trong bảng `roles`.
- **Chủ_Shop**: Người dùng cuối là chủ shop in nhỏ, vận hành ở Vai_Trò `admin`.
- **NV_CSKH**: Nhân viên chăm sóc khách hàng, vận hành ở Vai_Trò `agent` (mặc định).
- **Giám_Sát**: Người dùng ở Vai_Trò `supervisor` (preset tuỳ chọn cho shop có quản lý).
- **Người_Xem**: Người dùng ở Vai_Trò `viewer` (preset chỉ-đọc, tuỳ chọn).
- **Super_Admin**: Vai_Trò cấp nền tảng `super_admin`, bỏ qua mọi kiểm tra phân quyền.
- **Quyền (Permission)**: Khoá năng lực dạng `module.action`, ví dụ `quote.create`, `order.approve`; delimiter chuẩn là dấu chấm `.`.
- **Catalog_Quyền**: Tập tất cả Quyền hợp lệ, định nghĩa tại `ALL_PERMISSIONS` trong `rbac.service.ts`.
- **Ánh_Xạ_Vai_Trò_Quyền**: Bản đồ mặc định từ Vai_Trò sang tập Quyền, định nghĩa tại `DEFAULT_ROLE_PERMISSIONS` và lưu trong bảng `role_permissions`.
- **PermissionsGuard**: Guard NestJS đọc `@Permissions(...)` và `user.permissions` để cho phép hoặc từ chối; admin/super_admin bypass.
- **Decorator_Permissions**: Decorator `@Permissions('module.action', ...)` gắn Quyền yêu cầu lên route (logic OR — cần ÍT NHẤT MỘT quyền trong danh sách).
- **JWT_Strategy**: `jwt.strategy.ts`, nơi nạp `user.permissions` từ `role_permissions` khi xác thực token.
- **Fail_Open**: Hành vi hiện tại của JWT_Strategy khi lỗi DB: cấp `['*']` (toàn quyền) — yêu cầu loại bỏ.
- **Fail_Closed**: Hành vi mong muốn khi không nạp được Quyền: cấp tập Quyền rỗng (từ chối) thay vì toàn quyền.
- **Route_Cam_Kết**: Các route thực hiện hành động cam kết/cấu hình: duyệt báo giá (`quote.approve`), hoàn thành/huỷ đơn hàng (`order.approve`/huỷ), xoá báo giá (`quote.delete`), cài đặt (`settings.*`), người dùng (`user.*`), vai trò (`role.*`).
- **Route_Việc_Hằng_Ngày**: Các route phục vụ công việc thường nhật của NV_CSKH: hộp thư (`inbox.*`), xem/tạo/sửa báo giá (`quote.view/create/edit`), xem đơn hàng (`order.view`), xem/tạo khách hàng (`customer.view/create`), xem báo cáo (`report.view`), dùng engine tính giá.
- **RouteAccessGuard**: Component seam ở frontend (`frontend/src/components/RouteAccessGuard.tsx`) kiểm soát truy cập cấp route ở mức UX; hiện permissive.
- **FrozenRouteGuard**: Guard frontend chặn route thuộc tính năng đã đóng băng (thuộc spec product-rescope; KHÔNG được làm suy yếu).
- **Năng_Lực (Capability)**: Tham số `requiredCapability` truyền cho RouteAccessGuard; phải dùng cùng từ vựng Quyền (delimiter `.`) như backend.
- **Báo_Giá_Đơn_Hàng**: Thực thể duy nhất lưu trên bảng `quotes`, phục vụ bởi controller `/erp/orders`; trình bày qua hai route frontend `/pricing/quotes` và `/pricing/orders`.
- **Khoá_Nhầm (Lockout)**: Tình huống người dùng hợp lệ bị mất khả năng làm việc do thực thi phân quyền quá mức.
- **Màn_Hình_Người_Dùng**: Trang `frontend/src/app/pricing/admin/users/page.tsx` để Chủ_Shop gán Vai_Trò cho người dùng.

## Requirements

### Requirement 1: Mô hình vai trò và hoà giải từ vựng

**User Story:** Là Chủ_Shop, tôi muốn hệ thống dùng một bộ từ vựng vai trò thống nhất và đúng với enum backend, để việc gán quyền không bị nhầm lẫn giữa các tên gọi khác nhau.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL dùng đúng một bộ từ vựng Vai_Trò gồm năm giá trị: `super_admin`, `admin`, `supervisor`, `agent`, `viewer`, và SHALL không tạo thêm từ vựng vai trò mới.
2. THE Hệ_Thống SHALL giữ nguyên 4 vai trò hệ thống hiện có (`admin`, `supervisor`, `agent`, `viewer`) do `RbacService` seed, và SHALL coi `super_admin` là Vai_Trò cấp nền tảng bỏ qua mọi kiểm tra phân quyền.
3. WHERE Màn_Hình_Người_Dùng hiển thị danh sách Vai_Trò để chọn, THE Frontend SHALL hiển thị đúng các giá trị thuộc từ vựng chuẩn (`admin`, `supervisor`, `agent`, `viewer`) thay cho các nhãn cũ `manager` và `staff`.
4. WHEN một bản ghi người dùng hiện có mang giá trị vai trò cũ `manager`, THE Hệ_Thống SHALL ánh xạ giá trị đó về `supervisor`.
5. WHEN một bản ghi người dùng hiện có mang giá trị vai trò cũ `staff`, THE Hệ_Thống SHALL ánh xạ giá trị đó về `agent`.
6. THE Hệ_Thống SHALL coi `admin` là Vai_Trò chính của Chủ_Shop và `agent` là Vai_Trò chính của NV_CSKH, và SHALL coi `supervisor` và `viewer` là preset tuỳ chọn.
7. THE Frontend SHALL hiển thị nhãn Vai_Trò cho người dùng hiện tại dựa trên Vai_Trò thực tế của phiên đăng nhập, thay cho nhãn cố định "Quản trị viên" đang hard-code tại `(app)/layout.tsx`.

### Requirement 2: Catalog quyền và ánh xạ vai trò → quyền cho split báo giá/đơn hàng

**User Story:** Là Chủ_Shop, tôi muốn mỗi vai trò có sẵn một tập quyền mặc định hợp lý theo nguyên tắc "mở việc hằng ngày, khóa việc cam kết", để nhân viên làm việc trơn tru còn các hành động quan trọng được kiểm soát.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL dùng Catalog_Quyền hiện có với delimiter `.`, bao gồm `quote.view`, `quote.create`, `quote.edit`, `quote.delete`, `quote.approve`, `order.view`, `order.create`, `order.edit`, `order.delete`, `order.approve`.
2. THE Ánh_Xạ_Vai_Trò_Quyền SHALL cấp cho Vai_Trò `agent` các Quyền việc hằng ngày gồm: `inbox.view`, `inbox.reply`, `quote.view`, `quote.create`, `quote.edit`, `order.view`, `customer.view`, `customer.create`, `report.view`, `pricing.view`.
3. THE Ánh_Xạ_Vai_Trò_Quyền SHALL bảo đảm Vai_Trò `agent` có `order.view`, sao cho NV_CSKH xem được đơn hàng để phục vụ khách.
4. THE Ánh_Xạ_Vai_Trò_Quyền SHALL không cấp cho Vai_Trò `agent` các Quyền cam kết/cấu hình gồm `quote.approve`, `quote.delete`, `order.approve`, `order.delete`, `settings.edit`, và bất kỳ Quyền nào thuộc nhóm `user.*` hoặc `role.*`.
5. THE Ánh_Xạ_Vai_Trò_Quyền SHALL cấp cho Vai_Trò `supervisor` các Quyền cam kết gồm `quote.approve` và `order.approve`, cùng các Quyền việc hằng ngày của `agent`.
6. THE Ánh_Xạ_Vai_Trò_Quyền SHALL cấp cho Vai_Trò `admin` toàn quyền (`*`).
7. THE Ánh_Xạ_Vai_Trò_Quyền SHALL cấp cho Vai_Trò `viewer` chỉ các Quyền xem gồm `quote.view`, `order.view`, `customer.view`, `pricing.view`, `report.view`, và SHALL không cấp bất kỳ Quyền tạo, sửa, xoá, hoặc duyệt nào.
8. THE Hệ_Thống SHALL lưu Ánh_Xạ_Vai_Trò_Quyền trong bảng `role_permissions` hiện có, và SHALL không thêm bảng hoặc cột mới.

### Requirement 3: Thực thi phân quyền ở backend trên /erp/orders và các route nhạy cảm

**User Story:** Là Chủ_Shop, tôi muốn backend là nơi thực sự chặn truy cập trái phép, để dù ai đó gọi thẳng API thì các hành động cam kết vẫn được bảo vệ.

#### Acceptance Criteria

1. THE Backend_Dùng_Chung SHALL coi mình là ranh giới bảo mật thật, và SHALL không phụ thuộc vào RouteAccessGuard hay việc ẩn UI ở Frontend làm cơ chế kiểm soát truy cập duy nhất.
2. THE Backend_Dùng_Chung SHALL gắn Decorator_Permissions với Quyền phù hợp lên mọi route của controller `/erp/orders`, sao cho không route nào của controller đó còn thiếu khai báo Quyền.
3. WHEN một route đọc dữ liệu Báo_Giá_Đơn_Hàng (`GET /erp/orders`, `GET /erp/orders/:id`), THE Backend_Dùng_Chung SHALL yêu cầu Quyền `quote.view` hoặc `order.view`.
4. WHEN route tạo báo giá (`POST /erp/orders`) hoặc sửa báo giá (`PUT /erp/orders/:id`) được gọi, THE Backend_Dùng_Chung SHALL yêu cầu Quyền `quote.create` cho tạo và `quote.edit` cho sửa.
5. WHEN route duyệt báo giá (`POST /erp/orders/:id/approve`) được gọi, THE Backend_Dùng_Chung SHALL yêu cầu Quyền `quote.approve`.
6. WHEN route hoàn thành (`POST /erp/orders/:id/complete`) hoặc huỷ (`POST /erp/orders/:id/cancel`) được gọi, THE Backend_Dùng_Chung SHALL yêu cầu Quyền `order.approve`.
7. WHEN route xoá báo giá (`DELETE /erp/orders/:id`) được gọi, THE Backend_Dùng_Chung SHALL yêu cầu Quyền `quote.delete`.
8. IF một yêu cầu tới route được bảo vệ đến từ người dùng đã xác thực nhưng thiếu Quyền yêu cầu, THEN THE Backend_Dùng_Chung SHALL từ chối yêu cầu với mã trạng thái HTTP 403 và SHALL không thực hiện thao tác.
9. THE Backend_Dùng_Chung SHALL cho Super_Admin và `admin` bỏ qua kiểm tra Quyền, nhất quán với hành vi bypass hiện có của PermissionsGuard.
10. THE Backend_Dùng_Chung SHALL áp dụng cùng nguyên tắc thực thi cho các route nhạy cảm khác ngoài `/erp/orders` — gồm `settings.*` (`/erp/system-settings`), `user.*` (`/users`), và `role.*` (`/rbac`) — sao cho mỗi route nhạy cảm yêu cầu Quyền hoặc Vai_Trò tương ứng và từ chối yêu cầu thiếu quyền với HTTP 403.

### Requirement 4: Gỡ bỏ fail-open và bảo đảm chống khoá nhầm

**User Story:** Là Chủ_Shop, tôi muốn lỗi tải quyền dẫn tới từ chối an toàn thay vì cấp toàn quyền, nhưng đồng thời nhân viên hiện tại không bị mất khả năng làm việc sau khi bật phân quyền.

#### Acceptance Criteria

1. THE JWT_Strategy SHALL nạp `user.permissions` từ bảng `role_permissions` cho mọi người dùng không phải `admin`/`super_admin`.
2. IF việc nạp Quyền từ cơ sở dữ liệu thất bại do lỗi truy vấn, THEN THE JWT_Strategy SHALL gán tập Quyền rỗng (Fail_Closed) và SHALL không gán `['*']`.
3. THE Hệ_Thống SHALL bảo đảm 4 vai trò hệ thống và Quyền của chúng luôn được seed sẵn trong `roles` và `role_permissions`, sao cho việc nạp Quyền cho người dùng hợp lệ không phụ thuộc vào điều kiện lỗi.
4. WHEN phân quyền được thực thi, THE Hệ_Thống SHALL bảo đảm người dùng hiện có ở Vai_Trò mặc định `agent` vẫn giữ trọn vẹn năng lực Route_Việc_Hằng_Ngày.
5. WHEN phân quyền được thực thi, THE Hệ_Thống SHALL chỉ hạn chế các Route_Cam_Kết đối với Vai_Trò `agent`, và SHALL không hạn chế các Route_Việc_Hằng_Ngày của Vai_Trò đó.
6. THE Hệ_Thống SHALL giữ cho Vai_Trò `admin` và `super_admin` toàn quyền truy cập sau khi thực thi phân quyền.
7. WHEN một người dùng ở Vai_Trò `agent` thực hiện trọn vẹn luồng việc hằng ngày (mở hộp thư, tạo một báo giá, xem danh sách đơn hàng), THE Hệ_Thống SHALL cho phép hoàn tất luồng đó mà không trả về HTTP 403 ở bất kỳ bước nào của luồng.

### Requirement 5: Phơi quyền ra frontend và nối seam với năng lực thật

**User Story:** Là NV_CSKH, tôi muốn giao diện chỉ hiển thị những gì tôi được phép làm, để tôi không bấm vào thứ rồi nhận lỗi 403.

#### Acceptance Criteria

1. WHEN một người dùng đăng nhập thành công, THE Backend_Dùng_Chung SHALL trả về danh sách Quyền hiệu lực của người dùng đó cùng thông tin phiên đăng nhập.
2. THE Frontend SHALL phơi danh sách Quyền của người dùng qua `auth-context`, bổ sung cho trường `role` hiện có.
3. THE RouteAccessGuard SHALL dùng cùng từ vựng Quyền với Backend_Dùng_Chung theo delimiter `.`, và SHALL hoà giải các Năng_Lực placeholder hiện dùng delimiter `:` (`order:view`, `quote:create`) về dạng `.` (`order.view`, `quote.create`).
4. WHEN một route frontend được bọc bởi RouteAccessGuard với một Năng_Lực yêu cầu, THE RouteAccessGuard SHALL cho phép hiển thị nội dung route chỉ khi Quyền của người dùng trong `auth-context` chứa Năng_Lực đó hoặc chứa `*`.
5. IF người dùng không có Năng_Lực yêu cầu của một route được bọc, THEN THE RouteAccessGuard SHALL không hiển thị nội dung route và SHALL hiển thị thông báo không đủ quyền mà không gây lỗi chưa xử lý.
6. WHERE một thao tác trên giao diện (ví dụ nút Duyệt, Xoá, Hoàn thành, Huỷ) tương ứng một Quyền cam kết, THE Frontend SHALL ẩn hoặc vô hiệu hoá thao tác đó khi Quyền của người dùng không chứa Quyền tương ứng.
7. THE Frontend SHALL coi việc ẩn/vô hiệu hoá UI là biện pháp trải nghiệm, và SHALL không dựa vào nó làm cơ chế bảo mật thay cho thực thi backend tại Requirement 3.
8. THE Frontend SHALL giữ nguyên hành vi của FrozenRouteGuard và thứ tự compose `FrozenRouteGuard` (ngoài) → `RouteAccessGuard` (trong), sao cho việc thực thi RBAC không làm suy yếu việc chặn route đã đóng băng.

### Requirement 6: Ghi nhận và quan sát từ chối truy cập

**User Story:** Là Chủ_Shop, tôi muốn biết khi nào có người bị từ chối truy cập một hành động quan trọng, để phát hiện gán sai vai trò hoặc hành vi bất thường.

#### Acceptance Criteria

1. WHEN Backend_Dùng_Chung từ chối một yêu cầu với HTTP 403 do thiếu Quyền, THE Backend_Dùng_Chung SHALL ghi một bản ghi nhật ký gồm tối thiểu: định danh người dùng, Vai_Trò, Quyền yêu cầu, và route bị từ chối.
2. THE Backend_Dùng_Chung SHALL không ghi giá trị bí mật (token, mật khẩu) vào bản ghi nhật ký từ chối truy cập.
3. WHERE đã tồn tại cơ chế audit (`audit-log.entity`, module `audit`), THE Backend_Dùng_Chung SHALL tái dùng cơ chế đó để ghi nhận từ chối truy cập thay vì tạo cơ chế lưu trữ mới.

### Requirement 7: Yêu cầu phi chức năng

**User Story:** Là Chủ_Shop của một shop in nhỏ, tôi muốn việc gán vai trò đơn giản, không phá vỡ dữ liệu hay phiên đăng nhập hiện có, để tôi tự quản lý được mà không cần kỹ thuật.

#### Acceptance Criteria

1. WHEN Chủ_Shop gán Vai_Trò cho một người dùng tại Màn_Hình_Người_Dùng, THE Hệ_Thống SHALL cho phép hoàn tất việc gán trong tối đa 3 lần thao tác (chọn người dùng, chọn Vai_Trò, lưu) mà không cần chỉnh sửa từng Quyền riêng lẻ.
2. THE Hệ_Thống SHALL giữ `synchronize` ở trạng thái tắt (false), và SHALL không thực hiện thay đổi schema phá vỡ tương thích (xoá/đổi tên/đổi kiểu cột hoặc bảng đang dùng), tái dùng các bảng `users`, `roles`, `role_permissions`.
3. WHEN viết hoặc sửa raw SQL phục vụ phân quyền, THE Hệ_Thống SHALL dùng cú pháp PostgreSQL với trích dẫn nháy kép cho identifier camelCase, và SHALL dùng `= 1` cho cột `is_active` kiểu smallint/integer hoặc `= true` cho cột kiểu boolean theo kiểu cột thực tế.
4. WHEN phân quyền được triển khai, THE Hệ_Thống SHALL giữ tương thích với cơ chế JWT và phiên đăng nhập hiện có, sao cho token đang hiệu lực tiếp tục được chấp nhận và Quyền được nạp ở lần xác thực kế tiếp.
5. THE Hệ_Thống SHALL không làm suy yếu các bảo đảm của spec `product-rescope-cskh-quote`, gồm FrozenRouteGuard, hai route `/pricing/quotes` và `/pricing/orders`, và Đăng_Ký_Phạm_Vi (scope registry).
6. WHEN một yêu cầu được phân quyền tại backend, THE Hệ_Thống SHALL giữ chi phí kiểm tra Quyền trong phạm vi dữ liệu phiên đã nạp sẵn (`user.permissions`), và SHALL không phát sinh truy vấn cơ sở dữ liệu bổ sung cho mỗi lần kiểm tra Quyền của một yêu cầu.
