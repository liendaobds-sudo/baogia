---
name: zeplao-data-tenancy
description: "Làm việc với PostgreSQL/TypeORM và cô lập tenant ZeplaoPrint: schema snapshot, patch ledger, TenantContext, SET LOCAL, RLS, RBAC, app-scope, method capability, cache, queue, cron và WebSocket. Dùng khi thêm entity/query/migration hoặc sửa dữ liệu/quyền theo tenant. Không tự áp thay đổi lên DB thật."
---

# Dữ liệu và tenant ZeplaoPrint

Kiến trúc đích là shared schema public + tenant_id + PostgreSQL RLS; không dùng schema-per-tenant.

## Ba lớp phải khớp

1. Application context: JWT/request hoặc job payload xác định tenant và quyền/bypass.
2. Transaction context: repository chạy trên connection được bọc và SET LOCAL app.current_tenant trong transaction.
3. Database enforcement: policy RLS tồn tại và app role là NOSUPERUSER, không BYPASSRLS.

backend/src/main.ts có preflight đọc role và policy trước listen, nhưng cờ `TENANT_RLS_ENABLED=true` không tự chứng minh RLS đang cưỡng chế. Hiện preflight dừng khi role là SUPERUSER/BYPASSRLS hoặc không truy vấn được trạng thái; trường hợp không có policy và DB không phải PostgreSQL còn có nhánh chỉ log rồi tiếp tục. Trước khi tuyên bố cô lập thật, phải kiểm role, policy đúng bảng, FORCE/RLS state, tenant context trên connection thực và negative test A/B.

## Biên thường bị bỏ sót

- Cron/scheduler và BullMQ: đọc references/background-jobs.md. Job mới phải inject `TenantContextService` bắt buộc; không sao chép pattern `@Optional` hoặc dựa vào nhánh pass-through khi RLS bật mà thiếu context.
- BullMQ/callback: payload phải mang tenant; chia transaction DB ngắn khỏi AI/network chậm và dùng tenant scope ở từng đoạn DB.
- Socket.IO: dữ liệu tổ chức phải emit với tenantId tường minh vào room tenant. `EventsGateway` hiện có thể fallback global khi thiếu tenantId, kể cả lúc cờ RLS bật, nên caller mới phải fail-closed trước seam này.
- Cache/memory singleton: key gồm tenant; invalidation không làm tenant này nhận dữ liệu tenant khác.
- Super admin: bypass tường minh, transaction/query runner riêng và quyền route đã kiểm.
- Auto-KB/memory/learning: không đưa dữ liệu thiếu tenant vào pool dùng chung.

## Baseline và scope

Một số bảng có hàng tenant_id IS NULL làm baseline dùng chung, như method_capabilities và tenant_app_scopes. Chúng có policy đọc/ghi đặc biệt; không đưa vào loop SET NOT NULL hay trigger auto-fill chung.

Phân biệt:

- app-scope: trục cskh/baogia;
- method capability: digital/offset;
- RBAC permission;
- resource scope;
- RLS data isolation.

Các gate này không được thay đổi số học pricing. Frontend chỉ phản ánh trạng thái; backend/DB cưỡng chế.

## Raw SQL và entity

- Production là PostgreSQL, synchronize false.
- Dùng parameter $1...; allowlist identifier động; quote cột camelCase trong raw SQL.
- Kiểu is_active của bảng legacy có cả boolean và smallint; kiểm schema/entity trước khi so sánh.
- DTO class + class-validator tại input mạng; interface TypeScript không tạo runtime validation.
- Entity là nguồn mô hình, nhưng DB mới được dựng bằng snapshot + patch ledger; không giả định migration TypeORM legacy là đường production.

Đọc references/rls-migrations.md trước mọi patch, backfill, index, flip/rollback RLS hoặc thay entity.

Đọc references/background-jobs.md khi thêm/sửa cron, scheduler, BullMQ processor, callback nền hoặc WebSocket emit từ job.

## Kiểm chứng

Test tối thiểu A/B:

- A chỉ đọc/ghi dữ liệu A; B không thấy.
- Ghi tenant sai bị chặn.
- Thiếu context fail theo thiết kế, không rơi vào tenant mặc định nguy hiểm.
- Baseline đọc được nhưng tenant không ghi baseline.
- Bypass chỉ hoạt động ở đường đã cho phép.
- Flag RLS tắt giữ tương thích khi spec yêu cầu.
- Cache, queue, cron và WebSocket giữ tenant.

RLS thật phải chạy trên PostgreSQL bằng role NOSUPERUSER như job rls-e2e trong CI; SQLite/mock/superuser không chứng minh policy hoạt động.
