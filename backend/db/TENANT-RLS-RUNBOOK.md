# Runbook — Bật cô lập tenant (RLS) trong phiên có kiểm soát

Spec: `.kiro/specs/tenant-data-isolation`. Mục tiêu: bật RLS an toàn, không trắng dữ liệu, không hồi quy giá.

> **STOP — chỉ staging/bản sao (cập nhật 2026-08-23).** Runbook này hiện chỉ cho phép diễn tập
> trên PostgreSQL staging hoặc bản sao đã cô lập. Không áp Pha A/Pha B, backfill, đổi role hay bật
> `TENANT_RLS_ENABLED` trên production trong remediation này. Flip production cần phê duyệt thay đổi
> riêng, backup đã kiểm, maintenance window, owner vận hành và bằng chứng diễn tập mới nhất.

## Trạng thái code hiện tại
- ✅ G0: `TenantContextService` + interceptor (context theo request).
- ✅ Helper `tenantTransaction()` (set_config app.current_tenant / app.bypass).
- ✅ Manifest runtime: `src/common/tenant/rls-manifest.ts` khóa 62 bảng common + 2 bảng baseline
  và có test parity với `2026-06-26_tenant_phaseB_enable_rls.sql`.
- ✅ Startup preflight khi flag bật kiểm từng bảng: tồn tại, policy đúng tên, `ENABLE RLS`, `FORCE RLS`,
  `tenant_id NOT NULL` + trigger cho bảng common; baseline phải nullable và không có trigger.
- 📝 Trạng thái role/policy/dữ liệu của production **chưa được kiểm trong đợt này** và không được suy
  từ code hoặc tài liệu lịch sử.

### Bằng chứng lịch sử, không thay cho preflight hiện tại
- Pha A từng được áp trên môi trường được ghi nhận ngày 2026-07-09. File:
  `2026-06-26_tenant_phaseA_add_tenant_id.sql`.
- Backfill lần 2 (2026-07-09) từng vá **3489 hàng** `tenant_id` NULL → tenant 1
  (điều tra: chỉ tenant 1 có dữ liệu thật; 4/5/6/7 là TEST rỗng). File:
  `2026-07-09_backfill_null_tenant.sql`. Sau backfill: **0 hàng NULL** trên mọi bảng org-scoped
  tại thời điểm đo. Phải đo lại sau khi dừng write trên bản sao/staging; không tái sử dụng số này
  như bằng chứng production hiện tại.

## ⚠️ CHECK SẴN SÀNG (2026-07-09) — còn blocker trước khi flip
- 🔴 App vẫn nối bằng **superuser `postgres`** (RLS sẽ bị bỏ qua) và role `zeplao_app` **chưa tạo**.
  → Bước tạo role + đổi `.env` + `ENABLE RLS` PHẢI làm trong **maintenance window** (app dừng,
  đã backup), KHÔNG chạy trên DB đang phục vụ.
- 🔴 **App đang chạy vẫn sinh dòng `tenant_id` NULL mới** (message/ai-suggest write path khi
  `TENANT_RLS_ENABLED` tắt). Bằng chứng: bản sao lấy ngay sau backfill vẫn có 5 `ai_suggestions`
  + 11 `messages` NULL mới. ⇒ **Backfill phải chạy LẠI trong maintenance window SAU khi dừng app**,
  ngay trước Pha B. Khi flag bật + trigger `app_set_tenant_id` hoạt động + đường nền bọc
  `withTenant` → insert mới tự gán tenant, hết sinh NULL.

## ✅ DIỄN TẬP TRÊN BẢN SAO (2026-07-09) — flip đã được chứng minh đúng
Đã clone `zeplao_erp` → `zeplao_erp_rls_test` (pg_dump/restore), tạo role NOSUPERUSER `zeplao_app_test`,
backfill residual + chạy Pha B, kiểm bằng role app (không superuser):
- Không context → 0 hàng (mặc-định-đóng). ✓
- Context tenant 1 → 44 conversations / 2473 messages. ✓
- Context tenant 2 (rỗng) → 0 conversations (KHÔNG thấy dữ liệu tenant 1). ✓
- INSERT `tenant_id` sai → bị chặn bởi RLS WITH CHECK. ✓
- `app.bypass='on'` (super-admin) → thấy tất cả. ✓
- `method_capabilities` tenant 2 → thấy baseline (tenant_id NULL). ✓
Bản sao + role test đã DROP sau diễn tập. Bằng chứng này chỉ chứng minh revision tại thời điểm
2026-07-09; code/schema đã tiếp tục thay đổi nên phải diễn tập lại từ đầu trước mọi đề xuất production.

