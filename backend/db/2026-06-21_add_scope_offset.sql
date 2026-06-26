-- ════════════════════════════════════════════════════════════════════════
-- Sửa schema drift cho phần Offset — 2026-06-21
--
-- BỐI CẢNH: entities khai báo nhiều cột offset trên `materials`/`processing_options`
-- nhưng DB chưa có (synchronize=false, migration offset chưa áp) → query gãy:
--   "column m.scope_offset does not exist" (master data trả 0 materials),
--   processing_options thiếu scope_offset/billing_mode/moq_param/min_charge_param/ghi_chu.
--
-- Quy ước kiểu (khớp config-store dùng `WHERE scope_offset = true` + migration
-- offset_pricebook_config.sql): scope_offset = BOOLEAN ở cả hai bảng.
--
-- Idempotent. KHÔNG bật synchronize.
-- ════════════════════════════════════════════════════════════════════════

-- ── materials.scope_offset (boolean) ──
ALTER TABLE materials ADD COLUMN IF NOT EXISTS scope_offset boolean NOT NULL DEFAULT false;

-- ── processing_options.scope_offset (boolean) ──
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS scope_offset boolean DEFAULT false;
-- Nếu trước đó đã lỡ tạo dạng smallint → chuyển về boolean (config-store dùng = true).
DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'processing_options' AND column_name = 'scope_offset') = 'smallint' THEN
        ALTER TABLE processing_options ALTER COLUMN scope_offset DROP DEFAULT;
        ALTER TABLE processing_options ALTER COLUMN scope_offset TYPE boolean USING (scope_offset <> 0);
        ALTER TABLE processing_options ALTER COLUMN scope_offset SET DEFAULT false;
    END IF;
END $$;

-- ── processing_options: metadata tính giá gia công offset (khớp entity + config-store) ──
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS billing_mode     varchar(30);
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS moq_param        varchar(60);
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS min_charge_param varchar(60);
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS ghi_chu          text;
