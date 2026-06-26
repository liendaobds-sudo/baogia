# Design — Cô lập dữ liệu Tenant

## Overview

Spec này bật cô lập dữ liệu tenant đáng tin cậy cho ZeplaoPrint (mô hình cho thuê) trong một deployment dùng chung 1 Postgres, bằng **shared-schema + cột `tenant_id` + Row-Level Security (RLS)** kết hợp **tenant context (AsyncLocalStorage)** truyền xuyên request và đường chạy nền. Hạ tầng tenant sẵn có (`Tenant`, `TenantGuard`, super-admin, impersonation) được tận dụng; `TenantSchemaMiddleware` (search_path) bị thay thế.

## Architecture

### Quyết định kiến trúc

### 1.1 Mô hình cô lập: Shared-schema + `tenant_id` + RLS (KHÔNG dùng schema-per-tenant)

Đã từng có hướng **schema-per-tenant** (`TenantSchemaMiddleware` đặt `search_path`) nhưng bị tắt sau "DB consolidation". Spec này **chọn shared-schema + cột `tenant_id` + Postgres RLS**, vì:

| Tiêu chí | Schema-per-tenant (search_path) | Shared-schema + tenant_id + RLS (chọn) |
|---|---|---|
| Đường chạy nền (worker/cron/socket/zca-js) | ❌ Không qua HTTP middleware → dễ dùng nhầm schema `public` | ✅ Context qua AsyncLocalStorage + `SET LOCAL` trong transaction |
| Connection pool | ❌ `search_path` rò rỉ giữa request khi tái dùng connection | ✅ `SET LOCAL` chỉ sống trong transaction |
| Provision tenant mới | ❌ Phải clone toàn bộ DDL ~50 bảng mỗi tenant + migrate N schema | ✅ Chỉ INSERT 1 dòng `tenants` |
| Phòng thủ khi code quên lọc | ❌ Không có lớp DB chặn | ✅ RLS chặn ở tầng DB (mặc-định-đóng) |
| Migration sau này | ❌ ×N schema | ✅ ×1 |

→ Lý do chính: **đường chạy nền** (BullMQ/cron/socket/zca-js) và **connection pool** làm `search_path` không an toàn; RLS + context là chuẩn công nghiệp cho SaaS đơn-DB.

### 1.2 Hai trụ cột
1. **Tenant Context (AsyncLocalStorage)** — mang `(tenantId, userId, role)` xuyên request & job nền, không truyền tay.
2. **RLS (Postgres)** — policy `tenant_id = current_setting('app.current_tenant')::int` trên mọi bảng org-scoped; là lớp phòng thủ cuối cùng (không phụ thuộc code nhớ lọc).

### 1.3 Tận dụng hạ tầng sẵn có
- Giữ `Tenant` entity, `TenantGuard`, `@TenantId()`, super-admin, impersonation.
- **Gỡ bỏ/đóng băng** `TenantSchemaMiddleware` (search_path) — thay bằng context + RLS.
- Giữ TypeORM `schema: 'public'`, `synchronize: false`; migration thủ công qua SQL (đúng quy ước dự án).

## 2. Sơ đồ luồng

```
HTTP:   JwtStrategy → TenantContextInterceptor.enterWith({tenantId,userId,role})
                         │
                         ▼
        Handler/Service → tenantTransaction(): BEGIN; SET LOCAL app.current_tenant=<id>; ...; COMMIT
                         │                                   │
                         ▼                                   ▼
                  TypeORM query  ───────────────────►  Postgres RLS lọc theo app.current_tenant

Nền:    BullMQ/cron/socket/zca-js → withTenant(tenantId, fn) → (như trên)
```

## Components and Interfaces

### 3.1 `TenantContextService` (mới) — `shared/tenant/`
- Bọc `AsyncLocalStorage<TenantContext>`.
- API: `enter(ctx)`, `get()`, `require()` (fail-loud nếu thiếu), `withTenant(tenantId, fn, opts)`, `runSystem(fn)` (bypass có kiểm soát).
- `TenantContext = { tenantId: number; userId: string; role: string; bypass?: boolean }`.

### 3.2 `TenantContextInterceptor` / middleware (HTTP)
- Sau JWT: đọc `req.user.tenantId` (+ impersonation `x-tenant-id` cho super_admin) → `enter(ctx)`.
- Thay thế vai trò cũ của `TenantSchemaMiddleware`.

### 3.3 `tenantTransaction(dataSource, fn)` (mới)
- Mở 1 transaction, chạy `SET LOCAL app.current_tenant = $tenantId` (và `app.bypass='on'` khi runSystem), rồi chạy `fn` với `EntityManager` của tx.
- Mọi service org-scoped đọc/ghi qua helper này (hoặc qua một TypeORM subscriber/`DataSource` wrapper áp `SET LOCAL` đầu mỗi transaction).
- Bypass mù bị cấm: chỉ `runSystem()` mới set cờ bypass, và policy RLS phải kiểm `app.bypass`.

