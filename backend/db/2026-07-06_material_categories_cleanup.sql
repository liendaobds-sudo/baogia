-- ════════════════════════════════════════════════════════════════════════
-- material_categories: dọn nhãn (bỏ số thứ tự) + sort_order trùng + rác — 2026-07-06
--
-- BỐI CẢNH: các nhóm vật tư đang nhét SỐ THỨ TỰ cứng vào `name` ("1a. Giấy & VL nền
-- (Rời)", "2. Mực in"...). Đã có cột `sort_order` lo thứ tự → số trong tên là thừa,
-- và mỗi lần chèn/đổi thứ tự phải sửa tay từng nhãn. Bỏ tiền tố số, để `sort_order` lo.
--
-- ĐỒNG THỜI dọn 2 lỗi data thật (khảo sát DB): sort_order TRÙNG (adhesive=7 và
-- finishing=7), và bản ghi rác "11. Test" (code=mro).
--
-- KHÔNG đụng cột `code` — đó là KHÓA LỌC (materials.category_tab = material_categories.code,
-- UI gọi ?category=<code>). Đổi code sẽ vỡ liên kết vật tư ↔ nhóm.
--
-- Idempotent: regexp_replace bỏ tiền tố "<số><chữ tùy chọn>. " — chạy lại không đổi
-- (đã bỏ rồi thì không khớp nữa). sort_order gán tường minh theo id (bước 10, chừa chỗ
-- chèn). Xóa 'mro' CHỈ khi không vật tư nào đang dùng (tránh để vật tư mồ côi).
-- ════════════════════════════════════════════════════════════════════════

-- 1) Bỏ tiền tố số thứ tự khỏi nhãn: "1a. Giấy..." → "Giấy...", "11. Test" → "Test".
--    Regex: đầu chuỗi, ≥1 chữ số, tùy chọn 1 chữ cái (1a/1b), dấu chấm, khoảng trắng.
UPDATE material_categories
SET name = regexp_replace(name, '^[0-9]+[a-z]?\.\s*', '')
WHERE name ~ '^[0-9]+[a-z]?\.\s*';

-- 2) Gán lại sort_order tường minh (bước 10) — sửa trùng adhesive/finishing, giữ đúng
--    ý định thứ tự ban đầu trong nhãn cũ. Nhóm nào không liệt kê giữ nguyên.
UPDATE material_categories SET sort_order = 10  WHERE code = 'substrate_sheet';
UPDATE material_categories SET sort_order = 20  WHERE code = 'substrate_roll';
UPDATE material_categories SET sort_order = 30  WHERE code = 'ink';
UPDATE material_categories SET sort_order = 40  WHERE code = 'prepress';
UPDATE material_categories SET sort_order = 50  WHERE code = 'chemicals';
UPDATE material_categories SET sort_order = 60  WHERE code = 'surface';
UPDATE material_categories SET sort_order = 70  WHERE code = 'adhesive';
UPDATE material_categories SET sort_order = 80  WHERE code = 'finishing';
UPDATE material_categories SET sort_order = 90  WHERE code = 'tooling';
UPDATE material_categories SET sort_order = 100 WHERE code = 'packaging';

-- 3) Xóa nhóm rác 'mro' ("Test") — CHỈ khi không vật tư nào gán category_tab='mro'.
DELETE FROM material_categories
WHERE code = 'mro'
  AND NOT EXISTS (SELECT 1 FROM materials WHERE category_tab = 'mro');
