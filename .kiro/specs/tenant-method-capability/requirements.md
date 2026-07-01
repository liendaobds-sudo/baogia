# Requirements Document

## Introduction

Tài liệu này định nghĩa yêu cầu cho tính năng **phân quyền năng lực Phương_Pháp_In theo Tenant (tenant method capability)** của hệ ZeplaoPrint — nền tảng SaaS đa tenant báo giá/CSKH cho ngành in ấn (backend NestJS + TypeORM + PostgreSQL RLS; frontend Next.js).

**Vấn đề gốc (đã xác minh qua audit — coi là ground truth):**

- Bảng `method_capabilities(unit_id, method_id, enabled)` hiện gate `digital`/`offset` theo `unit_id` (mặc định `'default'`), **KHÔNG có `tenant_id`**. Migration ghi rõ "Độc lập với multi-tenant". `CapabilityService` (`backend/src/quote/capability.service.ts`) đọc theo `unitId`, với `DEFAULT_UNIT_ID='default'`. Hệ quả: **hiện KHÔNG gate được theo tenant** — mọi tenant dùng chung Đơn_Vị `'default'`.
- Enforcement HIỆN CHỈ nằm ở luồng báo giá hợp nhất `/quote-tool/*` (`backend/src/quote/quote.controller.ts`): `/quote-tool/calculate` trả `403` nếu phương pháp không khả dụng; `/quote-tool/methods` và `/quote-tool/compare` lọc theo cờ. Frontend ẩn menu/route qua `useEnabledMethods` (đang **fail-open** ở UI).
- **CÁC ĐƯỜNG TÍNH GIÁ KHÁC KHÔNG kiểm capability** (lỗ hổng cần đóng): `POST /pricing/calculate` (digital facade, `PricingController`), `POST /pricing/offset/calculate` (EngineOffset, `OffsetController`), `POST /quote/pricing-calc` (mini, `QuoteService.calculateMiniQuote`), và chatbot (`QuoteService.calculateFromParsed`).
- Phân loại sản phẩm nằm ở cột `quote_type` trong `unified_products`. Digital phục vụ 3 loại `{loose, bound, large_format}`; Offset phục vụ 5 loại `{to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay}` (hai tập rời nhau).
- Multi-tenant dùng PostgreSQL RLS (`backend/common/tenant/*`, migration `*_tenant_*`), gated sau cờ `TENANT_RLS_ENABLED` (mặc định OFF). Tenant context (`tenantId` kiểu số, `userId`, `role`) được set qua interceptor (`SET LOCAL app.current_tenant`).
- Ràng buộc nghiệp vụ hiện có: không được tắt Phương_Pháp_Khả_Dụng **cuối cùng** của một đơn vị đang vận hành (`LastEnabledMethodError` → HTTP 409).
- Super Admin (`/super-admin`) quản lý tenants và có tab "Plans" (gói dịch vụ), nhưng plan **CHƯA** liên kết `method_capabilities`.

**Mục tiêu:** Cho phép bật/tắt từng Phương_Pháp_In riêng cho từng Tenant, và **ENFORCE (siết)** năng lực đó ở **TẤT CẢ** đường tính giá — không chỉ `/quote-tool/*`. Ví dụ: tenant A chỉ dùng In_Nhanh; tenant B chỉ Offset; tenant C dùng cả hai.

**Nguyên tắc xuyên suốt:**
- **KHÔNG đụng số học giá/VAT.** Bất biến VAT (audit-rules §7): engine VAT-exclusive, VAT áp một lần ở tầng báo giá. Tính năng này chỉ **cổng (gate) truy cập** phương pháp, KHÔNG thay đổi công thức tính giá. Golden/property test giá phải giữ xanh.
- **Tôn trọng RLS gating** (audit-rules §9): mọi truy vấn cờ năng lực theo tenant phải lọc theo tenant context; hành vi phải đúng cả khi `TENANT_RLS_ENABLED` OFF và ON.
- **Tương thích ngược:** tenant chưa cấu hình phải giữ hành vi hiện tại (không phá báo giá đang chạy).
- **Fail-closed ở backend, fail-open ở UI:** backend là lớp chặn quyền uy tín; UI chỉ ẩn để bớt rối.

Tài liệu này đặc tả **hành vi nghiệp vụ mong muốn** ("what"); chi tiết mô hình dữ liệu, API, ánh xạ code để dành cho giai đoạn Design.