## Data Models

### 3.4 Migration RLS (SQL, theo giai đoạn)
- Pha A (additive): thêm cột `tenant_id INTEGER` + index cho mỗi bảng org-scoped; backfill = tenant gốc; chưa NOT NULL, chưa enable RLS.
- Pha B (enforce): `ALTER TABLE ... ALTER COLUMN tenant_id SET NOT NULL`; `ENABLE ROW LEVEL SECURITY`; tạo policy:
  ```sql
  CREATE POLICY tenant_isolation ON <table> USING (
    current_setting('app.bypass', true) = 'on'
    OR tenant_id = current_setting('app.current_tenant', true)::int
  );
  ```
  `FORCE ROW LEVEL SECURITY` để chủ bảng cũng bị áp.
- Mặc-định-đóng: thiếu `app.current_tenant` → `current_setting(...,true)` trả NULL → so sánh sai → 0 hàng.

### Phân loại bảng (Task 4 — kiểm kê từ `src/entities/index.ts`)

**Org-scoped — CẦN `tenant_id` + RLS** (dữ liệu vận hành riêng từng xưởng in):

- *Hội thoại/CSKH*: `channels`, `contacts`, `conversations`, `messages`, `conversation_participants`, `internal_notes`, `follow_ups`, `notifications`, `canned_responses`, `audit_log`.
- *AI/KB*: `ai_suggestions`, `ai_conversations`, `kb_documents`, `kb_chunks`.
- *Báo giá/khách*: `quotes`, `quote_items`, `quote_versions`, `quote_rules`, `quick_prices`, `customers`, `customer_interactions`, `customer_price_groups`.
- *Giá & catalog theo xưởng*: `pricing_config`, `materials`, `paper_sizes`, `pricing_tiers`, `processing_pricing`, `large_format_pricing`, `production_cost_config`, `production_costs`, `setup_fees`.
- *Sản phẩm*: `products`, `product_categories`, `product_quote_configs`, `product_ai_fields`, `unified_products`, `unified_product_categories`.
- *Offset*: `offset_machine_configs`, `plate_pricing`, `waste_rules`, `method_capabilities`.
- *Kho*: `inventory_slips`, `inventory_slip_items`.
- *Cấu hình xưởng*: `site_settings`.
- *Zalo cá nhân* (module zalo-personal, ngoài index này): `zalo_accounts`, + các bảng phiên/auto-reply/quick-message liên quan → cần `tenant_id`.

**Global / nền tảng — KHÔNG RLS** (hoặc `tenant_id NULL` = bản ghi dùng chung):

- `tenants`, `subscription_plans`, `payments` (billing nền tảng — super-admin quản lý), `system_settings`.
- `users` (đã có `tenantId`; cross-tenant qua super_admin), `roles`/`role_permissions` (role hệ thống `tenant_id NULL` = template chung; role tuỳ biến = per-tenant).

**Cần CHỐT với chủ dự án (taxonomy dùng chung hay tách theo xưởng?):**

- `material_types`, `print_types`, `units` — taxonomy/enum tham chiếu. Đề xuất: **GLOBAL dùng chung** (tránh nhân bản, các xưởng dùng cùng hệ phân loại); giá/tồn thực tế nằm ở `materials`/`pricing_tiers` đã là org-scoped. Nếu muốn mỗi xưởng tự định nghĩa loại riêng → chuyển sang org-scoped.

> Lưu ý vận hành: bảng org-scoped hiện CHƯA có cột `tenant_id` (data đang ở `public` dùng chung). Task 5 thêm cột + backfill về **tenant gốc** (tenant đầu tiên/đang dùng) trước khi NOT NULL.

## 4. Tầng thời-gian-thực & nền (điểm dễ rò rỉ nhất)

### 4.1 zca-js (Zalo cá nhân)
- Mỗi `zalo_account` thuộc 1 tenant. Listener nhận tin → tra `tenantId` của account → `withTenant(tenantId, () => processInbound(...))`.
- Pool phiên giữ map `accountId → tenantId` để mọi callback nền có context.

### 4.2 socket.io
- Khi client kết nối: join room `tenant:<tenantId>` (lấy từ JWT).
- Mọi `emit` nghiệp vụ phát tới `tenant:<tenantId>` thay vì broadcast toàn cục.

### 4.3 BullMQ / cron
- Job payload mang `tenantId`; consumer bọc `withTenant`.
- Cron quét nhiều tenant: lặp từng tenant, mỗi vòng `withTenant`.

