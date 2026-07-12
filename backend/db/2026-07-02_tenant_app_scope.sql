-- tenant-app-scope — Gate Trục Ứng Dụng (CSKH) theo tenant.
-- Spec: .kiro/specs/tenant-app-scope
--
-- Mục tiêu: Super_Admin cấp cho mỗi tenant chỉ Trục Báo_Giá, hoặc Báo_Giá + CSKH.
--   Báo_Giá là LÕI bất khả tắt (CSKH phụ thuộc nó) → chỉ lưu cờ cho Trục CSKH.
--
-- Thiết kế (design.md §Data Models):
--  - Hàng `tenant_id IS NULL` = baseline global (mặc-định-nền). Seed 'cskh'=true.
--  - Hàng `tenant_id = <id>` = cấu hình tường minh của tenant đó.
--  - Tenant chưa cấu hình → kế thừa baseline (CSKH bật) → tương thích ngược 100%.
--
-- TƯƠNG THÍCH NGƯỢC: KHÔNG backfill tenant nào → mọi tenant hiện hữu "chưa cấu hình"
--   → kế thừa baseline (CSKH bật) → 0 thay đổi hành vi cho tới khi admin tắt.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + INSERT ... WHERE NOT EXISTS.
-- Rollback: DROP TABLE tenant_app_scopes;
-- Target: PostgreSQL.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_app_scopes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NULL,
  app_key     VARCHAR(30) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- Đúng-một-trạng-thái: baseline 1 hàng/app_key; theo tenant 1 hàng/(tenant, app_key).
-- (Postgres cho phép nhiều NULL nên phải dùng partial unique index.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_scope_baseline
  ON tenant_app_scopes (app_key) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_scope_tenant
  ON tenant_app_scopes (tenant_id, app_key) WHERE tenant_id IS NOT NULL;

-- Baseline: CSKH bật cho mọi tenant chưa cấu hình (tương thích ngược — Req 2.2).
INSERT INTO tenant_app_scopes (tenant_id, app_key, enabled)
SELECT NULL, 'cskh', true
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_app_scopes WHERE tenant_id IS NULL AND app_key = 'cskh'
);

COMMIT;