## Glossary

- **Hệ_Thống (System):** Toàn bộ hệ ZeplaoPrint (backend NestJS + frontend Next.js dùng chung).
- **Tenant:** Một tổ chức/khách hàng SaaS trong hệ đa tenant ZeplaoPrint, định danh bằng `tenantId` (kiểu số) trong tenant context. Là biên giới cô lập dữ liệu (RLS).
- **Đơn_Vị (Unit):** Khoá phạm vi hiện có của bảng `method_capabilities` (`unit_id`, mặc định `'default'`). Trước tính năng này, Đơn_Vị độc lập với Tenant.
- **Phương_Pháp_In (Print Method):** Cách thức sản xuất quyết định công thức tính giá. Tập hiện tại gồm In_Nhanh (`digital`) và Offset (`offset`); có thể mở rộng (ví dụ Khổ_Lớn). KHÔNG phải là loại sản phẩm.
- **In_Nhanh (Digital):** Phương_Pháp_In `digital`, phục vụ 3 `quote_type` `{loose, bound, large_format}`, qua `POST /pricing/calculate`.
- **Offset:** Phương_Pháp_In `offset`, phục vụ 5 `quote_type` `{to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay}`, qua `POST /pricing/offset/calculate`.
- **Loại_Sản_Phẩm (Quote Type):** Giá trị cột `quote_type` trong `unified_products` phân loại sản phẩm; mỗi Loại_Sản_Phẩm thuộc đúng một Phương_Pháp_In.
- **Ánh_Xạ_Loại_Phương_Pháp (Method Mapping):** Quy tắc suy dẫn Phương_Pháp_In từ Loại_Sản_Phẩm (hoặc từ tham số request) để biết một request tính giá thuộc phương pháp nào.
- **Cờ_Năng_Lực (Capability Flag):** Thiết lập bật/tắt một Phương_Pháp_In cho một Tenant. Mỗi cặp (Tenant, Phương_Pháp_In) có đúng một trạng thái bật/tắt.
- **Phương_Pháp_Khả_Dụng (Enabled Method):** Một Phương_Pháp_In có Cờ_Năng_Lực đang bật cho Tenant hiện hành.
- **Cấu_Hình_Năng_Lực_Tenant (Tenant Capability Config):** Tập Cờ_Năng_Lực của một Tenant.
- **Tenant_Chưa_Cấu_Hình (Unconfigured Tenant):** Tenant chưa có bất kỳ Cờ_Năng_Lực tường minh nào; áp dụng hành vi mặc định tương thích ngược.
- **Đường_Tính_Giá (Pricing Endpoint):** Bất kỳ điểm vào tính giá: `/quote-tool/calculate`, `/quote-tool/methods`, `/quote-tool/compare`, `/pricing/calculate`, `/pricing/offset/calculate`, `/quote/pricing-calc` (mini), và chatbot `calculateFromParsed`.
- **Tenant_Context:** Ngữ cảnh `(tenantId, userId, role)` do interceptor set cho mỗi request/job (`common/tenant/*`).
- **Trình_Phân_Giải_Năng_Lực (Capability Resolver):** Thành phần backend phân giải Tenant_Context → Cấu_Hình_Năng_Lực_Tenant, thay cho việc để frontend tự truyền `unitId='default'`.
- **Super_Admin:** Vai trò quản trị toàn hệ tại `/super-admin`, quản lý tenants và Plan.
- **Admin_Tenant:** Vai trò quản trị trong phạm vi một Tenant.
- **Plan (Gói dịch vụ):** Gói dịch vụ gán cho Tenant tại tab "Plans" của Super_Admin; có thể liên kết mặc định Cờ_Năng_Lực.
- **RLS_Enabled:** Trạng thái cờ `TENANT_RLS_ENABLED` (mặc định OFF) bật/tắt row-level security theo tenant.
- **Lỗi_Method_Cuối (LastEnabledMethodError):** Lỗi khi cố tắt Phương_Pháp_Khả_Dụng cuối cùng của một Tenant đang vận hành → HTTP 409.
- **VAT:** Thuế giá trị gia tăng; theo bất biến audit-rules §7, VAT chỉ đến từ thông số báo giá, engine VAT-exclusive, áp một lần ở tầng báo giá.
- **Golden_Test:** Bộ test khoá giá đang đúng, dùng phát hiện lệch giá khi thay đổi.

