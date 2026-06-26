# UI Wireframe (Text) — ZeplaoPrint AI Agent Assist

> **Phiên bản:** 1.0 · **Ngày:** 2026-03-02

---

## 1. Layout chung

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🔵 ZeplaoPrint          [🔔 3]  [👤 Nguyễn Văn A ▼]                       │
├──────────┬──────────────────────────────────────────────────────────────┤
│ Sidebar  │                    Main Content                              │
│          │                                                              │
│ 📥 Inbox │                                                              │
│ 📊 Dashboard│                                                           │
│ 📚 KB    │                                                              │
│ ⚙️ Cài đặt│                                                            │
│          │                                                              │
│          │                                                              │
│ ──────── │                                                              │
│ Kênh:    │                                                              │
│ 🟢 OA BM │                                                              │
│ 🔵 FB (P2)│                                                             │
└──────────┴──────────────────────────────────────────────────────────────┘
```

**Responsive:** Sidebar thu gọn thành icon trên mobile. Main content full-width.

---

## 2. Inbox — Danh sách hội thoại

```
┌──────────────────────────────────────────────────────────────────────┐
│  📥 Inbox                                    [🔍 Tìm kiếm...]       │
│                                                                      │
│  Lọc: [Tất cả ▼] [Trạng thái ▼] [Nhân viên ▼] [Ưu tiên ▼]         │
│  Tab:  💬 Tất cả (42)  🆕 Mới (3)  ⚠️ SLA (2)  📌 Của tôi (15)     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ 🔴 ⚡ Chị Hương                              10:30 AM  🟡 SLA │  │
│  │     "Cho mình hỏi giá in decal 1000..."       Nguyễn A        │  │
│  │     🏷️ decal · 📌 urgent · 💬 New                              │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │ 🔵   A. Tuấn Anh                             10:25 AM         │  │
│  │     "Ok em gửi file thiết kế nhé"             Trần B           │  │
│  │     🏷️ hộp · ⏳ Waiting File                                   │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │     Cty XYZ                                   10:15 AM         │  │
│  │     "Mình đã chuyển khoản rồi"                Chưa assign      │  │
│  │     🏷️ catalogue · ✅ Quoted · 🔴 2 chưa đọc                   │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │     Anh Minh                                  09:45 AM         │  │
│  │     "Cảm ơn em, mình sẽ chốt sau"            Nguyễn A         │  │
│  │     🏷️ tem_nhãn · 💤 Waiting Customer                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ◀ 1  2  3 ▶                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

**Chi tiết mỗi item:**
- Avatar / initial
- Tên khách (bold nếu unread)
- Last message preview (truncated 50 chars)
- Timestamp (relative: "2 phút trước" hoặc "10:30 AM")
- Assignee name
- Tags: product type, status badge, priority icon
- SLA warning indicator (viền đỏ / badge đỏ)

**Sorting:**
1. SLA breached → đầu tiên
2. Unread → tiếp theo
3. Còn lại: theo `lastMessageAt` DESC

---

