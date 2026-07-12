# Requirements Document

## Introduction

Tài liệu này định nghĩa yêu cầu cho tính năng **phân quyền phạm vi ứng dụng theo Tenant (tenant app scope)** của hệ ZeplaoPrint — nền tảng SaaS đa tenant báo giá/CSKH cho ngành in ấn (backend NestJS + TypeORM + PostgreSQL RLS; frontend Next.js).

**Vấn đề gốc (đã xác minh qua khảo sát — coi là ground truth):**

- Hệ chia thành **hai Trục_Ứng_Dụng (App/Axis)**: `baogia` (Báo_Giá/ERP: báo giá, đơn hàng, sản phẩm, giá, kho, khách hàng) và `cskh` (Chăm_Sóc_Khách_Hàng: inbox Zalo, chatbot, knowledge base, ai-suggestions, dashboard CSKH). Định nghĩa tại `frontend/src/lib/scope/scope-registry.json` (`baseline`: `baogia` 8 menu, `cskh` 6 menu) và `frontend/src/lib/scope/types.ts` (`type Axis = 'cskh' | 'baogia' | 'shared' | 'none'`).
- Menu/route frontend hiện lọc theo **vai trò người dùng** qua `axisMatchesApp` (`frontend/src/lib/scope/ia-resolver.ts`), **KHÔNG theo Tenant**. Không có cơ chế bật/tắt cả một Trục_Ứng_Dụng cho một Tenant.
- `subscription_plans.features` (`string[]`, `backend/src/entities/subscription-plan.entity.ts`) tồn tại nhưng **CHỈ để lưu + hiển thị** ở tab "Plans" của Super_Admin — **KHÔNG nơi nào enforce**.
- **Chiều phụ thuộc là MỘT CHIỀU (đã xác minh):** CSKH phụ thuộc Báo_Giá, không ngược lại. Chatbot/ai-suggest gọi sang báo giá (`QuoteService.calculateFromParsed`, `calculateMiniQuote` tại `backend/src/modules/suggestions/ai-suggest.service.ts`). Báo giá/pricing (`backend/src/modules/pricing`, `backend/src/quote`) **KHÔNG import** gì từ `conversations`/`messages`/`inbox`. Do đó tắt CSKH không làm gãy báo giá; tắt báo giá thì gãy cả CSKH.
- Route backend của Trục CSKH (theo `scope-registry.json`): inbox `/conversations`, `/messages`; knowledge-base `/kb`, `/knowledge`; contacts `/contacts`; ai-suggestions `/ai/suggest`. Các module dashboard-CSKH/reports/test-chat chủ yếu là bề mặt frontend.
- Multi-tenant dùng PostgreSQL RLS (`backend/src/common/tenant/*`), gated sau cờ `TENANT_RLS_ENABLED` (mặc định OFF). Tenant context (`tenantId` số, `userId`, `role`) set qua interceptor. Super_Admin (`/super-admin`) quản lý tenants; đã có sẵn pattern gating theo tenant (tính năng `tenant-method-capability`: bảng có `tenant_id` nullable, baseline `tenant_id IS NULL` = mặc định nền, toggle ở super-admin, enforce backend, fail-open UI).

**Mục tiêu:** Cho phép Super_Admin cấp cho mỗi Tenant chỉ Trục Báo_Giá, hoặc cả Báo_Giá + CSKH. Vì Báo_Giá là lõi và CSKH phụ thuộc nó, Báo_Giá **luôn bật** và không thể tắt; chỉ Trục CSKH là tuỳ chọn bật/tắt. Ví dụ: tenant A chỉ dùng Báo_Giá; tenant B dùng cả Báo_Giá và CSKH.

**Nguyên tắc xuyên suốt:**
- **Báo_Giá là lõi bất khả tắt.** Mọi Tenant luôn có Trục Báo_Giá. Chỉ Trục CSKH được bật/tắt.
- **Tương thích ngược:** Tenant chưa cấu hình phải giữ hành vi hiện tại (thấy cả hai Trục), không phá hệ đang chạy.
- **Fail-closed ở backend, fail-open ở UI:** backend là lớp chặn quyền uy tín (route CSKH trả lỗi khi Trục tắt); UI chỉ ẩn menu để bớt rối, và khi chưa tải được cấu hình thì KHÔNG ẩn nhầm.
- **Tôn trọng RLS gating:** truy vấn cấu hình phạm vi theo tenant phải đúng cả khi `TENANT_RLS_ENABLED` OFF và ON.
- **KHÔNG đụng số học giá/VAT** và **KHÔNG đổi logic nghiệp vụ của module** — tính năng này chỉ cổng (gate) truy cập Trục_Ứng_Dụng.
- **Tái dùng pattern đã kiểm chứng** của `tenant-method-capability` (baseline inheritance + toggle super-admin + enforce + fail-open UI) thay vì phát minh cơ chế mới.

