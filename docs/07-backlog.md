# Backlog Kỹ thuật — ZeplaoPrint AI Agent Assist

> **Phiên bản:** 1.0 · **Ngày:** 2026-03-02  
> **Sprint duration:** 2 tuần

---

## MVP1 — Zalo OA (12 sprints ~ 24 tuần)

### Sprint 0: Foundation (Tuần 1-2)

| #   | Task                                               | Priority | Estimate | Owner  |
| --- | -------------------------------------------------- | -------- | -------- | ------ |
| 0.1 | Setup monorepo (NestJS backend + Next.js frontend) | P0       | 2d       | BE     |
| 0.2 | Docker Compose: Postgres + Redis + MinIO           | P0       | 1d       | DevOps |
| 0.3 | Database migration setup (TypeORM / Prisma)        | P0       | 1d       | BE     |
| 0.4 | Create all DB tables + enums + indexes             | P0       | 2d       | BE     |
| 0.5 | JWT Auth module (login, refresh, RBAC middleware)  | P0       | 3d       | BE     |
| 0.6 | Seed data: admin user, test channel                | P1       | 0.5d     | BE     |
| 0.7 | CI/CD pipeline setup (lint, test, build, deploy)   | P1       | 2d       | DevOps |
| 0.8 | Frontend: Next.js project, design system, layout   | P0       | 3d       | FE     |
| 0.9 | Frontend: Login page + auth context                | P0       | 1d       | FE     |

**✅ Definition of Done:** Backend server chạy được, login lấy JWT, frontend render layout, DB migration chạy clean.

---

### Sprint 1: Zalo OA Connection (Tuần 3-4)

| #    | Task                                                                                  | Priority | Estimate | Owner |
| ---- | ------------------------------------------------------------------------------------- | -------- | -------- | ----- |
| 1.1  | Channel Adapter interface + factory pattern                                           | P0       | 1d       | BE    |
| 1.2  | Zalo OA Adapter: webhook verification (HMAC)                                          | P0       | 1d       | BE    |
| 1.3  | Webhook receiver endpoint + BullMQ enqueue                                            | P0       | 2d       | BE    |
| 1.4  | Inbound worker: parse message → upsert contact → upsert conversation → insert message | P0       | 3d       | BE    |
| 1.5  | Attachment download → S3 + attachment metadata                                        | P1       | 1d       | BE    |
| 1.6  | Zalo OA Send API integration                                                          | P0       | 2d       | BE    |
| 1.7  | Outbound worker: send message + retry + status update                                 | P0       | 2d       | BE    |
| 1.8  | Idempotency check (inbound deduplicate + outbound idempotency key)                    | P0       | 1d       | BE    |
| 1.9  | Token auto-refresh cho Zalo OA                                                        | P1       | 1d       | BE    |
| 1.10 | Channel management API (CRUD)                                                         | P1       | 1d       | BE    |

**✅ DoD:** Nhận tin từ Zalo OA → lưu DB → gửi tin ra OA thành công. Webhook verified, retry hoạt động.

---

### Sprint 2: Inbox — Danh sách hội thoại (Tuần 5-6)

| #    | Task                                                                 | Priority | Estimate | Owner |
| ---- | -------------------------------------------------------------------- | -------- | -------- | ----- |
| 2.1  | API: GET /conversations (filter, sort, pagination)                   | P0       | 2d       | BE    |
| 2.2  | API: PATCH /conversations/:id (status, priority, assignee)           | P0       | 1d       | BE    |
| 2.3  | API: GET /conversations/:id/messages (lazy load)                     | P0       | 1d       | BE    |
| 2.4  | WebSocket: setup Socket.IO + JWT auth                                | P0       | 2d       | BE    |
| 2.5  | WebSocket: emit new_message, conversation_updated                    | P0       | 1d       | BE    |
| 2.6  | Frontend: Inbox list UI (theo wireframe)                             | P0       | 3d       | FE    |
| 2.7  | Frontend: Filter bar + tabs (All, New, SLA, Mine)                    | P0       | 1d       | FE    |
| 2.8  | Frontend: Real-time update via WS                                    | P0       | 1d       | FE    |
| 2.9  | Frontend: Conversation row component (badge, status, priority icons) | P0       | 1d       | FE    |
| 2.10 | Frontend: Search conversations                                       | P1       | 1d       | FE    |

