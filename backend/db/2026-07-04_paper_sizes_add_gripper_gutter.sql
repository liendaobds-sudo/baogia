-- ════════════════════════════════════════════════════════════════════════
-- paper_sizes: thêm gripper_cm + gutter_cm (thông số bình bài theo TỪNG khổ) — 2026-07-04
--
-- BỐI CẢNH: nhíp (gripper) và khe hở giữa con (gutter) là thông số VẬT LÝ của
-- máy in, phải cấu hình theo từng khổ giấy để engine bình bài (nestOnSheet) tính
-- đúng số con/tờ ≡ giá ≡ preview. Trước đây nesting hardcode 12mm/3mm còn engine
-- giá đọc mặc định param → hai bên vênh nhau.
--
-- Lề (margin_*) đã có sẵn (int, mm). Chỉ bổ sung gripper/gutter.
-- Đơn vị: cm (decimal) — khớp KhoIn.gripperCm/gutterCm + resolveMarginConfig (×10 → mm).
-- Nullable, KHÔNG default: khổ chưa set → engine dùng fallback params.Gripper_Cm/Gutter_Cm.
--
-- config-store.service.ts ĐÃ đọc 2 cột này (query tách, safeQuery nuốt lỗi nếu thiếu).
-- Idempotent. KHÔNG bật synchronize.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS gripper_cm decimal(10,2);
ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS gutter_cm  decimal(10,2);
