# Implementation Plan — tenant-app-scope

> ⚠️ **SỔ SÁCH TRÔI — audit 2026-08-29.** Toàn bộ 31 checkbox dưới đây đang để trống nhưng phần
> lớn công việc **ĐÃ CÓ TRONG CODE**. Bằng chứng đã xác minh:
> - Task 1.1: `backend/db/2026-07-02_tenant_app_scope.sql` tồn tại và được CI job `rls-e2e` áp.
> - Task 1.2: `backend/src/entities/tenant-app-scope.entity.ts` tồn tại.
> - Resolver + guard: `backend/src/common/app-scope/app-scope.service.ts`,
>   `cskh-scope.guard.ts` (fail-closed khi không phân giải được tenant), `app-scope.controller.ts`;
>   `AppScopeModule` là `@Global`.
> - RLS: Pha B có khối policy riêng `app_scope_read` / `app_scope_write` cho baseline `tenant_id IS NULL`.
> - Guard đã gắn ở conversations / messages / contacts / suggestions / kb / test-chat / chat-media /
>   canned-responses; **`MediaController` mới được bổ sung `CskhScopeGuard` trong đợt audit này**
>   (trước đó thiếu, đúng như task 42 của spec yêu cầu).
>
> 👉 Cần **rà từng task và tick lại** (không tick hàng loạt). Đừng dùng số checkbox của spec này
> làm thước đo tiến độ — nó không phản ánh trạng thái code.

## Overview

Gate Trục **CSKH** theo tenant (Báo_Giá luôn bật, không tắt được), theo mẫu baseline-inheritance đã kiểm chứng của `tenant-method-capability`. Backend enforce fail-closed qua Guard + hook nền; frontend fail-open ẩn menu. KHÔNG đổi logic nghiệp vụ/số học giá. Thứ tự: bảng + entity → resolver → guard/enforce → admin → frontend → isolation → hồi quy.

## Tasks

- [ ] 1. Bảng + entity `tenant_app_scopes`
  - [ ] 1.1 Migration `backend/db/2026-07-02_tenant_app_scope.sql`
    - Tạo bảng `tenant_app_scopes(id, tenant_id INTEGER NULL, app_key VARCHAR(30), enabled BOOLEAN DEFAULT true, updated_at)`; seed baseline `(NULL, 'cskh', true)` idempotent (INSERT ... WHERE NOT EXISTS); 2 partial unique index (baseline theo `app_key` WHERE tenant_id IS NULL; theo tenant `(tenant_id, app_key)` WHERE tenant_id IS NOT NULL). KHÔNG backfill tenant. PostgreSQL, idempotent.
    - _Requirements: 1.1, 2.2, 7.1, 7.2, 7.3, 7.5_
  - [ ] 1.2 Entity `backend/src/entities/tenant-app-scope.entity.ts`
    - `@Entity('tenant_app_scopes')`; cột `tenantId?: number|null` (`tenant_id`), `appKey` (`app_key`), `enabled`, `@UpdateDateColumn updatedAt`. Đăng ký vào entities index.
    - _Requirements: 1.1, 7.5_
  - [ ]* 1.3 Test idempotency + schema migration
    - Chạy migration 2 lần → cùng schema, 1 hàng baseline duy nhất, không lỗi.
    - _Requirements: 7.2, 7.3_

