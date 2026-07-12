-- Thêm cột lưu email + người liên hệ của khách trên báo giá.
-- Trước đây form "Báo giá mới" thu thập customer_email/customer_contact nhưng KHÔNG có cột
-- để lưu → mất dữ liệu khi Sửa. Bổ sung (nullable, additive, an toàn/idempotent).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_email   character varying(100);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_contact character varying(255);