## Tiền đề BẮT BUỘC cho diễn tập staging
1. **PostgreSQL staging/bản sao tách biệt** — không dùng DB đang phục vụ và không chứa secret/PII vượt phạm vi cần test.
2. **Role app NOSUPERUSER, NOBYPASSRLS** — superuser bỏ qua RLS. Role owner chỉ dùng để bootstrap/Pha B, không dùng chạy app.
3. **Schema + patch ledger khớp revision code** — chạy bootstrap/patch chỉ trên staging theo `db/README.md`.
4. **Wire `tenantTransaction()`/đọc qua context** — thiếu context phải fail-closed, không rơi về tenant mặc định.
5. **Backup/snapshot staging + dừng mọi write/job/cron/channel** trước residual scan/backfill và Pha B.
6. **Static gate xanh**:
   `npx jest src/common/tenant/rls-preflight.spec.ts src/common/tenant/rls-manifest.spec.ts src/common/tenant/rls-coverage.guard.spec.ts --runInBand`
   và `npx tsc --noEmit -p tsconfig.json` trong `backend/`.

## Thứ tự diễn tập staging (KHÔNG đảo)
```
1) Tạo/refresh bản sao staging từ revision schema được phép; ghi lại commit + thời điểm snapshot.
2) Chạy static gate manifest/preflight/coverage và CI matrix hiện hành.
3) Dừng toàn bộ app worker/write trên staging; snapshot rollback.
4) Đo residual tenant_id NULL theo manifest; backfill bằng script đã review và ghi before/after count.
5) Tạo role app NOSUPERUSER/NOBYPASSRLS trên staging bằng owner role.
6) Áp 2026-06-26_tenant_phaseB_enable_rls.sql trên staging bằng owner role.
7) Chạy app staging bằng app role + TENANT_RLS_ENABLED=true.
   Startup chỉ được tiếp tục khi preflight báo đủ 64 bảng khớp manifest.
8) Chạy tenant-isolation e2e bằng app role, test A/B, baseline, bypass, background jobs,
   pricing parity, auth/WebSocket và runtime smoke trong docs/PRODUCTION-SMOKE.md.
9) Diễn tập rollback trên staging và chạy lại smoke sau rollback.
10) Lưu output/owner/timestamp. Chỉ sau đó mới lập change request production riêng.
```

## Cổng startup theo manifest

- Flag tắt: preflight chỉ ghi trạng thái; giữ tương thích trong lúc chưa flip.
- Flag bật trên DB không phải PostgreSQL: **fatal**, app không listen.
- Flag bật với role SUPERUSER/BYPASSRLS: **fatal**.
- Flag bật mà thiếu bất kỳ table/policy/ENABLE/FORCE/column/trigger nào: **fatal**.
- Chỉ khi đủ toàn bộ manifest mới log `ok`. Policy name đúng chưa tự chứng minh biểu thức policy đúng;
  negative test A/B bằng role NOSUPERUSER vẫn là gate bắt buộc.

## Kiểm tra nhanh sau khi bật trên staging (psql bằng app role)
```sql
-- Thiếu context → 0 hàng (mặc-định-đóng)
SELECT count(*) FROM quotes;                 -- kỳ vọng 0
-- Có context tenant 1 → thấy dữ liệu
BEGIN; SELECT set_config('app.current_tenant','1',true); SELECT count(*) FROM quotes; COMMIT;
-- Ghi sai tenant bị chặn (WITH CHECK)
BEGIN; SELECT set_config('app.current_tenant','1',true);
  INSERT INTO contacts(...) VALUES(... tenant_id=2 ...);  -- kỳ vọng LỖI
ROLLBACK;
```

## Rollback staging (phải diễn tập trước production)
```sql
-- Tắt RLS toàn bộ bảng org-scoped (đảo Pha B), giữ nguyên cột tenant_id:
DO $$ DECLARE t text; tbls text[] := ARRAY[/* dùng cùng danh sách Pha B */]; BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
  END LOOP; END $$;
-- Hai bảng baseline phải drop thêm mc_read/mc_write và app_scope_read/app_scope_write,
-- rồi DISABLE RLS. Dùng manifest cùng revision; không copy danh sách thủ công sang production.
```
Dừng app staging trước rollback; khôi phục snapshot/credentials staging và chạy lại smoke. Không mở
traffic trong trạng thái nửa rollback, và không dùng superuser làm app role để "né" lỗi RLS.

## Ghi chú đặc biệt — `method_capabilities` (tenant-method-capability)
Bảng này KHÔNG đi theo policy chung. Lý do: hàng BASELINE (`tenant_id IS NULL`, `unit_id='default'`)
là mặc định nền, PHẢI đọc được bởi MỌI tenant (CapabilityService kế thừa baseline khi tenant
chưa cấu hình). Do đó Pha B tách riêng khối cho bảng này:
- KHÔNG `SET NOT NULL` trên `tenant_id`, KHÔNG gắn trigger auto-set (giữ hàng baseline NULL).
- Policy đọc (`USING`): `bypass` OR `tenant_id IS NULL` OR `tenant_id = current`.
- Policy ghi (`WITH CHECK`): `bypass` OR `tenant_id = current` → tenant chỉ ghi hàng của mình;
  ghi/sửa baseline chỉ qua `app.bypass='on'` (super-admin).
