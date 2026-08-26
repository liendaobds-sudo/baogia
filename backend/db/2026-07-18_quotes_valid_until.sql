-- Hiệu lực báo giá: cột ngày hết hạn (tính từ created_at + validity_days).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until date;

-- Backfill từ validity_days (mặc định 7)
UPDATE quotes
SET valid_until = (created_at::date + (COALESCE(validity_days, 7) || ' days')::interval)::date
WHERE valid_until IS NULL;
