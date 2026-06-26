-- ════════════════════════════════════════════════════════════════════════
-- Tạo 2 bảng bị thiếu khi migrate MySQL → PostgreSQL (zeplao_erp)
-- Ngày: 2026-06-19
--
-- BỐI CẢNH: probe DB cho thấy `binding_types` và `ink_costs` KHÔNG tồn tại ở
-- bất kỳ schema nào, nhưng code vẫn truy vấn chúng:
--   • binding_types ← pricing.service.getBindingCost ← bound-calculator (LUỒNG SỐNG:
--     báo giá sản phẩm đóng cuốn). Thiếu bảng → chi phí đóng cuốn luôn = 0 (bị .catch nuốt).
--   • ink_costs    ← system-settings.findAllInkCosts/saveInkCosts/calculateCostPerSheet
--     (công cụ ước tính giá thành theo chi phí). Thiếu bảng → chi phí mực = 0.
--
-- is_active = BOOLEAN (theo quy ước cột is_active trong STRUCTURE.md mục 4).
-- Dữ liệu seed là ĐỊNH MỨC MẪU để chạy luồng logic — KHÔNG phải giá thị trường thật.
-- Idempotent: chạy lại nhiều lần an toàn (IF NOT EXISTS + ON CONFLICT DO NOTHING).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. binding_types ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS binding_types (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50)  NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    name_en         VARCHAR(100),
    min_pages       INTEGER      DEFAULT 0,
    max_pages       INTEGER,
    price_per_book  NUMERIC(15,2) NOT NULL DEFAULT 0,
    price_per_page  NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    sort_order      INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    DEFAULT NOW(),
    updated_at      TIMESTAMP    DEFAULT NOW()
);

-- Seed: 5 kiểu đóng cuốn khớp pricingCode trong quote/extractors/binding-extractor.ts
-- Công thức dùng: cost = (price_per_book + price_per_page * pageCount) * quantity
INSERT INTO binding_types (code, name, name_en, min_pages, max_pages, price_per_book, price_per_page, sort_order) VALUES
    ('saddle_stitch', 'Ghim lồng', 'Saddle stitch', 4,  64,    500, 0,  1),
    ('perfect_bind',  'Keo gáy',   'Perfect bind',  32, 500,  3000, 0,  2),
    ('spiral',        'Lò xo',     'Spiral/Coil',   20, 470,  5000, 0,  3),
    ('wire_o',        'Vòng bấm',  'Wire-O',        20, 300,  7000, 0,  4),
    ('hardcover',     'Bìa cứng',  'Hardcover',     48, 800, 15000, 0,  5)
ON CONFLICT (code) DO NOTHING;

-- ── 2. ink_costs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ink_costs (
    id               SERIAL PRIMARY KEY,
    print_type       VARCHAR(50)  NOT NULL UNIQUE,
    print_type_name  VARCHAR(100),
    ml_per_sheet     NUMERIC(10,4) NOT NULL DEFAULT 0,
    price_per_ml     NUMERIC(10,2) NOT NULL DEFAULT 0,
    description      TEXT,
    is_active        BOOLEAN      NOT NULL DEFAULT true,
    created_at       TIMESTAMP    DEFAULT NOW(),
    updated_at       TIMESTAMP    DEFAULT NOW()
);

-- Seed: tự sinh từ print_types (đã có sẵn) để khớp print_type code dùng trong calculateCostPerSheet.
-- ml_per_sheet dùng định mức mẫu mặc định 0.5 ml/tờ; price_per_ml mẫu = 500đ.
-- (Cột print_types.ink_ml_per_sheet đã bị gỡ — không còn engine nào dùng định mức mực theo hệ màu.)
INSERT INTO ink_costs (print_type, print_type_name, ml_per_sheet, price_per_ml, description)
SELECT code,
       name,
       0.5,
       500,
       'Định mức mẫu tự sinh từ print_types (2026-06-19)'
FROM print_types
ON CONFLICT (print_type) DO NOTHING;

-- Đảm bảo luôn có ít nhất '4c' (mặc định của calculateCostPerSheet) kể cả khi print_types rỗng.
INSERT INTO ink_costs (print_type, print_type_name, ml_per_sheet, price_per_ml, description)
VALUES ('4c', 'In 4 màu', 0.5, 500, 'Định mức mẫu mặc định')
ON CONFLICT (print_type) DO NOTHING;
