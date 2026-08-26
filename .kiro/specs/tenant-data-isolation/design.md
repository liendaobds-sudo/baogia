# Design — Cô lập dữ liệu Tenant

## Overview

Spec này bật cô lập dữ liệu tenant đáng tin cậy cho ZeplaoPrint (mô hình cho thuê) trong một deployment dùng chung 1 Postgres, bằng **shared-schema + cột `tenant_id` + Row-Level Security (RLS)** kết hợp **tenant context (AsyncLocalStorage)** truyền xuyên request và đường chạy nền. Hạ tầng tenant sẵn có (`Tenant`, `TenantGuard`, super-admin, impersonation) được tận dụng; `TenantSchemaMiddleware` (search_path) bị thay thế.

> **Cập nhật 2026-07-25** — design này ban đầu viết khi chưa có gì được hiện thực. Phần lớn hạ tầng
> nay ĐÃ XONG; phạm vi còn lại thu hẹp về **bật cờ an toàn**. Xem §0 để biết cái gì đã có,
> và §9–§14 cho phần thiết kế mới (Req 7–12).

## 0. Trạng thái hiện thực (đã xác minh trên code + DB thật, 2026-07-25)

| Hạng mục | Trạng thái | Vị trí thật |
|---|---|---|
| `TenantContextService` (AsyncLocalStorage) | ✅ đã có | `backend/src/common/tenant/tenant-context.service.ts` |
| `TenantContextInterceptor` (nạp context từ JWT + impersonation) | ✅ đã có | `common/tenant/tenant-context.interceptor.ts` |
| `TenantConnectionInterceptor` (mở transaction + `set_config`) | ✅ đã có, **gated** sau `TENANT_RLS_ENABLED` | `common/tenant/tenant-connection.interceptor.ts:31-33` |
| `tenantTransaction()`, `applyTenantToConnection()` | ✅ đã có | `common/tenant/tenant-transaction.ts` |
| `runInTenant()`, `forEachTenant()` (đường nền) | ✅ đã có, gated | `common/tenant/tenant-background.ts` |
| Pha A: cột `tenant_id` + `idx_*_tenant` | ✅ **đã áp** trên DB thật (~60 bảng có index `idx_*_tenant`) | `db/2026-06-26_tenant_phaseA_add_tenant_id.sql` |
| Pha B: NOT NULL + trigger + policy + FORCE RLS | 📝 đã soạn, **chưa chạy**, đã diễn tập trên bản sao | `db/2026-06-26_tenant_phaseB_enable_rls.sql` |
| Role ứng dụng NOSUPERUSER | 📝 đã soạn, **chưa chạy** (app còn nối bằng `postgres`) | `db/2026-06-26_tenant_app_role.sql` |
| Job CI chứng minh cô lập thật | ✅ đã có | `.github/workflows/ci.yml` job `rls-e2e` |
| Cô lập cache giá theo tenant | ✅ đã có (gated) | `QuoteService.masterDataSlotKey`, `EngineOffsetService.cacheKey` |
| Chốt IDOR tin nhắn / ghi chú / WebSocket / RBAC | ✅ đã có | xem §13 |

**Ghi chú vị trí**: design cũ ghi `shared/tenant/` — đường dẫn thật là **`src/common/tenant/`**.

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

### 3.1 `TenantContextService` (✅ ĐÃ HIỆN THỰC) — `src/common/tenant/`
- Bọc `AsyncLocalStorage<TenantContext>`.
- API: `enter(ctx)`, `get()`, `require()` (fail-loud nếu thiếu), `withTenant(tenantId, fn, opts)`, `runSystem(fn)` (bypass có kiểm soát).
- `TenantContext = { tenantId: number; userId: string; role: string; bypass?: boolean }`.

### 3.2 `TenantContextInterceptor` / middleware (HTTP) (✅ ĐÃ HIỆN THỰC)
- Sau JWT: đọc `req.user.tenantId` (+ impersonation `x-tenant-id` cho super_admin) → `enter(ctx)`.
- Thay thế vai trò cũ của `TenantSchemaMiddleware`.

