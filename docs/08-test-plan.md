# Test Plan — ZeplaoPrint AI Agent Assist

> **Phiên bản:** 1.0 · **Ngày:** 2026-03-02

---

## 1. Tổng quan chiến lược test

```
┌─────────────────────────────────────────────────┐
│                  Test Pyramid                    │
│                                                  │
│                    ╱╲                            │
│                   ╱E2E╲        (5-10 flows)      │
│                  ╱──────╲                        │
│                 ╱Integr.  ╲    (30-50 tests)     │
│                ╱────────────╲                    │
│               ╱  Unit Tests   ╲  (200+ tests)   │
│              ╱──────────────────╲                │
└─────────────────────────────────────────────────┘
```

| Level       | Tool             | Scope                            | Coverage       |
| ----------- | ---------------- | -------------------------------- | -------------- |
| Unit        | Jest             | Functions, services, utils       | ≥ 80%          |
| Integration | Jest + Supertest | API endpoints, DB queries, queue | Key flows      |
| E2E         | Playwright       | Full user flows trên browser     | Critical paths |
| Load        | k6 / Artillery   | Webhook throughput, API latency  | P95 targets    |

---

## 2. Unit Tests

### 2.1 Zalo Adapter

| #       | Test Case                                        | Expected                                          |
| ------- | ------------------------------------------------ | ------------------------------------------------- |
| U-ZA-01 | `verifyWebhook` — signature hợp lệ               | Return true                                       |
| U-ZA-02 | `verifyWebhook` — signature sai                  | Return false                                      |
| U-ZA-03 | `verifyWebhook` — body trống                     | Return false                                      |
| U-ZA-04 | `parseInboundWebhook` — tin text                 | Return `{type: 'text', content, senderId, msgId}` |
| U-ZA-05 | `parseInboundWebhook` — tin ảnh                  | Return `{type: 'image', attachments: [...]}`      |
| U-ZA-06 | `parseInboundWebhook` — event không phải message | Return null                                       |
| U-ZA-07 | `parseInboundWebhook` — thiếu field `message`    | Throw validation error                            |
| U-ZA-08 | `sendMessage` — text thành công                  | Return `{success: true, externalMsgId}`           |
| U-ZA-09 | `sendMessage` — token hết hạn                    | Throw `TokenExpiredError`                         |

### 2.2 Conversation Service

| #       | Test Case                                                 | Expected                              |
| ------- | --------------------------------------------------------- | ------------------------------------- |
| U-CV-01 | `upsertConversation` — contact mới                        | Tạo conversation mới, status = 'new'  |
| U-CV-02 | `upsertConversation` — contact đã có conversation đang mở | Return conversation hiện tại          |
| U-CV-03 | `updateStatus` — transition hợp lệ (new → in_progress)    | Update thành công                     |
| U-CV-04 | `updateStatus` — transition không hợp lệ (won → new)      | Throw error                           |
| U-CV-05 | `assignConversation` — agent hợp lệ                       | Update assignee + audit log           |
| U-CV-06 | `assignConversation` — agent không tồn tại                | Throw NotFoundError                   |
| U-CV-07 | `calculateSlaDeadline` — giờ hành chính                   | Return +10 phút                       |
| U-CV-08 | `calculateSlaDeadline` — ngoài giờ                        | Return đầu giờ ngày kế tiếp + 10 phút |

### 2.3 Message Service

| #       | Test Case                                                | Expected                              |
| ------- | -------------------------------------------------------- | ------------------------------------- |
| U-MS-01 | `createMessage` — tin text                               | Insert DB + emit WS event             |
| U-MS-02 | `createMessage` — trùng `externalMsgId` (deduplicate)    | Skip, return existing                 |
| U-MS-03 | `sendMessage` — idempotency key trùng                    | Return 409                            |
| U-MS-04 | `sendMessage` — conversation không phải của agent (RBAC) | Return 403                            |
| U-MS-05 | `sendMessage` — kèm suggestionId                         | Link message → suggestion, log action |

### 2.4 Quote Engine