**✅ DoD:** Inbox hiển thị danh sách hội thoại, real-time khi có tin mới, filter/sort hoạt động.

---

### Sprint 3: Conversation View — 2 Pane (Tuần 7-8)

| #    | Task                                                               | Priority | Estimate | Owner |
| ---- | ------------------------------------------------------------------ | -------- | -------- | ----- |
| 3.1  | Frontend: Chat pane (cột trái) — bubble display                    | P0       | 2d       | FE    |
| 3.2  | Frontend: Message input box + send (manual)                        | P0       | 1d       | FE    |
| 3.3  | API: POST /messages/send + outbound flow                           | P0       | 1d       | BE    |
| 3.4  | Frontend: Attachment display (ảnh preview, file download)          | P1       | 1d       | FE    |
| 3.5  | Frontend: Conversation header (status, priority, assign dropdowns) | P0       | 1d       | FE    |
| 3.6  | Frontend: AI suggestion pane (cột phải) — placeholder              | P0       | 1d       | FE    |
| 3.7  | Frontend: Optimistic message update                                | P1       | 0.5d     | FE    |
| 3.8  | Frontend: Message status indicators (sending/sent/failed)          | P1       | 0.5d     | FE    |
| 3.9  | Assign conversation API + notification                             | P0       | 1d       | BE    |
| 3.10 | Frontend: Responsive layout (collapse pane on small screen)        | P1       | 1d       | FE    |

**✅ DoD:** Xem chat 2 cột, gửi tin manual, assign hoạt động, optimistic update.

---

### Sprint 4: Knowledge Base — Upload & Chunking (Tuần 9-10)

| #    | Task                                                            | Priority | Estimate | Owner |
| ---- | --------------------------------------------------------------- | -------- | -------- | ----- |
| 4.1  | pgvector extension setup + migration                            | P0       | 0.5d     | BE    |
| 4.2  | KB Document CRUD API                                            | P0       | 1d       | BE    |
| 4.3  | File upload endpoint (multipart → S3)                           | P0       | 1d       | BE    |
| 4.4  | Chunking pipeline: PDF parser (pdf-parse)                       | P0       | 2d       | BE    |
| 4.5  | Chunking pipeline: DOCX parser (mammoth)                        | P0       | 1d       | BE    |
| 4.6  | Chunking pipeline: XLSX/CSV parser                              | P0       | 1d       | BE    |
| 4.7  | Text chunking logic (split by heading, overlap, max 500 tokens) | P0       | 2d       | BE    |
| 4.8  | OpenAI Embedding API integration                                | P0       | 1d       | BE    |
| 4.9  | Store chunks + vectors in pgvector                              | P0       | 1d       | BE    |
| 4.10 | BullMQ worker for async processing pipeline                     | P0       | 1d       | BE    |
| 4.11 | KB Search API (semantic search + tag filter)                    | P0       | 1d       | BE    |
| 4.12 | Versioning: upload new → archive old → replace chunks           | P1       | 1d       | BE    |
| 4.13 | Frontend: KB management UI (list, upload modal, status)         | P0       | 2d       | FE    |
| 4.14 | Frontend: View chunks modal                                     | P1       | 1d       | FE    |

**✅ DoD:** Upload PDF/DOCX/XLSX → chunk → embed → searchable. Admin UI hoạt động.

---

### Sprint 5: AI Suggest — Core (Tuần 11-12)

| #    | Task                                                           | Priority | Estimate | Owner |
| ---- | -------------------------------------------------------------- | -------- | -------- | ----- |
| 5.1  | AI Suggest service architecture                                | P0       | 1d       | BE    |
| 5.2  | Intent detection module (prompt + LLM call)                    | P0       | 2d       | BE    |
| 5.3  | RAG retrieval integration (search KB → inject context)         | P0       | 2d       | BE    |
| 5.4  | System prompt implementation (template + variables)            | P0       | 1d       | BE    |
| 5.5  | LLM call (OpenAI GPT-4o) + structured output parsing           | P0       | 2d       | BE    |
| 5.6  | Async trigger: new customer message → generate suggestion      | P0       | 1d       | BE    |
| 5.7  | Save suggestion to DB + emit WebSocket                         | P0       | 1d       | BE    |
| 5.8  | API: GET suggestions + PATCH status + POST regenerate          | P0       | 1d       | BE    |
| 5.9  | Frontend: AI suggestion card UI (replies, sources, confidence) | P0       | 2d       | FE    |
| 5.10 | Frontend: Send / Edit&Send / Regenerate actions                | P0       | 2d       | FE    |
| 5.11 | Frontend: Edit & Send modal                                    | P0       | 1d       | FE    |
| 5.12 | Prompt versioning system                                       | P1       | 0.5d     | BE    |

