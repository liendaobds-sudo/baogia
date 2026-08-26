# Implementation Plan: Cô lập dữ liệu Tenant

## Overview

Kế hoạch triển khai cô lập dữ liệu tenant theo 5 giai đoạn (G0→G4), bật dần từ "cung cấp context" đến "enforce RLS" để không sập đường chạy nền. Mỗi task chỉ gồm hoạt động code/migration, tham chiếu requirement cụ thể.

## Notes

- Sau mỗi task → `cd backend && npx tsc --noEmit -p tsconfig.json && npx jest --runInBand`
  (mốc **≥1139 test / 125 suite**; cập nhật 2026-07-25, trước ghi sai là 710) và với task chạm frontend
  → `cd frontend && npx tsc --noEmit && npx jest` (mốc **≥367 test / 69 suite**).
- Migration DB áp qua `node db/apply-patches.js` (có sổ `schema_patches`); Pha A/B và seed **bị loại**
  khỏi đường tự động có chủ đích → chạy tay trong maintenance window.
- Backup DB trước G2/G8. Áp bản sao trước production.
- Task gắn `*` là tuỳ chọn (test bổ sung) — có thể hoãn cho MVP nhưng KHÔNG hoãn nếu là điều kiện GO.

> **Trạng thái 2026-07-25**: G0–G4 dưới đây đã đóng (với ngoại lệ ghi trong từng task). Phần **thực sự
> còn lại** là G5–G8 — bật cờ an toàn. Task 8 tuy tick `[x]` nhưng chỉ là "SQL đã soạn + đã diễn tập";
> việc CHẠY Pha B nằm ở Task 27.

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
  - ✅ ĐÃ ĐỦ: `TenantConnectionInterceptor` mở 1 `runInTransaction`/request + set `app.current_tenant` trên connection CLS. Nhờ `typeorm-transactional` v0.5.0 **patch cả `dataSource.query`, `manager`, `createQueryBuilder`**, MỌI đọc (repo `.find()`, query builder, raw `dataSource.query`) TỰ đi qua đúng connection đó → RLS lọc đúng tenant, KHÔNG cần sửa từng service. Mặc định TẮT qua `TENANT_RLS_ENABLED`.
  - ✅ ĐÃ KIỂM (dry-run runtime trên DB nháp + role NOSUPERUSER, 4/4 pass): trong `runInTransaction`+`set_config` → repo.find / dataSource.query / queryBuilder đều lọc đúng tenant; NGOÀI transaction → 0 hàng (mặc-định-đóng). Kết luận: KHÔNG còn "adoption dần" — read-path tự wire khi bật flag.
  - ⚠️ Ngoại lệ cần nhớ: đường GHI dùng `createQueryRunner` thủ công (orders/materials/quote-crud/quote.createQuoteFromChat) KHÔNG dùng connection CLS → đã wire tay `applyTenantToConnection` (đã có). Đường nền (cron/BullMQ/zca-js) bọc `runInTenant`/`forEachTenant` (đã có).
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

---

# G5 — Cổng tiền kiểm & khoá chống hồi quy (Req 7, 11)

- [ ] 15. Hàm thuần `evaluateRlsPreflight` + kiểm 3 lớp lúc khởi động
  - [ ] 15.1 Tạo `backend/src/common/tenant/rls-preflight.ts`
    - `RlsPreflightInput { flagOn, isSuperuser, canBypassRls, policyCount }` → verdict
      `ok | fatal | error | info` theo bảng quyết định design §9.1. Thuần, không I/O.
    - _Requirements: 7.3, 7.4, 7.5_
  - [ ]* 15.2 Unit test `rls-preflight.spec.ts`
    - Phủ 4 nhánh bảng quyết định + ca `flagOn && canBypassRls` (không chỉ `isSuperuser`).
    - _Requirements: 7.3, 7.4_
  - [ ] 15.3 Nối vào `main.ts` trước `app.listen()`
    - Truy vấn `pg_roles` (`rolsuper`, `rolbypassrls` của `current_user`) + `pg_policies`
      (đếm `tenant_isolation|mc_read|mc_write|app_scope_read|app_scope_write`); `fatal` ⇒ ném lỗi
      (không mở cổng HTTP); `error` ⇒ `logger.error`; lỗi truy vấn khi cờ BẬT ⇒ coi là `fatal`.
    - Chỉ chạy khi `DB_TYPE=postgres` (bỏ qua nhánh sqlite dev).
    - _Requirements: 7.3, 7.4, 7.5_

- [ ] 16. Khai báo `TENANT_RLS_ENABLED=false` tường minh vào `backend/.env`
  - Hiện biến này KHÔNG tồn tại trong `.env` lẫn `backend/.env` (chỉ có ở `.env.example`) ⇒ trạng thái
    hiện tại là "tắt do vắng mặt", không phải "tắt có chủ đích".
  - _Requirements: 7.1_