Tài liệu này đặc tả **hành vi nghiệp vụ mong muốn** ("what"); chi tiết mô hình dữ liệu, API, ánh xạ code để dành cho giai đoạn Design.

## Glossary

- **Hệ_Thống (System):** Toàn bộ hệ ZeplaoPrint (backend NestJS + frontend Next.js dùng chung).
- **Tenant:** Một tổ chức/khách hàng SaaS trong hệ đa tenant, định danh bằng `tenantId` (số) trong tenant context. Là biên giới cô lập dữ liệu (RLS).
- **Trục_Ứng_Dụng (App / Axis):** Một nhóm module lớn của hệ. Hai Trục hiện có: **Báo_Giá** (`baogia`) và **CSKH** (`cskh`). Ánh xạ theo `axis` trong `scope-registry.json`.
- **Báo_Giá (Trục lõi):** Trục_Ứng_Dụng `baogia` — báo giá, đơn hàng, sản phẩm, giá, kho, khách hàng. Là lõi bắt buộc; CSKH phụ thuộc Báo_Giá. KHÔNG thể tắt.
- **CSKH (Trục tuỳ chọn):** Trục_Ứng_Dụng `cskh` — inbox Zalo, chatbot/ai-suggestions, knowledge base, dashboard CSKH. Phụ thuộc Báo_Giá. Có thể bật/tắt theo Tenant.
- **Cờ_Phạm_Vi (App Scope Flag):** Thiết lập bật/tắt Trục CSKH cho một Tenant. (Báo_Giá luôn bật, không có cờ tắt.)
- **Trục_Khả_Dụng (Enabled App):** Một Trục_Ứng_Dụng đang bật cho Tenant hiện hành.
- **Cấu_Hình_Phạm_Vi_Tenant (Tenant App Scope Config):** Tập Cờ_Phạm_Vi của một Tenant.
- **Tenant_Chưa_Cấu_Hình (Unconfigured Tenant):** Tenant chưa có Cờ_Phạm_Vi tường minh; áp dụng mặc định tương thích ngược (cả hai Trục bật).
- **Route_CSKH:** Các endpoint backend thuộc Trục CSKH: `/conversations`, `/messages`, `/kb`, `/knowledge`, `/contacts`, `/ai/suggest` (và các route CSKH khác nếu phát sinh).
- **Tenant_Context:** Ngữ cảnh `(tenantId, userId, role)` do interceptor set cho mỗi request/job (`common/tenant/*`).
- **Super_Admin:** Vai trò quản trị toàn hệ tại `/super-admin`, quản lý tenants và Plan.
- **Admin_Tenant:** Vai trò quản trị trong phạm vi một Tenant.
- **Plan (Gói dịch vụ):** Gói dịch vụ gán cho Tenant tại tab "Plans" của Super_Admin; có thể liên kết mặc định Cờ_Phạm_Vi.
- **RLS_Enabled:** Trạng thái cờ `TENANT_RLS_ENABLED` (mặc định OFF) bật/tắt row-level security theo tenant.
- **IA (Information Architecture):** Kiến trúc điều hướng frontend (`scope-registry.json` + `ia-resolver.ts`) quyết định menu/route/tab hiển thị.

## Requirements

### Requirement 1: Mô hình phạm vi ứng dụng theo Tenant

**User Story:** Là Super_Admin, tôi muốn cấp cho mỗi Tenant chỉ Trục Báo_Giá hoặc cả Báo_Giá + CSKH, để mỗi Tenant chỉ thấy và dùng đúng phạm vi ứng dụng được cấp.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL lưu trữ một Cờ_Phạm_Vi bật/tắt cho Trục CSKH của mỗi Tenant, với đúng một trạng thái cho mỗi Tenant.
2. THE Hệ_Thống SHALL luôn coi Trục Báo_Giá là khả dụng cho mọi Tenant và SHALL không cung cấp cách tắt Trục Báo_Giá.
3. WHEN Super_Admin bật Cờ_Phạm_Vi CSKH cho một Tenant, THE Hệ_Thống SHALL ghi nhận CSKH là Trục_Khả_Dụng cho Tenant đó.
4. WHEN Super_Admin tắt Cờ_Phạm_Vi CSKH cho một Tenant, THE Hệ_Thống SHALL loại CSKH khỏi tập Trục_Khả_Dụng của Tenant đó, trong khi vẫn giữ Báo_Giá khả dụng.
5. THE Hệ_Thống SHALL gắn Cờ_Phạm_Vi với `tenantId` của Tenant, sao cho Cờ_Phạm_Vi của một Tenant không ảnh hưởng tới tập Trục_Khả_Dụng của Tenant khác.
6. THE Hệ_Thống SHALL hỗ trợ hai cấu hình Tenant: chỉ Báo_Giá, và Báo_Giá + CSKH.

