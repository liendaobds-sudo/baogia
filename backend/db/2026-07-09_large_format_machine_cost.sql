-- ════════════════════════════════════════════════════════════════════════
-- printers: mẫu số m² + cost_basis; large_format_pricing: tách máy/công/overhead — 2026-07-09 (tầng 3, khổ lớn)
--
-- BỐI CẢNH: tầng 3 đã cho in nhanh suy giá định mức từ hồ sơ chi phí per-máy (printers),
-- nhưng máy in nhanh phân bổ theo TỜ (sheets_per_month/hour). Khổ lớn tính theo m²
-- (large_format_pricing.price_per_sqm) — máy in khổ lớn (phun, bạt) chạy m²/giờ, KHÔNG
-- phải tờ/giờ. Đơn vị lệch nghĩa → không dùng lại được mẫu số tờ.
--
-- Giải pháp: cùng bảng `printers` nhưng thêm:
--   - cost_basis 'sheet'|'sqm' : máy này phân bổ theo tờ (in nhanh) hay m² (khổ lớn).
--   - sqm_per_month / sqm_per_hour : mẫu số phân bổ theo m² (song song sheets_per_*).
-- Các cột chung (machine_value, depreciation_years, lương, thuê, tiện ích, khác) TÁI DÙNG.
--
-- price_per_sqm (giá vốn THUẦN/m²) = vật liệu/m² + máy/m² + công/m² + overhead/m².
-- KHÔNG mực tách (mực khổ lớn nằm trong chi phí máy/vật tư), KHÔNG hệ số số mặt (in 1 mặt).
-- TUYỆT ĐỐI không markup — facade lo (như in nhanh).
--
-- Tất cả nullable/có default → dữ liệu cũ không vỡ. large_format_pricing cũ: 3 cột thành
-- phần mới = 0, printer_id = null (giữ nguyên price_per_sqm, không phá giá). Idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. printers: phân loại mẫu số + mẫu số m² ──
-- cost_basis mặc định 'sheet' → mọi máy hiện có giữ nghĩa in nhanh (không đổi hành vi tầng 3).
ALTER TABLE printers ADD COLUMN IF NOT EXISTS cost_basis varchar(10) DEFAULT 'sheet';  -- 'sheet' (in nhanh) | 'sqm' (khổ lớn)
ALTER TABLE printers ADD COLUMN IF NOT EXISTS sqm_per_month float DEFAULT 5000;        -- sản lượng tháng (m²) — phân bổ khấu hao/công/overhead cho máy khổ lớn
ALTER TABLE printers ADD COLUMN IF NOT EXISTS sqm_per_hour float DEFAULT 20;           -- tốc độ m²/giờ — phân bổ điện cho máy khổ lớn

-- ── 2. large_format_pricing: gắn máy + tách 3 thành phần chi phí (ngoài vật liệu) ──
ALTER TABLE large_format_pricing ADD COLUMN IF NOT EXISTS printer_id int;
ALTER TABLE large_format_pricing ADD COLUMN IF NOT EXISTS material_cost float;   -- vật liệu/m² (dẫn từ materials.cost_price)
ALTER TABLE large_format_pricing ADD COLUMN IF NOT EXISTS machine_cost float;    -- máy/m² (khấu hao + điện)
ALTER TABLE large_format_pricing ADD COLUMN IF NOT EXISTS labor_cost float;      -- công/m²
ALTER TABLE large_format_pricing ADD COLUMN IF NOT EXISTS overhead_cost float;   -- overhead/m²
ALTER TABLE large_format_pricing ADD COLUMN IF NOT EXISTS cost_synced_at timestamp;  -- mốc đồng bộ cuối với cost_price

-- FK printer_id → printers (guard idempotent). ON DELETE SET NULL: xóa máy KHÔNG xóa tier.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_large_format_printer' AND table_name = 'large_format_pricing'
    ) THEN
        ALTER TABLE large_format_pricing
            ADD CONSTRAINT fk_large_format_printer
            FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_large_format_printer ON large_format_pricing(printer_id);

-- Backfill tier cũ: 3 cột thành phần mới = 0 (giữ nguyên price_per_sqm hiện có, không phá tổng).
-- printer_id để null (tier cũ không gắn máy — vẫn chạy bình thường).
UPDATE large_format_pricing SET material_cost = 0 WHERE material_cost IS NULL;
UPDATE large_format_pricing SET machine_cost = 0 WHERE machine_cost IS NULL;
UPDATE large_format_pricing SET labor_cost = 0 WHERE labor_cost IS NULL;
UPDATE large_format_pricing SET overhead_cost = 0 WHERE overhead_cost IS NULL;
