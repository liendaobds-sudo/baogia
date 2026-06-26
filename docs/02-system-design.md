# System Design — ZeplaoPrint AI Agent Assist

> **Phiên bản:** 1.0 · **Ngày:** 2026-03-02

---

## 1. Kiến trúc tổng quan (C4 — Context)

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTERNET                                 │
│                                                                 │
│   ┌──────────┐    ┌──────────────┐    ┌──────────────────┐      │
│   │  Khách   │───▶│  Zalo OA     │───▶│  Zalo Platform   │      │
│   │  hàng    │    │  (chat)      │    │  Webhook / API   │      │
│   └──────────┘    └──────────────┘    └────────┬─────────┘      │
│                                                │                │
│   ┌──────────┐    ┌──────────────┐    ┌────────▼─────────┐      │
│   │  Khách   │───▶│  FB Page     │───▶│  Meta Webhook    │      │
│   │  hàng    │    │  (Phase 2)   │    │  / API (Phase 2) │      │
│   └──────────┘    └──────────────┘    └────────┬─────────┘      │
│                                                │                │
└────────────────────────────────────────────────┼────────────────┘
                                                 │
                    ┌────────────────────────────────────────────┐
                    │            ZeplaoPrint SYSTEM                  │
                    │                                            │
                    │  ┌─────────────┐   ┌────────────────────┐  │
                    │  │  Webhook    │──▶│  Message Queue      │  │
                    │  │  Receiver   │   │  (BullMQ / Redis)   │  │
                    │  └─────────────┘   └────────┬───────────┘  │
                    │                             │              │
                    │                    ┌────────▼───────────┐  │
                    │                    │  Core API Server   │  │
                    │                    │  (NestJS)          │  │
                    │                    └─┬───┬───┬───┬──────┘  │
                    │                      │   │   │   │         │
                    │            ┌─────────┘   │   │   └──────┐  │
                    │            ▼             ▼   ▼          ▼  │
                    │  ┌──────────┐  ┌──────┐ ┌────────┐ ┌────┐  │
                    │  │ AI/RAG   │  │Postgres│ │ Redis  │ │ S3 │  │
                    │  │ Service  │  │+pgvec │ │ Cache  │ │    │  │
                    │  └──────────┘  └──────┘ └────────┘ └────┘  │
                    │                                            │
                    │  ┌────────────────────────────────────┐    │
                    │  │  Frontend (Next.js)                │    │
                    │  │  Inbox · Chat · KB Admin · Dashboard│    │
                    │  └────────────────────────────────────┘    │
                    │                                            │
                    │  ┌─────────────┐                           │
                    │  │  NV CSKH    │  (Browser / Desktop)      │
                    │  │  Supervisor │                            │
                    │  │  Admin      │                            │
                    │  └─────────────┘                           │
                    └────────────────────────────────────────────┘
```

---

## 2. Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                       API Gateway / Reverse Proxy               │
│                       (Nginx / Caddy / Cloudflare)              │
└──────┬───────────┬───────────────┬──────────────────────────────┘
       │           │               │
       ▼           ▼               ▼
┌────────────┐ ┌────────────┐ ┌────────────────────────┐
│  Webhook   │ │  REST API  │ │  WebSocket Gateway     │
│  Controller│ │  (NestJS)  │ │  (Socket.IO / ws)      │
└──────┬─────┘ └──────┬─────┘ └──────────┬─────────────┘
       │              │                   │
       ▼              │                   │
┌────────────┐        │                   │
│ Inbound    │        │                   │
│ Queue      │◄───────┘                   │
│ (BullMQ)   │                            │
└──────┬─────┘                            │
       │                                  │
       ▼                                  │
┌──────────────────────────────────────────┴──────┐
│              CORE SERVICES (NestJS Modules)      │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Channel      │  │ Conversation │              │
│  │ Adapter      │  │ Service      │              │
│  │ (Zalo/FB)    │  │              │              │
│  └──────────────┘  └──────────────┘              │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Message      │  │ AI Suggest   │              │
│  │ Service      │  │ Service      │              │
│  └──────────────┘  └──────┬───────┘              │
│                           │                      │
│  ┌──────────────┐  ┌──────▼───────┐              │
│  │ Quote        │  │ RAG          │              │
│  │ Engine       │  │ Service      │              │
│  └──────────────┘  └──────────────┘              │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ KB Upload    │  │ Audit &      │              │
│  │ + Chunking   │  │ Analytics    │              │
│  └──────────────┘  └──────────────┘              │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ Auth / RBAC  │  │ Notification │              │
│  │ (JWT)        │  │ Service      │              │
│  └──────────────┘  └──────────────┘              │
│                                                  │
│  ┌──────────────┐                                │
│  │ SLA Monitor  │                                │
│  │ (Cron/Worker)│                                │
│  └──────────────┘                                │
└──────────────────────────────────────────────────┘
       │              │            │          │
       ▼              ▼            ▼          ▼
┌──────────┐  ┌────────────┐ ┌─────────┐ ┌──────┐
│ PostgreSQL│  │   Redis    │ │ OpenAI  │ │  S3  │
│ + pgvector│  │ (cache,   │ │ / Azure │ │(MinIO│
│           │  │  queue,   │ │ OpenAI  │ │  or  │
│           │  │  pubsub)  │ │         │ │cloud)│
└──────────┘  └────────────┘ └─────────┘ └──────┘
```

