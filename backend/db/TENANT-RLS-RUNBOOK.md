# Runbook — Bật cô lập tenant (RLS) trong phiên có kiểm soát

Spec: `.kiro/specs/tenant-data-isolation`. Mục tiêu: bật RLS an toàn, không trắng dữ liệu, không hồi quy giá.

## Trạng thái hiện tại (đã làm, an toàn)
- ✅ G0: `TenantContextService` + interceptor (context theo request).
- ✅ Pha A: 61 bảng có `tenant_id` (nullable) + backfill → tenant 1. File: `2026-06-26_tenant_phaseA_add_tenant_id.sql`.
- ✅ Helper `tenantTransaction()` (set_config app.current_tenant / app.bypass).
- 📝 Chưa chạy: role NOSUPERUSER (`2026-06-26_tenant_app_role.sql`), RLS (`2026-06-26_tenant_phaseB_enable_rls.sql`).

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

## Ghi chú parity giá
Engine giá / payload builder KHÔNG đổi. Sau bước 6 chạy lại bộ test giá (quote-flow, pricing-advanced, vat) xác nhận `grand_total` không đổi (Property 4).
