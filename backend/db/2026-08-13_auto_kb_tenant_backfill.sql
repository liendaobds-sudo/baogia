-- Auto-KB ("Auto-learned Best Practices") trước đây được tạo KHÔNG gắn tenant_id
-- (audit 2026-08-13): Q&A trích từ hội thoại chốt đơn (chứa giá đã báo, thông tin
-- khách) rơi vào pool tenant_id NULL mà tenantWhere của KB cho MỌI tenant đọc.
-- Code đã sửa: doc/chunk auto-KB nay luôn gắn tenant của hội thoại nguồn.
-- Patch này backfill dữ liệu cũ về tenant gốc (id=1) — cùng quyết định với các
-- đợt backfill Pha A (dữ liệu hiện hữu thuộc tenant mặc định).

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