### 3.3 `tenantTransaction(dataSource, fn)` (✅ ĐÃ HIỆN THỰC)
- Mở 1 transaction, chạy `SET LOCAL app.current_tenant = $tenantId` (và `app.bypass='on'` khi runSystem), rồi chạy `fn` với `EntityManager` của tx.
- Mọi service org-scoped đọc/ghi qua helper này (hoặc qua một TypeORM subscriber/`DataSource` wrapper áp `SET LOCAL` đầu mỗi transaction).
- Bypass mù bị cấm: chỉ `runSystem()` mới set cờ bypass, và policy RLS phải kiểm `app.bypass`.

## Data Models

### 3.4 Migration RLS (SQL, theo giai đoạn)
- Pha A (additive): thêm cột `tenant_id INTEGER` + index cho mỗi bảng org-scoped; backfill = tenant gốc; chưa NOT NULL, chưa enable RLS.
- Pha B (enforce): `ALTER TABLE ... ALTER COLUMN tenant_id SET NOT NULL`; trigger `app_set_tenant_id`
  auto-gán khi INSERT; `ENABLE` + `FORCE ROW LEVEL SECURITY`; tạo policy.
- Mặc-định-đóng: thiếu `app.current_tenant` → `current_setting(...,true)` trả NULL → so sánh sai → 0 hàng.

#### Hai khuôn mẫu policy (KHÔNG dùng lẫn)

**Khuôn A — bảng org-scoped thuần** (62 bảng trong `org_tables` của Pha B): một policy `FOR ALL`.

```sql
CREATE POLICY tenant_isolation ON <table>
  USING (current_setting('app.bypass', true) = 'on'
         OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.bypass', true) = 'on'
         OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
```

**Khuôn B — bảng có hàng BASELINE `tenant_id IS NULL`** (`method_capabilities`, `tenant_app_scopes`,
và theo Req 9 thêm `roles`): **TÁCH 2 policy** đọc/ghi, KHÔNG `SET NOT NULL`, KHÔNG gắn trigger auto-set.

```sql
CREATE POLICY <t>_read ON <table> FOR SELECT
  USING (bypass OR tenant_id IS NULL OR tenant_id = current);
CREATE POLICY <t>_write ON <table> FOR ALL
  USING (bypass OR tenant_id = current)
  WITH CHECK (bypass OR tenant_id = current);
```

> **Lý do bắt buộc tách** (đã phát hiện qua dry-run RLS, ghi trong Pha B SQL): nếu gộp một policy
> `FOR ALL` có `tenant_id IS NULL` trong `USING`, thì `UPDATE`/`DELETE` của tenant sẽ **khớp** hàng
> baseline (qua `USING`) rồi bị `WITH CHECK` từ chối ⇒ Postgres **ném lỗi** "row violates row-level
> security policy" thay vì lặng lẽ 0 hàng. Tách ra thì baseline nằm ngoài `USING` của policy ghi ⇒
> UPDATE/DELETE của tenant không đụng baseline (0 hàng, không lỗi). Sửa baseline CHỈ qua bypass.

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

**Global / nền tảng — KHÔNG RLS**:

- `tenants`, `subscription_plans`, `system_settings`, `migrations`, `schema_patches`.
- `users` (đã có `tenantId`, lọc app-level chặt trong `users.service.ts`; cross-tenant qua super_admin).

**ĐẢO QUYẾT ĐỊNH so với bản 2026-06-26 (Req 9)** — 3 bảng dưới trước xếp GLOBAL, nay **vào phạm vi cô lập**:

| Bảng | Khuôn policy | Lý do đảo |
|---|---|---|
| `roles` | **B** (baseline) | Role hệ thống (`is_system`, `tenant_id NULL`) dùng chung; role tuỳ biến per-tenant. Xếp GLOBAL khiến admin tenant A sửa được role của tenant B. |
| `role_permissions` | **A**, tenant suy từ role cha (xem §11) | Bảng chỉ có `role_id` + `permission`; nếu để GLOBAL thì đây là đường ghi chéo tenant thật sự. |
| `payments` | **A** | `payment.entity` đã có `tenant_id NOT NULL`; super-admin đọc cross-tenant qua bypass tường minh. |

**ĐÃ CHỐT (bỏ trạng thái treo)**: `material_types`, `print_types`, `units` — **org-scoped**. Cả 3 đã
nằm trong `org_tables` của Pha B; mỗi xưởng in tự định nghĩa hệ phân loại/đơn vị riêng.

