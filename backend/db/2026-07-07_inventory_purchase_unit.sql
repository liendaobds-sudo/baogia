-- ════════════════════════════════════════════════════════════════════════
-- inventory_slip_items: thêm đơn vị mua + hệ số quy đổi + giá vốn/ĐV cơ sở — 2026-07-07
--
-- BỐI CẢNH: giá vốn giấy đang nhập tay theo "tờ", nhưng thực tế mua theo LÔ:
--   - Giấy tờ: mua theo RAM (1 ram = 500 tờ) hoặc KG.
--   - Giấy cuộn: mua theo CUỘN / MÉT (ra m²).
-- Phiếu nhập cũ chỉ lưu `quantity` theo 1 đơn vị phẳng của vật tư → không ghi lại
-- được "mua bao nhiêu ram/kg giá bao nhiêu". Thêm 4 cột để lưu vết lô nhập + quy đổi:
--
--   - purchase_unit       : đơn vị NGƯỜI DÙNG MUA (ram/kg/roll/sheet/sqm...).
--   - purchase_qty        : số lượng theo ĐV mua (VD 10 ram).
--   - conversion_factor   : số ĐV CƠ SỞ / 1 ĐV mua (VD ram→tờ = 500).
--   - unit_cost_base      : giá vốn / ĐV CƠ SỞ của lô này (= giá lô ÷ factor), chưa VAT.
--
-- `quantity` (cột cũ) GIỮ NGUYÊN ý nghĩa = số ĐV CƠ SỞ (= purchase_qty × conversion_factor)
-- để logic cộng stock hiện có không đổi. 4 cột mới CHỈ để lưu vết + tính bình quân gia quyền.
--
-- Tất cả nullable → phiếu nhập cũ (không có field mới) giữ nguyên, không phá dữ liệu.
-- Idempotent (ADD COLUMN IF NOT EXISTS). KHÔNG synchronize.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE inventory_slip_items ADD COLUMN IF NOT EXISTS purchase_unit varchar(20);
ALTER TABLE inventory_slip_items ADD COLUMN IF NOT EXISTS purchase_qty float;
ALTER TABLE inventory_slip_items ADD COLUMN IF NOT EXISTS conversion_factor float DEFAULT 1;
ALTER TABLE inventory_slip_items ADD COLUMN IF NOT EXISTS unit_cost_base float;
