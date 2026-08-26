-- Thêm cột thời gian giao hàng trên báo giá.
-- Code OrdersService INSERT/UPDATE/clone + PDF đã tham chiếu `delivery_time`
-- nhưng schema Postgres thiếu cột → POST /erp/orders 400:
--   column "delivery_time" of relation "quotes" does not exist
-- Idempotent / additive / nullable.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivery_time character varying(100);
