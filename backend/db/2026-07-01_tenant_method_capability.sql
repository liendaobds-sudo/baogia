-- tenant-method-capability — Đưa phạm vi tenant vào bảng method_capabilities.
-- Spec: .kiro/specs/tenant-method-capability
--
-- Mục tiêu: cho phép bật/tắt từng Phương_Pháp_In (digital/offset) RIÊNG cho từng tenant.
--
-- Thiết kế (design.md §Data Models):
--  - Thêm cột `tenant_id` (nullable). Hàng `tenant_id IS NULL` = baseline global cũ
--    (unit_id='default', đã seed digital=true/offset=true) → đóng vai trò MẶC ĐỊNH NỀN.
--  - Hàng `tenant_id = <id>` = cấu hình tường minh riêng của tenant đó.
--  - UNIQUE cũ (unit_id, method_id) GIỮ NGUYÊN cho hàng nền; thêm partial unique index
--    (tenant_id, method_id) WHERE tenant_id IS NOT NULL cho hàng theo tenant
--    (Postgres cho phép nhiều NULL nên unique thường không phục vụ được).
--
-- TƯƠNG THÍCH NGƯỢC: KHÔNG backfill tenant nào → mọi tenant hiện hữu là "chưa cấu hình"
--   → kế thừa baseline (bật cả hai) → 0 thay đổi hành vi cho tới khi admin tắt bớt.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- Rollback: DROP INDEX uq_method_cap_tenant_method; ALTER TABLE method_capabilities DROP COLUMN tenant_id;
-- Target: PostgreSQL.

BEGIN;

ALTER TABLE method_capabilities ADD COLUMN IF NOT EXISTS tenant_id INTEGER NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_method_cap_tenant_method
    ON method_capabilities (tenant_id, method_id)
    WHERE tenant_id IS NOT NULL;

COMMIT;
