# ZeplaoPrint Chatbot — Lộ trình lên "top 1" (thực thi 2026-06-15)

Tài liệu theo dõi việc nâng chatbot lên chuẩn best-in-class. Các quyết định đã chốt, không bàn lại.

## ✅ P0 — ĐÃ LÀM (code + test xanh, build xanh)

### 1. Bộ Eval RAG (đo được mới chứng minh được "thông minh")
- `src/modules/suggestions/eval/rag-metrics.ts` — metric chuẩn IR: Precision@K, Recall@K, HitRate@K, F1@K, MRR, NDCG@K + `aggregate` (macro-average).
- `src/modules/suggestions/eval/golden-dataset.ts` — 10 câu hỏi vàng tiếng Việt ngành in (giá/chất liệu/kỹ thuật/gia công/thời gian), kèm `relevantDocTitles`, `mustContain`, `intent`.
- `src/modules/suggestions/eval/rag-eval.runner.ts` — chạy golden → KB search thật → in báo cáo + **ngưỡng regression** (recall ≥0.6, mrr ≥0.5, ndcg ≥0.5), exit 1 nếu tụt. Chạy: `npm run eval:rag` (cần DB + KB seeded).
- Test: `rag-metrics.spec.ts` (8 ca, giá trị tính tay).

### 2. Vá lỗ hổng recall (#1) — bỏ keyword-gate
- `knowledge-base.service.ts > searchChunks`: TRƯỚC lọc ứng viên bằng SQL `LIKE %từ_khóa%` → vector chỉ re-rank trên chunk đã trùng từ khóa ⇒ mất chunk gần nghĩa khác từ. NAY lấy toàn bộ chunk active làm ứng viên → dense (vector) đưa được chunk gần nghĩa vào dù không trùng từ khóa.
- Test: `hybrid-search.spec.ts` — chứng minh chunk không trùng từ khóa vẫn được truy hồi.

### 3. Đa-provider AI + nạp key từ ai-config.json lúc boot (sửa gốc "trả lời máy móc")
- **Gốc rễ**: ENV không có key AI nào; UI Settings lưu key vào `ai-config.json` và set `process.env` NGAY lúc lưu, nhưng sau RESTART không ai nạp lại → `ConfigService.get('GEMINI_API_KEY'|'AI_PROVIDER_2_KEY'|...)` trống → LLM fail → bot rơi xuống template-fallback = "máy móc".
- `ai-provider.service.ts > getProviders()`: đọc cả `ai-config.json` (mảng provider), env ưu tiên, cache 10s. Hỗ trợ: OpenAI, Gemini, Groq + bất kỳ endpoint OpenAI-compatible (Ollama local / OpenRouter). Test: `ai-provider.service.spec.ts` (18 ca, mock `fs`).
- `src/config/ai-config.loader.ts > loadAiConfigKeys()`: nạp vào `ConfigModule.forRoot({ load: [...] })` lúc boot → key có sẵn cho ConfigService trên TẤT CẢ điểm đọc (embeddings/rerank/query-expansion, không chỉ getProviders). Env vẫn ưu tiên. Test: `ai-config.loader.spec.ts` (8 ca).
- **Lưu ý vận hành**: key 401 (OpenAI hết hạn) / 429 (Gemini quá quota) là vấn đề tài khoản, KHÔNG phải bug code. Cách xử lý: thay key OpenAI còn hạn, hoặc kiểm tra quota Gemini; gợi ý thêm **Groq** (free-tier rộng) hoặc **Ollama** chạy local (miễn phí, offline).

### 3b. Gắn BẤT KỲ API nào (hệ provider mở — 2026-06-18)
Provider không còn hard-code 3 cái. Định tuyến theo `apiType` (`openai` = chuẩn `/chat/completions`, `gemini` = Google native), nên thêm nhà cung cấp mới = chỉ khai báo cấu hình.
- **Preset có sẵn** (chỉ cần `apiKey`): `openai`, `gemini`, `groq`, `openrouter`, `together`, `deepseek`, `mistral`, `xai`, `ollama`.
- **Provider tùy ý** (bất kỳ endpoint OpenAI-compatible) — thêm vào `ai-config.json`:
  ```json
  { "provider": "mycorp-llm", "apiKey": "key-123", "model": "corp-7b",
    "endpoint": "https://llm.mycorp.vn/v1/chat/completions", "apiType": "openai", "enabled": true }
  ```
  Provider lạ BẮT BUỘC có `endpoint`; thiếu sẽ bị bỏ qua (log cảnh báo).