## Requirements

### Requirement 1: Mô hình năng lực Phương pháp in theo Tenant

**User Story:** Là Super_Admin, tôi muốn bật/tắt từng Phương_Pháp_In riêng cho từng Tenant, để mỗi Tenant chỉ dùng đúng năng lực sản xuất được cấp (ví dụ tenant A chỉ In_Nhanh, tenant B chỉ Offset, tenant C cả hai).

#### Acceptance Criteria

1. THE Hệ_Thống SHALL lưu trữ một Cờ_Năng_Lực bật/tắt cho mỗi cặp (Tenant, Phương_Pháp_In), với đúng một trạng thái cho mỗi cặp.
2. WHEN Super_Admin bật Cờ_Năng_Lực của một Phương_Pháp_In cho một Tenant, THE Hệ_Thống SHALL ghi nhận Phương_Pháp_In đó là Phương_Pháp_Khả_Dụng cho Tenant đó.
3. WHEN Super_Admin tắt Cờ_Năng_Lực của một Phương_Pháp_In cho một Tenant, THE Hệ_Thống SHALL loại Phương_Pháp_In đó khỏi tập Phương_Pháp_Khả_Dụng của Tenant đó.
4. THE Hệ_Thống SHALL hỗ trợ ba cấu hình Tenant: chỉ bật In_Nhanh, chỉ bật Offset, và bật cả hai.
5. THE Hệ_Thống SHALL gắn Cờ_Năng_Lực với `tenantId` của Tenant, sao cho Cờ_Năng_Lực của một Tenant không ảnh hưởng tới tập Phương_Pháp_Khả_Dụng của Tenant khác.
6. WHERE tập Phương_Pháp_In có thể mở rộng, THE Hệ_Thống SHALL cho phép thêm Phương_Pháp_In mới (ví dụ Khổ_Lớn) vào cơ chế Cờ_Năng_Lực theo Tenant mà không thay đổi định nghĩa Loại_Sản_Phẩm.

### Requirement 2: Mặc định năng lực cho Tenant mới (tương thích ngược)

**User Story:** Là Super_Admin, tôi muốn Tenant mới hoặc Tenant chưa cấu hình có mặc định hợp lý, để việc triển khai tính năng không phá vỡ báo giá đang chạy của các Tenant hiện hữu.

#### Acceptance Criteria

1. WHERE một Tenant chưa có Cờ_Năng_Lực tường minh cho một Phương_Pháp_In, THE Hệ_Thống SHALL áp dụng một giá trị mặc định tương thích ngược cho Phương_Pháp_In đó đối với Tenant_Chưa_Cấu_Hình.
2. THE Hệ_Thống SHALL định nghĩa mặc định tương thích ngược là "bật cả In_Nhanh và Offset" cho Tenant_Chưa_Cấu_Hình, để giữ nguyên hành vi hiện tại (mọi phương pháp khả dụng) làm mốc quyết định.
3. WHERE Tenant được gán một Plan liên kết Cờ_Năng_Lực, THE Hệ_Thống SHALL suy dẫn Cấu_Hình_Năng_Lực_Tenant mặc định từ Plan đó thay vì mặc định tại 2.2.
4. WHEN Super_Admin đặt Cờ_Năng_Lực tường minh cho một Tenant, THE Hệ_Thống SHALL ưu tiên giá trị tường minh đó hơn mọi giá trị mặc định suy dẫn từ Plan hoặc từ mục 2.2.
5. THE Hệ_Thống SHALL phân biệt rõ trạng thái "chưa cấu hình → dùng mặc định" với trạng thái "đã cấu hình tường minh", để việc tính Phương_Pháp_Khả_Dụng là xác định (deterministic) cho mọi Tenant.

### Requirement 3: Phân giải Tenant context thành năng lực ở backend

**User Story:** Là kỹ sư backend, tôi muốn backend tự phân giải Tenant_Context thành Cấu_Hình_Năng_Lực_Tenant, để frontend không thể tự truyền `unitId='default'` mà vượt qua kiểm soát.

#### Acceptance Criteria