- [ ]* 17. Test khoá chống hồi quy cho các chốt đã vá (design §13)
  - Cache 2 tenant (`QuoteService`, `EngineOffsetService`): cờ bật ⇒ tách ô `t<id>`; cờ tắt ⇒ chung ô
    `'default'`; `pricing.changed` xoá MỌI ô.
  - Bổ sung assertion "không chồng lấn `GLOBAL_TABLES` ∩ `org_tables`" vào `rls-coverage.guard.spec.ts`.
  - _Requirements: 11.1, 11.6_

# G6 — Kiểm kê & wire Sink_Đọc (Req 8)

- [ ] 18. Dựng Danh_Mục_Sink trong `backend/db/TENANT-RLS-RUNBOOK.md`
  - Mục mới "Danh mục sink", 6 cột theo design §10.2 (`sink`, `bảng`, `dạng`, `trạng_thái`,
    `bằng_chứng`, `baseline_trước_flip`). Điền tối thiểu danh sách ở Req 8.2.
  - _Requirements: 8.1, 8.2_

- [ ] 19. Wire nhóm master-data (dạng a/b)
  - `master-data.service` (paper_sizes, print_types, units, printers, pricing_tiers) — xác minh đọc đi
    qua connection có `app.current_tenant`; sửa nếu tự tạo DataSource/query ngoài CLS.
  - _Requirements: 8.3_

- [ ] 20. Wire nhóm dashboard/thống kê (dạng b)
  - `pricing-dashboard.service`, `stats.service`, `dashboard.service` — toàn bộ `dataSource.query` raw.
  - Lưu ý: các query này có `.catch(() => [{}])` nuốt lỗi ⇒ khi RLS chặn sẽ hiện 0 chứ không báo lỗi.
    Đổi sang log lỗi để phân biệt "0 thật" với "bị RLS chặn".
  - _Requirements: 8.3, 8.6_

- [ ] 21. Wire nhóm sản phẩm/cấu hình (dạng b/c)
  - `products.service`, `system-settings.service`, `offset-engine/config-store.service` (42 raw query).
  - _Requirements: 8.3, 8.4_

- [ ] 22. Wire nhóm AI/CSKH nền (dạng d)
  - `suggestions/*` (ai-memory, ai-learning, conversation-search, conversation-summary),
    `rfm-scoring.service` — bọc `runInTenant`/`forEachTenant`, fail-loud khi thiếu tenant.
  - _Requirements: 8.3, 2.2, 2.3_

- [ ] 23. Siết `GET /contacts/export/csv`
  - Lọc tenant + ngưỡng cứng **50.000 hàng** (đã chốt 2026-07-25 — xem lý do ở design §10.3); vượt
    ngưỡng ⇒ từ chối kèm thông báo thu hẹp bộ lọc, KHÔNG trả tệp một phần.
  - _Requirements: 8.5_

- [ ]* 24. Test tích hợp 2 tenant cho từng nhóm sink (19–23)
  - Postgres thật + role NOSUPERUSER; context tenant A ⇒ ≥1 hàng của A, 0 hàng của B. Đây là
    `bằng_chứng` để tick Danh_Mục_Sink.
  - _Requirements: 8.3, 8.6, 8.7_

# G7 — Cô lập phân quyền (Req 9)

- [ ] 25. Đổi Bộ_Phân_Giải_Quyền sang cặp (tên role, tenant_id)
  - `jwt.strategy.ts` + `auth.service.ts`: thêm `AND (r.tenant_id = $2 OR r.tenant_id IS NULL)`; giữ
    `['*']` cho admin/super_admin; user không tenant & không super_admin ⇒ `[]` + log `warn`;
    không khớp/lỗi ⇒ `[]` (fail-closed, KHÔNG rơi về tra theo tên).
  - `tenantId` lấy từ bản ghi user (`validateUser`), không từ payload ⇒ token cũ vẫn áp lọc đúng.
  - _Requirements: 9.3, 9.4_

- [ ] 26. Bổ sung policy cho `roles`, `role_permissions`, `payments` vào Pha B SQL
  - `roles`: khuôn B (baseline, giữ nullable, không trigger auto-set).
  - `role_permissions`: khuôn A với subquery role cha (design §11.1 hướng 1).
  - `payments`: khuôn A (entity đã `tenant_id NOT NULL`).
  - Cập nhật `rls-coverage.guard.spec.ts`: bỏ 3 bảng khỏi `GLOBAL_TABLES`.
  - _Requirements: 9.1, 9.2, 9.6_

- [ ]* 27. Test phân quyền + cô lập role
  - 2 tenant role trùng tên khác tập quyền ⇒ mỗi bên đúng của mình; tenant A không đọc được
    `role_permissions` của role riêng tenant B (trong e2e RLS); route billing super-admin vẫn đủ dữ liệu
    qua bypass.
  - _Requirements: 9.3, 9.4, 9.5_

# G8 — Phiên_Flip (Req 10, 12)

- [ ] 28. Chuẩn bị Phiên_Flip
  - Cập nhật runbook: thứ tự 10 bước (design §12.1), `lock_timeout='5s'` + `statement_timeout='5min'`
    cho phiên migration, Kịch_Bản_Rollback, ngưỡng cửa sổ 120 phút.
  - Diễn tập lại Kịch_Bản_Rollback trên bản sao (≤7 ngày trước flip) + ghi kết quả.
  - _Requirements: 12.4, 12.5, 10.9_

