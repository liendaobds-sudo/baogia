-- ════════════════════════════════════════════════════════════════════════
-- printers: hồ sơ chi phí per-máy + pricing_tiers: tách máy/công/overhead — 2026-07-08 (tầng 3)
--
-- BỐI CẢNH: giá định mức (pricing_tiers.price_per_sheet) cần suy ra từ 5 thành phần chi phí:
--   giấy (materials.cost_price, tầng 1) + mực (ink_costs) + MÁY + CÔNG + OVERHEAD.
-- Ba thành phần sau trước đây nằm trong `production_costs` (singleton — 1 dòng cho CẢ xưởng).
-- Người dùng chốt "riêng theo máy": mỗi máy in (digital, dùng cho in nhanh + khổ lớn) có hồ
-- sơ chi phí riêng. Nên chuyển 10 cột chi phí xuống bảng `printers` (mỗi dòng = 1 máy).
--
-- price_per_sheet (giá vốn THUẦN/tờ) = paper_cost + ink_cost + machine_cost + labor_cost + overhead_cost.
-- TUYỆT ĐỐI không chứa markup/lời — markup áp một lần ở facade (calculateSellingPrice). Nếu
-- nhét lời vào đây sẽ bị markup CHỒNG markup lúc báo giá.
--
-- production_costs (singleton) GIỮ NGUYÊN làm legacy (không xóa) — dùng để backfill điểm xuất
-- phát cho mọi máy hiện có. Luồng mới đọc chi phí PER-MÁY từ printers.
--
-- Tất cả cột nullable / có default → dữ liệu cũ không vỡ. pricing_tiers cũ: 3 cột thành phần
-- mới = 0, printer_id = null (giữ nguyên tổng price_per_sheet, không phá giá). Idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. printers: 10 cột hồ sơ chi phí per-máy ──
ALTER TABLE printers ADD COLUMN IF NOT EXISTS machine_value float DEFAULT 0;          -- giá trị máy (để khấu hao)
ALTER TABLE printers ADD COLUMN IF NOT EXISTS depreciation_years int DEFAULT 5;        -- số năm khấu hao
ALTER TABLE printers ADD COLUMN IF NOT EXISTS sheets_per_month int DEFAULT 50000;      -- sản lượng tháng (phân bổ khấu hao/công/overhead)
ALTER TABLE printers ADD COLUMN IF NOT EXISTS electricity_per_hour float DEFAULT 0;    -- tiền điện/giờ
ALTER TABLE printers ADD COLUMN IF NOT EXISTS sheets_per_hour int DEFAULT 1000;        -- tốc độ tờ/giờ (phân bổ điện)
ALTER TABLE printers ADD COLUMN IF NOT EXISTS staff_count int DEFAULT 1;               -- số nhân công vận hành
ALTER TABLE printers ADD COLUMN IF NOT EXISTS avg_salary_monthly float DEFAULT 0;      -- lương bình quân/tháng
ALTER TABLE printers ADD COLUMN IF NOT EXISTS rent_monthly float DEFAULT 0;            -- thuê mặt bằng/tháng (phân bổ)
ALTER TABLE printers ADD COLUMN IF NOT EXISTS utilities_monthly float DEFAULT 0;       -- tiện ích chung/tháng
ALTER TABLE printers ADD COLUMN IF NOT EXISTS other_monthly float DEFAULT 0;           -- overhead khác/tháng

-- Backfill điểm xuất phát: mọi máy lấy chung profile từ production_costs active (nếu có).
-- Chỉ set khi cột đang ở default (chưa ai chỉnh) — an toàn chạy lại.
DO $$
DECLARE pc RECORD;
BEGIN
    SELECT * INTO pc FROM production_costs WHERE is_active = true ORDER BY id DESC LIMIT 1;
    IF FOUND THEN
        UPDATE printers SET
            machine_value        = COALESCE(NULLIF(machine_value, 0), pc.machine_value),
            depreciation_years   = COALESCE(NULLIF(depreciation_years, 5), pc.machine_depreciation_years),
            sheets_per_month     = COALESCE(NULLIF(sheets_per_month, 50000), pc.sheets_per_month),
            electricity_per_hour = COALESCE(NULLIF(electricity_per_hour, 0), pc.electricity_per_hour),
            sheets_per_hour      = COALESCE(NULLIF(sheets_per_hour, 1000), pc.sheets_per_hour),
            staff_count          = COALESCE(NULLIF(staff_count, 1), pc.production_staff_count),
            avg_salary_monthly   = COALESCE(NULLIF(avg_salary_monthly, 0), pc.avg_salary_monthly),
            rent_monthly         = COALESCE(NULLIF(rent_monthly, 0), pc.rent_monthly),
            utilities_monthly    = COALESCE(NULLIF(utilities_monthly, 0), pc.utilities_monthly),
            other_monthly        = COALESCE(NULLIF(other_monthly, 0), pc.other_monthly);
    END IF;
END $$;

-- ── 2. pricing_tiers: gắn máy + tách 3 thành phần chi phí còn lại ──
ALTER TABLE pricing_tiers ADD COLUMN IF NOT EXISTS printer_id int;
ALTER TABLE pricing_tiers ADD COLUMN IF NOT EXISTS machine_cost float;   -- chi phí máy/tờ (khấu hao + điện)
ALTER TABLE pricing_tiers ADD COLUMN IF NOT EXISTS labor_cost float;     -- chi phí công/tờ
ALTER TABLE pricing_tiers ADD COLUMN IF NOT EXISTS overhead_cost float;  -- overhead/tờ

-- FK printer_id → printers (guard idempotent). ON DELETE SET NULL: xóa máy KHÔNG xóa tier
-- (tier giữ giá vốn đã tính; chỉ mất liên kết máy — admin gán lại).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_pricing_tiers_printer' AND table_name = 'pricing_tiers'
    ) THEN
        ALTER TABLE pricing_tiers
            ADD CONSTRAINT fk_pricing_tiers_printer
            FOREIGN KEY (printer_id) REFERENCES printers(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_printer ON pricing_tiers(printer_id);

-- Backfill tier cũ: 3 cột thành phần mới = 0 (giữ nguyên price_per_sheet = paper+ink hiện có,
-- không phá tổng). printer_id để null (tier cũ không gắn máy — vẫn chạy bình thường).
UPDATE pricing_tiers SET machine_cost = 0 WHERE machine_cost IS NULL;
UPDATE pricing_tiers SET labor_cost = 0 WHERE labor_cost IS NULL;
UPDATE pricing_tiers SET overhead_cost = 0 WHERE overhead_cost IS NULL;