1. WHEN một Đường_Tính_Giá được gọi trong phạm vi một Tenant_Context, THE Trình_Phân_Giải_Năng_Lực SHALL xác định tập Phương_Pháp_Khả_Dụng từ `tenantId` của Tenant_Context.
2. THE Hệ_Thống SHALL bỏ qua mọi định danh Đơn_Vị hoặc Tenant do phía client truyền lên khi xác định Phương_Pháp_Khả_Dụng, và SHALL chỉ dùng `tenantId` từ Tenant_Context phía backend.
3. IF một Đường_Tính_Giá được gọi mà không có Tenant_Context hợp lệ, THEN THE Hệ_Thống SHALL từ chối yêu cầu tính giá thay vì mặc định về một Tenant tuỳ ý (fail-closed).
4. WHILE `TENANT_RLS_ENABLED` đang OFF, THE Hệ_Thống SHALL phân giải Phương_Pháp_Khả_Dụng theo Tenant_Context hiện hành và áp dụng hành vi mặc định tương thích ngược tại Requirement 2 cho Tenant_Chưa_Cấu_Hình.
5. WHILE `TENANT_RLS_ENABLED` đang ON, THE Hệ_Thống SHALL đọc Cờ_Năng_Lực qua đường truy vấn tôn trọng RLS theo `tenantId` hiện hành, không đọc chéo sang Tenant khác.

### Requirement 4: Enforce năng lực trên tất cả đường tính giá

**User Story:** Là chủ hệ SaaS, tôi muốn mọi đường tính giá đều siết theo năng lực của Tenant, để không tồn tại lỗ hổng cho phép tính giá bằng phương pháp mà Tenant không được cấp.

#### Acceptance Criteria

1. WHEN một request tính giá đến `POST /pricing/calculate`, THE Hệ_Thống SHALL suy dẫn Phương_Pháp_In từ Ánh_Xạ_Loại_Phương_Pháp và IF Phương_Pháp_In đó không thuộc tập Phương_Pháp_Khả_Dụng của Tenant hiện hành, THEN THE Hệ_Thống SHALL từ chối tính giá và trả về lỗi báo phương pháp không khả dụng cho Tenant.
2. WHEN một request tính giá đến `POST /pricing/offset/calculate`, IF Offset không thuộc tập Phương_Pháp_Khả_Dụng của Tenant hiện hành, THEN THE Hệ_Thống SHALL từ chối tính giá và trả về lỗi báo phương pháp không khả dụng cho Tenant.
3. WHEN một request tính giá đến `POST /quote/pricing-calc` (mini), THE Hệ_Thống SHALL suy dẫn Phương_Pháp_In từ Ánh_Xạ_Loại_Phương_Pháp và IF Phương_Pháp_In đó không thuộc tập Phương_Pháp_Khả_Dụng của Tenant hiện hành, THEN THE Hệ_Thống SHALL từ chối tính giá và trả về lỗi báo phương pháp không khả dụng cho Tenant.
4. WHEN chatbot gọi `calculateFromParsed` với một request đã phân giải, THE Hệ_Thống SHALL suy dẫn Phương_Pháp_In từ Ánh_Xạ_Loại_Phương_Pháp và IF Phương_Pháp_In đó không thuộc tập Phương_Pháp_Khả_Dụng của Tenant hiện hành, THEN THE Hệ_Thống SHALL trả về thông báo báo-giá-thủ-công (manual-quote) rõ ràng thay vì một con số giá.
5. THE Hệ_Thống SHALL giữ nguyên hành vi enforcement hiện có của `/quote-tool/calculate` (403), `/quote-tool/methods` (lọc) và `/quote-tool/compare` (lọc) khi chuyển từ phạm vi Đơn_Vị sang phạm vi Tenant.
6. THE Hệ_Thống SHALL áp dụng cùng một định nghĩa Phương_Pháp_Khả_Dụng theo Tenant cho tất cả Đường_Tính_Giá, sao cho một Phương_Pháp_In bị tắt cho Tenant thì bị chặn nhất quán ở mọi đường.
7. WHEN Hệ_Thống từ chối một request vì phương pháp không khả dụng, THE Hệ_Thống SHALL nêu rõ Phương_Pháp_In bị chặn và không tiết lộ cấu hình của Tenant khác.

### Requirement 5: Ánh xạ Loại sản phẩm ↔ Phương pháp in

