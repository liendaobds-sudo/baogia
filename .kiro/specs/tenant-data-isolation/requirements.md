# Requirements Document

## Introduction

ZeplaoPrint cho thuê dạng **tenant** (mỗi xưởng in là một tổ chức/tenant). Khung multi-tenant đã có sẵn (entity `Tenant`, `TenantGuard`, `@TenantId()`, super-admin + gói cước + thanh toán + impersonation), và phần lớn hạ tầng cô lập đã dựng xong. **Nhưng cô lập dữ liệu THẬT vẫn chưa có hiệu lực.**

Trạng thái đã xác minh trên code + DB thật (đợt audit 2026-07-25):

- ✅ **Pha A ĐÃ ÁP**: ~60 bảng org-scoped có cột `tenant_id` (nullable) + index `idx_*_tenant` (xác minh trên DB `zeplao_erp`). Backfill đã đưa dữ liệu hiện hữu về tenant 1; backfill lần 2 (2026-07-09) vá 3489 hàng NULL sinh sau Pha A.
- ✅ **Hạ tầng context**: `TenantContextService` (AsyncLocalStorage), `TenantContextInterceptor`, `TenantConnectionInterceptor` (mở `runInTransaction` + `set_config('app.current_tenant')` theo request), helper `tenantTransaction()` / `applyTenantToConnection()`, `runInTenant`/`forEachTenant` cho đường nền.
- ✅ **SQL Pha B đã soạn + đã diễn tập trên bản sao** (`db/2026-06-26_tenant_phaseB_enable_rls.sql`, diễn tập 2026-07-09 trên `zeplao_erp_rls_test` bằng role NOSUPERUSER: mặc-định-đóng, cô lập chéo, WITH CHECK chặn ghi sai tenant, bypass super-admin — tất cả đúng).
- ✅ **Job CI `rls-e2e`** dựng Postgres 16 + role NOSUPERUSER + áp Pha A/B rồi chạy `tenant-isolation.e2e.spec.ts`.
- 🔴 **RLS chưa có hiệu lực, do 3 lớp cùng tắt**:
  1. `TENANT_RLS_ENABLED` **không tồn tại** trong `.env` lẫn `backend/.env` (chỉ có trong `backend/.env.example`) ⇒ `TenantConnectionInterceptor.enabled = false` (`tenant-connection.interceptor.ts:31-33`) ⇒ không mở transaction, không set biến phiên.
  2. `backend/.env` còn `DB_USERNAME=postgres` — **superuser BỎ QUA RLS** kể cả khi policy đã bật; role `zeplao_app` chưa được tạo.
  3. `2026-06-26_tenant_phaseB_enable_rls.sql` **chưa chạy** trên DB thật ⇒ chưa có policy, `tenant_id` chưa NOT NULL.
