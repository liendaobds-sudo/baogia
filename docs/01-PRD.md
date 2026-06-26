# PRD — AI Agent Assist cho CSKH ngành In ấn (ZeplaoPrint)

> **Phiên bản:** 1.0 · **Ngày:** 2026-03-02  
> **Tác giả:** Solution Architect & Product Manager  

---

## 1. Tổng quan sản phẩm

### 1.1 Vision
Xây dựng **inbox nội bộ thông minh** giúp nhân viên CSKH công ty in ấn trả lời khách hàng **nhanh, chính xác, không trôi tin** — với AI đề xuất câu trả lời dựa trên kiến thức nội bộ (bảng giá, quy cách, SOP), nhân viên duyệt trước khi gửi.

### 1.2 Problem Statement
| Vấn đề                                | Hậu quả                         |
| ------------------------------------- | ------------------------------- |
| Khách nhắn qua Zalo, nhân viên ít     | Trôi tin, khách chờ lâu         |
| Nhân viên trả lời thiếu/sai thông tin | Báo sai giá, sai chất liệu      |
| Nhớ giá, quy cách bằng kinh nghiệm    | Nhân viên mới không onboard nổi |
| Không track SLA                       | Không biết ai chưa trả lời      |
| Dữ liệu nằm rải rác                   | Không cải tiến được quy trình   |

### 1.3 Success Metrics (MVP1)
| KPI                           | Mục tiêu            |
| ----------------------------- | ------------------- |
| Thời gian phản hồi trung bình | < 5 phút (giảm 50%) |
| % tin nhắn dùng AI suggestion | ≥ 40%               |
| Tỷ lệ báo giá sai             | < 2%                |
| Tin trôi > 10 phút            | < 5%                |

### 1.4 Scope

| Giai đoạn          | Phạm vi                                                        |
| ------------------ | -------------------------------------------------------------- |
| **MVP1 (Phase 1)** | Zalo OA: inbox, AI suggest, RAG, Quote Engine, SLA, audit      |
| **MVP2 (Phase 2)** | + Facebook Messenger, multi-channel routing, CRM nhẹ           |
| **Future**         | Auto-reply cho FAQ đơn giản, analytics nâng cao, Zalo Mini App |

> [!IMPORTANT]
> AI chỉ **ĐỀ XUẤT**, nhân viên **DUYỆT** rồi mới gửi (human-in-the-loop). AI **không tự gửi tin nhắn** cho khách.

---

## 2. Personas & Stakeholders

| Persona                      | Mô tả                     | Nhu cầu chính                                 |
| ---------------------------- | ------------------------- | --------------------------------------------- |
| **NV CSKH (Agent)**          | Nhân viên tư vấn, báo giá | Trả lời nhanh, đúng giá, không nhầm hội thoại |
| **Trưởng nhóm (Supervisor)** | Quản lý team CSKH         | Theo dõi SLA, phân việc, xem KPI              |
| **Admin**                    | IT / Owner                | Quản lý KB, user, cấu hình OA, prompt         |
| **Khách hàng**               | Người mua in ấn qua Zalo  | Được trả lời nhanh, đúng, có báo giá rõ ràng  |

---

## 3. User Stories & Acceptance Criteria

### Epic 1: Kết nối Zalo OA

#### US-1.1: Nhận tin nhắn từ Zalo OA
> **Là** Agent, **tôi muốn** thấy tin nhắn Zalo xuất hiện trong inbox nội bộ **để** trả lời tập trung.

**Acceptance Criteria:**
- [x] Tin nhắn text từ Zalo OA webhook xuất hiện trong inbox ≤ 2 giây.
- [x] File đính kèm (ảnh, PDF) hiển thị đúng hoặc link download.
- [x] Tin nhắn được deduplicate (cùng `msgId` chỉ lưu 1 lần).
- [x] Nếu webhook fail → retry với exponential backoff, log lỗi.

#### US-1.2: Gửi tin nhắn qua Zalo OA
> **Là** Agent, **tôi muốn** gửi tin nhắn từ inbox nội bộ dưới danh nghĩa OA **để** khách nhận trên Zalo.

**Acceptance Criteria:**
- [x] Nhân viên bấm "Send" → tin gửi qua OA API, trạng thái `sent`/`failed`.
- [x] Hỗ trợ gửi text, ảnh, file.
- [x] Gửi thất bại → hiện thông báo lỗi + cho phép retry.
- [x] Idempotency key tránh gửi trùng khi retry.

#### US-1.3: Đồng bộ trạng thái hội thoại
> **Là** Agent, **tôi muốn** biết khách đã đọc tin chưa và hội thoại ở trạng thái nào.

**Acceptance Criteria:**
- [x] Trạng thái hội thoại tự chuyển: `New → In Progress → Waiting Customer → …`
- [x] Khi nhân viên gửi tin → chuyển `Waiting Customer`.
- [x] Khi khách nhắn lại → chuyển `In Progress` (nếu đang `Waiting Customer`).

---

