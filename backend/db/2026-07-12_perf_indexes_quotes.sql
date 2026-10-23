-- ════════════════════════════════════════════════════════════════════════
-- Index hiệu năng cho đường báo giá / khách hàng / khổ lớn — 2026-07-12
--
-- BỐI CẢNH (audit hiệu năng): các cột JOIN/WHERE/ORDER nóng nhất chưa có index.
-- Ở quy mô nhỏ seq-scan còn rẻ, nhưng khi quotes/quote_items lên chục nghìn dòng:
--   - list báo giá (_attachQuoteItems: WHERE quote_id = ANY($1)) → seq-scan quote_items.
--   - trang khách hàng (subquery đếm đơn/tổng chi theo customer_id) → O(customers × quotes).
--   - dashboard/KPI filter+ORDER theo status / created_at → quét toàn quotes nhiều lần.
--   - báo giá khổ lớn (getTieredPricing WHERE material_id) → Postgres KHÔNG tự index FK.
--
-- Nguồn sự thật schema = TypeORM entities (đã thêm @Index tương ứng); prod chạy
-- synchronize:false nên áp bằng file này trong maintenance window. Chỉ THÊM index →
-- không khóa ghi lâu (CREATE INDEX thường; cân nhắc CONCURRENTLY nếu bảng đã lớn &
-- không chạy trong transaction). Idempotent qua IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════════════

-- quote_items: lookup theo quote_id (list + chi tiết báo giá, batch-attach)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);

-- quotes: filter/ORDER thường dùng
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);

-- large_format_pricing: FK material_id (Postgres không tự index FK) — filter mỗi báo giá khổ lớn
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_large_format_material_id ON large_format_pricing(material_id);