**User Story:** Là kỹ sư backend, tôi muốn có ánh xạ xác định giữa Loại_Sản_Phẩm và Phương_Pháp_In, để mỗi request tính giá được quy về đúng một phương pháp trước khi kiểm năng lực.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL ánh xạ mỗi Loại_Sản_Phẩm digital `{loose, bound, large_format}` tới Phương_Pháp_In In_Nhanh.
2. THE Hệ_Thống SHALL ánh xạ mỗi Loại_Sản_Phẩm offset `{to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay}` tới Phương_Pháp_In Offset.
3. WHEN một request tính giá xác định được Loại_Sản_Phẩm, THE Ánh_Xạ_Loại_Phương_Pháp SHALL trả về đúng một Phương_Pháp_In cho Loại_Sản_Phẩm đó.
4. IF một request tính giá mang Loại_Sản_Phẩm không nằm trong tập ánh xạ đã biết, THEN THE Hệ_Thống SHALL từ chối request với lỗi mô tả loại sản phẩm không được nhận dạng, thay vì đoán phương pháp.
5. THE Hệ_Thống SHALL giữ Ánh_Xạ_Loại_Phương_Pháp là nguồn sự thật duy nhất được mọi Đường_Tính_Giá dùng để suy dẫn Phương_Pháp_In.

### Requirement 6: Quản trị năng lực Tenant

**User Story:** Là Super_Admin, tôi muốn quản lý Cờ_Năng_Lực cho từng Tenant từ màn hình quản trị, để cấp/thu hồi phương pháp mà không cần sửa cơ sở dữ liệu thủ công.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cho Super_Admin xem tập Cờ_Năng_Lực hiện hành của một Tenant.
2. WHEN Super_Admin bật hoặc tắt một Cờ_Năng_Lực của một Tenant, THE Hệ_Thống SHALL lưu trạng thái mới và áp dụng cho các lần tính giá kế tiếp của Tenant đó.
3. IF Super_Admin cố tắt Cờ_Năng_Lực của Phương_Pháp_In cuối cùng đang bật của một Tenant đã có ít nhất một Phương_Pháp_Khả_Dụng, THEN THE Hệ_Thống SHALL từ chối thao tác và thông báo Lỗi_Method_Cuối qua HTTP 409.
4. WHERE Super_Admin liên kết một Plan với một tập Cờ_Năng_Lực, THE Hệ_Thống SHALL cho phép gán Plan đó cho Tenant để suy dẫn Cấu_Hình_Năng_Lực_Tenant mặc định theo Requirement 2.3.
5. WHERE Admin_Tenant được cấp quyền quản trị năng lực trong phạm vi Tenant của mình, THE Hệ_Thống SHALL giới hạn thao tác của Admin_Tenant chỉ trong Cờ_Năng_Lực của chính Tenant đó.
6. WHEN một thao tác quản trị năng lực bị từ chối, THE Hệ_Thống SHALL giữ nguyên trạng thái Cờ_Năng_Lực trước thao tác đó.

### Requirement 7: Migration an toàn, idempotent, tương thích ngược

**User Story:** Là kỹ sư vận hành, tôi muốn migration đưa `tenant_id` vào cơ chế năng lực một cách an toàn và có thể chạy lại, để triển khai không làm mất dữ liệu và không phá hành vi hiện tại.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cung cấp migration đưa phạm vi Tenant vào cơ chế `method_capabilities` mà không xoá dữ liệu Cờ_Năng_Lực hiện có.
2. WHEN migration được chạy nhiều lần, THE Hệ_Thống SHALL cho kết quả giống nhau như chạy một lần (idempotent), không tạo bản ghi trùng và không lỗi.
3. WHERE tồn tại cấu hình Đơn_Vị `'default'` trước migration, THE Hệ_Thống SHALL bảo toàn tập Phương_Pháp_Khả_Dụng đó cho các Tenant chưa có cấu hình tường minh, theo mặc định tương thích ngược tại Requirement 2.
4. THE Hệ_Thống SHALL định nghĩa cấu trúc dữ liệu năng lực theo Tenant tương thích với gating RLS, sao cho migration và truy vấn hoạt động đúng cả khi `TENANT_RLS_ENABLED` OFF và khi ON.
5. THE Hệ_Thống SHALL giữ ràng buộc đúng-một-trạng-thái cho mỗi cặp (Tenant, Phương_Pháp_In) ở tầng lưu trữ.

