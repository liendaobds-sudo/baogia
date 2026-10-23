-- ════════════════════════════════════════════════════════════════════════
-- Gỡ "standee" khỏi ai_keywords của sản phẩm offset "Sản phẩm khác" — 2026-08-29
--
-- BỐI CẢNH (audit độ thông minh chatbot AI):
--   `migrations/unified_products_offset.sql` seed `offset_sp_khac` với ai_keywords
--   ["sản phẩm khác","tem nhãn","poster","standee","in khác"].
--   Standee là in phun khổ lớn trên PP, KHÔNG phải in offset trên tờ giấy.
--   Hệ quả trên đường chạy thật: khách nhắn "in standee 60x160" →
--   `detectProduct` khớp keyword "standee" (7 ký tự ⇒ confidence 0.35) → khoá hội thoại
--   vào template offset → hỏi sai bộ trường (khổ tờ, số con/tờ, kẽm) và định tuyến sai
--   phương pháp tính giá. Standee phải đi đường large_format.
--
-- Patch này chỉ sửa DỮ LIỆU seed đã nằm trong DB (migration đã áp thì sửa file nguồn không
-- có tác dụng với DB đang chạy). Idempotent, chỉ tác động đúng một dòng theo `code`.
--
-- Lưu ý vận hành: đây là bảng cấu hình sản phẩm dùng chung, thay đổi có hiệu lực ngay với mọi
-- tenant. KHÔNG áp trực tiếp lên DB đang phục vụ mà không có cửa sổ bảo trì.
-- Target: PostgreSQL.
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_before text;
    v_after  text := '["sản phẩm khác","tem nhãn","poster","in khác"]';
BEGIN
    SELECT ai_keywords::text INTO v_before
    FROM unified_products
    WHERE code = 'offset_sp_khac'
    LIMIT 1;

    IF v_before IS NULL THEN
        RAISE NOTICE 'Bỏ qua: không có unified_products.code = offset_sp_khac.';
        RETURN;
    END IF;

    IF position('standee' in lower(v_before)) = 0 THEN
        RAISE NOTICE 'Bỏ qua: ai_keywords của offset_sp_khac đã không còn "standee".';
        RETURN;
    END IF;

    UPDATE unified_products
    SET ai_keywords = v_after
    WHERE code = 'offset_sp_khac';

    RAISE NOTICE 'Đã sửa ai_keywords offset_sp_khac: % → %', v_before, v_after;
END $$;