> Lưu ý vận hành (cập nhật): Pha A **đã áp** — mọi bảng org-scoped đã có `tenant_id` (nullable) +
> index. Backfill đã đưa dữ liệu về tenant 1, backfill lần 2 (2026-07-09) vá thêm 3489 hàng.
> Việc còn lại là backfill LẦN CUỐI trong Phiên_Flip (§12) rồi mới `SET NOT NULL`.

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
1. ✅ **G0 — Context only**: `TenantContextService` + interceptor + `runInTenant`/`forEachTenant`. Không đổi hành vi.
2. ✅ **G1 — Schema additive**: `tenant_id` + index + backfill tenant gốc (nullable). ĐÃ ÁP trên DB thật.
3. 📝 **G2 — Enforce RLS**: role NOSUPERUSER → backfill lần cuối → NOT NULL + ENABLE/FORCE RLS + policy → bật cờ. **Đây là phần còn lại**, chi tiết ở §12.
4. 🔶 **G3 — Realtime/nền/cache**: socket room theo tenant + kiểm quyền join (✅ đã có), zca-js context (✅), cache key theo tenant (✅ cho giá/master-data/pricebook offset), media path theo tenant (📝 chưa).
5. 🔶 **G4 — Test cô lập + chống bỏ sót**: `tenant-isolation.e2e.spec.ts` + `rls-coverage.guard.spec.ts` (✅ đã có), Danh_Mục_Sink (📝 chưa — §10).

→ Mỗi giai đoạn phải giữ mốc: backend `npx jest --runInBand` ~**1139 test / 125 suite**, frontend
`npx jest` ~**367 test / 69 suite**, `npx tsc --noEmit` 0 lỗi ở cả hai workspace.

## 7. Rủi ro & giảm thiểu
- **Quên `tenant_id` ở INSERT** → RLS WITH CHECK chặn ghi sai tenant; test cô lập bắt lỗi.
- **Đường nền thiếu context** → `require()` fail-loud + log; thêm test cho từng loại job.
- **Connection pool rò context** → dùng `SET LOCAL` trong transaction (tự reset cuối tx), KHÔNG `SET` session-level.
- **Hồi quy giá** → giữ engine/payload builder bất biến; chạy lại bộ test giá sau mỗi giai đoạn.
- **Migration mất dữ liệu** → additive-only + backfill + backup trước G2.

## 8. Ngoài phạm vi (ghi nhận)
- BYO-Database mỗi tenant (DB riêng) — topology khác, spec riêng.
- Mã hoá dữ liệu tại tầng nghỉ theo tenant; phân vùng vật lý.
- Index hiệu năng + cơ chế ghi sổ patch DB (`db/apply-patches.js`) — spec khác, chỉ tham chiếu.

---

# Thiết kế phần còn lại (Req 7–12)

## 9. Cổng tiền kiểm ba lớp bật RLS (Req 7)

**Vấn đề**: "RLS đang bật" là kết hợp của 3 điều kiện độc lập, và hiện cả 3 đều tắt. Nguy hiểm nhất
là trạng thái **lệch**: bật cờ nhưng DB user vẫn là superuser ⇒ app tưởng đã cô lập, thực tế Postgres
bỏ qua toàn bộ policy.

### 9.1 Hàm thuần quyết định (dễ test, không cần DB)

Đặt tại `backend/src/common/tenant/rls-preflight.ts`:

```ts
export interface RlsPreflightInput {
    flagOn: boolean;          // tenantRlsEnabled()
    isSuperuser: boolean;     // pg_roles.rolsuper của current_user
    canBypassRls: boolean;    // pg_roles.rolbypassrls
    policyCount: number;      // số policy tenant_isolation/*_read/*_write đã có
}
export type RlsPreflightVerdict =
    | { level: 'ok' }
    | { level: 'fatal'; reason: string }   // ⇒ ném lỗi, KHÔNG mở cổng HTTP
    | { level: 'error'; reason: string }   // ⇒ log error mỗi lần boot, vẫn chạy
    | { level: 'info'; reason: string };   // ⇒ cờ tắt: ghi nhận trạng thái
export function evaluateRlsPreflight(i: RlsPreflightInput): RlsPreflightVerdict;
```

