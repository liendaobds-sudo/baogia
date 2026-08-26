-- Seed đơn vị số lượng (unified_products.unit) theo quote_type.
-- Chỉ ghi đè khi unit IS NULL hoặc rỗng — giữ unit tenant đã cấu hình.
-- Nguồn quy ước: backend/src/modules/pricing/lib/quote-units.ts (defaultBasisForQuoteType).
--
-- Mapping:
--   bound         → cuốn
--   large_format  → tấm
--   to_roi        → tờ
--   còn lại       → cái
-- Idempotent.

UPDATE unified_products
SET unit = 'cuốn',
    updated_at = NOW()
WHERE (unit IS NULL OR btrim(unit) = '')
  AND lower(quote_type) IN ('bound', 'sach', 'catalog', 'book');

UPDATE unified_products
SET unit = 'tấm',
    updated_at = NOW()
WHERE (unit IS NULL OR btrim(unit) = '')
  AND lower(quote_type) IN ('large_format', 'lf', 'kho_lon');

UPDATE unified_products
SET unit = 'tờ',
    updated_at = NOW()
WHERE (unit IS NULL OR btrim(unit) = '')
  AND lower(quote_type) IN ('to_roi', 'flyer');

UPDATE unified_products
SET unit = 'cái',
    updated_at = NOW()
WHERE (unit IS NULL OR btrim(unit) = '');