---

## 3. Luồng dữ liệu chính

### 3.1 Luồng nhận tin nhắn (Inbound)

```
Khách (Zalo)
    │
    ▼
Zalo Platform ──webhook POST──▶ Webhook Receiver
    │                               │
    │                     ① Verify signature
    │                     ② Deduplicate (msgId)
    │                     ③ Enqueue job
    │                               │
    │                               ▼
    │                        BullMQ: inbound_message
    │                               │
    │                     ④ Worker:
    │                       - Upsert contact
    │                       - Upsert conversation
    │                       - Insert message
    │                       - Download attachment → S3
    │                       - Update conversation.lastMessageAt
    │                       - Reset SLA timer
    │                               │
    │                     ⑤ Trigger AI Suggest (async)
    │                               │
    │                               ▼
    │                        AI Suggest Service
    │                       - Detect intent
    │                       - RAG: search KB chunks
    │                       - Slot filling check
    │                       - If slots OK → call Quote Engine
    │                       - Generate suggestion(s)
    │                       - Save suggestion to DB
    │                               │
    │                     ⑥ Emit WebSocket event:
    │                       - "new_message" (to UI)
    │                       - "new_suggestion" (to UI)
    │                               │
    │                               ▼
    │                        Frontend (Agent)
    │                       - Cột trái: hiện tin mới
    │                       - Cột phải: hiện suggestion card
```

### 3.2 Luồng gửi tin nhắn (Outbound)

```
Agent (Frontend)
    │
    ▼
① Bấm "Send" / "Edit & Send"
    │
    ▼
② POST /api/messages/send
    {conversationId, content, suggestionId?, action: "sent_as_is"|"edited"}
    │
    ▼
③ API Server:
    - Validate
    - Idempotency check
    - Enqueue job: outbound_message
    - Return 202 Accepted
    │
    ▼
④ BullMQ Worker:
    - Get channel adapter (Zalo)
    - Call Zalo OA Send API
    - On success: update message.status = "sent"
    - On fail: retry (max 3) → message.status = "failed"
    - Log audit (suggestion_id, action, edited_content)
    │
    ▼
⑤ Emit WebSocket:
    - "message_sent" / "message_failed"
    │
    ▼
⑥ Frontend: update bubble status (✓ / ✗)
```

### 3.3 Luồng AI Suggestion

