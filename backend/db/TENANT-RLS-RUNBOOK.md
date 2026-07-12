# Runbook — Bật cô lập tenant (RLS) trong phiên có kiểm soát

Spec: `.kiro/specs/tenant-data-isolation`. Mục tiêu: bật RLS an toàn, không trắng dữ liệu, không hồi quy giá.

## Trạng thái hiện tại (đã làm, an toàn)
- ✅ G0: `TenantContextService` + interceptor (context theo request).
- ✅ Pha A: 61 bảng có `tenant_id` (nullable) + backfill → tenant 1. File: `2026-06-26_tenant_phaseA_add_tenant_id.sql`.
- ✅ Helper `tenantTransaction()` (set_config app.current_tenant / app.bypass).
- ✅ Backfill lần 2 (2026-07-09): vá **3489 hàng** `tenant_id` NULL sinh sau Pha A → tenant 1
  (điều tra: chỉ tenant 1 có dữ liệu thật; 4/5/6/7 là TEST rỗng). File:
  `2026-07-09_backfill_null_tenant.sql`. Sau backfill: **0 hàng NULL** trên mọi bảng org-scoped
  → gỡ blocker cho `ALTER COLUMN tenant_id SET NOT NULL` của Pha B.
- 📝 Chưa chạy: role NOSUPERUSER (`2026-06-26_tenant_app_role.sql`), RLS (`2026-06-26_tenant_phaseB_enable_rls.sql`).

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
Bản sao + role test đã DROP sau diễn tập. Kết luận: SQL Pha B + policy + trigger chạy đúng;
chỉ cần thực thi các bước "Thứ tự chạy" ở trên trong maintenance window (app dừng + backfill lại).

## Tiền đề BẮT BUỘC trước khi bật RLS
1. **Role app NOSUPERUSER** — vì superuser `postgres` bỏ qua RLS. Chạy `2026-06-26_tenant_app_role.sql`, đổi `.env` → `DB_USERNAME=zeplao_app`.
2. **Wire `tenantTransaction()`/đọc qua context** (Task 6) — đường GHI đã wire sẵn. Đường ĐỌC: bật `TENANT_RLS_ENABLED=true` (kích hoạt `TenantConnectionInterceptor`) + đổi service đọc sang `this.tenantCtx.manager() ?? repo.manager`. Nếu thiếu → RLS trả 0 hàng → app trắng dữ liệu.
3. **Backup DB** + **dừng `nest watch`** (hoặc dùng DB staging/bản sao).

## Thứ tự chạy (KHÔNG đảo)
```
1) Backup DB
2) Tạo role NOSUPERUSER  → 2026-06-26_tenant_app_role.sql  (chạy bằng postgres)
3) Đổi .env DB_USERNAME/DB_PASSWORD = zeplao_app
4) Wire tenantTransaction vào service org-scoped (Task 6) + chạy 720 test pass
5) Áp RLS               → 2026-06-26_tenant_phaseB_enable_rls.sql
6) Khởi động app bằng role mới → kiểm: đăng nhập tenant 1 thấy đủ dữ liệu
7) Test cô lập (Task 12): tạo tenant 2, xác minh A không thấy B
```

## Kiểm tra nhanh sau khi bật (psql bằng zeplao_app)
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

## Rollback (nếu app trắng dữ liệu / lỗi)
```sql
-- Tắt RLS toàn bộ bảng org-scoped (đảo Pha B), giữ nguyên cột tenant_id:
DO $$ DECLARE t text; tbls text[] := ARRAY[/* dùng cùng danh sách Pha B */]; BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
  END LOOP; END $$;
```
Và đổi `.env` về `DB_USERNAME=postgres` để app chạy lại ngay (superuser bypass RLS).

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
Engine giá / payload builder KHÔNG đổi. Sau bước 6 chạy lại bộ test giá (quote-flow, pricing-advanced, vat) xác nhận `grand_total` không đổi (Property 4).

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
