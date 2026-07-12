-- ════════════════════════════════════════════════════════════════════════
-- materials: thêm sheet_role + parent_material_id (self-ref khổ nhập ↔ khổ xả) — 2026-07-05
--
-- BỐI CẢNH: khổ giấy KHÔNG ra giá nếu chỉ là kích thước trừu tượng — phải là VẬT TƯ
-- cụ thể (tên + khổ + giá). Mô hình đúng: mọi khổ giấy = một bản ghi `materials`, phân
-- vai trò qua `sheet_role`:
--   - 'parent' (khổ NHẬP): tờ giấy lớn mua về. Có `unit_price` (giá 1 tờ nhập) + width/height.
--   - 'child'  (khổ XẢ / bài in): cắt ra từ tờ nhập. Trỏ vật tư cha qua `parent_material_id`.
--             KHÔNG nhập giá — engine dẫn xuất: đơn giá = giá cha / (số khổ xả trên tờ nhập).
--   - NULL: vật tư thường (không phải giấy khổ offset) — hành vi cũ, không đổi.
--
-- Thay bảng riêng `parent_sheets` (đã gỡ) bằng self-reference trên chính `materials`:
-- vật tư cha mang giá + khổ, vật tư con trỏ về cha. Danh sách vật tư xổ cha → con.
--
-- Nullable, KHÔNG default cho parent_material_id (chỉ khổ xả set). sheet_role NULL cho
-- vật tư thường. FK self-ref ON DELETE SET NULL: xóa vật tư cha KHÔNG xóa lan vật tư con
-- (con thành mồ côi, admin xử tay) — an toàn hơn CASCADE.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS + guard FK qua information_schema). KHÔNG synchronize.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE materials ADD COLUMN IF NOT EXISTS sheet_role varchar(10);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS parent_material_id int;

-- FK self-ref materials.parent_material_id → materials.id (guard idempotent).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_materials_parent_material' AND table_name = 'materials'
    ) THEN
        ALTER TABLE materials
            ADD CONSTRAINT fk_materials_parent_material
            FOREIGN KEY (parent_material_id) REFERENCES materials(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Index cho truy vấn "các khổ con của một cha" (danh sách xổ cha → con).
CREATE INDEX IF NOT EXISTS idx_materials_parent_material ON materials(parent_material_id);