```
┌──────────────────────────────────────────────────────────────┐
│                     AI Suggest Pipeline                       │
│                                                              │
│  INPUT: conversation history (last N messages)               │
│                                                              │
│  ① Intent Detection                                         │
│     - Hỏi giá? Hỏi kỹ thuật? Gửi file? Phàn nàn?          │
│     - Output: intent + product_type (nếu xác định được)     │
│                                                              │
│  ② RAG Retrieval                                             │
│     - Query = last message + context summary                 │
│     - Filter: tag = product_type (nếu có)                    │
│     - Top-K chunks (K=3..8, cosine ≥ 0.7)                   │
│     - Reranking (optional, cross-encoder)                    │
│                                                              │
│  ③ Slot Filling Check                                        │
│     - Slots needed per product_type                          │
│       VD: decal → {kích thước, chất liệu, số lượng,         │
│                     bế, cán, file thiết kế}                  │
│     - Extract filled slots from conversation                 │
│     - missing_slots = required - filled                      │
│     - If missing_slots > 0:                                  │
│         → Generate follow-up questions                       │
│         → flag: "missing_info"                               │
│                                                              │
│  ④ Quote Engine Call (if slots complete)                      │
│     - POST /internal/quote/calc                              │
│     - Input: product_type + filled slots                     │
│     - Output: price, leadtime, tech_notes, breakdown         │
│                                                              │
│  ⑤ LLM Generation                                            │
│     - System prompt (guardrails + style + trích nguồn)       │
│     - Context: chunks + slot status + quote result           │
│     - Generate 1–3 reply options                             │
│     - Attach: confidence, sources, warnings                  │
│                                                              │
│  OUTPUT → Suggestion Record                                   │
│    { replies[], missing_info[], sources[], confidence,        │
│      warnings[], quote_result?, prompt_version }              │
└──────────────────────────────────────────────────────────────┘
```

### 3.4 Luồng Upload Knowledge Base

```
Admin (Frontend)
    │
    ▼
① Upload file (PDF/DOCX/XLSX) via multipart
    │
    ▼
② API Server:
    - Validate file type & size
    - Upload to S3
    - Create KB document record (status: "processing")
    - Enqueue job: kb_process
    │
    ▼
③ KB Processing Worker:
    - Download from S3
    - Extract text (pdf-parse / mammoth / xlsx)
    - Chunking:
      * Split by section/heading
      * Overlap: 100 tokens
      * Max chunk: 500 tokens
    - Tag assignment (auto-detect + admin tags)
    - Generate embeddings (OpenAI text-embedding-3-small)
    - Store chunks + vectors in PostgreSQL (pgvector)
    - Update document status: "indexed"
    │
    ▼
④ Admin UI: status changes to "✅ Indexed (N chunks)"
```

---

## 4. Channel Adapter Pattern (Đa kênh)

```
┌─────────────────────────────────────────────────┐
│               Channel Adapter Interface          │
│                                                  │
│  interface IChannelAdapter {                     │
│    parseInboundWebhook(req): InboundMessage      │
│    sendMessage(convId, content): SendResult       │
│    verifyWebhook(req): boolean                   │
│    refreshToken(): void                          │
│    getAttachment(attachId): Buffer               │
│  }                                               │
│                                                  │
│  ┌──────────────┐    ┌──────────────┐            │
│  │ ZaloAdapter   │    │ MessengerAd. │            │
│  │ (Phase 1)     │    │ (Phase 2)    │            │
│  └──────────────┘    └──────────────┘            │
│          │                    │                   │
│          └────────┬───────────┘                   │
│                   │                              │
│                   ▼                              │
│         Core Message Service                     │
│    (channel-agnostic processing)                 │
└─────────────────────────────────────────────────┘
```

Mỗi kênh được implement qua một adapter riêng, đảm bảo:
- Core logic không phụ thuộc vào kênh cụ thể.
- Thêm kênh mới = thêm adapter + đăng ký webhook.
- Conversation model có `channel` field để phân biệt.

---

## 5. Technology Stack

