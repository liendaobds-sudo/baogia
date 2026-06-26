-- print-method-unification — Phase 3 (Task 9.1)
-- Đưa 5 loại offset vào catalog method-agnostic `unified_products`:
--   to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay
--
-- Nguyên tắc (Req 3.1, 3.4, 9.1, 9.5):
--  - Sản phẩm ĐỘC LẬP với phương pháp in: tên không nhắc tới "offset/digital".
--    `quote_type` chỉ là GỢI Ý ĐỊNH TUYẾN plugin (OffsetMethodPlugin.appliesTo đọc giá trị này),
--    KHÔNG phải "loại sản phẩm cứng" và KHÔNG phải trường khoá-engine.
--  - KHÔNG thêm trường khoá-engine nào vào sản phẩm.
--  - `allowed_materials / allowed_paper_sizes / allowed_processing` để NULL: phạm vi tài nguyên
--    offset được quản ở MỘT nguồn duy nhất là Tài_Nguyên_Dùng_Chung
--    (`materials.scope_offset`, `paper_sizes.scope_offset`, `processing_options.scope_offset`),
--    KHÔNG nhân đôi danh mục xuống từng sản phẩm (Req 3.4).
--
-- Idempotent: ON CONFLICT (code) DO NOTHING — chạy lại không tạo bản ghi trùng (Req giữ dữ liệu hiện có).
-- Target: PostgreSQL (đồng bộ với các migration anh em trong thư mục này).
-- _Requirements: 3.1, 3.4, 9.1, 9.5_

INSERT INTO unified_products
    (code, name_vi, name_en, quote_type, unit, parent_category_code,
     ai_keywords, icon, description_vi, is_active, has_auto_pricing,
     allowed_materials, allowed_paper_sizes, allowed_processing, sort_order)
VALUES
    ('offset_to_roi',        'Tờ rơi',          'Flyer',        'to_roi',
        'tờ', NULL,
        '["tờ rơi","flyer","brochure","tờ gấp","leaflet"]', 'fa-file-alt',
        'Tờ rơi / tờ gấp — định tuyến tính giá qua phương pháp offset.', true, true,
        NULL, NULL, NULL, 101),

    ('offset_bi_thu_folder', 'Bì thư / Folder', 'Envelope / Folder', 'bi_thu_folder',
        'cái', NULL,
        '["bì thư","phong bì","folder","kẹp file","envelope"]', 'fa-envelope',
        'Bì thư / Folder — định tuyến tính giá qua phương pháp offset.', true, true,
        NULL, NULL, NULL, 102),

    ('offset_sp_khac',       'Sản phẩm khác',   'Other product', 'sp_khac',
        'cái', NULL,
        '["sản phẩm khác","tem nhãn","poster","standee","in khác"]', 'fa-shapes',
        'Sản phẩm in khác theo khổ in — định tuyến tính giá qua phương pháp offset.', true, true,
        NULL, NULL, NULL, 103),

    ('offset_hop_giay',      'Hộp giấy',        'Paper box',    'hop_giay',
        'cái', NULL,
        '["hộp giấy","hộp đựng","hộp carton","vỏ hộp","paper box"]', 'fa-box',
        'Hộp giấy (có khuôn bế) — định tuyến tính giá qua phương pháp offset.', true, true,
        NULL, NULL, NULL, 104),

    ('offset_tui_giay',      'Túi giấy',        'Paper bag',    'tui_giay',
        'cái', NULL,
        '["túi giấy","túi đựng","túi quà","shopping bag","paper bag"]', 'fa-shopping-bag',
        'Túi giấy (có khuôn bế) — định tuyến tính giá qua phương pháp offset.', true, true,
        NULL, NULL, NULL, 105)
ON CONFLICT (code) DO NOTHING;
