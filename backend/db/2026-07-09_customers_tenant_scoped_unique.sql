-- Cô lập tenant cho KH: đổi UNIQUE TOÀN CỤC (phone/code) → UNIQUE THEO TENANT.
-- Trước đây `phone`/`code` unique xuyên tenant ⇒ tenant B không tạo được KH trùng SĐT/mã
-- của tenant A (chặn nghiệp vụ + rò rỉ tồn tại). Chuyển sang unique theo (tenant_id, ...).
-- An toàn/idempotent; chỉ tenant 1 có dữ liệu thật nên không vỡ ràng buộc khi áp.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS "UQ_88acd889fbe17d0e16cc4bc9174"; -- phone (global)
ALTER TABLE customers DROP CONSTRAINT IF EXISTS "UQ_f2eee14aa1fe3e956fe193c142f"; -- code  (global)

-- Unique theo tenant (partial: chỉ khi giá trị NOT NULL — tránh chặn nhiều bản ghi để trống).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_phone
    ON customers (tenant_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_code
    ON customers (tenant_id, code) WHERE code IS NOT NULL;
