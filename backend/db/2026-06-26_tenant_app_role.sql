-- Tenant Data Isolation — Tạo role ứng dụng NOSUPERUSER (tiền đề cho RLS Pha B).
-- Spec: .kiro/specs/tenant-data-isolation
--
-- ⚠️ VÌ SAO CẦN: PostgreSQL superuser (vd `postgres`) BỎ QUA RLS. App phải kết nối
--   bằng role THƯỜNG (NOSUPERUSER) thì policy RLS mới có hiệu lực.
--
-- CÁCH DÙNG (chạy bằng superuser `postgres`, DB zeplao_erp):
--   1) Đổi mật khẩu bên dưới cho mạnh.
--   2) psql -h localhost -U postgres -d zeplao_erp -f db/2026-06-26_tenant_app_role.sql
--   3) Cập nhật .env: DB_USERNAME=zeplao_app, DB_PASSWORD=<mật khẩu vừa đặt>
--   4) Chỉ sau khi đã wire tenantTransaction (Task 6/7) + áp Pha B mới có cô lập thật.
--
-- An toàn: KHÔNG đổi schema/dữ liệu; chỉ tạo role + cấp quyền. Rollback:
--   REVOKE ... ; DROP OWNED BY zeplao_app; DROP ROLE zeplao_app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zeplao_app') THEN
    CREATE ROLE zeplao_app LOGIN PASSWORD 'CHANGE_ME_strong_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Quyền dùng schema + thao tác dữ liệu trên bảng/sequence hiện có.
GRANT USAGE ON SCHEMA public TO zeplao_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO zeplao_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO zeplao_app;

-- Bảng/sequence TẠO MỚI sau này (vd entity mới) cũng tự được cấp quyền.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zeplao_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO zeplao_app;

-- Cho phép set biến phiên app.* (set_config / SET LOCAL) — mặc định role thường vẫn set được
-- biến custom trong cùng session/transaction, không cần quyền đặc biệt.

-- Lưu ý: zeplao_app KHÔNG sở hữu bảng → FORCE ROW LEVEL SECURITY (Pha B) áp đúng cho nó.
-- KHÔNG cấp BYPASSRLS. KHÔNG superuser.