| #       | Test Case                                 | Expected                               |
| ------- | ----------------------------------------- | -------------------------------------- |
| U-QE-01 | Decal giấy 5x5cm, 1.000 cái               | Giá đúng theo rule                     |
| U-QE-02 | Decal giấy 5x5cm, 500 cái (tier thấp hơn) | Giá tier 500                           |
| U-QE-03 | Quantity = 0                              | Validation error                       |
| U-QE-04 | Quantity < MOQ                            | Return warning `số_lượng_nhỏ`          |
| U-QE-05 | Kích thước ngoài bảng chuẩn               | `requiresManualQuote = true`           |
| U-QE-06 | Rule hết hạn (effective_to < today)       | Không match rule, manual quote         |
| U-QE-07 | Có surcharge (cán bóng +15%)              | Giá = base + surcharge                 |
| U-QE-08 | Leadtime express                          | Trả `expressDays` + `expressSurcharge` |
| U-QE-09 | Product type không tồn tại                | `requiresManualQuote = true`           |
| U-QE-10 | Số lượng rất lớn (> 100.000)              | Warning `số_lượng_lớn`                 |

### 2.5 RAG / KB Service

| #       | Test Case                                       | Expected                                |
| ------- | ----------------------------------------------- | --------------------------------------- |
| U-KB-01 | Chunking: text 1000 tokens → 2 chunks (overlap) | 2 chunks, overlap ~100 tokens           |
| U-KB-02 | Chunking: text 200 tokens → 1 chunk             | 1 chunk                                 |
| U-KB-03 | Chunking: text có heading → split by heading    | Chunk theo section                      |
| U-KB-04 | Search: query liên quan → top-K results         | Score ≥ 0.7                             |
| U-KB-05 | Search: query không liên quan                   | Results rỗng hoặc score < 0.7           |
| U-KB-06 | Search: filter by tag                           | Chỉ trả chunks có tag match             |
| U-KB-07 | Document versioning: upload mới                 | Chunks cũ deactivate, chunks mới active |

### 2.6 AI Suggest Service

| #       | Test Case                                      | Expected                              |
| ------- | ---------------------------------------------- | ------------------------------------- |
| U-AI-01 | Intent detection: "giá in decal"               | `intent: ask_price`                   |
| U-AI-02 | Intent detection: "gửi file cho em"            | `intent: send_file`                   |
| U-AI-03 | Intent detection: "xin chào"                   | `intent: greeting`                    |
| U-AI-04 | Slot extraction: "5x5cm, 1000 cái, decal giấy" | `{size, quantity, material}`          |
| U-AI-05 | Slot extraction: thiếu chất liệu               | `missingInfo` chứa material           |
| U-AI-06 | Suggestion với đủ slot + quote result          | Suggestion có `quoteResult`           |
| U-AI-07 | Suggestion khi KB không có thông tin           | Confidence thấp + warning             |
| U-AI-08 | Prompt version được lưu                        | `promptVersion` khớp version hiện tại |

### 2.7 SLA Monitor

| #       | Test Case                                | Expected                               |
| ------- | ---------------------------------------- | -------------------------------------- |
| U-SL-01 | Conversation 11 phút chưa reply          | `slaBreached = true` + notification    |
| U-SL-02 | Conversation 5 phút chưa reply           | Không breach                           |
| U-SL-03 | Conversation đã reply                    | Không kiểm SLA                         |
| U-SL-04 | Conversation status = 'waiting_customer' | Không kiểm SLA                         |
| U-SL-05 | SLA breach → notification created        | Notification cho assignee + supervisor |

---

## 3. Integration Tests

### 3.1 Webhook → Message Flow

| #       | Test Case                                                 | Expected                                 |
| ------- | --------------------------------------------------------- | ---------------------------------------- |
| I-WH-01 | POST /webhooks/zalo với signature hợp lệ → message lưu DB | 200 + message in DB                      |
| I-WH-02 | POST /webhooks/zalo signature sai                         | 401 Unauthorized                         |
| I-WH-03 | POST /webhooks/zalo trùng msgId                           | 200 + không insert trùng                 |
| I-WH-04 | POST /webhooks/zalo → conversation tạo mới                | Contact + Conversation created           |
| I-WH-05 | POST /webhooks/zalo → conversation đã tồn tại             | New message, conversation updated        |
| I-WH-06 | Webhook → AI suggestion triggered (async)                 | Suggestion created after <5s             |
| I-WH-07 | Webhook server down → retry                               | Zalo retry, message eventually processed |

### 3.2 Send Message Flow

