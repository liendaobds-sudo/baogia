-- Seed bảng đơn vị tính chuẩn (units) + backfill materials.unit_id theo symbol.
-- Đơn vị là DANH SÁCH CHUẨN (không gõ tay/không cứng). Idempotent.

INSERT INTO units (code, name, symbol, type) VALUES
    ('sheet',      'Tờ',          'tờ',     'count'),
    ('piece',      'Cái',         'cái',    'count'),
    ('roll',       'Cuộn',        'cuộn',   'count'),
    ('sqm',        'Mét vuông',   'm²',     'area'),
    ('kg',         'Kilôgam',     'kg',     'weight'),
    ('sheet_big',  'Tấm',         'tấm',    'count'),
    ('impression', 'Bài in',      'bài',    'count'),
    ('book',       'Quyển',       'quyển',  'count'),
    ('bag',        'Túi',         'túi',    'count'),
    ('box',        'Hộp',         'hộp',    'count'),
    ('set',        'Bộ',          'bộ',     'count'),
    ('turn',       'Lượt',        'lượt',   'count')
ON CONFLICT (code) DO NOTHING;

-- Backfill unit_id cho vật tư: khớp chuỗi `unit` cũ với symbol chuẩn ('m2' → 'm²').
UPDATE materials m
SET unit_id = u.id
FROM units u
WHERE (m.unit = u.symbol OR (m.unit = 'm2' AND u.symbol = 'm²'));

-- Chuẩn hoá lại chuỗi unit về symbol chuẩn (vd 'm2' → 'm²') để hiển thị đồng nhất.
UPDATE materials m
SET unit = u.symbol
FROM units u
WHERE m.unit_id = u.id AND m.unit <> u.symbol;
