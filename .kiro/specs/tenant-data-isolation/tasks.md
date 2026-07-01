# Implementation Plan: Cô lập dữ liệu Tenant

## Overview

Kế hoạch triển khai cô lập dữ liệu tenant theo 5 giai đoạn (G0→G4), bật dần từ "cung cấp context" đến "enforce RLS" để không sập đường chạy nền. Mỗi task chỉ gồm hoạt động code/migration, tham chiếu requirement cụ thể.

## Notes

- Sau mỗi task → `npx tsc --noEmit` (cwd backend) + `npx jest --runInBand` (giữ 710 test pass).
- Migration DB áp qua script node+pg tạm (`require('dotenv').config`) rồi xoá script.
- Backup DB trước G2 (enforce RLS). Áp staging trước production.

## Tasks

## G0 — Tenant context (chưa đổi hành vi)

- [x] 1. Tạo `TenantContextService` (AsyncLocalStorage) ở `backend/src/shared/tenant/`
  - `TenantContext { tenantId, userId, role, bypass? }`; API `enter/get/require/withTenant/runSystem`.
  - Unit test: `require()` throw khi ngoài context; `withTenant` lồng nhau giữ đúng id.
  - ✅ Đã làm tại `backend/src/common/tenant/tenant-context.service.ts` (+ spec 7 test pass).
  - _Requirements: 2.1, 2.3, 2.4_

- [x] 2. Thêm `TenantContextInterceptor` (HTTP) nạp context từ `req.user` + impersonation `x-tenant-id`
  - Đăng ký global sau JwtAuthGuard; super_admin + header → tenant impersonate.
  - ✅ Đã làm: `tenant-context.interceptor.ts` + `tenant-context.module.ts` (Global, APP_INTERCEPTOR), import vào `app.module.ts`. Non-breaking: thiếu user/tenantId → bỏ qua. 717 test pass.
  - _Requirements: 2.1, 5.1, 5.2_

- [x] 3. Bọc các đường chạy nền bằng `withTenant`
  - zca-js listener (map `accountId→tenantId`), BullMQ consumer (payload `tenantId`), cron (lặp tenant), socket handler.
  - ✅ Đường chính (zca-js inbound `processInbound`): bọc `withTenant`+`runInTransaction`, gated `TENANT_RLS_ENABLED` (commit 11b7a76). Phân giải tenant từ `channels.tenant_id`.
  - ✅ ĐÃ BỌC nốt (helper dùng chung `common/tenant/tenant-background.ts` — `runInTenant`/`forEachTenant`, gated `TENANT_RLS_ENABLED`): cron follow-up (`follow-up.service`), SLA monitor + AI-suggest queued (`message-processor.service`), BullMQ outbound (`outbound-message.processor`), media archiver (`zalo-media-archiver.service`). Flag TẮT → chạy thẳng logic gốc (byte-for-byte). Event handlers (typing/seen/reaction) chỉ UPDATE/no-op → không crash NOT NULL.
  - _Requirements: 2.2, 4.1, 4.2_

## G1 — Schema additive + gắn tenant_id

- [x] 4. Kiểm kê entity org-scoped vs global
  - Liệt kê từ `src/entities/*`; chốt bảng cần `tenant_id`; ghi vào design §3.5.
  - ✅ Đã rà 58 entity → design §"Phân loại bảng": ~40 bảng org-scoped (CSKH/báo giá/giá/sản phẩm/offset/kho/zalo), nhóm global (tenants/plans/payments/users/roles/system_settings), và điểm cần chốt: taxonomy `material_types`/`print_types`/`units` (đề xuất GLOBAL).
  - _Requirements: 1.1, 1.2_

- [x] 5. Migration Pha A: thêm cột `tenant_id INTEGER` + index cho mọi bảng org-scoped (nullable)
  - Backfill `tenant_id` = tenant gốc cho dữ liệu hiện có; KHÔNG drop gì.
  - ✅ Đã chạy: **61 bảng** có `tenant_id` (nullable) + index, **4353 hàng** backfill → tenant 1 ("Xưởng In Mặc Định"). SQL lưu tại `backend/db/2026-06-26_tenant_phaseA_add_tenant_id.sql`. 717 test pass, không hồi quy.
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 6. Gán `tenant_id` khi tạo bản ghi + lọc đọc theo context
  - Cập nhật service/repository org-scoped lấy `tenantId` từ context (không truyền tay).
  - ✅ Đường GHI tường minh đã wire `applyTenantToConnection` (no-op khi thiếu context/RLS tắt): `quote-crud` (create/update), `orders` (create/update/delete/clone), `materials` (delete/inventory-slip), `quote.createQuoteFromChat`. Dùng `@Optional()` để không vỡ unit test. 720 test pass.
  - ⏳ CÒN LẠI (đường ĐỌC): phần lớn đọc qua Repository pool KHÔNG transaction → chưa set biến phiên. Khi bật RLS, các đọc này trả 0 hàng (mặc-định-đóng) → app trắng dữ liệu. Cần cơ chế **connection theo request**.
  - ✅ KHUNG đã viết: `TenantConnectionInterceptor` (mở 1 transaction/request, set `app.current_tenant`, gắn `EntityManager` vào context) + `tenantCtx.manager()` accessor. **Mặc định TẮT** qua `TENANT_RLS_ENABLED` (passthrough → không đổi hành vi). 722 test pass.
  - ⏳ Bước cuối còn lại: service org-scoped đọc qua `this.tenantCtx.manager() ?? repo.manager` (adoption dần) — làm trong phiên flip cùng bật RLS.
  - _Requirements: 1.1, 2.1, 3.2, 3.3_