**✅ DoD:** Tin nhắn khách → AI tạo suggestion → hiện cột phải → nhân viên Send/Edit.

---

### Sprint 6: Slot Filling + Quote Engine (Tuần 13-14)

| #    | Task                                                       | Priority | Estimate | Owner |
| ---- | ---------------------------------------------------------- | -------- | -------- | ----- |
| 6.1  | Slot configuration data model (per product type)           | P0       | 1d       | BE    |
| 6.2  | Slot extraction from conversation history                  | P0       | 2d       | BE    |
| 6.3  | Missing slot detection + follow-up question generation     | P0       | 2d       | BE    |
| 6.4  | Quote rules CRUD API (Admin)                               | P0       | 2d       | BE    |
| 6.5  | Quote calculation engine (rule-based, tiered pricing)      | P0       | 3d       | BE    |
| 6.6  | API: POST /quote/calc                                      | P0       | 1d       | BE    |
| 6.7  | Integration: AI → slot check → Quote Engine → suggestion   | P0       | 2d       | BE    |
| 6.8  | Frontend: Missing info checklist in suggestion card        | P0       | 1d       | FE    |
| 6.9  | Frontend: Quote result display in suggestion               | P0       | 1d       | FE    |
| 6.10 | Seed data: quote rules cho decal, hộp, catalogue, tem nhãn | P1       | 1d       | BE    |
| 6.11 | Frontend: Admin quote rules management page                | P1       | 2d       | FE    |

**✅ DoD:** AI hỏi follow-up khi thiếu slot → đủ slot → tính giá → suggestion có giá.

---

### Sprint 7: SLA & Chống trôi tin (Tuần 15-16)

| #    | Task                                                     | Priority | Estimate | Owner |
| ---- | -------------------------------------------------------- | -------- | -------- | ----- |
| 7.1  | SLA timer logic: set deadline khi khách nhắn             | P0       | 1d       | BE    |
| 7.2  | SLA monitor cron job (check every 1 min)                 | P0       | 1d       | BE    |
| 7.3  | SLA breach: flag conversation + create notification      | P0       | 1d       | BE    |
| 7.4  | Notification service: CRUD + WebSocket emit              | P0       | 1d       | BE    |
| 7.5  | Auto status transitions (rules-based)                    | P0       | 2d       | BE    |
| 7.6  | Priority auto-assignment (khách cũ → high)               | P1       | 1d       | BE    |
| 7.7  | Frontend: SLA badge + warning indicator                  | P0       | 1d       | FE    |
| 7.8  | Frontend: Notification bell + dropdown                   | P0       | 1.5d     | FE    |
| 7.9  | Frontend: Sound alert for SLA                            | P1       | 0.5d     | FE    |
| 7.10 | Conversation status workflow UI (dropdown + auto-update) | P0       | 1d       | FE    |

**✅ DoD:** SLA warning hiện khi > 10 phút chưa trả lời, notification hoạt động, status auto-transition.

---

### Sprint 8: Audit & Dashboard (Tuần 17-18)

| #    | Task                                                         | Priority | Estimate | Owner |
| ---- | ------------------------------------------------------------ | -------- | -------- | ----- |
| 8.1  | Audit log service: log all state changes                     | P0       | 2d       | BE    |
| 8.2  | Suggestion audit: track sent/edited/rejected + reason        | P0       | 1d       | BE    |
| 8.3  | Dashboard KPI API: response time, suggestion usage           | P0       | 2d       | BE    |
| 8.4  | Dashboard API: SLA compliance, conversations by status       | P0       | 1d       | BE    |
| 8.5  | Dashboard API: top questions (intent aggregation)            | P1       | 1d       | BE    |
| 8.6  | Dashboard API: agent performance table                       | P1       | 1d       | BE    |
| 8.7  | Frontend: Dashboard page — KPI cards                         | P0       | 1d       | FE    |
| 8.8  | Frontend: Dashboard — charts (response time, suggestion pie) | P0       | 2d       | FE    |
| 8.9  | Frontend: Dashboard — agent table + filters                  | P1       | 1d       | FE    |
| 8.10 | Frontend: Dashboard — date range picker                      | P1       | 0.5d     | FE    |