Kiểm nhanh: `BEGIN; SELECT set_config('app.current_tenant','2',true); SELECT * FROM method_capabilities; COMMIT;`
→ kỳ vọng thấy hàng baseline (tenant_id NULL) + hàng của tenant 2, KHÔNG thấy hàng tenant khác.

## Ghi chú parity giá
Engine giá / payload builder KHÔNG được đổi bởi flip. Chạy ma trận pricing/VAT/offset/order/PDF
theo skill `zeplao-testing` và CI hiện hành; không dùng số suite/test lịch sử làm gate.

## Readiness fixes cho phiên flip (2026-07-12) — đã sửa code, gated sau `TENANT_RLS_ENABLED`
Audit trục 1 (RLS) tìm 3 chỗ sẽ hỏng NGAY khi flip (chạy tốt hôm nay vì RLS còn tắt). Đã sửa,
mọi thay đổi no-op byte-for-byte khi `TENANT_RLS_ENABLED` tắt:

1. **super-admin `getTenantStats` → 0 sau flip** (`super-admin.service.ts`).
   - Vấn đề: request super-admin đã mở transaction với `app.current_tenant` = tenant của CHÍNH
     super-admin. Query COUNT quotes/materials cho tenant KHÁC bị RLS lọc → 0 (dashboard trắng số).
   - Fix: khi `tenantRlsEnabled()`, 2 COUNT chạy trên **queryRunner riêng** với `SET LOCAL
     app.bypass='on'` (cross-tenant hợp lệ, route đã chặn SUPER_ADMIN). Bypass cô lập trong
     transaction đó, KHÔNG rò ra request. Cờ tắt → giữ nguyên `dataSource.query` cũ.

2. **audit denial log vi phạm NOT NULL sau flip** (`audit.service.ts`, `denial-log.ts`).
   - Vấn đề: `PermissionsGuard` (ghi audit khi 403) chạy TRƯỚC `TenantContextInterceptor` →
     context CHƯA có → `writeTenantId()` = null. Sau flip `audit_logs.tenant_id` SET NOT NULL →
     INSERT vỡ (nuốt lỗi → MẤT denial log).
   - Fix: `AuditService.log` nhận `tenantId` tường minh (ưu tiên hơn context). `buildDenialLog`
     lấy `tenantId` thẳng từ `user` (JWT payload đã có `tenantId`). Guard đã truyền `user` sẵn.

3. **seed-on-boot chết sau flip** (`engine-offset.service.ts`).
   - Vấn đề: `configStore.seedDefaults()` chạy ở `onModuleInit` NGOÀI tenant context. Sau flip:
     (a) `ALTER TABLE` cần OWNER — app role NOSUPERUSER bị từ chối; (b) INSERT materials/
     paper_sizes (đã NOT NULL tenant_id) vỡ vì trigger không có `app.current_tenant`.
   - Fix: bỏ qua `seedDefaults()` khi `tenantRlsEnabled()` (vẫn `refreshFromConfigStore()` như
     thường). Dữ liệu offset đã seed 1 lần lúc còn superuser.
   - ⚠️ CÒN THỦ CÔNG: seed/DDL MỚI sau flip phải chạy bằng **owner role** trong maintenance
     window, KHÔNG qua app boot. Nếu cần thêm cột offset (các `ALTER TABLE paper_sizes ADD COLUMN`
     trong `seedDefaults`) → đưa vào file `db/*.sql` idempotent, chạy bằng postgres/owner.

### Bổ sung "Thứ tự chạy" cho các fix trên
- Sau bước 5 (áp Pha B), trước khi mở lại cho user: xác nhận cột offset của `paper_sizes` đã đủ
  (vì boot không còn tự `ALTER`). Nếu DB dựng từ schema cũ thiếu cột → chạy tay bằng owner:
  `ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS scope_offset boolean DEFAULT false;` (+ các cột
  `kho_giay_lon, chia_to, so_con_bai_in, so_con_to_lon, loai_kem, gripper_cm, gutter_cm` — xem
  `config-store.service.ts seedDefaults`).
- Kiểm super-admin sau flip: đăng nhập super-admin → mở dashboard 1 tenant bất kỳ → `usage.quotes`/
  `usage.materials` phải ra số THẬT của tenant đó (không phải 0).
- Kiểm audit: gọi 1 route bị 403 với user thường → `audit_logs` có 1 dòng `access.denied` với
  `tenant_id` = tenant của user (không NULL, không vỡ).
