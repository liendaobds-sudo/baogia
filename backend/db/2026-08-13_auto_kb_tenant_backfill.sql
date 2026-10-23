-- Auto-KB ("Auto-learned Best Practices") trước đây được tạo KHÔNG gắn tenant_id
-- (audit 2026-08-13): Q&A trích từ hội thoại chốt đơn (chứa giá đã báo, thông tin
-- khách) rơi vào pool tenant_id NULL mà tenantWhere của KB cho MỌI tenant đọc.
-- Code đã sửa: doc/chunk auto-KB nay luôn gắn tenant của hội thoại nguồn.
-- Patch này backfill dữ liệu cũ về tenant gốc (id=1) — cùng quyết định với các
-- đợt backfill Pha A (dữ liệu hiện hữu thuộc tenant mặc định).
--
-- ⚠️ PHỤ THUỘC: cột `kb_chunks.tenant_id` / `kb_documents.tenant_id` do Pha A tạo.
--    Audit 2026-08-29: đã loại khỏi `apply-patches.js` (EXCLUDED) — đây là BACKFILL DỮ LIỆU,
--    không phải schema, và trên DB mới nó fail làm ROLLBACK cả chuỗi patch sau. Chạy trong
--    chuỗi tenant, sau Pha A (xem TENANT-RLS-RUNBOOK.md). Guard dưới đây làm nó NO-OP nếu
--    chạy sai thứ tự.
--
-- Rollback (đưa về trạng thái trước backfill):
--    UPDATE kb_chunks c SET tenant_id = NULL
--      FROM kb_documents d
--     WHERE c.document_id = d.id AND d.title = 'Auto-learned Best Practices';
--    UPDATE kb_documents SET tenant_id = NULL WHERE title = 'Auto-learned Best Practices';

DO $$
DECLARE
  chunks_before  bigint;
  docs_before    bigint;
  chunks_after   bigint;
  docs_after     bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kb_chunks' AND column_name = 'tenant_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kb_documents' AND column_name = 'tenant_id'
  ) THEN
    RAISE NOTICE 'Bỏ qua: kb_chunks/kb_documents.tenant_id chưa tồn tại (chạy Pha A trước).';
    RETURN;
  END IF;

  -- Thống kê TRƯỚC (yêu cầu của rls-migrations.md cho mọi backfill dữ liệu).
  SELECT count(*) INTO chunks_before
    FROM kb_chunks c JOIN kb_documents d ON c.document_id = d.id
   WHERE d.title = 'Auto-learned Best Practices' AND c.tenant_id IS NULL;
  SELECT count(*) INTO docs_before
    FROM kb_documents WHERE title = 'Auto-learned Best Practices' AND tenant_id IS NULL;
  RAISE NOTICE 'auto-KB backfill TRƯỚC: % chunk NULL, % doc NULL', chunks_before, docs_before;

  -- Chunk kế thừa tenant từ document cha (ưu tiên nguồn chính xác hơn nếu doc đã có tenant).
  UPDATE kb_chunks c
     SET tenant_id = d.tenant_id
    FROM kb_documents d
   WHERE c.document_id = d.id
     AND d.title = 'Auto-learned Best Practices'
     AND c.tenant_id IS NULL
     AND d.tenant_id IS NOT NULL;

  -- Doc + chunk còn NULL → tenant gốc.
  UPDATE kb_chunks c
     SET tenant_id = 1
    FROM kb_documents d
   WHERE c.document_id = d.id
     AND d.title = 'Auto-learned Best Practices'
     AND c.tenant_id IS NULL;

  UPDATE kb_documents
     SET tenant_id = 1
   WHERE title = 'Auto-learned Best Practices'
     AND tenant_id IS NULL;

  SELECT count(*) INTO chunks_after
    FROM kb_chunks c JOIN kb_documents d ON c.document_id = d.id
   WHERE d.title = 'Auto-learned Best Practices' AND c.tenant_id IS NULL;
  SELECT count(*) INTO docs_after
    FROM kb_documents WHERE title = 'Auto-learned Best Practices' AND tenant_id IS NULL;
  RAISE NOTICE 'auto-KB backfill SAU: % chunk NULL, % doc NULL', chunks_after, docs_after;
END $$;