- **Gắn nhanh 1 API qua ENV** (không cần sửa file): `AI_CUSTOM_NAME`, `AI_CUSTOM_KEY` (+ `AI_CUSTOM_ENDPOINT`, `AI_CUSTOM_MODEL`, `AI_CUSTOM_TYPE`).
- Thứ tự fallback: ENV preset → ENV custom → `ai-config.json`. Trùng tên thì nguồn xuất hiện trước thắng (ENV ưu tiên file). Circuit-breaker áp dụng cho mọi provider.
- UI Settings (`GET/PUT suggestions/ai-config`) đã giữ `endpoint`/`apiType` và hiển thị cả provider tùy ý chỉ-có-trong-file.
- Test: `ai-provider.service.spec.ts` (preset mới deepseek, provider lạ có/không endpoint, apiType=gemini proxy, ENV custom, kiểm apiType).
- *Chưa làm*: provider-swap cho **embeddings** (đổi provider = đổi số chiều vector → re-index `kb_chunks`) và **agent tool-calling** (schema OpenAI `tools` ≠ Gemini `functionDeclarations` → cần adapter). Việc lớn, để sau.

## 🔜 P0 còn lại / P1 / P2 — THIẾT KẾ ĐÃ CHỐT (cần infra/DB nên làm khi có môi trường)

### P0b. pgvector + HNSW (mở rộng truy hồi đúng chuẩn)
Hiện quét toàn bộ chunk trong JS (ổn với KB nhỏ markdown). Khi KB lớn:
- Bật extension `pgvector`, đổi cột `kb_chunks.embedding` → kiểu `vector(768)` (text-embedding-004 = 768 chiều), tạo index HNSW.
- Truy hồi: `ORDER BY embedding <=> $query LIMIT N` (dense) + full-text `tsvector` tiếng Việt (sparse) → **RRF fusion** (k=60). Reranker giữ nguyên.
- Lý do chưa làm: cần cài extension + migration trên Postgres thật + verify; không sửa mù.

### P1. Observability/tracing (hết "mù" production)
- Tích hợp **Langfuse** (self-host) hoặc OpenTelemetry: trace mỗi lượt = prompt → retrieval (chunk+score) → tool calls → guardrail → output + token/cost/latency.
- Gom token (đã đếm trong `ai-provider`) thành dashboard cost/conversation + alert lỗi/độ trễ.

### P1. Agent pipeline resilient + provider-agnostic
- `agent-pipeline.service` đang khóa cứng Gemini + `fetch` thô. Chuyển: đi qua `ai-provider` (circuit-breaker/fallback), hỗ trợ tool-calling OpenAI (`tools`/`tool_calls`), khi max-step thì trả lời tốt nhất thay vì rỗng.

### P2. Chuẩn hóa còn lại
- **Reranker chuyên dụng** (bge-reranker / Cohere) thay vì gọi LLM/truy vấn (giảm latency+cost).
- **Prompt versioning**: tách prompt ra store + version + A/B, eval trước khi promote.
- **Guardrail input**: lọc prompt-injection + PII trên text Zalo trước khi vào prompt; safety cho cả OpenAI/Groq (hiện chỉ Gemini).
- **Embedding async**: đưa sinh embedding vào hàng đợi (BullMQ đã có) thay vì đồng bộ lúc upload; cân nhắc embedding đa ngữ (bge-m3) cho tiếng Việt.
- **Tách `ai-suggest` monolith** (~1000 dòng) thành các bước pipeline rõ ràng; rà soát các service learning/memory/outcome (xác minh thực-hay-khung).

## Tham chiếu chuẩn
- RAG hybrid + rerank + pgvector: dbi-services pgvector RAG; DeepSeek-RAG-Chatbot (BM25+FAISS+rerank+HyDE); NovaSearch RAG-Retrieval (ColBERT/reranker).
- Eval: Advanced-RAG-Evaluation (P@K/Recall@K/MRR/NDCG).
- Agent observability/eval: LangChain (prod monitoring), Arthur (launch checklist), MLflow/Langfuse, futureagi (LLM-as-judge + offline regression + runtime guardrails).