**✅ DoD:** Dashboard hiển thị KPI thực tế, suggestion tracking hoạt động, audit log lưu đủ.

---

### Sprint 9: Security & Observability (Tuần 19-20)

| #    | Task                                                       | Priority | Estimate | Owner  |
| ---- | ---------------------------------------------------------- | -------- | -------- | ------ |
| 9.1  | RBAC enforcement: review all endpoints                     | P0       | 1d       | BE     |
| 9.2  | Rate limiting middleware (per user, per IP)                | P0       | 1d       | BE     |
| 9.3  | Token encryption (Zalo OA tokens at rest)                  | P0       | 1d       | BE     |
| 9.4  | PII masking in logs                                        | P1       | 1d       | BE     |
| 9.5  | Structured logging (Pino / Winston)                        | P0       | 1d       | BE     |
| 9.6  | Prometheus metrics: webhook, send, AI latency, queue depth | P0       | 2d       | DevOps |
| 9.7  | Grafana dashboards: system health                          | P0       | 1d       | DevOps |
| 9.8  | Alert rules: webhook fail, queue backlog, AI timeout       | P0       | 1d       | DevOps |
| 9.9  | Error tracking (Sentry hoặc tương đương)                   | P1       | 1d       | DevOps |
| 9.10 | Security audit: OWASP top 10 review                        | P1       | 1d       | BE     |

**✅ DoD:** RBAC đầy đủ, metrics/alert/logging hoạt động, token encryption verified.

---

### Sprint 10: Polish & QA (Tuần 21-22)

| #     | Task                                            | Priority | Estimate | Owner  |
| ----- | ----------------------------------------------- | -------- | -------- | ------ |
| 10.1  | E2E test: full flow webhook → suggestion → send | P0       | 2d       | QA     |
| 10.2  | E2E test: KB upload → chunk → search            | P0       | 1d       | QA     |
| 10.3  | E2E test: quote flow (slot fill → calc → send)  | P0       | 1d       | QA     |
| 10.4  | Load test: webhook spike (100 msg/min)          | P1       | 1d       | QA     |
| 10.5  | UI/UX review + fixes                            | P0       | 2d       | FE     |
| 10.6  | Mobile responsive fixes                         | P1       | 1d       | FE     |
| 10.7  | Performance optimization (DB queries, WS)       | P1       | 1d       | BE     |
| 10.8  | Documentation: deployment guide                 | P0       | 1d       | DevOps |
| 10.9  | Documentation: user manual                      | P0       | 2d       | PM     |
| 10.10 | Bug fixing buffer                               | P0       | 3d       | ALL    |

---

### Sprint 11: UAT & Go-live Prep (Tuần 23-24)

| #    | Task                                               | Priority | Estimate | Owner  |
| ---- | -------------------------------------------------- | -------- | -------- | ------ |
| 11.1 | UAT với team CSKH thực tế                          | P0       | 3d       | ALL    |
| 11.2 | Fix UAT bugs                                       | P0       | 3d       | ALL    |
| 11.3 | Seed production data: users, channel, KB documents | P0       | 1d       | Admin  |
| 11.4 | Production deployment                              | P0       | 1d       | DevOps |
| 11.5 | Monitoring setup verify                            | P0       | 0.5d     | DevOps |
| 11.6 | Go-live checklist pass                             | P0       | 0.5d     | PM     |
| 11.7 | Training session cho nhân viên CSKH                | P0       | 1d       | PM     |

---

## MVP2 — Facebook Messenger (6 sprints ~ 12 tuần)

### Sprint M1: Messenger Adapter (Tuần 25-26)

| #    | Task                                         | Priority | Estimate |
| ---- | -------------------------------------------- | -------- | -------- |
| M1.1 | Facebook Page webhook setup                  | P0       | 1d       |
| M1.2 | Messenger Adapter: implement IChannelAdapter | P0       | 2d       |
| M1.3 | Inbound worker: handle FB message format     | P0       | 2d       |
| M1.4 | Send API: FB Messenger Send API integration  | P0       | 2d       |
| M1.5 | FB token management + refresh                | P0       | 1d       |
| M1.6 | Test: full flow FB → DB → AI → Send          | P0       | 2d       |