Bảng quyết định:

| flagOn | isSuperuser \|\| canBypassRls | policyCount | Kết luận |
|---|---|---|---|
| false | — | — | `info` — RLS chủ động tắt, hành vi như cũ |
| true | **true** | — | **`fatal`** — superuser bỏ qua RLS, cô lập là ảo |
| true | false | 0 | `error` — Pha B chưa áp, chưa có cô lập |
| true | false | > 0 | `ok` |

### 9.2 Nơi gắn trong vòng đời Nest

`main.ts`, **sau** `NestFactory.create` và **trước** `app.listen()` (cùng chỗ với `enableShutdownHooks`).
Lý do không đặt trong `onApplicationBootstrap`: cần chắc chắn chưa nhận request nào trước khi kết luận
`fatal`. Truy vấn tiền kiểm:

```sql
SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
SELECT count(*) FROM pg_policies
 WHERE schemaname = 'public'
   AND policyname IN ('tenant_isolation','mc_read','mc_write','app_scope_read','app_scope_write');
```

Ca biên: truy vấn tiền kiểm lỗi/timeout khi cờ BẬT ⇒ coi là `fatal` (fail-closed) — không cho chạy
trong trạng thái không biết mình có cô lập hay không. Cờ TẮT thì lỗi tiền kiểm chỉ `warn` (không chặn dev).

## 10. Chiến lược wire Sink_Đọc (Req 8)

**Vấn đề**: đường GHI đã wire; đường ĐỌC thì nhiều service gọi `repo.find()` / `dataSource.query()`
ngoài transaction có `app.current_tenant`. Bật RLS ⇒ policy mặc-định-đóng ⇒ **0 hàng** ⇒ trắng dashboard,
trắng dropdown vật tư.

### 10.1 Năm dạng sink và cách xử lý

| Dạng | Ví dụ | Cách wire |
|---|---|---|
| (a) Repository trong request HTTP | `master-data.service.findAllPaperSizes()` | Không cần sửa **nếu** `TenantConnectionInterceptor` đã bọc `runInTransaction` và repo được `typeorm-transactional` vá (đăng ký qua `addTransactionalDataSource` ở `app.module.ts`). Điều kiện: service phải dùng repo đã inject, KHÔNG tự tạo DataSource mới. Xác minh bằng test tích hợp 2 tenant, không bằng suy luận. |
| (b) `dataSource.query()` raw trong request | `pricing-dashboard.service`, `stats.service` | `dataSource.query` chạy trên manager gắn-CLS khi ở trong `runInTransaction` ⇒ thừa hưởng biến phiên. Vẫn phải kiểm bằng test vì đây là điểm dễ vỡ nhất. |
| (c) Tự `createQueryRunner()` | `orders.service`, `materials.service`, `quote-crud` | Gọi `applyTenantToConnection(runner, tenantCtx)` **ngay sau** `startTransaction()`, trước truy vấn đầu tiên. Không tái dùng runner cho tenant khác. |
| (d) Đường nền (cron/BullMQ/zca-js) | `sla-monitor`, `follow-up`, `outbound-message.processor` | `runInTenant(ctx, manager, tenantId, fn)` cho job biết tenant; `forEachTenant` cho cron quét nhiều tenant. Thiếu tenant ⇒ fail-loud (Req 2.3). |
| (e) `Promise.all` nhiều truy vấn | `pricing-facade` gom processing/accessories | Tất cả phải nằm TRONG cùng transaction của request; không `Promise.all` bọc ngoài transaction. |

### 10.2 Danh_Mục_Sink — cấu trúc bắt buộc

Lưu thành mục mới **"Danh mục sink"** trong `backend/db/TENANT-RLS-RUNBOOK.md`:

| Cột | Nội dung |
|---|---|
| `sink` | `file:line` |
| `bảng` | bảng org-scoped bị chạm |
| `dạng` | a / b / c / d / e theo §10.1 |
| `trạng_thái` | `ĐÃ_WIRE` \| `CHƯA_WIRE` \| `KHÔNG_ÁP_DỤNG` |
| `bằng_chứng` | tên test 2-tenant hoặc output smoke |
| `baseline_trước_flip` | số hàng đo được trước flip (để phân biệt "trắng do RLS" vs "vốn rỗng") |