- [ ] 2. `AppScopeService` (resolver + toggle)
  - [ ] 2.1 Resolver tenant-aware
    - `backend/src/common/app-scope/app-scope.service.ts`: `isCskhEnabledForTenant(tenantId|null)`, `resolveEnabledApps()` (đọc tenant từ `TenantContextService`; `baogia` LUÔN có, `cskh` theo cờ), `getScopeForTenant(tenantId)` (trả `{cskh, source}`). Inject `TenantContextService` (`@Optional()`).
    - _Requirements: 1.2, 2.1, 3.1, 3.2_
  - [ ] 2.2 Phân giải xác định + kế thừa baseline
    - Hàng tường minh `(tenant_id,'cskh')` → dùng; không có → baseline `(NULL,'cskh')`=true. Null context → coi CSKH bật (baseline, fail-open). `baogia` bất khả tắt.
    - _Requirements: 1.2, 2.1, 2.5, 3.3_
  - [ ] 2.3 Toggle admin `setCskhForTenant(tenantId, enabled)`
    - Materialize hàng tường minh cho tenant khi set; KHÔNG có ràng buộc "last app" (baogia luôn bật → tắt cskh luôn hợp lệ).
    - _Requirements: 6.2_
  - [ ] 2.4 `AppScopeModule` (Global) export `AppScopeService`
    - TypeOrmModule.forFeature([TenantAppScope]); export service để các module CSKH + super-admin import.
    - _Requirements: 3.1_
  - [ ]* 2.5 Unit test resolver/service
    - explicit off/on; chưa cấu hình → baseline cskh on; baogia luôn trong tập; null context → cskh on; toggle persist.
    - _Requirements: 1.2, 2.2, 2.5, 6.2_

- [ ] 3. Enforcement HTTP — `CskhScopeGuard`
  - [ ] 3.1 Guard `backend/src/common/app-scope/cskh-scope.guard.ts`
    - `canActivate`: non-http → true; null tenant context → true (fail-open); CSKH tắt → `ForbiddenException('Trục CSKH không khả dụng...')`. Chỉ nêu Trục bị chặn.
    - _Requirements: 4.1, 4.5, 4.6_
  - [ ] 3.2 Gắn guard vào controller Trục CSKH
    - `@UseGuards(AuthGuard('jwt'), CskhScopeGuard)` cho: `ConversationsController`, `MessagesController`, `ChatMediaController`, `MediaController`, `ContactsController`, `SuggestionsController`, `TestChatController`, KB controllers (`/kb`,`/knowledge`). KHÔNG gắn `ProductTemplatesController` (bọc dữ liệu Báo_Giá) và mọi route Trục Báo_Giá.
    - _Requirements: 4.1, 4.2, 4.4_
  - [ ]* 3.3 Enforcement integration test
    - tenant CSKH off → `/conversations`,`/suggestions`,`/contacts` trả 403; `/pricing/*`,`/erp/*` KHÔNG bị đụng; tenant CSKH on → pass; null context → pass.
    - _Requirements: 4.1, 4.2, 4.4, 4.6_

- [ ] 4. Enforcement đường chạy nền CSKH
  - [ ] 4.1 Guard mềm trong đường nền
    - `message-processor` (Zalo inbound `processInbound`), `follow-up`, `sla-monitor`: trước khi xử lý cho `tenantId`, kiểm `isCskhEnabledForTenant(tid)`; tắt → log + return (KHÔNG throw). Inject `AppScopeService` `@Optional()`.
    - _Requirements: 4.6, 9.3_
  - [ ]* 4.2 Test đường nền
    - tenant off: inbound bị bỏ qua (không throw, không insert); tenant khác vẫn xử lý bình thường.
    - _Requirements: 9.3_