## 3. Conversation View — 2 Pane

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ← Back   Chị Hương · 🏷️ Decal · 📌 Urgent                               │
│ Trạng thái: [New ▼]  Ưu tiên: [Urgent ▼]  Assign: [Nguyễn Văn A ▼]      │
├────────────────────────────────┬───────────────────────────────────────────┤
│       CỘT TRÁI: CHAT THẬT    │     CỘT PHẢI: AI SUGGESTIONS              │
│       (60% width)             │     (40% width)                            │
│                               │                                            │
│  ┌─────────────────────────┐  │  ┌──────────────────────────────────────┐  │
│  │ 👤 Chị Hương  10:28 AM │  │  │  🤖 AI Suggestion  #SG-001          │  │
│  │ "Chào shop, mình muốn  │  │  │  Confidence: ████████░░ 85%          │  │
│  │  hỏi giá in decal"     │  │  │  Intent: 💰 Hỏi giá                 │  │
│  └─────────────────────────┘  │  │                                      │  │
│                               │  │  ── Phương án 1 (Báo giá) ──────    │  │
│  ┌─────────────────────────┐  │  │  "Dạ chào chị Hương! Giá in        │  │
│  │ 👤 Chị Hương  10:30 AM │  │  │   decal giấy 5x5cm:                │  │
│  │ "In decal giấy 5x5cm,  │  │  │   - 500c: 550.000đ                 │  │
│  │  1000 cái, bế theo hình"│  │  │   - 1.000c: 850.000đ              │  │
│  └─────────────────────────┘  │  │   Leadtime: 3-4 ngày ạ."          │  │
│                               │  │                                      │  │
│                               │  │  [📤 Send] [✏️ Edit&Send]           │  │
│                               │  │  [🔄 Regenerate]                    │  │
│                               │  │                                      │  │
│                               │  │  ── Phương án 2 (Hỏi thêm) ─────   │  │
│                               │  │  "Dạ chào chị! Em cần hỏi thêm:   │  │
│                               │  │   1. Cán màng (bóng/mờ)?           │  │
│                               │  │   2. File thiết kế sẵn chưa ạ?"   │  │
│                               │  │                                      │  │
│                               │  │  [📤 Send] [✏️ Edit&Send]           │  │
│                               │  │                                      │  │
│                               │  │  ── Missing Info ─────────────────   │  │
│                               │  │  ⚠️ Thiếu thông tin:                │  │
│                               │  │  ☐ Cán màng (bóng/mờ/không)        │  │
│                               │  │  ☐ File thiết kế                    │  │
│                               │  │                                      │  │
│                               │  │  ── Nguồn tham khảo ──────────────  │  │
│                               │  │  📄 Bảng giá decal 2026.xlsx       │  │
│                               │  │     chunk #042 (score: 0.92)        │  │
│                               │  │  📄 SOP tư vấn decal.pdf           │  │
│                               │  │     chunk #015 (score: 0.78)        │  │
│                               │  │                                      │  │
│                               │  │  ── Cảnh báo ─────────────────────  │  │
│                               │  │  (không có cảnh báo)                │  │
│                               │  └──────────────────────────────────────┘  │
│                               │                                            │
│                               │  ── Quick Actions ──────────────────────   │
│                               │  [📋 Tạo báo giá] [📦 Tạo Job]           │
│                               │  [❓ Hỏi follow-up] [🔄 Regenerate All]   │
│ ─────────────────────────     │                                            │
│ Nhập tin nhắn...        [📎] [📤 Gửi]                                     │
└────────────────────────────────┴───────────────────────────────────────────┘
```

**Tương tác cột trái:**
- Scroll lịch sử tin nhắn (lazy load thêm khi scroll lên)
- Bubble phân biệt: khách (trái, xám), nhân viên (phải, xanh)
- Attachment hiện preview (ảnh) hoặc icon + tên file (PDF)
- Input box dưới cùng: gõ thủ công hoặc paste từ suggestion
- Typing indicator khi agent đang gõ

**Tương tác cột phải:**
- **Send:** Gửi nguyên văn → cột trái hiện bubble mới
- **Edit & Send:** Mở modal editor → chỉnh sửa → gửi
- **Regenerate:** Gọi AI tạo lại (có thể thêm instruction)
- **Ask Follow-up:** AI tạo câu hỏi bổ sung
- Collapse/expand từng section
- Click vào source → mở popup xem chunk đầy đủ

---

## 4. Edit & Send Modal

```
┌──────────────────────────────────────────────┐
│  ✏️ Chỉnh sửa trước khi gửi                 │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Dạ chào chị Hương! Giá in decal giấy  │  │
│  │ 5x5cm:                                │  │
│  │ - 500 cái: 550.000đ                   │  │
│  │ - 1.000 cái: 850.000đ                 │  │
│  │ - 2.000 cái: 1.400.000đ               │  │
│  │                                        │  │
│  │ Đã bao gồm chi phí bế. Thời gian giao │  │
│  │ 3-4 ngày làm việc ạ. ▊                │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  📎 Đính kèm file                            │
│                                              │
│             [Hủy]  [📤 Gửi tin nhắn]        │
└──────────────────────────────────────────────┘
```

---

## 5. Admin — Knowledge Base Management

```
┌────────────────────────────────────────────────────────────────────┐
│  📚 Knowledge Base                              [+ Upload tài liệu]│
│                                                                    │
│  Lọc: [Tất cả ▼] [Tag ▼] [Trạng thái ▼]    [🔍 Tìm kiếm...]     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  📄 Bảng giá decal 2026.xlsx                                │  │
│  │  Tags: 🏷️ decal, bảng_giá                                  │  │
│  │  Version: 3 · 24 chunks · ✅ Indexed                        │  │
│  │  Upload: Admin · 2026-02-15                                 │  │
│  │  [👁️ Xem chunks] [📤 Upload version mới] [🗑️ Archive]       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  📄 SOP tư vấn decal.pdf                                   │  │
│  │  Tags: 🏷️ decal, SOP                                       │  │
│  │  Version: 1 · 18 chunks · ✅ Indexed                        │  │
│  │  Upload: Admin · 2026-02-10                                 │  │
│  │  [👁️ Xem chunks] [📤 Upload version mới] [🗑️ Archive]       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │  📄 Bảng giá hộp Q1-2026.xlsx                              │  │
│  │  Tags: 🏷️ hộp, bảng_giá                                    │  │
│  │  Version: 2 · 31 chunks · ⏳ Processing...                  │  │
│  │  Upload: Admin · 2026-03-01                                 │  │
│  │  [⏳ Đang xử lý...]                                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 6. Upload Document Modal