Chỉ `ĐÃ_WIRE` + có `bằng_chứng` mới được tick. Còn ô chưa tick ⇒ **NO-GO**.

Sink phải có mặt tối thiểu: `master-data.service` (paper_sizes, print_types, units, printers,
pricing_tiers), `pricing-dashboard.service`, `stats.service`, `dashboard.service`,
`contacts.controller` (export CSV), `products.service`, `system-settings.service`,
`offset-engine/config-store.service` (42 raw query), `suggestions/*` (ai-memory, ai-learning,
conversation-search, conversation-summary), `rfm-scoring.service`.

### 10.3 `GET /contacts/export/csv`

Hiện `contactRepo.find({ relations:['channel'] })` — full table, không LIMIT, không lọc tenant, build
toàn bộ CSV trong RAM. Thiết kế: lọc tenant + **ngưỡng cứng 50.000 hàng**; vượt ngưỡng ⇒ từ chối kèm
thông báo yêu cầu thu hẹp bộ lọc, **không** trả tệp một phần (tệp thiếu dữ liệu âm thầm nguy hiểm hơn
là lỗi rõ ràng).

> **Đã chốt 50.000** (2026-07-25). Ràng buộc thật không phải nghiệp vụ mà là bộ nhớ: handler build toàn
> bộ CSV thành MỘT chuỗi trong RAM (`rows.map(...).join('\n')`), 50k dòng × ~150 byte ≈ 7,5 MB — an toàn
> cho một request. Ngưỡng này vượt xa quy mô danh bạ của một xưởng in nên không chặn nghiệp vụ thật.
> Nếu sau này cần xuất lớn hơn, hướng đúng là **stream** (`res.write` từng lô + cursor) chứ không phải
> nâng ngưỡng.

## 11. Cô lập phân quyền (Req 9)

### 11.1 Policy cho 3 bảng

- **`roles`** — khuôn B (baseline). `tenant_id` giữ **nullable**: `NULL` = role hệ thống dùng chung
  (`is_system = true`), giá trị = role riêng của tenant. Đọc: baseline + của mình. Ghi: chỉ của mình
  hoặc bypass.
- **`role_permissions`** — bảng chỉ có `role_id` + `permission`, **không có `tenant_id`**. Hai hướng:
  - *Hướng 1 (chọn)*: policy tham chiếu role cha bằng subquery —
    `USING (bypass OR EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND (r.tenant_id IS NULL OR r.tenant_id = current)))`.
    Ưu: không đổi schema, không backfill. Nhược: subquery mỗi hàng — chấp nhận được vì bảng nhỏ và chỉ
    đọc lúc phân giải quyền (đã có cache ở tầng JWT).
  - *Hướng 2 (loại)*: thêm cột `tenant_id` denormalize — nhanh hơn nhưng sinh nguy cơ lệch với role cha.
- **`payments`** — khuôn A. Entity đã `tenant_id NOT NULL` nên không cần backfill. Route billing của
  super-admin đọc qua `app.bypass='on'` tường minh (mẫu có sẵn: `super-admin.service.countTenantRowsBypass`).

### 11.2 Bộ_Phân_Giải_Quyền — đổi từ "theo tên role" sang "theo (tên role, tenant)"

Hiện tại (`jwt.strategy.ts:47-52`, `auth.service.ts` tương tự):

```sql
SELECT rp.permission FROM role_permissions rp
  JOIN roles r ON rp.role_id = r.id
 WHERE LOWER(r.name) = $1              -- ⚠️ mọi tenant dùng chung
```

Thiết kế mới:

```sql
SELECT rp.permission FROM role_permissions rp
  JOIN roles r ON rp.role_id = r.id
 WHERE LOWER(r.name) = $1
   AND (r.tenant_id = $2 OR r.tenant_id IS NULL)   -- role riêng của tenant HOẶC baseline hệ thống
```

Kết quả là **phép hợp** quyền của các hàng khớp (xác định, không phụ thuộc thứ tự). Quy tắc biên:

