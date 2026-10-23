-- ════════════════════════════════════════════════════════════════════════════════════════
-- Index hiệu năng — bổ sung từ audit toàn diện 2026-07-25
--
-- ⚠️ CHƯA CHẠY. Áp trong maintenance window.
--    2026-08-29 (audit): đã đổi sang `CREATE INDEX CONCURRENTLY` — KHÔNG khoá ghi, nhưng
--    KHÔNG được bọc trong transaction. Chạy bằng `psql -f` (không BEGIN/COMMIT thủ công).
--    Nếu một lệnh bị hủy giữa đường, index để lại ở trạng thái INVALID: kiểm bằng
--      SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE NOT i.indisvalid;
--    rồi DROP INDEX và chạy lại lệnh đó.
--
-- BỐI CẢNH: đối chiếu WHERE/ORDER BY thực tế của các query nóng với index đang có trong
-- `db/schema.postgres.sql` (31 index, TOÀN BỘ là index đơn cột) cho thấy các predicate
-- tổ hợp dưới đây đang phải seq-scan + sort:
--
--   1. orders.service.findAllQuotes  : (tenant_id = $ OR IS NULL) + status + ORDER BY created_at DESC
--      → snapshot 2026-06-25 chỉ có index tenant_id trên `users`. LƯU Ý (sửa 2026-08-29):
--        Pha A tạo `idx_<table>_tenant` cho MỌI bảng org-scoped (gồm `quotes`) và README ghi
--        Pha A đã áp trên DB thật ⇒ index tenant_id đơn cột ĐÃ CÓ. Vì vậy `idx_quotes_tenant_id`
--        trong bản gốc của file này là TRÙNG và đã được gỡ; index tổ hợp bên dưới mới là thứ cần.
--   2. messages.findByConversation   : conversation_id = $ + is_local_deleted = false
--                                      + ORDER BY created_at DESC LIMIT n
--      → 2 index rời (conversation_id), (created_at) ⇒ PG phải sort toàn bộ tin của hội thoại.
--   3. conversations.findAll         : ORDER BY is_pinned DESC, last_message_at DESC
--   4. contacts.findAll              : ORDER BY last_contact_at DESC NULLS LAST
--   5. knowledge-base.getChunks      : kb_chunks WHERE document_id = $ / is_active
--
-- Điều kiện tiên quyết: file `db/2026-07-12_perf_indexes_quotes.sql` phải đã được áp
-- (kiểm bằng `\di idx_quote*`). Audit không xác nhận được nó đã áp trên DB thật.
--
-- An toàn: chỉ THÊM index, idempotent qua IF NOT EXISTS, không đổi dữ liệu/schema logic.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- 1) quotes: cô lập tenant + lọc trạng thái + sắp theo thời gian (đường list báo giá/đơn hàng)
-- (gỡ 2026-08-29) idx_quotes_tenant_id — trùng `idx_quotes_tenant` do Pha A tạo, và bị bao
-- bởi idx_quotes_tenant_created_at bên dưới. Index thừa chỉ làm chậm ghi.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_status_created_at ON quotes(status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotes_tenant_created_at ON quotes(tenant_id, created_at DESC);

-- 2) messages: phân trang tin theo hội thoại (cursor `before` + LIMIT)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created_at ON messages(conversation_id, created_at DESC);

-- 3) conversations: thứ tự inbox (ghim trước, hoạt động mới nhất trước) + lọc badge chưa đọc
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_pinned_last_msg ON conversations(is_pinned DESC, last_message_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_channel_unread ON conversations(channel_id, unread_count);

-- 4) contacts: danh sách liên hệ sắp theo lần liên hệ cuối
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_last_contact_at ON contacts(last_contact_at DESC);

-- 5) kb_chunks: lấy chunk theo tài liệu + lọc active (retrieval RAG)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_chunks_document_id ON kb_chunks(document_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kb_chunks_is_active ON kb_chunks(is_active);

-- ─── Kiểm tra sau khi áp ────────────────────────────────────────────────────────────────
--   SELECT tablename, indexname FROM pg_indexes
--    WHERE schemaname = 'public'
--      AND indexname LIKE 'idx_%'
--    ORDER BY tablename, indexname;
--
-- Và xác nhận kế hoạch đã dùng index:
--   EXPLAIN ANALYZE SELECT q.* FROM quotes q
--    WHERE (q.tenant_id = 1 OR q.tenant_id IS NULL) AND q.status = 'draft'
--    ORDER BY q.created_at DESC LIMIT 30;