### Sprint M2: Multi-channel Inbox (Tuần 27-28)

| #    | Task                                                | Priority | Estimate |
| ---- | --------------------------------------------------- | -------- | -------- |
| M2.1 | Frontend: channel indicator in inbox (Zalo/FB icon) | P0       | 0.5d     |
| M2.2 | Frontend: channel filter in inbox                   | P0       | 0.5d     |
| M2.3 | Contact merging (cùng 1 khách qua 2 kênh)           | P1       | 2d       |
| M2.4 | Channel-specific message formatting                 | P1       | 1d       |
| M2.5 | Dashboard: thêm filter theo channel                 | P1       | 1d       |
| M2.6 | Test cross-channel scenarios                        | P0       | 2d       |

### Sprint M3: CRM nhẹ (Tuần 29-30)

| #    | Task                                               | Priority | Estimate |
| ---- | -------------------------------------------------- | -------- | -------- |
| M3.1 | Contact profile page (lịch sử hội thoại, đơn hàng) | P1       | 2d       |
| M3.2 | Contact tags management                            | P1       | 1d       |
| M3.3 | Quick notes trên conversation                      | P1       | 1d       |
| M3.4 | Customer history sidebar trong conversation view   | P1       | 2d       |

### Sprint M4: AI Improvements (Tuần 31-32)

| #    | Task                                                         | Priority | Estimate |
| ---- | ------------------------------------------------------------ | -------- | -------- |
| M4.1 | Thêm slot config cho sản phẩm mới (namecard, tờ rơi, bao bì) | P1       | 2d       |
| M4.2 | Cải thiện slot filling accuracy (fine-tune prompt)           | P1       | 2d       |
| M4.3 | Caching frequent AI queries                                  | P1       | 1d       |
| M4.4 | A/B testing framework cho prompt versions                    | P2       | 2d       |
| M4.5 | Auto-tagging conversation product type                       | P1       | 1d       |

### Sprint M5-M6: Polish + UAT (Tuần 33-36)

| #    | Task                          | Priority | Estimate |
| ---- | ----------------------------- | -------- | -------- |
| M5.1 | Cross-channel E2E tests       | P0       | 2d       |
| M5.2 | Performance tuning            | P1       | 2d       |
| M5.3 | UAT Phase 2                   | P0       | 3d       |
| M5.4 | Bug fixing                    | P0       | 5d       |
| M5.5 | Production deployment Phase 2 | P0       | 1d       |

---

## Tóm tắt Timeline

```
Tuần  1-2   Sprint 0: Foundation
Tuần  3-4   Sprint 1: Zalo OA Connection
Tuần  5-6   Sprint 2: Inbox UI
Tuần  7-8   Sprint 3: Conversation View 2-Pane
Tuần  9-10  Sprint 4: Knowledge Base
Tuần 11-12  Sprint 5: AI Suggest Core
Tuần 13-14  Sprint 6: Slot Filling + Quote Engine
Tuần 15-16  Sprint 7: SLA & Chống trôi tin
Tuần 17-18  Sprint 8: Audit & Dashboard
Tuần 19-20  Sprint 9: Security & Observability
Tuần 21-22  Sprint 10: QA & Polish
Tuần 23-24  Sprint 11: UAT & Go-live MVP1
────────── MVP1 GO LIVE ──────────
Tuần 25-26  Sprint M1: Messenger Adapter
Tuần 27-28  Sprint M2: Multi-channel Inbox
Tuần 29-30  Sprint M3: CRM nhẹ
Tuần 31-32  Sprint M4: AI Improvements
Tuần 33-36  Sprint M5-M6: QA + UAT MVP2
────────── MVP2 GO LIVE ──────────
```

---

## Team đề xuất

| Vai trò           | Số người        | Ghi chú                           |
| ----------------- | --------------- | --------------------------------- |
| Backend Engineer  | 2               | NestJS, Zalo API, AI integration  |
| Frontend Engineer | 1-2             | Next.js, real-time UI             |
| AI/ML Engineer    | 1               | Prompt engineering, RAG, chunking |
| DevOps            | 0.5 (part-time) | Docker, CI/CD, monitoring         |
| QA                | 0.5 (part-time) | Sprint 10+ full-time              |
| PM                | 1               | Coordination, UAT, training       |
| **Total**         | **5-6**         |                                   |