| Layer              | Công nghệ                     | Lý do                                       |
| ------------------ | ----------------------------- | ------------------------------------------- |
| **Backend**        | NestJS (Node.js / TypeScript) | Module-based, DI, decorators, ecosystem tốt |
| **Database**       | PostgreSQL 16 + pgvector      | ACID, vector search native, giảm infra      |
| **Queue**          | BullMQ + Redis                | Reliable queue, retry, rate limit, delay    |
| **Cache**          | Redis                         | Session, rate limit, pub/sub cho WS         |
| **Vector**         | pgvector (extension)          | Đủ cho scale < 1M chunks; giảm thêm DB      |
| **Object Storage** | MinIO (self-host) hoặc S3     | File đính kèm, KB documents                 |
| **LLM**            | OpenAI GPT-4o / GPT-4o-mini   | Hiểu tiếng Việt tốt, function calling       |
| **Embedding**      | text-embedding-3-small        | Chi phí thấp, quality tốt                   |
| **Frontend**       | Next.js 14 (App Router)       | SSR, routing, React ecosystem               |
| **Real-time**      | Socket.IO                     | WebSocket + fallback, rooms                 |
| **Auth**           | JWT + Refresh Token           | Stateless, RBAC middleware                  |
| **Monitoring**     | Prometheus + Grafana + Loki   | Metrics, dashboards, logs                   |
| **Deploy**         | Docker Compose (MVP) → K8s    | Dễ bắt đầu, scale khi cần                   |

---

## 6. Deployment Architecture (MVP)

```
┌─────────────────────────────────────────────────┐
│                Docker Compose                    │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │  nginx       │  │  frontend    │              │
│  │  (reverse    │──│  (next.js)   │              │
│  │   proxy)     │  │  :3000       │              │
│  └──────┬───────┘  └──────────────┘              │
│         │                                        │
│  ┌──────▼───────┐  ┌──────────────┐              │
│  │  api         │──│  worker      │              │
│  │  (nestjs)    │  │  (bullmq)    │              │
│  │  :4000       │  │              │              │
│  └──────────────┘  └──────────────┘              │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │  postgres    │  │  redis       │              │
│  │  +pgvector   │  │              │              │
│  │  :5432       │  │  :6379       │              │
│  └──────────────┘  └──────────────┘              │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │  minio       │  │  grafana     │              │
│  │  (S3)        │  │  +prometheus │              │
│  │  :9000       │  │  :3001       │              │
│  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

```
┌─────────────────────────────────────────────────┐
│                 Security Layers                  │
│                                                  │
│  ① HTTPS (TLS 1.3) — all traffic                │
│  ② Webhook Verification (HMAC signature)         │
│  ③ JWT Auth + Refresh Token rotation             │
│  ④ RBAC Middleware:                              │
│     - Admin: full access                         │
│     - Supervisor: read all + assign + dashboard  │
│     - Agent: own assigned conversations          │
│  ⑤ Token Encryption (Zalo OA tokens at rest)    │
│  ⑥ PII Masking in logs                          │
│  ⑦ Rate Limiting (per user, per IP)             │
│  ⑧ Audit Log (all state changes)                │
└─────────────────────────────────────────────────┘
```

---

## 8. Scalability Considerations

| Bottleneck            | Giải pháp MVP            | Giải pháp Scale                       |
| --------------------- | ------------------------ | ------------------------------------- |
| Webhook spikes        | BullMQ queue buffer      | Auto-scale workers                    |
| AI latency            | Async + streaming        | Cache frequent queries, model routing |
| DB queries            | Indexes, connection pool | Read replicas, partitioning           |
| WebSocket connections | Socket.IO single node    | Redis adapter, sticky sessions        |
| Vector search         | pgvector (< 1M vectors)  | Migrate to Qdrant / Pinecone          |
| File storage          | MinIO single node        | S3-compatible cloud                   |

---

## 9. Implementation Status (Sprint 0-8)

> **Cập nhật:** 2026-03-02 — Đã hoàn thành 26+ features qua 9 sprint.

### 9.1 Entity Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    DATABASE ENTITIES                       │
│                                                           │
│  User ─────────────┐                                      │
│  (role, email,     │                                      │
│   fullName, hash)  │                                      │
│        │           │                                      │
│        ▼           ▼                                      │
│  Conversation ◄── Contact ◄── Channel                     │
│  (status,priority, (phone,email, (type:zalo/fb,           │
│   slaBreached,     tags,metadata) name,webhook)           │
│   assigneeId)                                             │
│        │                                                  │
│        ├── Message (senderType, content, contentType)     │
│        ├── AiSuggestion (intent, replies, confidence)     │
│        └── InternalNote (content, isPinned, author)       │
│                                                           │
│  KbDocument ── KbChunk (content, embedding, tags)         │
│  QuoteRule (productType, priceFormula, slots)             │
│  CannedResponse (title, content, shortcut, usageCount)   │
│  AuditLog (entity, action, userId, metadata)             │
│  Notification (type, data, userId)                        │
└──────────────────────────────────────────────────────────┘
```