### Requirement 2: Mặc định phạm vi cho Tenant mới (tương thích ngược)

**User Story:** Là Super_Admin, tôi muốn Tenant mới hoặc chưa cấu hình có mặc định hợp lý, để triển khai tính năng không phá vỡ trải nghiệm của các Tenant hiện hữu.

#### Acceptance Criteria

1. WHERE một Tenant chưa có Cờ_Phạm_Vi CSKH tường minh, THE Hệ_Thống SHALL áp dụng giá trị mặc định tương thích ngược cho Tenant_Chưa_Cấu_Hình.
2. THE Hệ_Thống SHALL định nghĩa mặc định tương thích ngược là "CSKH bật" cho Tenant_Chưa_Cấu_Hình, để giữ nguyên hành vi hiện tại (thấy cả hai Trục) làm mốc quyết định.
3. WHERE Tenant được gán một Plan liên kết Cờ_Phạm_Vi, THE Hệ_Thống SHALL suy dẫn Cấu_Hình_Phạm_Vi_Tenant mặc định từ Plan đó thay vì mặc định tại 2.2.
4. WHEN Super_Admin đặt Cờ_Phạm_Vi tường minh cho một Tenant, THE Hệ_Thống SHALL ưu tiên giá trị tường minh đó hơn mọi giá trị mặc định suy dẫn từ Plan hoặc từ mục 2.2.
5. THE Hệ_Thống SHALL phân biệt rõ trạng thái "chưa cấu hình → dùng mặc định" với "đã cấu hình tường minh", để việc tính Trục_Khả_Dụng là xác định (deterministic) cho mọi Tenant.

### Requirement 3: Phân giải Tenant context thành phạm vi ở backend

**User Story:** Là kỹ sư backend, tôi muốn backend tự phân giải Tenant_Context thành Cấu_Hình_Phạm_Vi_Tenant, để frontend không thể tự vượt qua kiểm soát bằng cách gọi thẳng route.

#### Acceptance Criteria

1. WHEN một Route_CSKH được gọi trong phạm vi một Tenant_Context, THE Hệ_Thống SHALL xác định tập Trục_Khả_Dụng từ `tenantId` của Tenant_Context.
2. THE Hệ_Thống SHALL bỏ qua mọi định danh phạm vi do phía client truyền lên khi xác định Trục_Khả_Dụng, và SHALL chỉ dùng `tenantId` từ Tenant_Context phía backend.
3. WHILE `TENANT_RLS_ENABLED` đang OFF, THE Hệ_Thống SHALL phân giải Trục_Khả_Dụng theo Tenant_Context hiện hành và áp dụng mặc định tương thích ngược tại Requirement 2 cho Tenant_Chưa_Cấu_Hình.
4. WHILE `TENANT_RLS_ENABLED` đang ON, THE Hệ_Thống SHALL đọc Cờ_Phạm_Vi qua đường truy vấn tôn trọng RLS theo `tenantId` hiện hành, không đọc chéo sang Tenant khác.
5. THE Hệ_Thống SHALL cho phép đọc cấu hình mặc định nền (baseline) chung cho mọi Tenant chưa cấu hình, kể cả khi RLS bật.

### Requirement 4: Enforce phạm vi trên route CSKH backend

**User Story:** Là chủ hệ SaaS, tôi muốn khi một Tenant không được cấp CSKH thì mọi route CSKH đều bị chặn ở backend, để không tồn tại lỗ hổng truy cập chức năng chưa được cấp.

#### Acceptance Criteria