| Tình huống | Hành vi |
|---|---|
| `admin` / `super_admin` | giữ `['*']` như hiện tại (không truy vấn) |
| user có `tenantId`, có role riêng | dùng role riêng + baseline |
| user có `tenantId`, chỉ có baseline | dùng baseline (không phá tenant chưa cấu hình role) |
| user **không** có `tenantId` và không phải super_admin | `permissions = []` + log `warn` |
| không khớp hàng nào / truy vấn lỗi | `permissions = []` (fail-closed, đã đúng ở code hiện tại) — **cấm** rơi về tra theo tên role |
| token cũ phát hành trước thay đổi | `tenantId` lấy từ **bản ghi user trong DB** (`validateUser`), không từ payload ⇒ áp lọc ngay request đầu, không cần đăng nhập lại |

### 11.3 Ảnh hưởng `rls-coverage.guard.spec.ts`

3 bảng phải được **bỏ khỏi** allowlist `GLOBAL_TABLES` và **có** trong `org_tables`; thêm assertion
"không chồng lấn giữa hai danh sách" để không thể vừa global vừa org-scoped.

## 12. Backfill lần cuối + `SET NOT NULL` an toàn + Phiên_Flip (Req 10, 12)

### 12.1 Thứ tự bắt buộc (không đảo)

```
1. Backup DB (pg_dump) + kiểm dump đọc được
2. DỪNG backend  →  xác nhận 0 kết nối app trong pg_stat_activity (≥60s liên tục)
3. Backfill lần cuối (2026-07-09_backfill_null_tenant.sql, idempotent)
4. Kiểm 0 hàng tenant_id NULL trên org_tables  (loại trừ 2 bảng baseline)
5. Tạo role zeplao_app NOSUPERUSER (chạy bằng postgres)
6. Áp Pha B (1 transaction)
7. Đổi DB_USERNAME/DB_PASSWORD → zeplao_app ;  bật TENANT_RLS_ENABLED=true
8. Khởi động backend → cổng tiền kiểm §9 phải cho verdict `ok`
9. 4 kiểm nhanh cô lập + smoke toàn bộ Danh_Mục_Sink
10. Mở lại cho người dùng
```

**Vì sao bước 2 trước bước 3**: app đang chạy với cờ tắt VẪN sinh hàng `tenant_id` NULL mới — bằng chứng
là bản sao lấy ngay sau backfill 2026-07-09 vẫn có 5 `ai_suggestions` + 11 `messages` NULL mới.

### 12.2 Thời gian khoá khi `SET NOT NULL`

`ALTER TABLE ... SET NOT NULL` cần `ACCESS EXCLUSIVE` và quét toàn bảng để kiểm. Pha B chạy trong **một
transaction** cho 62 bảng ⇒ khoá tích luỹ. Thiết kế: đặt `SET lock_timeout = '5s'` và
`SET statement_timeout = '5min'` cho phiên chạy migration. Vượt ngưỡng ⇒ transaction rollback **toàn bộ**
— đây là hành vi mong muốn: không để một nửa bảng có policy, một nửa không.

### 12.3 Lộ trình gỡ `OR tenant_id IS NULL`

Sau flip, 7 nhóm gỡ độc lập, mỗi nhóm một thay đổi + test cô lập riêng: `orders.service` →
`quote-crud` → `conversations.service` → `customers.service` → `canned-responses` → `notes` → `reports`.
Chỗ nào giữ lại phải có comment nêu lý do + rủi ro + ngày rà soát.

### 12.4 Kịch_Bản_Rollback

```sql
-- Trên toàn danh sách org_tables:
ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON <t>;
-- + mc_read/mc_write, app_scope_read/app_scope_write
-- Rồi: TENANT_RLS_ENABLED=false, đổi lại DB_USERNAME nếu cần, khởi động lại
```

**Nguyên tắc**: nếu đã mở cho người dùng rồi mới phát hiện lỗi ⇒ **chỉ chạy Kịch_Bản_Rollback**, KHÔNG
restore dump (sẽ mất dữ liệu người dùng vừa tạo). Restore dump chỉ dùng khi chưa mở lại truy cập.

## 13. Lưới chống hồi quy các chốt đã có (Req 11)