### Epic 2: Inbox Web nội bộ

#### US-2.1: Danh sách hội thoại
> **Là** Agent, **tôi muốn** thấy danh sách hội thoại với trạng thái, ưu tiên, SLA **để** biết xử lý cái nào trước.

**Acceptance Criteria:**
- [x] Hiển thị: avatar, tên khách, last message preview, thời gian, trạng thái, assignee.
- [x] Sắp xếp: SLA warning trước, rồi theo `lastMessageAt` giảm dần.
- [x] Lọc theo: trạng thái, assignee, ưu tiên, kênh (Zalo/FB).
- [x] Badge đỏ cho hội thoại chưa đọc / SLA vi phạm.
- [x] Real-time cập nhật (WebSocket) khi có tin mới.

#### US-2.2: Màn hình hội thoại 2 cột
> **Là** Agent, **tôi muốn** xem chat thật bên trái và gợi ý AI bên phải **để** duyệt và gửi nhanh.

**Acceptance Criteria:**
- [x] **Cột trái:** Bubble chat chronological, phân biệt khách/nhân viên, timestamp.
- [x] **Cột phải — AI Suggestion Card:**
  - Suggested reply (1–3 phương án).
  - Missing info checklist (nếu chưa đủ dữ liệu).
  - Internal sources used (tên tài liệu + chunk ID).
  - Confidence score (%) + cảnh báo rủi ro.
- [x] **Actions:** Send / Edit & Send / Regenerate / Ask Follow-up / Assign / Create Quote / Create Job.
- [x] Khi bấm "Send", tin nhắn xuất hiện cột trái ngay lập tức (optimistic update).

#### US-2.3: Assign & chuyển hội thoại
> **Là** Supervisor, **tôi muốn** assign hội thoại cho agent cụ thể **để** phân công rõ ràng.

**Acceptance Criteria:**
- [x] Dropdown chọn agent → hội thoại chuyển sang inbox người đó.
- [x] Lịch sử assign được lưu audit log.
- [x] Agent nhận notification khi được assign.

---

### Epic 3: Knowledge Base (RAG)

#### US-3.1: Upload tài liệu
> **Là** Admin, **tôi muốn** upload tài liệu (PDF, DOCX, Excel, XLSX) **để** AI có kiến thức trả lời.

**Acceptance Criteria:**
- [x] Upload file qua UI → lưu S3 → trigger chunking pipeline.
- [x] Hỗ trợ: PDF, DOCX, XLSX, CSV, TXT, Markdown.
- [x] Admin gắn tag (decal / hộp / catalogue / tem nhãn / chung).
- [x] Hiển thị trạng thái processing: `uploading → chunking → indexed → error`.
- [x] Versioning: upload lại file mới → version cũ deactivate, chunks mới thay thế.

#### US-3.2: AI truy xuất kiến thức (Retrieval)
> **Là** hệ thống AI, **tôi cần** tìm 3–8 chunks liên quan từ KB **để** trả lời dựa trên nguồn nội bộ.

**Acceptance Criteria:**
- [x] Retrieval trả về top 3–8 chunks (cosine similarity ≥ 0.7).
- [x] Filter theo tag sản phẩm (nếu đã xác định loại sản phẩm).
- [x] AI trả lời **phải trích dẫn** tên tài liệu / chunk ID.
- [x] Nếu không tìm được chunk phù hợp → AI nói rõ "Không có thông tin trong hệ thống".

---

### Epic 4: Quote Engine (Rule-based)

#### US-4.1: Tính giá tự động
> **Là** Agent (thông qua AI), **tôi muốn** hệ thống tính giá dựa trên thông số đơn hàng **để** báo giá chính xác.

**Acceptance Criteria:**
- [x] API `/quote/calc` nhận input (loại sản phẩm, kích thước, số lượng, chất liệu, gia công) → trả giá + leadtime.
- [x] Output gồm: tổng giá, breakdown từng hạng mục, leadtime, note kỹ thuật.
- [x] Rule-based: Admin cấu hình bảng giá, công thức.
- [x] Nếu input ngoài phạm vi rule → trả `requires_manual_quote: true`.

#### US-4.2: AI slot filling
> **Là** AI, **tôi cần** hỏi khách bổ sung thông tin thiếu trước khi tính giá **để** báo giá chính xác.

**Acceptance Criteria:**
- [x] AI nhận diện slots cần thiết theo loại sản phẩm.
- [x] Nếu thiếu ≤ 3 slot → gợi ý câu hỏi follow-up, nhân viên duyệt rồi hỏi khách.
- [x] Chỉ khi đủ slot → AI gọi Quote Engine.
- [x] AI **không bịa giá** — chỉ trả giá từ Quote Engine hoặc KB.

---

### Epic 5: Chống trôi tin & SLA

#### US-5.1: Cảnh báo SLA
> **Là** Supervisor, **tôi muốn** biết hội thoại nào chưa được trả lời quá 10 phút **để** can thiệp kịp thời.