```
┌──────────────────────────────────────────────┐
│  📤 Upload tài liệu mới                      │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  │    📁 Kéo thả file vào đây             │  │
│  │    hoặc [Chọn file]                    │  │
│  │                                        │  │
│  │    Hỗ trợ: PDF, DOCX, XLSX, CSV, TXT  │  │
│  │    Tối đa: 50MB                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Tiêu đề: [_________________________]       │
│                                              │
│  Tags:    [decal ×] [bảng_giá ×] [+ Thêm]  │
│                                              │
│  Thay thế phiên bản cũ:                     │
│  [Không ▼] (chọn tài liệu cũ nếu cần)      │
│                                              │
│              [Hủy]  [📤 Upload]              │
└──────────────────────────────────────────────┘
```

---

## 7. View Chunks Modal

```
┌──────────────────────────────────────────────────────────┐
│  📄 Bảng giá decal 2026.xlsx — 24 chunks                 │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Chunk #001  · 245 tokens · Tags: decal, giới_thiệu│  │
│  │ ───────────────────────────────────────────────     │  │
│  │ "Bảng giá in decal áp dụng từ 01/01/2026.         │  │
│  │  Liên hệ CSKH để được tư vấn chi tiết.            │  │
│  │  Giá chưa bao gồm VAT..."                         │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ Chunk #002  · 312 tokens · Tags: decal, giấy       │  │
│  │ ───────────────────────────────────────────────     │  │
│  │ "Decal giấy, in offset 4 màu:                     │  │
│  │  - 3x3cm: 500c = 350k, 1000c = 550k               │  │
│  │  - 5x5cm: 500c = 550k, 1000c = 850k..."           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ◀ 1  2  3  4 ▶                                         │
│                                                 [Đóng]  │
└──────────────────────────────────────────────────────────┘
```

---

## 8. Dashboard KPI