| Chốt | Vị trí | Bất biến phải giữ |
|---|---|---|
| Cache giá theo tenant | `QuoteService.masterDataSlotKey()`, `priceCache` key, `EngineOffsetService.cacheKey()` | Cờ bật ⇒ khoá `t<id>`; cờ tắt ⇒ khoá `'default'` (byte-for-byte như cũ). TTL: master-data 5 phút, priceCache 10 phút |
| Invalidate cache | `QuoteService.onPricingChanged` (`pricing.changed`) | Xoá **mọi** ô tenant, không chỉ ô hiện hành |
| IDOR tin nhắn | `MessagesService.assertConversationInTenant` — 8 điểm vào: `findByConversation`, `send`, `reactToMessage`, `recallMessage`, `togglePinMessage`, `toggleStarMessage`, `deleteMessageLocal`, `searchMessages` | Ném **404** (không 403) để không tiết lộ tồn tại; không thay đổi dữ liệu trước khi chặn |
| Ghi chú | `NotesController` — list/create/pin/delete lọc qua `conversations.tenant_id` | Ghi chú `scope='global'` KHÔNG vượt biên tenant |
| WebSocket | `events.gateway.canJoinConversation` / `canJoinAccount` | Lỗi tra cứu ⇒ **từ chối** (fail-closed), trả `join_denied` |
| RBAC scope | `RbacService.requireRoleInScope` | Lọc tenant + chặn sửa role hệ thống (trừ super_admin) |
| Chống bỏ sót bảng | `rls-coverage.guard.spec.ts` | Bảng org-scoped mới thiếu policy/khai báo ⇒ test đỏ |

Ca biên chung cho mọi chốt trên: **không có tenant context** hoặc **đường bypass** hoặc **dữ liệu di sản
`tenant_id NULL`** ⇒ KHÔNG chặn (giữ hành vi cũ). Đây là lý do các chốt an toàn để bật trước khi flip.

## 14. Tiêu chí GO/NO-GO (Req 12)

| Nhóm | Bằng chứng bắt buộc |
|---|---|
| CI | Job `rls-e2e` xanh **trên đúng commit sẽ deploy** |
| Typecheck | `npx tsc --noEmit` exit 0 ở cả hai workspace |
| Test | backend ≥1139 pass / 125 suite; frontend ≥367 pass / 69 suite; 0 skip thêm |
| Giá | `offset-price-preservation.golden.spec.ts` + property giá xanh, **diff rỗng** trên tệp golden/tolerance (§8.1 audit-rules) |
| Dữ liệu | 0 hàng `tenant_id` NULL (trừ 2 bảng baseline); backup đã kiểm đọc được |
| Sink | Danh_Mục_Sink 100% `ĐÃ_WIRE` + có bằng chứng |
| Rollback | Kịch_Bản_Rollback đã diễn tập ≤7 ngày trước flip |

4 kiểm nhanh sau flip (chạy bằng `zeplao_app`, cả 4 phải đúng — 1 sai ⇒ rollback trước khi mở lại):
không context ⇒ 0 hàng; context tenant 1 ⇒ đủ dữ liệu (so `baseline_trước_flip`); context tenant 2 ⇒
không thấy dữ liệu tenant 1; INSERT sai `tenant_id` ⇒ bị `WITH CHECK` chặn.

Người ra quyết định GO/NO-GO cuối: chủ dự án. Cửa sổ bảo trì 120 phút; vượt ⇒ rollback và lên lịch lại.

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

### Property 6: Không tồn tại trạng thái "cô lập ảo"
Với mọi tổ hợp `(flagOn, isSuperuser|canBypassRls, policyCount)`, `evaluateRlsPreflight` KHÔNG bao giờ
trả `ok` khi cờ bật mà role bỏ qua được RLS hoặc chưa có policy. Cờ bật + role bỏ qua RLS ⇒ luôn `fatal`.
**Validates: Requirements 7.3, 7.4, 7.5**

### Property 7: Wire đủ ⇔ không trắng dữ liệu
Với mọi sink trong Danh_Mục_Sink có `baseline_trước_flip > 0`, sau flip số hàng trả về trong context
tenant tương ứng vẫn `> 0`. Sink trắng ⇒ tồn tại ô `CHƯA_WIRE` (đối ngẫu: 100% `ĐÃ_WIRE` ⇒ không trắng).
**Validates: Requirements 8.3, 8.6, 8.7**