1. WHEN một request đến một Route_CSKH trong phạm vi một Tenant có CSKH đang tắt, THE Hệ_Thống SHALL từ chối request với lỗi báo Trục CSKH không khả dụng cho Tenant.
2. WHEN một request đến một route thuộc Trục Báo_Giá, THE Hệ_Thống SHALL không áp dụng kiểm tra Cờ_Phạm_Vi CSKH lên request đó (Báo_Giá luôn khả dụng).
3. WHERE chatbot/ai-suggestions phụ thuộc báo giá, THE Hệ_Thống SHALL chỉ chặn nhánh CSKH (điểm vào chatbot/inbox) khi CSKH tắt, và SHALL không chặn các đường tính giá của Trục Báo_Giá mà báo giá tự dùng.
4. THE Hệ_Thống SHALL áp dụng cùng một định nghĩa Trục_Khả_Dụng theo Tenant cho mọi Route_CSKH, sao cho khi CSKH bị tắt thì bị chặn nhất quán ở mọi route CSKH.
5. WHEN Hệ_Thống từ chối một request vì CSKH không khả dụng, THE Hệ_Thống SHALL nêu rõ Trục bị chặn và không tiết lộ cấu hình của Tenant khác.
6. IF một Route_CSKH được gọi bởi một tiến trình nền (không có Tenant_Context người dùng), THEN THE Hệ_Thống SHALL xác định phạm vi theo tenant của công việc nền đó (nếu có) hoặc bỏ qua enforcement một cách an toàn mà không phá tiến trình nền.

### Requirement 5: Frontend phản ánh phạm vi theo Tenant

**User Story:** Là người dùng của một Tenant chỉ dùng Báo_Giá, tôi muốn giao diện chỉ hiển thị phần Báo_Giá, để không bị rối bởi phần CSKH không dùng tới.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cung cấp cho frontend tập Trục_Khả_Dụng theo Tenant hiện hành.
2. WHILE Trục CSKH không thuộc tập Trục_Khả_Dụng của Tenant hiện hành, THE Hệ_Thống SHALL ẩn các mục menu, route và tab thuộc Trục CSKH khỏi giao diện của Tenant đó.
3. THE Hệ_Thống SHALL luôn hiển thị các mục thuộc Trục Báo_Giá bất kể cấu hình CSKH.
4. IF frontend không lấy được tập Trục_Khả_Dụng của Tenant, THEN THE Hệ_Thống SHALL hiển thị theo hướng fail-open ở UI (không ẩn nhầm chức năng), trong khi backend vẫn enforce fail-closed theo Requirement 4.
5. WHEN tập Trục_Khả_Dụng của Tenant thay đổi, THE Hệ_Thống SHALL cập nhật menu/route/tab suy dẫn cho các lần điều hướng kế tiếp của Tenant đó.
6. WHEN người dùng của Tenant chỉ-Báo_Giá điều hướng trực tiếp tới một route CSKH, THE Hệ_Thống SHALL không hiển thị nội dung CSKH mà chuyển hướng hoặc báo không khả dụng phù hợp.

### Requirement 6: Quản trị phạm vi Tenant

**User Story:** Là Super_Admin, tôi muốn quản lý Cờ_Phạm_Vi cho từng Tenant từ màn hình quản trị, để cấp/thu hồi Trục CSKH mà không cần sửa cơ sở dữ liệu thủ công.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cho Super_Admin xem trạng thái Cờ_Phạm_Vi hiện hành (và nguồn: mặc định kế thừa hay tường minh) của một Tenant.
2. WHEN Super_Admin bật hoặc tắt Cờ_Phạm_Vi CSKH của một Tenant, THE Hệ_Thống SHALL lưu trạng thái mới và áp dụng cho các lần truy cập kế tiếp của Tenant đó.
3. THE Hệ_Thống SHALL từ chối mọi thao tác cố tắt Trục Báo_Giá và SHALL không phơi bày thao tác tắt Báo_Giá trên giao diện quản trị.
4. WHERE Super_Admin liên kết một Plan với một Cấu_Hình_Phạm_Vi, THE Hệ_Thống SHALL cho phép gán Plan đó cho Tenant để suy dẫn Cấu_Hình_Phạm_Vi_Tenant mặc định theo Requirement 2.3.
5. WHEN một thao tác quản trị phạm vi bị từ chối, THE Hệ_Thống SHALL giữ nguyên trạng thái Cờ_Phạm_Vi trước thao tác đó.
6. THE Hệ_Thống SHALL giới hạn thao tác quản trị Cờ_Phạm_Vi ở vai trò Super_Admin (không cho Admin_Tenant tự nâng phạm vi của chính Tenant mình).

### Requirement 7: Migration an toàn, idempotent, tương thích ngược