### 9.2 Backend Modules

| Module                   | Controller Routes                                            | Key Features                  |
| ------------------------ | ------------------------------------------------------------ | ----------------------------- |
| **AuthModule**           | `/auth/login`, `/auth/register`                              | JWT + bcrypt                  |
| **UsersModule**          | `/users`                                                     | CRUD, RBAC                    |
| **ChannelsModule**       | `/channels`, `/channels/:id/webhook`                         | Zalo OA adapter               |
| **ConversationsModule**  | `/conversations`                                             | Status, priority, assign, SLA |
| **MessagesModule**       | `/messages`, `/messages/send`                                | Inbound/outbound, WS emit     |
| **SuggestionsModule**    | `/suggestions`                                               | AI pipeline, RAG, slots       |
| **KnowledgeBaseModule**  | `/kb`                                                        | Upload, chunk, delete         |
| **QuoteModule**          | `/quote/calc`                                                | Price engine                  |
| **DashboardModule**      | `/dashboard/kpi`                                             | Real-time KPIs                |
| **CannedResponseModule** | `/canned-responses`                                          | CRUD + usage tracking         |
| **ReportsModule**        | `/reports/agents`, `/reports/summary`, `/reports/export/csv` | Agent perf + CSV              |
| **ContactsModule**       | `/contacts`, `/contacts/export/csv`                          | List, search, detail, CSV     |
| **NotesModule**          | `/conversations/:id/notes`                                   | Internal notes + pin          |
| **AuditModule**          | `/audit-logs`                                                | Activity logging              |
| **GatewayModule**        | WebSocket                                                    | Socket.IO rooms               |

### 9.3 Frontend Pages (8 pages)

| Page           | Route            | Features                                                                                  |
| -------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| Login          | `/login`         | JWT auth, form validation                                                                 |
| Dashboard      | `/dashboard`     | KPI cards, SLA %, conv list                                                               |
| Inbox          | `/inbox`         | 3-pane layout, Quick Reply (`/`), auto-scroll, 3-tab right pane (AI \| Notes \| Transfer) |
| Contacts       | `/contacts`      | 2-pane: searchable list + detail (edit, tags, conv history)                               |
| Knowledge Base | `/kb`            | Upload, chunk count, delete                                                               |
| Quick Replies  | `/quick-replies` | CRUD canned responses                                                                     |
| Reports        | `/reports`       | Agent performance cards, CSV export                                                       |
| Settings       | `/settings`      | Channels + Audit log + System info                                                        |

### 9.4 Real-time Features

| Feature           | Mechanism                                       |
| ----------------- | ----------------------------------------------- |
| New message alert | WebSocket `new_message` → notification badge    |
| New conversation  | WebSocket `new_conversation` → badge + dropdown |
| Live chat         | WebSocket room join/leave per conversation      |
| Auto-scroll       | `useRef` + `scrollIntoView` on new messages     |
| Online status     | Green dot indicator in header                   |

### 9.5 API Inventory (~45 endpoints)

```
Auth:        POST /login, POST /register
Users:       GET /users, GET /:id, PUT /:id
Channels:    GET, POST, PUT /:id, POST /:id/webhook
Conversations: GET, GET /:id, POST, PATCH /:id, PATCH /:id/assign
Messages:    GET /:convId, POST /send
Suggestions: GET /:convId, PATCH /:id/accept
KB:          GET, POST (upload), DELETE /:id
Quote:       POST /calc
Dashboard:   GET /kpi
Canned:      GET, POST, PUT /:id, DELETE /:id, POST /:id/use
Reports:     GET /agents, GET /summary, GET /export/csv
Contacts:    GET, GET /:id, PUT /:id, GET /export/csv
Notes:       GET /:convId/notes, POST, PATCH /:noteId/pin
Audit:       GET /audit-logs
Dev:         POST /dev/simulate-message
Webhook:     POST /webhook/zalo
```