- [ ] 29. Cổng GO/NO-GO
  - Thu bằng chứng theo bảng design §14: CI `rls-e2e` xanh trên đúng commit deploy, `tsc` 0 lỗi ×2,
    test đạt mốc, golden giá diff rỗng, Danh_Mục_Sink 100% `ĐÃ_WIRE`, backup đã kiểm đọc được.
  - Còn ô chưa tick ⇒ NO-GO, hoãn flip.
  - _Requirements: 12.1, 12.2, 12.3, 8.7_

- [ ] 30. Thực thi flip (maintenance window)
  - Backup → **dừng backend** → xác nhận 0 kết nối app trong `pg_stat_activity` (≥60s) → backfill lần
    cuối → kiểm 0 hàng `tenant_id` NULL (trừ 2 bảng baseline) → tạo role `zeplao_app` → áp Pha B →
    đổi `DB_USERNAME`/`DB_PASSWORD` + `TENANT_RLS_ENABLED=true` → khởi động (tiền kiểm phải `ok`).
  - Pha B lỗi/vượt ngưỡng khoá ⇒ rollback toàn bộ transaction, KHÔNG bật cờ.
  - _Requirements: 10.1, 10.2, 10.3, 7.2, 7.5, 12.9_

- [ ] 31. Nghiệm thu sau flip
  - 4 kiểm nhanh cô lập bằng `zeplao_app` (không context ⇒ 0 hàng; tenant 1 ⇒ đủ dữ liệu so baseline;
    tenant 2 ⇒ không thấy dữ liệu tenant 1; INSERT sai tenant ⇒ bị `WITH CHECK` chặn).
  - Smoke toàn bộ Danh_Mục_Sink, ghi "có dữ liệu / trắng"; kiểm dashboard super-admin ra số thật và
    `audit_logs.tenant_id` khác NULL khi có 403.
  - Trắng ngoài dự kiến ⇒ chạy Kịch_Bản_Rollback TRƯỚC khi mở lại cho người dùng.
  - _Requirements: 12.7, 12.8, 12.6, 8.6_

- [ ] 32. Gỡ nới lỏng `OR tenant_id IS NULL` sau flip (7 nhóm, mỗi nhóm 1 thay đổi + test)
  - Thứ tự: `orders.service` → `quote-crud` → `conversations.service` → `customers.service` →
    `canned-responses` → `notes` → `reports`. Chỗ giữ lại phải có comment lý do + rủi ro + ngày rà soát.
  - _Requirements: 10.5, 10.6_

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
    { "wave": 12, "tasks": ["14"] },
    { "wave": 13, "tasks": ["15.1", "16", "18"] },
    { "wave": 14, "tasks": ["15.2", "15.3", "17", "19", "20", "21", "22", "23", "25"] },
    { "wave": 15, "tasks": ["24", "26"] },
    { "wave": 16, "tasks": ["27", "28"] },
    { "wave": 17, "tasks": ["29"] },
    { "wave": 18, "tasks": ["30"] },
    { "wave": 19, "tasks": ["31"] },
    { "wave": 20, "tasks": ["32"] }
  ]
}
```

Diễn giải phụ thuộc:
- G0 (1→2→3): context phải có trước.
- G1 (4→5→6): kiểm kê → migration additive → gắn tenant_id (cần context từ G0).
- G2 (7→8): tenantTransaction → soạn SQL enforce RLS (cần tenant_id từ G1).
- G3 (9,10,11): realtime/cache/storage (cần context + tenant_id).
- G4 (12→13→14): test cô lập, chống bỏ sót, hồi quy.
- G5 (15,16,17): tiền kiểm + khai báo cờ + khoá hồi quy — độc lập nhau, làm song song được;
  15.1 phải trước 15.2/15.3.
- G6 (18 → 19..23 → 24): Danh_Mục_Sink phải có trước để biết wire cái gì; 5 nhóm wire độc lập
  (khác file ⇒ song song được); 24 gom bằng chứng cho cả 5 nhóm.
- G7 (25 → 26 → 27): đổi bộ phân giải quyền trước, rồi mới thêm policy (nếu đảo thứ tự, policy mới sẽ
  chặn bộ phân giải cũ ⇒ mất quyền toàn hệ thống).
- G8 (28 → 29 → 30 → 31 → 32): tuần tự tuyệt đối, KHÔNG song song. 29 là cổng chặn: chưa đủ bằng chứng
  thì không được sang 30. 32 chỉ làm SAU khi 31 đã nghiệm thu đạt.

**Chặn cứng**: Task 30 (flip) yêu cầu 15.3, 18–24, 25–26, 28, 29 đều xong. Lý do: thiếu tiền kiểm ⇒ có thể
flip vào trạng thái cô lập ảo; thiếu wire sink ⇒ trắng dữ liệu; thiếu đổi bộ phân giải quyền ⇒ mất quyền.
