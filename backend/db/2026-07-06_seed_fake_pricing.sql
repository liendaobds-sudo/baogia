-- Seed DỮ LIỆU GIẢ: vật tư giấy bổ sung + định mức in nhanh (pricing_tiers) + định mức khổ lớn.
-- Mục đích: có sẵn giá để test luồng báo giá. Giá KHÔNG phải giá thị trường — công thức giả theo
-- gsm × mặt in × hệ màu × mốc số lượng. Idempotent: bỏ qua tổ hợp/mã đã tồn tại.
-- Chạy trong transaction; đếm rồi COMMIT.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Bổ sung vài giấy in nhanh còn thiếu (substrate_sheet, loose+bound)
--    ON CONFLICT theo code (code UNIQUE) → chạy lại không nhân đôi.
-- ─────────────────────────────────────────────────────────────
INSERT INTO materials (code, name, type, category, category_tab, unit, gsm, unit_price, cost_price,
                       material_format, price_unit, scope_loose, scope_bound, scope_large_format, scope_offset,
                       stock, min_stock, status)
VALUES
  ('PP_COUCHE_350', 'Couche 350gsm',        'paper', 'printing', 'substrate_sheet', 'tờ', 350, 0, 0, 'sheet', 'sheet', true, true, false, false, 500, 50, 'normal'),
  ('PP_FORD_100',   'Ford 100gsm',          'paper', 'printing', 'substrate_sheet', 'tờ', 100, 0, 0, 'sheet', 'sheet', true, true, false, false, 500, 50, 'normal'),
  ('PP_BRISTOL_300','Bristol 300gsm',       'paper', 'printing', 'substrate_sheet', 'tờ', 300, 0, 0, 'sheet', 'sheet', true, true, false, false, 500, 50, 'normal'),
  ('PP_MYTHUAT_300','Giấy Mỹ Thuật 300gsm', 'paper', 'printing', 'substrate_sheet', 'tờ', 300, 0, 0, 'sheet', 'sheet', true, true, false, false, 300, 30, 'normal')
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. Định mức IN NHANH (pricing_tiers) — mọi tổ hợp:
--    giấy in nhanh (substrate_sheet, loose|bound) × khổ scope_loose × 2 mặt × 2 màu × 4 mốc SL.
--    Giá/tờ = làm tròn 50 của: (400 + gsm*3) × hệ_màu × hệ_mặt × hệ_mốc.
--    Bỏ tổ hợp đã tồn tại (idempotent).
-- ─────────────────────────────────────────────────────────────
INSERT INTO pricing_tiers (material_id, paper_size_id, technology, print_side, print_type,
                           quantity_from, quantity_to, price_per_sheet)
SELECT m.id, ps.id, 'digital_toner', side.v, ptype.v, q.qfrom, q.qto,
       round(
         ( (400 + COALESCE(m.gsm,150)*3)
           * ptype.mult
           * side.mult
           * q.mult
         ) / 50.0
       ) * 50 AS price_per_sheet
FROM materials m
CROSS JOIN paper_sizes ps
CROSS JOIN (VALUES ('single',1.0),('double',1.8)) AS side(v,mult)
CROSS JOIN (VALUES ('4c',1.0),('bw',0.6))         AS ptype(v,mult)
CROSS JOIN (VALUES (1,99,1.3),(100,499,1.1),(500,999,1.0),(1000,NULL,0.9)) AS q(qfrom,qto,mult)
WHERE m.category_tab = 'substrate_sheet'
  AND (m.scope_loose OR m.scope_bound)
  AND ps.scope_loose
  AND NOT EXISTS (
    SELECT 1 FROM pricing_tiers t
    WHERE t.material_id = m.id AND t.paper_size_id = ps.id
      AND t.print_side = side.v AND t.print_type = ptype.v
      AND t.quantity_from = q.qfrom
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Định mức KHỔ LỚN (large_format_pricing) — mọi vật tư scope_large_format × 3 mốc diện tích.
--    Giá/m² = làm tròn 1000 của: base_theo_loại × hệ_mốc. min_charge 50k.
--    Bỏ vật tư đã có mốc (idempotent).
-- ─────────────────────────────────────────────────────────────
INSERT INTO large_format_pricing (material_id, material_code, material_name,
                                  area_from, area_to, price_per_sqm, min_charge, is_active)
SELECT m.id, m.code, m.name, band.afrom, band.ato,
       round(
         ( CASE
             WHEN m.name ILIKE '%hiflex%'  THEN 45000
             WHEN m.name ILIKE '%pp%'      THEN 90000
             WHEN m.name ILIKE '%canvas%'  THEN 150000
             WHEN m.name ILIKE '%decal%'   THEN 120000
             WHEN m.name ILIKE '%simili%'  THEN 110000
             ELSE 80000
           END * band.mult
         ) / 1000.0
       ) * 1000 AS price_per_sqm,
       50000, true
FROM materials m
CROSS JOIN (VALUES (0.0,5.0,1.2),(5.0,20.0,1.0),(20.0,NULL,0.85)) AS band(afrom,ato,mult)
WHERE m.scope_large_format
  -- Chỉ VẬT LIỆU IN (substrate) — KHÔNG lấy surface/tooling/ink dù bị bật scope_large_format
  -- rộng tay trong DB (cùng luật lọc fetchQuoteMaterials dùng cho dropdown).
  AND m.category_tab IN ('substrate_sheet', 'substrate_roll')
  AND NOT EXISTS (SELECT 1 FROM large_format_pricing lf WHERE lf.material_id = m.id);

-- ─────────────────────────────────────────────────────────────
-- ĐẾM kết quả trước khi COMMIT
-- ─────────────────────────────────────────────────────────────
SELECT 'materials tong' AS bang, count(*)::text AS n FROM materials
UNION ALL SELECT 'pricing_tiers tong', count(*)::text FROM pricing_tiers
UNION ALL SELECT 'pricing_tiers so vat tu', count(DISTINCT material_id)::text FROM pricing_tiers
UNION ALL SELECT 'large_format_pricing tong', count(*)::text FROM large_format_pricing
UNION ALL SELECT 'large_format so vat tu', count(DISTINCT material_id)::text FROM large_format_pricing;

COMMIT;