- 🔴 **Nhiều sink đọc bảng org-scoped chưa được kiểm chứng dưới RLS** (master-data, pricing-dashboard, stats, dashboard CSKH, contacts CSV export, products, system-settings, offset config-store, suggestions/*, rfm-scoring) — flip mà không kiểm sẽ làm trắng dashboard/dropdown vật tư.
- 🔴 **3 bảng tenant-scoped còn nằm NGOÀI Pha B**: `roles`, `role_permissions`, `payments`; và quyền đang được phân giải **theo TÊN role** (`WHERE LOWER(r.name) = $1` tại `jwt.strategy.ts:52-54` và `auth.service.ts:233-235`) ⇒ role cùng tên dùng chung mọi tenant.
- 🔴 **App vẫn sinh hàng `tenant_id IS NULL`** khi cờ tắt, và mọi guard app-level hiện nới lỏng bằng `OR tenant_id IS NULL` (orders, quote-crud, conversations, customers, canned-responses, notes, reports).

**Mục tiêu của spec (đã thu hẹp)**: bật `TENANT_RLS_ENABLED` + Pha B **một cách an toàn** — cô lập dữ liệu thật giữa các tenant mà KHÔNG làm trắng dữ liệu, KHÔNG vỡ tính năng, KHÔNG đổi kết quả tính giá.

## Phạm vi

- **Trong phạm vi**: cô lập dữ liệu trong MỘT deployment dùng chung (1 DB Postgres) bằng `tenant_id` + Row-Level Security (RLS) + context truyền tenant xuyên request/worker; bật cờ RLS an toàn (chuẩn bị, kiểm kê sink, tiêu chí GO, rollback).
- **Ngoài phạm vi**: mô hình BYO-Database / self-hosted mỗi tenant một DB riêng (topology triển khai khác, tách spec riêng); thanh toán/gói cước (đã có); **index hiệu năng và cơ chế ghi sổ patch DB** (`db/apply-patches.js`, `db/2026-07-25_perf_indexes_audit.sql`) — thuộc spec khác, chỉ tham chiếu ở đây.

## Glossary

- **Tenant / Org**: một xưởng in thuê hệ thống; biên giới cô lập dữ liệu, khoá là `tenants.id`.
- **Tenant context**: bộ `(tenantId, userId, role)` mang theo suốt một request HTTP hoặc một job nền.
- **RLS**: Row-Level Security của PostgreSQL — chính sách lọc hàng theo `tenant_id` ở tầng DB.
- **Cờ_RLS**: biến môi trường `TENANT_RLS_ENABLED`; `true` ⇒ `TenantConnectionInterceptor` và các nhánh gated được kích hoạt.
- **Role_Ứng_Dụng**: role Postgres NOSUPERUSER mà app dùng để kết nối (`zeplao_app`), tạo bởi `db/2026-06-26_tenant_app_role.sql`.
- **Pha_A**: migration additive đã áp — thêm `tenant_id` nullable + index cho bảng org-scoped.
- **Pha_B**: migration enforce — `SET NOT NULL` + trigger `app_set_tenant_id` + policy `tenant_isolation` + `ENABLE/FORCE ROW LEVEL SECURITY`.
- **Phiên_Flip**: cửa sổ bảo trì có kiểm soát để tạo Role_Ứng_Dụng, backfill lại, áp Pha_B và bật Cờ_RLS.
- **Sink_Đọc**: điểm cuối thực sự truy vấn bảng org-scoped (repository, query builder, hoặc SQL raw) trên đường chạy live.
- **Danh_Mục_Sink**: bản kiểm kê Sink_Đọc org-scoped kèm trạng thái đã-wire, dùng làm checklist trước Phiên_Flip.
- **Bộ_Phân_Giải_Quyền**: đoạn tra `role_permissions` trong `jwt.strategy.ts` và `auth.service.ts`.
- **Bộ_Kiểm_Phủ_RLS**: test `backend/src/common/tenant/rls-coverage.guard.spec.ts` — chặn bảng org-scoped mới bị bỏ sót policy.
- **Job_CI_RLS**: job `rls-e2e` trong `.github/workflows/ci.yml` — dựng Postgres + Role_Ứng_Dụng NOSUPERUSER + Pha_A/Pha_B rồi chạy `tenant-isolation.e2e.spec.ts`.
- **Kịch_Bản_Rollback**: SQL `DISABLE ROW LEVEL SECURITY` + `DROP POLICY` + tắt Cờ_RLS, mô tả trong `backend/db/TENANT-RLS-RUNBOOK.md`.
- **Super admin**: tài khoản vận hành toàn hệ thống, được phép truy cập xuyên tenant có kiểm soát (impersonation).
- **Đường chạy nền**: BullMQ worker, cron (@Cron), socket.io handler, listener zca-js — KHÔNG đi qua HTTP middleware.
- **Danh_Sách_Org_Tables**: mảng `org_tables` khai trong `db/2026-06-26_tenant_phaseB_enable_rls.sql` — **62 bảng**; Pha_B chạy toàn bộ trong MỘT transaction và `RAISE NOTICE` + bỏ qua bảng không tồn tại trong deployment.
- **Bảng_Baseline**: `method_capabilities` và `tenant_app_scopes` — dùng policy riêng (`mc_read`/`mc_write`, `app_scope_read`/`app_scope_write`), KHÔNG `SET NOT NULL`, KHÔNG trigger auto-set, hàng `tenant_id IS NULL` là mặc-định-nền mọi tenant đọc được.
- **Chủ_Hệ_Thống**: người ra quyết định GO/NO-GO cuối cùng cho Phiên_Flip.
- **Cửa_Sổ_Bảo_Trì**: khoảng thời gian tối đa 120 phút dành cho Phiên_Flip, tính từ lúc dừng Ứng_Dụng_Backend đến lúc mở lại truy cập cho người dùng.
- **Ứng_Dụng_Backend**: tiến trình NestJS trong `backend/` kết nối Postgres bằng `DB_USERNAME`/`DB_PASSWORD` của `backend/.env`.

## Requirements

### Requirement 1: Mọi dữ liệu nghiệp vụ gắn tenant
**User Story:** Là chủ hệ thống cho thuê, tôi muốn mọi bản ghi nghiệp vụ thuộc về đúng một tenant, để không tenant nào đọc/ghi dữ liệu của tenant khác.

#### Acceptance Criteria
1. WHEN một bản ghi nghiệp vụ (quote, quote_item, conversation, message, contact, product, zalo account, appointment, note, suggestion, KB doc/chunk...) được tạo THEN hệ thống SHALL gán `tenant_id` của tenant hiện hành.
2. IF một entity nghiệp vụ chưa có cột `tenant_id` THEN migration SHALL thêm cột `tenant_id` (NOT NULL sau backfill) + index.
3. WHERE dữ liệu hiện hữu trong `public` chưa gắn tenant, THE hệ thống SHALL backfill `tenant_id` về một tenant mặc định (tenant gốc) trước khi bật ràng buộc NOT NULL.
4. WHILE chạy migration, THE hệ thống SHALL KHÔNG drop hay làm mất dữ liệu hiện có (additive-only + backfill).

### Requirement 2: Tenant context xuyên suốt (request + nền)
**User Story:** Là lập trình viên, tôi muốn `tenantId` tự có ở mọi đường chạy (HTTP và nền) mà không phải truyền tay, để không bỏ sót cô lập.

#### Acceptance Criteria
1. WHEN một request HTTP đã xác thực đi vào THEN hệ thống SHALL nạp `(tenantId, userId, role)` vào một tenant context (AsyncLocalStorage) cho toàn bộ vòng đời request.
2. WHEN một job BullMQ/cron/socket/listener zca-js chạy THEN nó SHALL chạy bên trong `withTenant(tenantId, fn)` để có context đúng.
3. IF một truy vấn org-scoped chạy NGOÀI mọi tenant context THEN hệ thống SHALL fail-loud (ném lỗi rõ ràng), KHÔNG âm thầm trả dữ liệu toàn cục.
4. WHERE một job cần chạy cross-tenant hợp lệ (vd dọn rác toàn cục) THE code SHALL dùng cờ bypass tường minh có ghi lý do tại call-site.

### Requirement 3: RLS thực thi ở tầng DB (phòng thủ lớp cuối)
**User Story:** Là chủ hệ thống, tôi muốn DB tự chặn truy cập chéo tenant kể cả khi code quên lọc, để rò rỉ dữ liệu là bất khả thi do lỗi lập trình.

#### Acceptance Criteria
1. WHEN bật RLS THEN mỗi bảng org-scoped SHALL có policy lọc theo `tenant_id = current_setting('app.current_tenant')`.
2. WHEN một transaction bắt đầu trong tenant context THEN hệ thống SHALL `SET LOCAL app.current_tenant` = tenantId hiện hành trên connection của transaction đó.
3. IF `app.current_tenant` chưa set THEN policy RLS SHALL trả về 0 hàng cho bảng org-scoped (mặc định đóng, không hở).
4. WHERE super_admin/impersonation hợp lệ, THE hệ thống SHALL set `app.current_tenant` về tenant được impersonate (không bypass mù).
5. THE việc bật RLS SHALL theo từng giai đoạn (cung cấp context trước → bật enforce sau) để không sập worker khi lật công tắc.

### Requirement 4: Bật lại định tuyến tenant ở mọi tầng
**User Story:** Là chủ hệ thống, tôi muốn tài nguyên thời-gian-thực và file cũng cô lập theo tenant, để chat/thông báo/media không lẫn giữa các tenant.

#### Acceptance Criteria
1. WHEN socket.io phát sự kiện (tin nhắn, suggestion, thông báo) THEN hệ thống SHALL chỉ phát tới room/ănclient thuộc đúng tenant.
2. WHEN một phiên zca-js (Zalo cá nhân) nhận tin THEN message + conversation tạo ra SHALL gắn `tenant_id` của tenant sở hữu tài khoản Zalo đó.
3. WHEN lưu/đọc media (ảnh/file Zalo) THEN đường dẫn/khoá lưu trữ SHALL phân tách theo tenant để không truy cập chéo.
4. WHEN cache theo khoá (giá, KB, master data) THEN khoá cache SHALL bao gồm `tenantId` để không trả dữ liệu tenant khác.

### Requirement 5: Super admin & impersonation an toàn
**User Story:** Là super admin, tôi muốn xem/hỗ trợ tenant cụ thể có kiểm soát, để vận hành mà không phá cô lập.

#### Acceptance Criteria
1. WHEN super_admin gọi API quản trị THEN hệ thống SHALL cho phép cross-tenant CHỈ trên các route quản trị được đánh dấu.
2. WHEN super_admin impersonate một tenant (header `x-tenant-id` / token impersonation) THEN mọi truy vấn trong request đó SHALL bị giới hạn về tenant được impersonate.
3. WHEN một hành động impersonation diễn ra THEN hệ thống SHALL ghi audit log (ai, tenant nào, khi nào).

### Requirement 6: Không hồi quy & có kiểm thử
**User Story:** Là lập trình viên, tôi muốn bật cô lập tenant mà không vỡ tính năng hiện có và có test bảo chứng, để yên tâm triển khai.

#### Acceptance Criteria
1. WHEN suite test chạy THEN toàn bộ test hiện có SHALL vẫn pass ở mức bằng hoặc cao hơn mốc hiện tại: backend ~1139 test / 125 suite (`cd backend && npx jest --runInBand`) và frontend ~367 test / 69 suite (`cd frontend && npx jest`); kết quả thấp hơn mốc SHALL được truy nguyên từng test mất/skip trước khi kết luận không hồi quy.
2. THE hệ thống SHALL có test cô lập: tenant A KHÔNG đọc/sửa được bản ghi của tenant B qua API, qua truy vấn trực tiếp khi thiếu context, và qua đường nền.
3. WHEN một entity org-scoped mới được thêm sau này THEN SHALL có cơ chế/lint/test nhắc gắn `tenant_id` + policy RLS (chống bỏ sót).
4. THE thay đổi giá/engine báo giá SHALL giữ nguyên (zero-tolerance) — cô lập tenant không được đổi kết quả tính giá của cùng một input trong cùng tenant.

### Requirement 7: Ba lớp bật RLS phải cùng bật, và không bao giờ bật lệch
**User Story:** Là người vận hành, tôi muốn RLS chỉ được coi là "đang bật" khi cả cờ ứng dụng, role DB và policy DB đều đúng, để không rơi vào trạng thái tưởng đã cô lập mà thực tế không có hiệu lực.

#### Acceptance Criteria
1. THE Cờ_RLS SHALL tồn tại tường minh trong tệp cấu hình môi trường của backend với giá trị `false` cho tới Phiên_Flip (xác minh: `Select-String -Path backend/.env -Pattern 'TENANT_RLS_ENABLED'` trả về đúng 1 dòng).
2. WHEN Phiên_Flip chuẩn bị bắt đầu, THE người vận hành SHALL tạo Role_Ứng_Dụng NOSUPERUSER bằng `db/2026-06-26_tenant_app_role.sql` và đổi `DB_USERNAME`/`DB_PASSWORD` sang Role_Ứng_Dụng (xác minh: `SELECT rolname, rolsuper FROM pg_roles WHERE rolname = 'zeplao_app'` trả `rolsuper = false`).
3. IF Cờ_RLS bằng `true` trong khi kết nối DB dùng role có `rolsuper = true`, THEN THE Ứng_Dụng_Backend SHALL fail-fast lúc khởi động với thông báo nêu rõ superuser bỏ qua RLS (xác minh: unit test khởi động với `TENANT_RLS_ENABLED=true` + role superuser giả lập ⇒ ném lỗi).
4. IF Cờ_RLS bằng `true` trong khi Pha_B chưa áp (không tồn tại policy `tenant_isolation` trên `quotes`), THEN THE Ứng_Dụng_Backend SHALL ghi log cảnh báo mức `error` nêu rõ RLS chưa có hiệu lực (xác minh: `SELECT count(*) FROM pg_policies WHERE policyname = 'tenant_isolation'` = 0 + kiểm log lúc boot).
5. WHEN Pha_B đã áp xong, THE người vận hành SHALL xác nhận cả 3 lớp cùng bật bằng 3 bằng chứng: Cờ_RLS = `true`, `rolsuper = false`, và `pg_policies` có policy `tenant_isolation` trên toàn bộ bảng trong danh sách `org_tables` của Pha_B.
6. THE tài liệu `backend/db/TENANT-RLS-RUNBOOK.md` SHALL ghi thứ tự 3 lớp trên và trạng thái thực tế sau Phiên_Flip (artifact: mục "Trạng thái hiện tại" được cập nhật kèm ngày).

### Requirement 8: Kiểm kê và wire mọi Sink_Đọc org-scoped trước khi flip
**User Story:** Là chủ hệ thống, tôi muốn mọi điểm truy vấn dữ liệu org-scoped đều đã được kiểm chứng dưới RLS trước khi flip, để bật cô lập không làm trắng dashboard, dropdown vật tư hay báo cáo.

#### Acceptance Criteria
1. THE Danh_Mục_Sink SHALL liệt kê từng Sink_Đọc bảng org-scoped kèm `file:line`, cách truy vấn (repository / query builder / SQL raw / `createQueryRunner`) và trạng thái wire (artifact: mục "Danh mục sink" trong `backend/db/TENANT-RLS-RUNBOOK.md`).
2. THE Danh_Mục_Sink SHALL bao gồm tối thiểu các sink đã xác minh còn thiếu wire: `pricing/services/master-data.service.ts` (paper_sizes, print_types, units, printers, pricing_tiers), `pricing/services/pricing-dashboard.service.ts`, `pricing/services/stats.service.ts`, `dashboard/dashboard.service.ts`, `contacts/contacts.controller.ts` (`GET /contacts/export/csv`), `pricing/services/products.service.ts`, `pricing/services/system-settings.service.ts`, `pricing/services/offset-engine/config-store.service.ts`, `pricing/services/suggestions/*` (ai-memory, ai-learning, conversation-search, conversation-summary), `pricing/services/rfm-scoring.service.ts`.
3. WHEN một Sink_Đọc chạy trên đường HTTP, THE Sink_Đọc SHALL đọc qua connection có `app.current_tenant` (do `TenantConnectionInterceptor` mở) hoặc qua lọc tenant tường minh (xác minh: test cho mỗi nhóm sink, chạy trong context tenant A ⇒ chỉ trả hàng của A).
4. WHERE một Sink_Đọc tự mở `createQueryRunner()` hoặc dùng `dataSource.query` ngoài request context, THE Sink_Đọc SHALL gọi `applyTenantToConnection()` trên cùng connection trước truy vấn đầu tiên (xác minh: grep `createQueryRunner` trong `backend/src` — mỗi kết quả trên đường org-scoped có `applyTenantToConnection` kèm theo).
5. WHEN `GET /contacts/export/csv` được gọi, THE Ứng_Dụng_Backend SHALL chỉ xuất contact của tenant hiện hành và SHALL áp giới hạn tối đa **50.000 hàng** cho một lần xuất (đã chốt 2026-07-25; lý do bộ nhớ ở design §10.3); vượt ngưỡng ⇒ từ chối kèm thông báo thu hẹp bộ lọc, KHÔNG trả tệp một phần (xác minh: test 2 tenant ⇒ CSV của A không chứa contact của B; test vượt ngưỡng ⇒ phản hồi lỗi, không có nội dung CSV).
6. WHEN Phiên_Flip hoàn tất, THE người vận hành SHALL chạy khói (smoke) từng mục trong Danh_Mục_Sink và ghi kết quả "có dữ liệu / trắng" (artifact: checklist đã tick trong runbook; tiêu chí đạt = không mục nào trắng ngoài dự kiến).
7. IF một Sink_Đọc trong Danh_Mục_Sink chưa được wire và chưa được kiểm chứng, THEN THE người vận hành SHALL hoãn Phiên_Flip (xác minh: checklist còn ô chưa tick ⇒ NO-GO).

### Requirement 9: Cô lập bảng phân quyền và phân giải quyền theo tenant
**User Story:** Là chủ hệ thống, tôi muốn role và quyền của mỗi xưởng in độc lập nhau, để tenant này không thừa hưởng hoặc sửa được quyền của tenant khác.

#### Acceptance Criteria
1. THE Migration_Pha_B SHALL đưa `roles`, `role_permissions`, `payments` vào phạm vi cô lập tenant với chính sách phù hợp cho từng bảng (xác minh: `SELECT tablename FROM pg_policies` chứa 3 bảng này sau khi áp).
2. WHERE `roles` chứa role hệ thống dùng chung, THE Migration_Pha_B SHALL dùng policy dạng baseline (đọc được khi `tenant_id IS NULL`, ghi chỉ khi `tenant_id` khớp hoặc `app.bypass = 'on'`) theo cùng khuôn mẫu `mc_read`/`mc_write` đã dùng cho `method_capabilities`.
3. WHEN Bộ_Phân_Giải_Quyền tra quyền cho một người dùng, THE Bộ_Phân_Giải_Quyền SHALL lọc theo cặp (tên role, `tenant_id` của người dùng) thay vì chỉ theo tên role (xác minh: 2 tenant có role cùng tên khác tập quyền ⇒ mỗi tenant nhận đúng tập quyền của mình; test tại `auth`/`jwt.strategy` spec).
4. IF không tìm thấy role khớp cả tên và tenant, THEN THE Bộ_Phân_Giải_Quyền SHALL trả về tập quyền rỗng (fail-closed) và ghi log mức `warn` (xác minh: unit test với tenant không có role tương ứng ⇒ `permissions = []`).
5. WHEN `payments` được truy vấn từ route quản trị nền tảng, THE Ứng_Dụng_Backend SHALL dùng đường bypass tường minh của super admin (xác minh: test route billing super-admin vẫn trả dữ liệu đủ sau khi bật RLS).
6. WHEN 3 bảng trên chuyển từ nhóm global sang nhóm cô lập, THE Bộ_Kiểm_Phủ_RLS SHALL được cập nhật tương ứng (bỏ khỏi allowlist `GLOBAL_TABLES`) và SHALL pass (xác minh: `npx jest rls-coverage` xanh).

### Requirement 10: Sạch dữ liệu `tenant_id` NULL và lộ trình gỡ nới lỏng
**User Story:** Là người vận hành, tôi muốn không còn hàng `tenant_id` NULL ngay trước khi enforce, và các mệnh đề nới lỏng tạm thời được gỡ theo lộ trình, để cô lập không bị hở dài hạn.

#### Acceptance Criteria
1. WHEN Phiên_Flip bắt đầu, THE người vận hành SHALL dừng Ứng_Dụng_Backend trước khi chạy backfill lần cuối, vì app đang chạy với Cờ_RLS tắt vẫn sinh hàng `tenant_id` NULL mới (bằng chứng: bản sao sau backfill 2026-07-09 vẫn có 5 `ai_suggestions` + 11 `messages` NULL mới).
2. WHEN backfill lần cuối chạy xong, THE người vận hành SHALL xác minh 0 hàng NULL trên mọi bảng org-scoped trước khi áp Pha_B (xác minh: truy vấn tổng hợp `count(*) WHERE tenant_id IS NULL` trên danh sách `org_tables` = 0; artifact: output psql dán vào runbook).
3. IF còn bất kỳ hàng `tenant_id` NULL trên bảng thuộc danh sách `org_tables`, THEN THE người vận hành SHALL hoãn `ALTER COLUMN tenant_id SET NOT NULL` và điều tra nguồn sinh hàng NULL.
4. WHERE bảng có hàng baseline cố ý (`method_capabilities`, `tenant_app_scopes`), THE Migration_Pha_B SHALL giữ `tenant_id` nullable và KHÔNG gắn trigger auto-set (xác minh: `tenant-isolation.e2e.spec.ts` — tenant 2 vẫn thấy hàng baseline).
5. WHEN Pha_B đã áp và Cờ_RLS đã bật, THE Ứng_Dụng_Backend SHALL gỡ mệnh đề `OR tenant_id IS NULL` khỏi các guard app-level (`orders.service`, `quote-crud`, `conversations`, `customers`, `canned-responses`, `notes`, `reports`) theo từng nhóm, mỗi nhóm kèm test cô lập (xác minh: grep `tenant_id IS NULL` trong `backend/src` chỉ còn ở nhánh baseline hợp lệ).
6. WHERE một mệnh đề `OR tenant_id IS NULL` được giữ lại sau flip, THE mã nguồn SHALL ghi chú lý do và rủi ro tại chỗ (artifact: comment tại `file:line` + mục ghi nhận trong runbook).

### Requirement 11: Không hồi quy các hạng mục cô lập đã hoàn thành
**User Story:** Là lập trình viên, tôi muốn những lỗ hổng đã vá trong đợt audit không bị mở lại, để mỗi lần thay đổi sau này không âm thầm phá cô lập.

#### Acceptance Criteria
1. THE cache dữ liệu giá SHALL khoá theo tenant khi Cờ_RLS bật và khoá `'default'` khi Cờ_RLS tắt, tại cả `QuoteService` (master-data cache, priceCache) và `EngineOffsetService` (PricingData cache) (xác minh: test cache 2 tenant ⇒ tenant B không nhận giá trị cache của tenant A).
2. WHEN một API tin nhắn nhận `conversationId`, THE `MessagesService` SHALL kiểm hội thoại thuộc tenant hiện hành trước khi đọc/ghi tại toàn bộ điểm vào đã vá (8 điểm) (xác minh: test IDOR ⇒ tenant B nhận 403/404 với hội thoại của A).
3. WHEN ghi chú global/khách hàng được truy vấn qua `NotesController`, THE Ứng_Dụng_Backend SHALL lọc qua `conversations.tenant_id` (xác minh: test 2 tenant trên `notes` spec).
4. WHEN client gửi `join_conversation` hoặc `join_account`, THE cổng WebSocket SHALL kiểm quyền phía server và SHALL từ chối khi tra cứu lỗi (fail-closed) (xác minh: test gateway với tài nguyên của tenant khác và với lỗi tra cứu giả lập ⇒ không join).
5. WHEN một role được đọc hoặc sửa qua `RbacService.requireRoleInScope`, THE Ứng_Dụng_Backend SHALL lọc theo tenant và SHALL chặn sửa role hệ thống trừ super admin (xác minh: `rbac` spec hiện có vẫn xanh).
6. THE Bộ_Kiểm_Phủ_RLS SHALL fail khi một bảng org-scoped mới thiếu policy hoặc thiếu khai báo global (xác minh: `npx jest rls-coverage` — thêm entity giả lập chưa phân loại ⇒ test đỏ).

### Requirement 12: Tiêu chí nghiệm thu và đường lùi cho Phiên_Flip
**User Story:** Là chủ hệ thống, tôi muốn có tiêu chí GO/NO-GO rõ ràng và một đường lùi đã diễn tập, để quyết định bật cô lập dựa trên bằng chứng chứ không dựa vào cảm giác.

#### Acceptance Criteria
1. WHEN đánh giá GO cho Phiên_Flip, THE người vận hành SHALL yêu cầu Job_CI_RLS xanh trên commit sẽ triển khai, vì job này chứng minh cô lập thật bằng Role_Ứng_Dụng NOSUPERUSER (artifact: link run CI xanh của job `rls-e2e`).
2. WHEN đánh giá GO, THE người vận hành SHALL yêu cầu `npx tsc --noEmit` xanh ở cả hai workspace và suite test đạt mốc tại Requirement 6.1 (artifact: output lệnh thật kèm timestamp).
3. WHEN đánh giá GO, THE người vận hành SHALL yêu cầu golden và property test giá giữ nguyên số (xác minh: `offset-price-preservation.golden.spec.ts` + các property giá xanh, không sửa expected/tolerance — theo `audit-rules.md` §8.1).
4. WHEN Phiên_Flip bắt đầu, THE người vận hành SHALL có bản backup DB tạo trong cùng cửa sổ bảo trì và SHALL ghi lại cách khôi phục (artifact: đường dẫn dump + lệnh restore trong runbook).
5. THE Kịch_Bản_Rollback SHALL được diễn tập trên bản sao DB và SHALL đưa hệ thống về trạng thái phục vụ được: `DISABLE ROW LEVEL SECURITY` + `DROP POLICY` trên toàn danh sách `org_tables`, tắt Cờ_RLS (xác minh: diễn tập trên bản sao ⇒ truy vấn không context trả dữ liệu như trước flip; ghi kết quả vào runbook).
6. IF sau flip một tính năng trên đường chạy chính trả 0 hàng ngoài dự kiến, THEN THE người vận hành SHALL thực thi Kịch_Bản_Rollback trước khi mở lại cho người dùng.
7. WHEN Phiên_Flip kết thúc, THE người vận hành SHALL xác minh cô lập trên DB thật bằng 4 kiểm nhanh: không context ⇒ 0 hàng; context tenant 1 ⇒ đủ dữ liệu; context tenant 2 ⇒ không thấy dữ liệu tenant 1; INSERT sai `tenant_id` ⇒ bị chặn bởi WITH CHECK (artifact: output psql chạy bằng Role_Ứng_Dụng).
8. WHEN Phiên_Flip kết thúc, THE người vận hành SHALL xác minh 2 đường đặc biệt đã sửa trước đó: dashboard super-admin trả số thật của tenant được xem (không phải 0) và log từ chối quyền ghi được `audit_logs.tenant_id` khác NULL (xác minh: gọi 1 route bị 403 bằng user thường rồi truy vấn `audit_logs`).