### 4.4 Cache & storage
- Khoá cache (giá/KB/master) thêm tiền tố `t<tenantId>:`.
- Media path/khoá thêm phân vùng theo tenant (`media/<tenantId>/...`).

## 5. Super admin / impersonation
- Route quản trị đánh dấu `@AllowCrossTenant()` → interceptor cho `runSystem()` hoặc set tenant theo `x-tenant-id`.
- Impersonation: super_admin + `x-tenant-id` → context.tenantId = header → RLS giới hạn đúng tenant đó (không bypass).
- Ghi `audit_log` mỗi lần impersonate.

## 6. Chiến lược triển khai theo giai đoạn (an toàn, không sập)
1. **G0 — Context only**: thêm `TenantContextService` + interceptor + `withTenant` ở các đường nền. Chưa RLS. Không đổi hành vi.
2. **G1 — Schema additive**: thêm `tenant_id` + backfill tenant gốc (nullable). Đọc/ghi gắn tenant_id qua context. Vẫn chưa enforce RLS.
3. **G2 — Enforce RLS**: NOT NULL + ENABLE/FORCE RLS + policy + `SET LOCAL` trong `tenantTransaction`. Bật trên môi trường staging trước.
4. **G3 — Realtime/nền/cache/storage**: socket room, zca-js context, cache key, media path.
5. **G4 — Test cô lập + chống bỏ sót** + tài liệu vận hành.

→ Mỗi giai đoạn build + 710 test pass trước khi sang giai đoạn sau.

## 7. Rủi ro & giảm thiểu
- **Quên `tenant_id` ở INSERT** → RLS WITH CHECK chặn ghi sai tenant; test cô lập bắt lỗi.
- **Đường nền thiếu context** → `require()` fail-loud + log; thêm test cho từng loại job.
- **Connection pool rò context** → dùng `SET LOCAL` trong transaction (tự reset cuối tx), KHÔNG `SET` session-level.
- **Hồi quy giá** → giữ engine/payload builder bất biến; chạy lại bộ test giá sau mỗi giai đoạn.
- **Migration mất dữ liệu** → additive-only + backfill + backup trước G2.

## 8. Ngoài phạm vi (ghi nhận)
- BYO-Database mỗi tenant (DB riêng) — topology khác, spec riêng.
- Mã hoá dữ liệu tại tầng nghỉ theo tenant; phân vùng vật lý.

## Correctness Properties

### Property 1: Cô lập đọc
Với mọi tenant A≠B, truy vấn trong context A KHÔNG bao giờ trả hàng có `tenant_id = B`.
**Validates: Requirements 1.1, 3.1, 3.3**

### Property 2: Cô lập ghi
INSERT/UPDATE trong context A KHÔNG thể đặt `tenant_id = B` (RLS WITH CHECK chặn).
**Validates: Requirements 1.1, 3.1**

### Property 3: Mặc-định-đóng
Thiếu `app.current_tenant` ⇒ bảng org-scoped trả 0 hàng (không hở dữ liệu toàn cục).
**Validates: Requirements 2.3, 3.3**

### Property 4: Bất biến giá
Cùng một input báo giá trong cùng tenant ⇒ cùng `grand_total` như trước khi bật cô lập (zero-tolerance).
**Validates: Requirements 6.4**

### Property 5: Bypass tường minh
Chỉ `runSystem()` mới qua được RLS; mọi bypass đều có audit/log.
**Validates: Requirements 2.4, 3.4, 5.3**

## Error Handling

- **Thiếu context (đường nền)**: `require()` ném lỗi rõ ràng + log; job thất bại có thể retry sau khi bọc `withTenant`. Không âm thầm chạy ở `public`.
- **INSERT sai tenant**: RLS WITH CHECK trả lỗi DB; service map sang 403/422 với thông báo rõ.
- **search_path/`SET LOCAL` lỗi**: transaction rollback; không commit dữ liệu ngoài cô lập.
- **Impersonation không hợp lệ**: thiếu quyền super_admin hoặc tenant bị suspend ⇒ 403.
- **Migration**: chạy trong transaction; lỗi ⇒ rollback; có backup trước G2 để khôi phục.

## Testing Strategy

- **Unit**: `TenantContextService` (require fail-loud, withTenant lồng nhau, runSystem bypass).
- **Integration (RLS)**: seed 2 tenant, xác minh P1–P3 qua repository thật trên Postgres test; INSERT chéo bị chặn.
- **API e2e**: tenant A gọi API không thấy bản ghi tenant B; super_admin impersonate giới hạn đúng tenant.
- **Background**: giả lập listener zca-js/cron/job thiếu context ⇒ fail-loud; có context ⇒ gắn đúng `tenant_id`.
- **Regression**: chạy lại toàn bộ 710 test + bộ test giá (quote-flow, pricing-advanced, vat) xác nhận P4.