### Requirement 8: Bảo toàn số học giá và bất biến VAT

**User Story:** Là Admin, tôi muốn tính năng phân quyền năng lực không làm thay đổi bất kỳ con số giá hay VAT nào, để báo giá đang đúng vẫn đúng sau khi triển khai.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL giới hạn tính năng này ở việc cổng (gate) truy cập Phương_Pháp_In, và SHALL không thay đổi công thức hay số học tính giá của bất kỳ engine nào.
2. THE Hệ_Thống SHALL giữ engine giá VAT-exclusive và áp VAT đúng một lần ở tầng báo giá theo bất biến VAT (audit-rules §7), không đưa cấu hình năng lực Tenant thành một nguồn VAT.
3. WHEN một Phương_Pháp_In đang khả dụng cho Tenant, THE Hệ_Thống SHALL trả về Giá khớp với hành vi trước khi có tính năng này cho cùng đầu vào, trong dung sai bằng không cho các trường hợp được Golden_Test khoá.
4. IF một thay đổi thuộc tính năng này làm một Golden_Test hoặc property test giá thất bại ngoài dự kiến, THEN THE Hệ_Thống SHALL coi thay đổi đó là chưa đạt và không đưa vào nhánh phát hành cho tới khi được giải trình.

### Requirement 9: Frontend phản ánh năng lực theo Tenant

**User Story:** Là NV_Báo_Giá của một Tenant chỉ dùng In_Nhanh, tôi muốn giao diện chỉ hiển thị phần In_Nhanh, để không bị rối bởi phần Offset không dùng tới.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL mở rộng `useEnabledMethods` để lấy tập Phương_Pháp_Khả_Dụng theo Tenant hiện hành thay vì theo Đơn_Vị `'default'`.
2. WHILE một Phương_Pháp_In không thuộc tập Phương_Pháp_Khả_Dụng của Tenant hiện hành, THE Hệ_Thống SHALL ẩn các mục menu, route và tab dành riêng cho Phương_Pháp_In đó khỏi giao diện của Tenant đó.
3. IF frontend không lấy được tập Phương_Pháp_Khả_Dụng của Tenant, THEN THE Hệ_Thống SHALL hiển thị theo hướng fail-open ở UI (không ẩn nhầm chức năng), trong khi backend vẫn enforce fail-closed theo Requirement 4.
4. WHEN tập Phương_Pháp_Khả_Dụng của Tenant thay đổi, THE Hệ_Thống SHALL cập nhật menu/route/tab suy dẫn cho các lần điều hướng kế tiếp của Tenant đó.

### Requirement 10: Xử lý các ca biên

**User Story:** Là kỹ sư, tôi muốn hành vi xác định cho các ca biên năng lực Tenant, để hệ không rơi vào trạng thái mơ hồ hay rò rỉ giữa các Tenant.

#### Acceptance Criteria

1. WHERE một Tenant có 0 Phương_Pháp_Khả_Dụng, THE Hệ_Thống SHALL cho Tenant tồn tại ở trạng thái đó và SHALL từ chối mọi request tính giá của Tenant đó với lỗi báo không có Phương_Pháp_Khả_Dụng.
2. IF một request quy về một Phương_Pháp_In chưa được đăng ký plugin trong hệ, THEN THE Hệ_Thống SHALL từ chối request với lỗi báo phương pháp không được hỗ trợ, tách bạch với lỗi phương pháp bị tắt cho Tenant.
3. IF một Tenant chỉ bật In_Nhanh nhận một request quy về Offset, THEN THE Hệ_Thống SHALL từ chối request đó với lỗi báo Offset không khả dụng cho Tenant.
4. IF một Tenant chỉ bật Offset nhận một request quy về In_Nhanh, THEN THE Hệ_Thống SHALL từ chối request đó với lỗi báo In_Nhanh không khả dụng cho Tenant.
5. WHILE `TENANT_RLS_ENABLED` OFF, THE Hệ_Thống SHALL enforce năng lực theo Tenant_Context hiện hành mà không phụ thuộc vào RLS ở tầng cơ sở dữ liệu.
6. WHILE `TENANT_RLS_ENABLED` ON, THE Hệ_Thống SHALL enforce năng lực theo Tenant và SHALL không để một Tenant đọc hay chịu ảnh hưởng bởi Cờ_Năng_Lực của Tenant khác.
