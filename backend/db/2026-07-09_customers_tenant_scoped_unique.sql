-- Cô lập tenant cho KH: đổi UNIQUE TOÀN CỤC (phone/code) → UNIQUE THEO TENANT.
-- Trước đây `phone`/`code` unique xuyên tenant ⇒ tenant B không tạo được KH trùng SĐT/mã
-- của tenant A (chặn nghiệp vụ + rò rỉ tồn tại). Chuyển sang unique theo (tenant_id, ...).
-- An toàn/idempotent; chỉ tenant 1 có dữ liệu thật nên không vỡ ràng buộc khi áp.
--
-- ⚠️ PHỤ THUỘC: cột `customers.tenant_id` do Pha A tạo
--    (db/2026-06-26_tenant_phaseA_add_tenant_id.sql).
--    Audit 2026-08-29: file này đã bị loại khỏi `apply-patches.js` (EXCLUDED) vì trên DB mới
--    (chưa chạy Pha A) nó fail và làm ROLLBACK cả chuỗi patch phía sau. Chạy nó trong chuỗi
--    tenant, NGAY SAU Pha A — xem TENANT-RLS-RUNBOOK.md.
--    Thêm guard `IF EXISTS column` để rerun/chạy sai thứ tự chỉ NO-OP thay vì lỗi.
-- Rollback:
--    DROP INDEX IF EXISTS uq_customers_tenant_phone;
--    DROP INDEX IF EXISTS uq_customers_tenant_code;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'tenant_id'
  ) THEN
    RAISE NOTICE 'Bỏ qua: customers.tenant_id chưa tồn tại (chạy Pha A trước).';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE customers DROP CONSTRAINT IF EXISTS "UQ_88acd889fbe17d0e16cc4bc9174"'; -- phone (global)
  EXECUTE 'ALTER TABLE customers DROP CONSTRAINT IF EXISTS "UQ_f2eee14aa1fe3e956fe193c142f"'; -- code  (global)

  -- Unique theo tenant (partial: chỉ khi giá trị NOT NULL — tránh chặn nhiều bản ghi để trống).
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_phone
             ON customers (tenant_id, phone) WHERE phone IS NOT NULL';
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tenant_code
             ON customers (tenant_id, code) WHERE code IS NOT NULL';
END $$;