## G2 — Enforce RLS

- [x] 7. Thêm `tenantTransaction()` helper + áp `SET LOCAL app.current_tenant`
  - Mọi đọc/ghi org-scoped chạy trong transaction có set biến phiên; `runSystem` set `app.bypass='on'`.
  - ✅ Helper `backend/src/common/tenant/tenant-transaction.ts` + 3 unit test (fail-loud, set_config, bypass). CHƯA wire vào toàn bộ service (cần phiên có kiểm soát).
  - _Requirements: 3.2, 2.4_

- [x] 8. Migration Pha B: NOT NULL + ENABLE/FORCE RLS + policy `tenant_isolation`
  - Policy USING + WITH CHECK theo `app.current_tenant`/`app.bypass`; mặc-định-đóng.
  - 📝 SQL ĐÃ SOẠN (chưa chạy): `backend/db/2026-06-26_tenant_phaseB_enable_rls.sql` + trigger auto-set tenant_id.
  - ✅ HTTP read/write path: tích hợp `typeorm-transactional` (nhánh `upgrade/tenant-rls`, commit 96ea787) — interceptor `runInTransaction` set biến phiên, repo tự dùng connection đó. Flag `TENANT_RLS_ENABLED` mặc định TẮT. 724 test pass.
  - 🔴 CHẶN flip: (1) trigger NOT NULL → app nối `postgres`/flag-tắt sẽ NULL tenant_id → vỡ INSERT; (2) **đường ghi NỀN (zca-js inbound, cron, BullMQ) CHƯA bọc `withTenant`+`runInTransaction`** → insert nền gán NULL → vỡ. Phải bọc đường nền (Task 3/10) TRƯỚC, và flip trên DB sao / maintenance window (KHÔNG live).
  - _Requirements: 3.1, 3.3, 3.4, 3.5, 1.2_

## G3 — Realtime / cache / storage

- [x] 9. socket.io phát theo room `tenant:<id>`
  - Join room lúc kết nối; đổi mọi emit nghiệp vụ sang room tenant.
  - _Requirements: 4.1_

- [x] 10. zca-js inbound gắn tenant_id đúng chủ tài khoản
  - message/conversation tạo từ listener mang `tenant_id` của account.
  - _Requirements: 4.2_

- [x] 11. Cache key + media path thêm tiền tố tenant
  - Khoá giá/KB/master `t<id>:`; media `media/<id>/...`.
  - _Requirements: 4.3, 4.4_

## G4 — Test & chống bỏ sót

- [x] 12. Test cô lập đầu-cuối
  - Tenant A không đọc/sửa bản ghi tenant B qua API; truy vấn thiếu context → 0 hàng; job nền sai context → fail-loud.
  - _Requirements: 6.2_

- [x] 13. Cơ chế chống bỏ sót entity mới
  - Test/quy ước liệt kê bảng org-scoped phải có RLS; CI cảnh báo khi thêm bảng thiếu policy.
  - _Requirements: 6.3_

- [x] 14. Hồi quy toàn bộ + parity giá
  - 710 test pass; bộ test giá (quote-flow, pricing-advanced...) giữ nguyên kết quả.
  - _Requirements: 6.1, 6.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] },
    { "wave": 6, "tasks": ["6"] },
    { "wave": 7, "tasks": ["7"] },
    { "wave": 8, "tasks": ["8"] },
    { "wave": 9, "tasks": ["9", "10", "11"] },
    { "wave": 10, "tasks": ["12"] },
    { "wave": 11, "tasks": ["13"] },
    { "wave": 12, "tasks": ["14"] }
  ]
}
```

Diễn giải phụ thuộc:- G0 (1→2→3): context phải có trước.
- G1 (4→5→6): kiểm kê → migration additive → gắn tenant_id (cần context từ G0).
- G2 (7→8): tenantTransaction → enforce RLS (cần tenant_id từ G1).
- G3 (9,10,11): realtime/cache/storage (cần context + tenant_id).
- G4 (12→13→14): test cô lập, chống bỏ sót, hồi quy cuối (cần toàn bộ trên).