### Property 8: Quyền không rò qua tên role
Với hai tenant A≠B có role trùng tên nhưng khác tập quyền, tập quyền phân giải cho user của A luôn bằng
(quyền role riêng của A ∪ quyền baseline) và KHÔNG chứa quyền riêng của B. Không khớp ⇒ tập rỗng.
**Validates: Requirements 9.3, 9.4**

### Property 9: Baseline đọc được, không ghi được
Với bảng khuôn B, mọi tenant SELECT thấy hàng `tenant_id IS NULL`; UPDATE/DELETE của tenant lên hàng
baseline trả 0 hàng và KHÔNG ném lỗi RLS.
**Validates: Requirements 9.2, 10.4**

### Property 10: Flip là nguyên tử
Sau Phiên_Flip, hệ thống chỉ ở một trong hai trạng thái: (a) mọi bảng `org_tables` đều có policy + cờ bật,
hoặc (b) không bảng nào có policy + cờ tắt. Không tồn tại trạng thái một phần.
**Validates: Requirements 12.5, 12.9**

### Property 11: Cờ tắt ⇒ bất biến hành vi
Với `TENANT_RLS_ENABLED` không bằng `'true'`, mọi chốt cô lập (cache key, kiểm tenant, join room) cho ra
kết quả giống hệt bản trước đợt vá — mốc test và golden giá không đổi.
**Validates: Requirements 11.1, 11.6, 6.4**

## Error Handling

- **Thiếu context (đường nền)**: `require()` ném lỗi rõ ràng + log; job thất bại có thể retry sau khi bọc `withTenant`. Không âm thầm chạy ở `public`.
- **INSERT sai tenant**: RLS WITH CHECK trả lỗi DB; service map sang 403/422 với thông báo rõ.
- **search_path/`SET LOCAL` lỗi**: transaction rollback; không commit dữ liệu ngoài cô lập.
- **Impersonation không hợp lệ**: thiếu quyền super_admin hoặc tenant bị suspend ⇒ 403.
- **Migration**: chạy trong transaction; lỗi ⇒ rollback; có backup trước G2 để khôi phục.

## Testing Strategy

### Đã có (không được xoá/skip)
- **Unit**: `TenantContextService` (require fail-loud, withTenant lồng nhau, runSystem bypass).
- **Coverage guard**: `rls-coverage.guard.spec.ts` — bảng org-scoped mới thiếu phân loại ⇒ đỏ (P: chống bỏ sót).
- **E2E cô lập** (gated `RLS_E2E=1`): `tenant-isolation.e2e.spec.ts` — chạy thật trong CI job `rls-e2e`
  bằng role NOSUPERUSER, phủ P1–P3 + P9 (baseline `method_capabilities`).
- **Chốt IDOR/WS/RBAC**: spec của `messages`, `notes`, `events.gateway`, `rbac` (xem §13).

### Cần viết mới
| Test | Phủ | Ghi chú |
|---|---|---|
| `rls-preflight.spec.ts` | P6 | Hàm thuần, bảng quyết định 4 nhánh + ca lỗi truy vấn tiền kiểm |
| Integration 2-tenant cho từng nhóm sink §10.2 | P7 | Dùng Postgres thật + role NOSUPERUSER; đây là bằng chứng để tick Danh_Mục_Sink |
| `permissions-resolution.spec.ts` | P8 | 2 tenant role trùng tên; user không tenant; token cũ; truy vấn lỗi ⇒ `[]` |
| Policy `role_permissions` qua subquery role cha | P8, P9 | Trong e2e RLS: tenant A không đọc được quyền role riêng của B |
| Export CSV 2 tenant + vượt ngưỡng | 8.5 | Ngưỡng 50k (chờ xác nhận) |
| Cache 2 tenant (`QuoteService`, `EngineOffsetService`) | P11 | Cờ bật ⇒ tách ô; cờ tắt ⇒ dùng chung ô `'default'` |

### Regression (chạy sau mỗi giai đoạn)
`cd backend && npx tsc --noEmit && npx jest --runInBand` (≥1139 pass / 125 suite) và
`cd frontend && npx tsc --noEmit && npx jest` (≥367 pass / 69 suite) và `npm run build`.
Bộ test giá (`offset-price-preservation.golden`, `vat.property`, `break-even.property`,
`quote-calculate.integration`) xác nhận P4 — **không sửa expected/tolerance** để cho xanh (§8.1 audit-rules).