**Acceptance Criteria:**
- [x] Hội thoại `New` hoặc `In Progress` > 10 phút chưa reply → badge SLA đỏ.
- [x] Notification cho Supervisor qua UI (bell icon + sound).
- [x] Dashboard hiển thị số hội thoại vi phạm SLA real-time.

#### US-5.2: Trạng thái & ưu tiên hội thoại
> **Là** Agent, **tôi muốn** hội thoại có trạng thái rõ ràng **để** biết việc cần làm.

**Acceptance Criteria:**
- [x] Trạng thái: `New` → `In Progress` → `Waiting Customer` → `Waiting File` → `Quoted` → `Won` / `Lost`.
- [x] Chuyển trạng thái thủ công (Agent) hoặc tự động (theo event).
- [x] Ưu tiên: `urgent` (đơn gấp) / `high` (khách cũ/VIP) / `normal` / `low`.
- [x] Ưu tiên có thể set thủ công hoặc auto (khách cũ → high).

---

### Epic 6: Audit & Cải tiến

#### US-6.1: Lưu log AI suggestion
> **Là** Admin, **tôi muốn** mọi suggestion AI được lưu lại **để** đánh giá chất lượng và cải tiến prompt.

**Acceptance Criteria:**
- [x] Lưu: suggestion text, prompt version, sources used, confidence, timestamps.
- [x] Lưu hành động nhân viên: `sent_as_is` / `edited_and_sent` / `rejected` + lý do (tag).
- [x] Dữ liệu được phân tích cho dashboard.

#### US-6.2: Dashboard KPI
> **Là** Supervisor, **tôi muốn** xem dashboard KPI CSKH **để** đánh giá hiệu quả team.

**Acceptance Criteria:**
- [x] Thời gian phản hồi trung bình (theo ngày/tuần).
- [x] % tin nhắn dùng AI suggestion (sent as-is / edited / rejected).
- [x] Top 10 câu hỏi thường gặp.
- [x] Số hội thoại theo trạng thái.
- [x] SLA compliance rate.
- [x] Lọc theo agent, khoảng thời gian.

---

## 4. Yêu cầu phi chức năng

| Hạng mục          | Yêu cầu                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| **Bảo mật**       | RBAC (Admin/Supervisor/Agent), JWT auth, mã hóa token Zalo, log truy cập, hạn chế PII trong log |
| **Idempotency**   | Webhook + Send message đều có idempotency key → chống duplicate                                 |
| **Queue**         | Webhook → Queue → Process (tách consume khỏi HTTP handler)                                      |
| **Hiệu năng**     | AI suggestion < 5 giây (P95); UI real-time qua WebSocket                                        |
| **Observability** | Structured logging, metrics (Prometheus), traces (OpenTelemetry), alert webhook fail/send fail  |
| **Compliance**    | Chỉ dùng Zalo OA API chính thức; không đọc chat cá nhân; tuân thủ Zalo Policy                   |
| **Availability**  | Target 99.5% uptime cho webhook receiver                                                        |
| **Scalability**   | Thiết kế multi-channel từ đầu; DB schema hỗ trợ multi-tenant nếu mở rộng                        |

---

## 5. Out of Scope (MVP1)

- Auto-reply không qua duyệt.
- Zalo Mini App.
- CRM nâng cao (pipeline, deal stage).
- Tích hợp ERP / phần mềm quản lý sản xuất.
- Chatbot cho website.
- AI xử lý ảnh thiết kế (kiểm tra file in).

---

## 6. Risks & Mitigations

| Rủi ro                            | Khả năng   | Tác động   | Giải pháp                                                    |
| --------------------------------- | ---------- | ---------- | ------------------------------------------------------------ |
| Zalo OA API thay đổi / rate limit | Trung bình | Cao        | Abstract adapter layer; queue + retry; monitor               |
| AI hallucinate giá                | Cao        | Rất cao    | Guardrails: AI chỉ lấy giá từ Quote Engine/KB; prompt strict |
| Nhân viên không dùng hệ thống mới | Trung bình | Cao        | UX đơn giản; onboarding; track adoption metrics              |
| Token Zalo OA hết hạn             | Thấp       | Trung bình | Auto-refresh token; alert khi gần hết hạn                    |
| Knowledge Base thiếu/cũ           | Cao        | Trung bình | Nhắc admin review KB định kỳ; track "no source found"        |

---

## 7. Phụ lục: Glossary

| Thuật ngữ         | Giải thích                                            |
| ----------------- | ----------------------------------------------------- |
| OA                | Zalo Official Account                                 |
| RAG               | Retrieval-Augmented Generation                        |
| Slot filling      | Thu thập đủ thông tin cần thiết trước khi xử lý       |
| Human-in-the-loop | AI đề xuất, con người quyết định cuối cùng            |
| KB                | Knowledge Base — cơ sở kiến thức nội bộ               |
| SLA               | Service Level Agreement — cam kết thời gian phản hồi  |
| Chunk             | Đoạn văn bản nhỏ được vector hóa để tìm kiếm semantic |
