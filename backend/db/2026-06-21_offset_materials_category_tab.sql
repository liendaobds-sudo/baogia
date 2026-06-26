-- 2026-06-21: Gán category_tab cho 26 vật tư giấy in OFFSET
-- ----------------------------------------------------------------------------
-- BỐI CẢNH: ConfigStore.seedDefaults() seed giấy offset vào bảng `materials`
-- với scope_offset=true nhưng category_tab=NULL → màn "Vật tư" (UI luôn lọc
-- ?category=<tab> khớp material_categories.code) KHÔNG xếp các vật tư này vào
-- bất kỳ tab nào, gây cảm giác "lộn tùm lum".
--
-- KHẮC PHỤC:
--   1. (code) config-store.service.ts: INSERT thêm cột category_tab='substrate_sheet'.
--   2. (data) Backfill các bản ghi đã seed trước đó còn NULL — câu lệnh dưới đây.
--
-- Giấy in offset là chất nền dạng TỜ → thuộc tab 'substrate_sheet'
-- ('1a. Giấy & VL nền (Rời)'), tab này đã tồn tại & is_active=1.
-- Idempotent: chỉ cập nhật khi còn NULL.
-- ----------------------------------------------------------------------------

UPDATE materials
   SET category_tab = 'substrate_sheet'
 WHERE scope_offset = true
   AND category_tab IS NULL;
