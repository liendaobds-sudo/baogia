# Requirements Document

## Introduction

ZeplaoPrint sẽ cho thuê dạng **tenant** (mỗi xưởng in là một tổ chức/tenant). Hiện hệ thống đã có khung multi-tenant (entity `Tenant` với cột `schema_name`, `TenantGuard`, `@TenantId()`, `TenantSchemaMiddleware`, super-admin + gói cước + thanh toán + impersonation) **NHƯNG cô lập dữ liệu đang TẮT**:

- `TenantSchemaMiddleware` bị comment trong `app.module.ts` ("single schema public after DB consolidation").
- TypeORM chạy cố định `schema: 'public'`, `synchronize: false`.
- Các entity nghiệp vụ (quote, conversation, message, product, zalo account...) **không có cột `tenant_id`**.
- Hệ quả: **mọi tenant dùng chung dữ liệu trong schema `public`** — không có biên giới cô lập. Chỉ vài bảng (users, rbac, payments) lọc `tenantId` thủ công.

Mục tiêu: bật cô lập dữ liệu **đáng tin cậy, phòng-thủ-nhiều-lớp**, để mỗi tenant chỉ thấy/sửa dữ liệu của mình — kể cả khi code quên lọc, kể cả ở đường chạy nền (BullMQ worker, cron, socket.io, phiên zca-js).

## Phạm vi

- **Trong phạm vi**: cô lập dữ liệu trong MỘT deployment dùng chung (1 DB Postgres) bằng `tenant_id` + Row-Level Security (RLS) + context truyền tenant xuyên request/worker.
- **Ngoài phạm vi**: mô hình BYO-Database / self-hosted mỗi tenant một DB riêng (topology triển khai khác, tách spec riêng); thanh toán/gói cước (đã có).

## Glossary

- **Tenant / Org**: một xưởng in thuê hệ thống; biên giới cô lập dữ liệu, khoá là `tenants.id`.
- **Tenant context**: bộ `(tenantId, userId, role)` mang theo suốt một request HTTP hoặc một job nền.
- **RLS**: Row-Level Security của PostgreSQL — chính sách lọc hàng theo `tenant_id` ở tầng DB.
- **Super admin**: tài khoản vận hành toàn hệ thống, được phép truy cập xuyên tenant có kiểm soát (impersonation).
- **Đường chạy nền**: BullMQ worker, cron (@Cron), socket.io handler, listener zca-js — KHÔNG đi qua HTTP middleware.

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
1. WHEN suite test chạy THEN toàn bộ test hiện có (710) SHALL vẫn pass.
2. THE hệ thống SHALL có test cô lập: tenant A KHÔNG đọc/sửa được bản ghi của tenant B qua API, qua truy vấn trực tiếp khi thiếu context, và qua đường nền.
3. WHEN một entity org-scoped mới được thêm sau này THEN SHALL có cơ chế/lint/test nhắc gắn `tenant_id` + policy RLS (chống bỏ sót).
4. THE thay đổi giá/engine báo giá SHALL giữ nguyên (zero-tolerance) — cô lập tenant không được đổi kết quả tính giá của cùng một input trong cùng tenant.
