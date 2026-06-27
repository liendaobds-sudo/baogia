-- 2026-06-27 — Nới pricing_config.config_value: varchar(255) → text
--
-- Lý do: các giá trị cấu hình dạng JSON (offset.ProductConfig, offset.WasteStages,
-- waste_category_map…) được lưu qua ConfigStore.saveProductConfig / saveWasteStages
-- vượt quá 255 ký tự → INSERT/UPDATE lỗi "value too long for type character varying(255)",
-- khiến tính năng "Cấu Hình Sản Phẩm Offset" và "Định mức hao công đoạn" không lưu được.
--
-- Nới sang text là thao tác KHÔNG mất dữ liệu (widening). An toàn chạy nhiều lần.
ALTER TABLE pricing_config ALTER COLUMN config_value TYPE text;