- [ ] 5. Admin surface (super-admin)
  - [ ] 5.1 Backend endpoints
    - `GET /super-admin/tenants/:id/app-scope` → `{cskh, source}`; `PUT /super-admin/tenants/:id/app-scope/cskh` body `{enabled}` → 200. `@Roles(SUPER_ADMIN)`. KHÔNG có endpoint tắt baogia. Import `AppScopeModule`.
    - _Requirements: 6.1, 6.2, 6.3, 6.6_
  - [ ]* 5.2 Controller test
    - view trả source explicit/inherited; toggle persist; chỉ SUPER_ADMIN; không có route tắt baogia.
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ] 5.3 Frontend management UI
    - Mục "Phạm vi ứng dụng" trên modal tenant `/super-admin` (cạnh "Năng lực"): toggle CSKH, hiện nguồn; Báo_Giá hiện dạng khoá-bật (không toggle).
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 6. Frontend phản ánh phạm vi theo tenant
  - [ ] 6.1 Hook `useEnabledApps`
    - `frontend/src/lib/scope/use-enabled-apps.ts`: gọi endpoint trả `enabledApps` theo tenant token; fail-open (lỗi/đang tải → không ẩn).
    - _Requirements: 5.1, 5.4_
  - [ ] 6.2 Lọc menu theo app-scope
    - Trong IA/`PricingSidebar`: nếu `cskh` không thuộc `enabledApps` → ẩn entry `axis==='cskh'`; `axis==='baogia'|'shared'` luôn hiện. Song song lọc theo role hiện có.
    - _Requirements: 5.2, 5.3, 5.5_
  - [ ] 6.3 Guard route CSKH ở FE
    - Điều hướng trực tiếp tới route CSKH khi tắt → chuyển hướng/hiện "không khả dụng" (giống `guardMethodRoute`).
    - _Requirements: 5.6_
  - [ ]* 6.4 Component test
    - tenant off → menu ẩn entry cskh, giữ baogia; lỗi tải → fail-open (không ẩn).
    - _Requirements: 5.2, 5.3, 5.4_

- [ ] 7. Tenant isolation (RLS) cho `tenant_app_scopes`
  - [ ] 7.1 Policy RLS tách đọc/ghi (Phase B)
    - Thêm khối `tenant_app_scopes` vào `2026-06-26_tenant_phaseB_enable_rls.sql`: `app_scope_read` (SELECT: bypass OR tenant_id IS NULL OR = current), `app_scope_write` (FOR ALL: bypass OR = current). ENABLE/FORCE RLS. KHÔNG đưa vào vòng NOT-NULL/auto-set (baseline NULL). Ghi runbook.
    - _Requirements: 3.4, 3.5, 7.4_
  - [ ]* 7.2 Isolation e2e (gated RLS_E2E=1)
    - tenant A không đọc/bị ảnh hưởng cờ tenant B; baseline (NULL) đọc được bởi mọi tenant; tenant UPDATE baseline → 0 hàng, không lỗi.
    - _Requirements: 3.5, 9.5_

- [ ] 8. Hồi quy + verify
  - [ ] 8.1 tsc + test
    - `npx tsc --noEmit` (backend + frontend) = 0 lỗi. `npx jest app-scope cskh --runInBand` xanh. Chạy lại test CSKH (inbox/messages/suggestions) + giá (offset golden/property) không hồi quy.
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

## Notes

- Task gắn `*` là test (tuỳ chọn cho MVP nhanh); task lõi không gắn `*`.
- Độc lập & trực giao với `tenant-method-capability` — dùng bảng riêng, không đụng `method_capabilities`.
- Baseline `cskh=true` + không backfill → 0 thay đổi hành vi cho tới khi admin tắt.
- Gate ở cấp **controller** (không cấp module) để tránh chặn nhầm `ProductTemplatesController` (dữ liệu Báo_Giá nằm trong suggestions module).

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1.1", "1.2"] },
    { "wave": 2, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "wave": 3, "tasks": ["3.1", "3.2", "4.1", "7.1"] },
    { "wave": 4, "tasks": ["5.1", "5.3", "6.1", "6.2", "6.3"] },
    { "wave": 5, "tasks": ["8.1"] }
  ],
  "dependencies": {
    "1.1": [], "1.2": ["1.1"],
    "2.1": ["1.2"], "2.2": ["2.1"], "2.3": ["2.1"], "2.4": ["2.1"],
    "3.1": ["2.4"], "3.2": ["3.1"], "4.1": ["2.4"], "7.1": ["1.1"],
    "5.1": ["2.4"], "5.3": ["5.1"], "6.1": ["2.4"], "6.2": ["6.1"], "6.3": ["6.1"],
    "8.1": ["3.2", "4.1", "5.1", "5.3", "6.2", "7.1"]
  }
}
```