| #       | Test Case                                       | Expected                        |
| ------- | ----------------------------------------------- | ------------------------------- |
| I-SM-01 | POST /messages/send → message sent via Zalo API | 202 + message.status = 'sent'   |
| I-SM-02 | POST /messages/send → Zalo API fail → retry     | Retry 3 lần, cuối cùng 'failed' |
| I-SM-03 | POST /messages/send với idempotency key trùng   | 409 + existing messageId        |
| I-SM-04 | POST /messages/send + suggestionId → audit log  | Audit log có suggestion link    |
| I-SM-05 | Send → conversation status auto-update          | Status → 'waiting_customer'     |

### 3.3 KB Upload Flow

| #       | Test Case                                      | Expected                             |
| ------- | ---------------------------------------------- | ------------------------------------ |
| I-KB-01 | Upload PDF → chunks created → searchable       | Document indexed, chunks in pgvector |
| I-KB-02 | Upload XLSX → chunks from rows                 | Chunks reflect table data            |
| I-KB-03 | Upload file > 50MB                             | 413 Payload Too Large                |
| I-KB-04 | Upload file type không hỗ trợ (.exe)           | 400 Bad Request                      |
| I-KB-05 | Upload version mới → old chunks deactivated    | Old chunks is_active = false         |
| I-KB-06 | Search sau upload → kết quả từ file vừa upload | Results contain new chunks           |

### 3.4 Quote Flow

| #       | Test Case                                 | Expected                               |
| ------- | ----------------------------------------- | -------------------------------------- |
| I-QT-01 | POST /quote/calc → valid result           | 200 + price + breakdown                |
| I-QT-02 | POST /quote/calc → missing required field | 400 + validation detail                |
| I-QT-03 | AI slot filling → quote calc → suggestion | End-to-end: suggestion has quoteResult |

### 3.5 Auth & RBAC

| #       | Test Case                                    | Expected                         |
| ------- | -------------------------------------------- | -------------------------------- |
| I-AU-01 | Login success → JWT valid                    | accessToken đúng                 |
| I-AU-02 | Login fail → 401                             | "Email hoặc mật khẩu không đúng" |
| I-AU-03 | Agent truy cập /dashboard/kpi                | 403 Forbidden                    |
| I-AU-04 | Admin truy cập /kb/documents (POST)          | 201 Created                      |
| I-AU-05 | Token expired → refresh → new token          | New accessToken                  |
| I-AU-06 | Agent xem conversation không assign cho mình | 403                              |

---

## 4. E2E Tests (Playwright)

| #    | Test Flow                         | Steps                                                                                                              |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| E-01 | **Full inbound → suggest → send** | Simulate webhook → xác nhận inbox cập nhật → mở conversation → thấy suggestion → bấm Send → tin xuất hiện cột trái |
| E-02 | **Edit & Send**                   | Mở suggestion → click Edit & Send → chỉnh text → gửi → verify edited message                                       |
| E-03 | **AI Regenerate**                 | Mở suggestion → click Regenerate → suggestion mới xuất hiện                                                        |
| E-04 | **KB Upload**                     | Admin login → navigate KB → upload PDF → wait processing → search → results hiện                                   |
| E-05 | **SLA Warning**                   | Simulate webhook → đợi 11 phút (mock timer) → SLA badge hiện → notification bell có alert                          |
| E-06 | **Assign conversation**           | Supervisor login → inbox → chọn conversation → assign agent B → agent B thấy trong "Của tôi"                       |
| E-07 | **Login → Dashboard**             | Supervisor login → navigate dashboard → KPI cards hiện → filter by date                                            |
| E-08 | **Quote flow E2E**                | Khách hỏi giá (webhook) → AI hỏi follow-up → khách trả lời → AI báo giá                                            |
| E-09 | **Reject suggestion**             | Mở suggestion → reject + chọn lý do → verify audit log ghi nhận                                                    |
| E-10 | **Multi-conversation**            | 3 conversations đồng thời → switch giữa các conversation → AI suggestion đúng context                              |

---

## 5. Load Tests

| #    | Scenario                                                      | Target                    | Tool |
| ---- | ------------------------------------------------------------- | ------------------------- | ---- |
| L-01 | Webhook burst: 100 msg/phút trong 5 phút                      | 0 message lost, P95 < 2s  | k6   |
| L-02 | Concurrent inbox: 20 agents online, mỗi agent 5 conversations | WS ổn định, no disconnect | k6   |
| L-03 | AI suggestion latency under load                              | P95 < 5s, P99 < 8s        | k6   |
| L-04 | KB search: 50 concurrent queries, 10.000 chunks               | P95 < 500ms               | k6   |
| L-05 | Send message: 50 msg/phút outbound                            | 0 duplicate, P95 < 3s     | k6   |

