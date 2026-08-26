-- ════════════════════════════════════════════════════════════════════════
-- Vector hóa tóm tắt hội thoại (pgvector) — 2026-07-15
--
-- BỐI CẢNH: trí nhớ chốt sale (AiMemoryService) và tìm hội thoại tương tự
-- (ConversationSearchService) trước đây khớp bằng SQL LIKE + keyword-overlap →
-- hỏi cùng ý nhưng khác từ ngữ ("in card visit" vs "làm danh thiếp") thì không
-- truy được nhau. Nâng lên tìm kiếm ngữ nghĩa nearest-neighbor trên vector của
-- conversations.ai_summary (Gemini text-embedding-004, 768 chiều).
--
-- CHỈ ÁP TRÊN POSTGRES. Cột `vector` KHÔNG khai trong TypeORM entity (tránh
-- SQLite synchronize:true ở test cố tạo type `vector` → vỡ). Dev/test SQLite
-- chạy nhánh fallback keyword như cũ; Postgres prod chạy nhánh NN vector.
--
-- Áp trong maintenance window (prod synchronize:false). Idempotent qua IF NOT
-- EXISTS. RLS: conversations đã có policy tenant_isolation (Pha B) → truy vấn NN
-- qua connection tenant-transactional tự được lọc theo tenant, cột mới kế thừa.
-- Sau khi áp: chạy backfill script cho các WON conversation đã có ai_summary.
-- Rollback: DROP INDEX ... ; ALTER TABLE conversations DROP COLUMN summary_embedding;
-- ════════════════════════════════════════════════════════════════════════

-- 1) Extension pgvector (cần quyền tạo extension — superuser hoặc rds_superuser).
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Cột vector 768 chiều (khớp text-embedding-004). NULL = chưa sinh embedding.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary_embedding vector(768);

-- 3) Index HNSW cho cosine distance (toán tử <=>). Chỉ tạo khi chưa có.
--    HNSW: truy vấn NN nhanh, build chậm hơn ivfflat nhưng không cần train.
CREATE INDEX IF NOT EXISTS idx_conversations_summary_embedding
  ON conversations USING hnsw (summary_embedding vector_cosine_ops);