```
┌────────────────────────────────────────────────────────────────────┐
│  📊 Dashboard          Từ: [23/02/2026] Đến: [02/03/2026]  [Lọc]  │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ ⏱️ 4m05s  │  │ 📨 40%   │  │ ✅ 94.2%  │  │ 💬 156   │          │
│  │ TB phản  │  │ AI dùng  │  │ SLA OK   │  │ Hội thoại│          │
│  │ hồi      │  │ nguyên   │  │          │  │ tuần này │          │
│  │ ▼ 12.5%  │  │          │  │ 9 breach │  │          │          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │
│                                                                    │
│  ┌─────────────────────────────┐ ┌──────────────────────────────┐  │
│  │  📈 Thời gian phản hồi      │ │  🥧 AI Suggestion Usage      │  │
│  │     (biểu đồ line 7 ngày)   │ │     (pie chart)              │  │
│  │                              │ │                              │  │
│  │  ───/\──/\─────\───/\──     │ │  ■ Gửi nguyên: 40%          │  │
│  │                              │ │  ■ Chỉnh & gửi: 42%         │  │
│  │                              │ │  ■ Từ chối: 18%             │  │
│  └─────────────────────────────┘ └──────────────────────────────┘  │
│                                                                    │
│  ┌─────────────────────────────┐ ┌──────────────────────────────┐  │
│  │  📊 Hội thoại theo trạng thái│ │  🔥 Top câu hỏi             │  │
│  │     (stacked bar chart)      │ │                              │  │
│  │                              │ │  1. Giá in decal      (42)   │  │
│  │  █ New  █ InProg  █ Quoted  │ │  2. Thời gian giao    (38)   │  │
│  │  █ Won  █ Lost              │ │  3. Giá in hộp        (31)   │  │
│  │                              │ │  4. Yêu cầu file     (25)   │  │
│  │                              │ │  5. Đổi trả          (18)   │  │
│  └─────────────────────────────┘ └──────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  👥 Hiệu suất theo Agent                                    │  │
│  │                                                              │  │
│  │  Agent        | TB phản hồi | Hội thoại | AI dùng | SLA OK  │  │
│  │  ─────────────┼─────────────┼───────────┼─────────┼───────  │  │
│  │  Nguyễn A     | 3m20s       | 45        | 52%     | 96%     │  │
│  │  Trần B       | 5m10s       | 38        | 35%     | 91%     │  │
│  │  Lê C         | 4m45s       | 31        | 44%     | 93%     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 9. Notification Center

```
┌──────────────────────────────────────┐
│  🔔 Thông báo                   [✓ Tất cả đã đọc] │
│                                      │
│  🔴 ⚠️ SLA: Chị Hương chờ > 10p     │
│     conv #001 · 2 phút trước        │
│                                      │
│  🔵 📌 Bạn được assign: Cty XYZ     │
│     conv #003 · 15 phút trước       │
│                                      │
│  ⚪ 💬 Tin mới: Anh Tuấn Anh        │
│     "Ok em gửi file..." · 30p trước │
│                                      │
└──────────────────────────────────────┘
```

---

## 10. Color System & Design Tokens

| Token             | Value                  | Dùng cho                  |
| ----------------- | ---------------------- | ------------------------- |
| `--primary`       | `#2563EB` (blue-600)   | Actions, links, active    |
| `--success`       | `#16A34A` (green-600)  | Sent, Won, Indexed        |
| `--warning`       | `#F59E0B` (amber-500)  | SLA warning, processing   |
| `--danger`        | `#DC2626` (red-600)    | SLA breach, error, urgent |
| `--neutral-bg`    | `#F8FAFC`              | Page background           |
| `--chat-customer` | `#F1F5F9`              | Customer bubble bg        |
| `--chat-agent`    | `#DBEAFE`              | Agent bubble bg           |
| `--ai-card-bg`    | `#F5F3FF` (violet-50)  | AI suggestion card bg     |
| `--ai-accent`     | `#7C3AED` (violet-600) | AI indicators             |

**Typography:** Inter / system-ui · 14px base · line-height 1.5