---

## 6. Các Case "Dễ Sai" ngành In ấn 🖨️

> [!CAUTION]
> Đây là những tình huống thường gây lỗi trong tư vấn/báo giá ngành in, cần test kỹ.

### 6.1 Về giá cả

| #    | Case                                    | Vì sao dễ sai                          | Test                                                     |
| ---- | --------------------------------------- | -------------------------------------- | -------------------------------------------------------- |
| P-01 | **Giá theo bậc thang (tiered pricing)** | 500c giá khác 1000c giá khác 5000c     | Verify quote engine tính đúng tier                       |
| P-02 | **Phụ thu cán màng**                    | Bóng +15%, mờ +12%, nhiều NV quên tính | Verify surcharge applied correctly                       |
| P-03 | **Phụ thu bế hình (die-cut shape)**     | Bế vuông free, bế hình +30%            | Verify `finishing: 'bế_hình'` tính surcharge             |
| P-04 | **Giá thay đổi theo mùa**               | Q4 tăng giá giấy, khuyến mãi Tết       | Verify `effective_from/to` rule matching                 |
| P-05 | **Giá kẹp giữa 2 tier**                 | Khách muốn 750 cái — tính tier nào?    | Verify: lấy tier 500 (giá cao hơn/cái) hoặc suggest 1000 |
| P-06 | **VAT chưa bao gồm**                    | Khách hỏi "đã tính VAT chưa?"          | AI phải nói rõ "chưa bao gồm VAT" nếu KB ghi vậy         |
| P-07 | **Giá cho khách sỉ vs lẻ**              | Khác nhau, NV hay nhầm                 | Quote Engine phải check customer tag                     |

### 6.2 Về quy cách kỹ thuật

| #    | Case                                     | Vì sao dễ sai                                   | Test                                             |
| ---- | ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| T-01 | **Kích thước đơn vị nhầm (cm vs mm)**    | Khách nói "50" không rõ cm hay mm               | AI phải hỏi rõ đơn vị, slot filling validate     |
| T-02 | **Bleed / tràn lề**                      | File thiết kế cần bleed 2-3mm, khách không biết | AI phải nhắc tech note từ Quote Engine           |
| T-03 | **CMYK vs RGB**                          | Khách gửi file RGB, in offset cần CMYK          | AI nhắc: "File cần chuyển CMYK trước khi in nhé" |
| T-04 | **Số trang catalogue phải chẵn (bội 4)** | In tay sách phải 8/12/16/20... trang            | Slot filling validate: pages % 4 == 0            |
| T-05 | **Định lượng giấy nhầm**                 | Couché 150gsm khác 200gsm, Bristol 250 khác 300 | AI phải list rõ options, không giả định          |
| T-06 | **Kích thước hộp: dài × rộng × cao**     | 3 chiều, khách hay nói thiếu 1 chiều            | Slot filling yêu cầu đủ 3 chiều                  |
| T-07 | **In 1 mặt vs 2 mặt**                    | Ảnh hưởng giá, NV hay quên hỏi                  | AI phải xác nhận, default 1 mặt                  |
| T-08 | **Số màu in: 4 màu vs spot color**       | Pantone riêng giá khác                          | Slot filling cần hỏi nếu chưa rõ                 |

### 6.3 Về quy trình

| #    | Case                                       | Vì sao dễ sai                            | Test                                         |
| ---- | ------------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| F-01 | **Leadtime không tính T7/CN**              | Khách tưởng "3 ngày" = 3 ngày calendar   | AI ghi rõ "3 ngày **làm việc**"              |
| F-02 | **File chưa gửi nhưng đã báo giá**         | Giá tạm, khách tưởng giá chốt            | AI warning: "Giá tạm, cần xem file thiết kế" |
| F-03 | **MOQ (min order quantity)**               | In offset minimum 500 tờ, khách muốn 100 | AI cảnh báo MOQ, gợi ý in số                 |
| F-04 | **Gia công đặc biệt cần báo giá thủ công** | Ép nhũ hình phức tạp, UV spot            | `requiresManualQuote = true`                 |
| F-05 | **Khách "giống lần trước"**                | Không có lịch sử trong hệ thống          | AI hỏi lại chi tiết, không fake thông tin    |
| F-06 | **Deadline Tết / lễ**                      | Xưởng nghỉ, khách không biết             | Warning: deadline gấp + check lịch nghỉ      |

