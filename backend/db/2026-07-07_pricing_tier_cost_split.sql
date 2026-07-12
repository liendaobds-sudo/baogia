-- ════════════════════════════════════════════════════════════════════════
-- pricing_tiers: tách paper_cost + ink_cost khỏi price_per_sheet gộp — 2026-07-07
--
-- BỐI CẢNH: định mức in nhanh chỉ lưu 1 cột `price_per_sheet` GỘP (giấy + mực). Form
-- FE "giả vờ" tách paperPrice/inkPrice bằng cách chia 50/50 ảo lúc load rồi gộp lại khi
-- lưu → hệ thống CHƯA BAO GIỜ tách thật chi phí giấy khỏi mực. Hệ quả: giá vốn giấy
-- (`materials.cost_price`, đã sống ở tầng 1) KHÔNG chảy vào định mức — nhập tay 2 lần.
--
-- Tách 2 thành phần thật để giá vốn giấy DẪN XUẤT từ cost_price (nguồn duy nhất):
--   - paper_cost      : chi phí giấy / tờ (đồng bộ từ materials.cost_price).
--   - ink_cost        : chi phí mực / tờ (nhập tay / config).
--   - price_per_sheet : GIỮ = paper_cost + ink_cost. Engine đọc giá KHÔNG đổi (vẫn đọc
--                       cột này) → không vỡ đường tính giá. Tầng 2 chỉ đổi cách GHI.
--   - cost_synced_at  : mốc đồng bộ cuối với cost_price, để phát hiện "giá vốn đã đổi"
--                       (badge lệch trên UI). NULL = chưa từng đồng bộ.
--
-- BACKFILL: dòng cũ → paper_cost = price_per_sheet, ink_cost = 0 (GIỮ NGUYÊN tổng,
-- không phá giá đang dùng). Người dùng tách lại về sau nếu muốn.
--
-- Tất cả nullable → tương thích ngược. Idempotent (ADD COLUMN IF NOT EXISTS). KHÔNG synchronize.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE pricing_tiers ADD COLUMN IF NOT EXISTS paper_cost float;
ALTER TABLE pricing_tiers ADD COLUMN IF NOT EXISTS ink_cost float;
ALTER TABLE pricing_tiers ADD COLUMN IF NOT EXISTS cost_synced_at timestamp;

-- Backfill: giữ nguyên tổng cho dòng cũ chưa tách (chỉ set khi paper_cost còn NULL).
UPDATE pricing_tiers
SET paper_cost = price_per_sheet,
    ink_cost = 0
WHERE paper_cost IS NULL;