**User Story:** Là kỹ sư vận hành, tôi muốn migration đưa cấu hình phạm vi vào hệ một cách an toàn và có thể chạy lại, để triển khai không mất dữ liệu và không phá hành vi hiện tại.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL cung cấp migration tạo cấu trúc lưu Cờ_Phạm_Vi theo Tenant mà không xoá hay thay đổi dữ liệu module hiện có.
2. WHEN migration được chạy nhiều lần, THE Hệ_Thống SHALL cho kết quả giống chạy một lần (idempotent), không tạo bản ghi trùng và không lỗi.
3. THE Hệ_Thống SHALL để mọi Tenant hiện hữu ở trạng thái Tenant_Chưa_Cấu_Hình sau migration (không backfill cưỡng bức), sao cho tất cả kế thừa mặc định "CSKH bật" theo Requirement 2 → 0 thay đổi hành vi.
4. THE Hệ_Thống SHALL định nghĩa cấu trúc dữ liệu phạm vi theo Tenant tương thích với gating RLS, hoạt động đúng cả khi `TENANT_RLS_ENABLED` OFF và ON, và cho phép hàng baseline (mặc định nền) đọc được bởi mọi Tenant.
5. THE Hệ_Thống SHALL giữ ràng buộc đúng-một-trạng-thái cho Cờ_Phạm_Vi của mỗi Tenant ở tầng lưu trữ.

### Requirement 8: Bảo toàn nghiệp vụ và số học giá

**User Story:** Là Admin, tôi muốn tính năng phạm vi ứng dụng không làm thay đổi bất kỳ logic nghiệp vụ hay con số giá/VAT nào, để hệ đang đúng vẫn đúng sau khi triển khai.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL giới hạn tính năng này ở việc cổng (gate) truy cập Trục_Ứng_Dụng, và SHALL không thay đổi công thức, số học tính giá, hay logic nghiệp vụ của bất kỳ module nào.
2. WHEN Trục CSKH đang khả dụng cho Tenant, THE Hệ_Thống SHALL giữ mọi hành vi CSKH (inbox, chatbot, KB) khớp với trước khi có tính năng này.
3. WHEN Trục Báo_Giá được truy cập, THE Hệ_Thống SHALL trả kết quả khớp với hành vi trước khi có tính năng này cho cùng đầu vào, trong dung sai bằng không cho các trường hợp được Golden_Test khoá.
4. IF một thay đổi thuộc tính năng này làm một test hồi quy (giá hoặc CSKH) thất bại ngoài dự kiến, THEN THE Hệ_Thống SHALL coi thay đổi đó là chưa đạt cho tới khi được giải trình.

### Requirement 9: Xử lý các ca biên

**User Story:** Là kỹ sư, tôi muốn hành vi xác định cho các ca biên phạm vi Tenant, để hệ không rơi vào trạng thái mơ hồ hay rò rỉ giữa các Tenant.

#### Acceptance Criteria

1. WHERE một Tenant chỉ bật Báo_Giá nhận một request tới Route_CSKH, THE Hệ_Thống SHALL từ chối request với lỗi báo CSKH không khả dụng cho Tenant.
2. WHERE một Tenant bật cả hai Trục, THE Hệ_Thống SHALL cho phép truy cập cả Route_CSKH lẫn route Báo_Giá như hành vi hiện tại.
3. IF một tiến trình nền của Trục CSKH (ví dụ xử lý tin nhắn Zalo đến, cron follow-up) chạy cho một Tenant có CSKH tắt, THEN THE Hệ_Thống SHALL xử lý một cách xác định (bỏ qua an toàn hoặc không kích hoạt) mà không phá tiến trình nền của các Tenant khác.
4. WHILE `TENANT_RLS_ENABLED` OFF, THE Hệ_Thống SHALL enforce phạm vi theo Tenant_Context hiện hành mà không phụ thuộc RLS ở tầng cơ sở dữ liệu.
5. WHILE `TENANT_RLS_ENABLED` ON, THE Hệ_Thống SHALL enforce phạm vi theo Tenant và SHALL không để một Tenant đọc hay chịu ảnh hưởng bởi Cờ_Phạm_Vi của Tenant khác.
6. WHERE một module CSKH không có route backend riêng (ví dụ bề mặt chỉ-frontend), THE Hệ_Thống SHALL vẫn ẩn nó khỏi IA của Tenant chỉ-Báo_Giá theo Requirement 5.

## Ghi chú phạm vi (không phải yêu cầu)

- Tính năng này **song song và độc lập** với `tenant-method-capability`: cái kia gate *phương pháp in* (digital/offset) *trong* Trục Báo_Giá; cái này gate *cả Trục CSKH*. Một Tenant có thể vừa chỉ-Báo_Giá (tắt CSKH) vừa chỉ-offset (tắt digital).
- Chiều phụ thuộc một chiều (CSKH → Báo_Giá) là lý do Báo_Giá bất khả tắt. Nếu sau này có Trục thứ ba độc lập, mô hình Cờ_Phạm_Vi có thể mở rộng, nhưng KHÔNG nằm trong phạm vi spec này.