### 6.4 Về AI / RAG

| #    | Case                                         | Vì sao dễ sai                         | Test                                                    |
| ---- | -------------------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| A-01 | **AI bịa giá không có trong KB**             | Hallucination                         | Verify: chỉ trả giá từ Quote Engine / KB chunk          |
| A-02 | **KB cũ, giá đã thay đổi**                   | Chunk cũ vẫn active                   | Verify: document versioning deactivate old              |
| A-03 | **Khách hỏi sản phẩm chưa có trong KB**      | AI phải nói "chưa có thông tin"       | Verify: low confidence + warning                        |
| A-04 | **RAG trả chunk sai product type**           | Decal chunk trùng từ khóa với hộp     | Verify: tag filter hoạt động                            |
| A-05 | **Khách nhắn tiếng lóng ngành in**           | "Dập nổi", "thúc vàng", "4C1M"        | AI vẫn detect intent + extract slots                    |
| A-06 | **Khách gửi nhiều yêu cầu trong 1 tin nhắn** | "In 1000 decal 5x5 + 500 hộp 10x10x5" | AI tách thành 2 quote requests                          |
| A-07 | **AI tham chiếu sai giữa các hội thoại**     | Context leak                          | Verify: mỗi suggestion chỉ dùng context conversation đó |

---

## 7. Regression Test Suite

Chạy trước mỗi release:

| #         | Category                           | Test Count | Auto/Manual       |
| --------- | ---------------------------------- | ---------- | ----------------- |
| R-01      | Webhook receive + deduplicate      | 7          | Auto              |
| R-02      | Send message + idempotency         | 5          | Auto              |
| R-03      | Auth + RBAC                        | 6          | Auto              |
| R-04      | Quote Engine (tất cả product type) | 10         | Auto              |
| R-05      | KB upload + search                 | 6          | Auto              |
| R-06      | AI suggestion generation           | 8          | Auto              |
| R-07      | SLA monitoring                     | 5          | Auto              |
| R-08      | Inbox E2E                          | 3          | Auto (Playwright) |
| R-09      | Conversation E2E                   | 3          | Auto (Playwright) |
| R-10      | Edge cases ngành in                | 20         | Auto + Manual     |
| **Total** |                                    | **73**     |                   |

---

## 8. Test Environment

```
┌──────────────────────────────────────────────┐
│              Test Environments                │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Local    │  │ Staging  │  │ Prod     │   │
│  │ (Docker  │  │ (Deploy  │  │          │   │
│  │ Compose) │→ │  trước)  │→ │          │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│                                              │
│  Unit/Integration: Local (CI pipeline)       │
│  E2E: Staging (Playwright on CI)             │
│  Load: Staging (k6 scheduled)                │
│  UAT: Staging (manual by CSKH team)          │
└──────────────────────────────────────────────┘
```

**Mock Zalo API** cho test:
- Mock server trả response chuẩn cho send message.
- Webhook simulator gửi fake events.
- Token refresh mock.

**Test Data:**
- 3 Zalo users (mock contacts)
- 5 conversations ở các status khác nhau
- 10 KB documents (bảng giá decal/hộp/catalogue/tem_nhãn)
- 15 quote rules (cả active lẫn expired)

---

## 9. Acceptance Test Checklist (Go-live)

| #   | Criteria                                         | Status |
| --- | ------------------------------------------------ | ------ |
| ☐   | Webhook nhận tin từ OA thật thành công           |        |
| ☐   | Gửi tin từ inbox ra OA thật thành công           |        |
| ☐   | AI suggestion xuất hiện < 5 giây                 |        |
| ☐   | Báo giá decal chính xác (đối chiếu bảng giá tay) |        |
| ☐   | Báo giá hộp chính xác (đối chiếu bảng giá tay)   |        |
| ☐   | AI không bịa giá (test 10 scenarios)             |        |
| ☐   | SLA warning hoạt động (test 10 phút)             |        |
| ☐   | KB upload + search hoạt động                     |        |
| ☐   | RBAC: agent không truy cập admin page            |        |
| ☐   | Dashboard KPI hiển thị dữ liệu đúng              |        |
| ☐   | Không có lỗi JS console trên production          |        |
| ☐   | Load test pass: 100 msg/phút không mất tin       |        |
| ☐   | Backup DB hoạt động                              |        |
| ☐   | Monitoring alert hoạt động (test fail webhook)   |        |
| ☐   | Training session hoàn thành                      |        |
