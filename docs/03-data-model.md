# Data Model — ZeplaoPrint AI Agent Assist

> **Phiên bản:** 1.0 · **Ngày:** 2026-03-02

---

## 1. ER Diagram (Text)

```
┌──────────┐     ┌───────────────┐     ┌──────────────┐
│  users   │──┐  │ conversations │──┐  │  messages     │
└──────────┘  │  └───────────────┘  │  └──────────────┘
              │         │           │         │
              │         │           │         ▼
              │         │           │  ┌──────────────┐
              │         │           └──│ ai_suggestions│
              │         │              └──────────────┘
              │         │                     │
              │         ▼                     ▼
              │  ┌───────────────┐    ┌──────────────┐
              └──│  contacts     │    │ audit_logs   │
                 └───────────────┘    └──────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ kb_documents │───▶│ kb_chunks    │    │ quote_rules  │
└──────────────┘    └──────────────┘    └──────────────┘

┌──────────────┐    ┌──────────────┐
│ channels     │    │ notifications│
└──────────────┘    └──────────────┘
```

---

## 2. Chi tiết từng bảng

### 2.1 `users` — Nhân viên nội bộ

| Field           | Type         | Constraints      | Mô tả                            |
| --------------- | ------------ | ---------------- | -------------------------------- |
| `id`            | UUID         | PK, default gen  | ID nhân viên                     |
| `email`         | VARCHAR(255) | UNIQUE, NOT NULL | Email đăng nhập                  |
| `password_hash` | VARCHAR(255) | NOT NULL         | Bcrypt hash                      |
| `full_name`     | VARCHAR(100) | NOT NULL         | Tên hiển thị                     |
| `role`          | ENUM         | NOT NULL         | `admin` / `supervisor` / `agent` |
| `avatar_url`    | TEXT         | NULL             | URL ảnh đại diện                 |
| `is_active`     | BOOLEAN      | DEFAULT true     | Trạng thái tài khoản             |
| `last_login_at` | TIMESTAMPTZ  | NULL             | Lần đăng nhập cuối               |
| `created_at`    | TIMESTAMPTZ  | DEFAULT NOW()    |                                  |
| `updated_at`    | TIMESTAMPTZ  | DEFAULT NOW()    |                                  |

**Indexes:** `idx_users_email` (email), `idx_users_role` (role)

---

### 2.2 `channels` — Kênh kết nối (Zalo OA, FB Page…)

| Field               | Type         | Constraints   | Mô tả                                  |
| ------------------- | ------------ | ------------- | -------------------------------------- |
| `id`                | UUID         | PK            |                                        |
| `type`              | ENUM         | NOT NULL      | `zalo_oa` / `facebook_page`            |
| `name`              | VARCHAR(100) | NOT NULL      | Tên hiển thị (VD: "OA Công ty In ABC") |
| `external_id`       | VARCHAR(255) | NOT NULL      | OA ID hoặc Page ID                     |
| `access_token_enc`  | TEXT         | NOT NULL      | Token đã mã hóa (AES-256)              |
| `refresh_token_enc` | TEXT         | NULL          | Refresh token mã hóa                   |
| `token_expires_at`  | TIMESTAMPTZ  | NULL          | Thời điểm token hết hạn                |
| `webhook_secret`    | VARCHAR(255) | NULL          | Secret verify webhook                  |
| `config`            | JSONB        | DEFAULT '{}'  | Cấu hình riêng kênh                    |
| `is_active`         | BOOLEAN      | DEFAULT true  |                                        |
| `created_at`        | TIMESTAMPTZ  | DEFAULT NOW() |                                        |
| `updated_at`        | TIMESTAMPTZ  | DEFAULT NOW() |                                        |

**Indexes:** `idx_channels_type_extid` (type, external_id)

---

### 2.3 `contacts` — Khách hàng

| Field              | Type         | Constraints      | Mô tả                     |
| ------------------ | ------------ | ---------------- | ------------------------- |
| `id`               | UUID         | PK               |                           |
| `channel_id`       | UUID         | FK → channels.id | Kênh liên hệ              |
| `external_user_id` | VARCHAR(255) | NOT NULL         | Zalo userId / FB PSID     |
| `display_name`     | VARCHAR(255) | NULL             | Tên Zalo/FB               |
| `avatar_url`       | TEXT         | NULL             |                           |
| `phone`            | VARCHAR(20)  | NULL             | SĐT (nếu có)              |
| `email`            | VARCHAR(255) | NULL             | Email (nếu có)            |
| `tags`             | TEXT[]       | DEFAULT '{}'     | VD: `{'vip', 'khách_cũ'}` |
| `metadata`         | JSONB        | DEFAULT '{}'     | Thông tin bổ sung         |
| `first_contact_at` | TIMESTAMPTZ  | DEFAULT NOW()    |                           |
| `last_contact_at`  | TIMESTAMPTZ  | DEFAULT NOW()    |                           |
| `created_at`       | TIMESTAMPTZ  | DEFAULT NOW()    |                           |

**Indexes:** `idx_contacts_channel_ext` UNIQUE (channel_id, external_user_id)

---

### 2.4 `conversations` — Hội thoại

| Field                      | Type         | Constraints             | Mô tả                                                                                              |
| -------------------------- | ------------ | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `id`                       | UUID         | PK                      |                                                                                                    |
| `channel_id`               | UUID         | FK → channels.id        |                                                                                                    |
| `contact_id`               | UUID         | FK → contacts.id        |                                                                                                    |
| `assignee_id`              | UUID         | FK → users.id, NULL     | Agent được assign                                                                                  |
| `status`                   | ENUM         | NOT NULL, DEFAULT 'new' | `new` / `in_progress` / `waiting_customer` / `waiting_file` / `quoted` / `won` / `lost` / `closed` |
| `priority`                 | ENUM         | DEFAULT 'normal'        | `urgent` / `high` / `normal` / `low`                                                               |
| `subject`                  | VARCHAR(255) | NULL                    | Tóm tắt / loại sản phẩm                                                                            |
| `product_type`             | VARCHAR(50)  | NULL                    | `decal` / `hop` / `catalogue` / `tem_nhan` / …                                                     |
| `last_message_at`          | TIMESTAMPTZ  | NULL                    | Thời điểm tin cuối                                                                                 |
| `last_customer_message_at` | TIMESTAMPTZ  | NULL                    | Tin cuối từ khách                                                                                  |
| `sla_deadline`             | TIMESTAMPTZ  | NULL                    | Deadline phải trả lời                                                                              |
| `sla_breached`             | BOOLEAN      | DEFAULT false           | Đã vi phạm SLA                                                                                     |
| `unread_count`             | INTEGER      | DEFAULT 0               | Tin chưa đọc                                                                                       |
| `metadata`                 | JSONB        | DEFAULT '{}'            |                                                                                                    |
| `closed_at`                | TIMESTAMPTZ  | NULL                    |                                                                                                    |
| `created_at`               | TIMESTAMPTZ  | DEFAULT NOW()           |                                                                                                    |
| `updated_at`               | TIMESTAMPTZ  | DEFAULT NOW()           |                                                                                                    |

**Indexes:**
- `idx_conv_status` (status)
- `idx_conv_assignee` (assignee_id)
- `idx_conv_channel_contact` (channel_id, contact_id)
- `idx_conv_sla` (sla_breached, sla_deadline) WHERE status IN ('new', 'in_progress')
- `idx_conv_last_msg` (last_message_at DESC)

---

### 2.5 `messages` — Tin nhắn

| Field               | Type         | Constraints                  | Mô tả                                                             |
| ------------------- | ------------ | ---------------------------- | ----------------------------------------------------------------- |
| `id`                | UUID         | PK                           |                                                                   |
| `conversation_id`   | UUID         | FK → conversations.id        |                                                                   |
| `sender_type`       | ENUM         | NOT NULL                     | `customer` / `agent` / `system`                                   |
| `sender_id`         | VARCHAR(255) | NULL                         | user.id (nếu agent) hoặc contact.external_user_id                 |
| `content`           | TEXT         | NULL                         | Nội dung text                                                     |
| `content_type`      | ENUM         | DEFAULT 'text'               | `text` / `image` / `file` / `sticker` / `location` / `quote_card` |
| `attachments`       | JSONB        | DEFAULT '[]'                 | `[{type, url, filename, size, mimeType}]`                         |
| `external_msg_id`   | VARCHAR(255) | NULL                         | msgId từ Zalo/FB (deduplicate)                                    |
| `idempotency_key`   | VARCHAR(255) | NULL                         | Key chống gửi trùng outbound                                      |
| `status`            | ENUM         | DEFAULT 'received'           | `received` / `sending` / `sent` / `failed` / `delivered` / `read` |
| `suggestion_id`     | UUID         | FK → ai_suggestions.id, NULL | Suggestion gốc (nếu gửi từ AI)                                    |
| `suggestion_action` | ENUM         | NULL                         | `sent_as_is` / `edited` / `manual` (không dùng AI)                |
| `error_detail`      | TEXT         | NULL                         | Chi tiết lỗi nếu failed                                           |
| `created_at`        | TIMESTAMPTZ  | DEFAULT NOW()                |                                                                   |

**Indexes:**
- `idx_msg_conv_created` (conversation_id, created_at)
- `idx_msg_external` UNIQUE (external_msg_id) WHERE external_msg_id IS NOT NULL
- `idx_msg_idempotency` UNIQUE (idempotency_key) WHERE idempotency_key IS NOT NULL

---

### 2.6 `ai_suggestions` — Đề xuất AI

| Field                | Type         | Constraints           | Mô tả                                                       |
| -------------------- | ------------ | --------------------- | ----------------------------------------------------------- |
| `id`                 | UUID         | PK                    |                                                             |
| `conversation_id`    | UUID         | FK → conversations.id |                                                             |
| `trigger_message_id` | UUID         | FK → messages.id      | Tin nhắn kích hoạt                                          |
| `replies`            | JSONB        | NOT NULL              | `[{text, label?}]` — 1-3 phương án                          |
| `missing_info`       | JSONB        | DEFAULT '[]'          | `[{slot, question}]`                                        |
| `sources`            | JSONB        | DEFAULT '[]'          | `[{doc_id, chunk_id, doc_name, excerpt, score}]`            |
| `confidence`         | DECIMAL(3,2) | NULL                  | 0.00 – 1.00                                                 |
| `warnings`           | TEXT[]       | DEFAULT '{}'          | VD: `{'deadline_gấp', 'gia_công_đặc_biệt'}`                 |
| `quote_result`       | JSONB        | NULL                  | Kết quả từ Quote Engine                                     |
| `intent`             | VARCHAR(50)  | NULL                  | `ask_price` / `ask_spec` / `send_file` / `complaint` / …    |
| `prompt_version`     | VARCHAR(20)  | NOT NULL              | VD: "v1.3"                                                  |
| `model`              | VARCHAR(50)  | NOT NULL              | VD: "gpt-4o-2025-08"                                        |
| `latency_ms`         | INTEGER      | NULL                  | Thời gian generate (ms)                                     |
| `token_usage`        | JSONB        | NULL                  | `{prompt_tokens, completion_tokens}`                        |
| `status`             | ENUM         | DEFAULT 'generated'   | `generating` / `generated` / `sent` / `edited` / `rejected` |
| `rejection_reason`   | VARCHAR(255) | NULL                  | Lý do reject (tag)                                          |
| `created_at`         | TIMESTAMPTZ  | DEFAULT NOW()         |                                                             |

**Indexes:**
- `idx_suggestion_conv` (conversation_id, created_at DESC)
- `idx_suggestion_status` (status)

---

### 2.7 `kb_documents` — Tài liệu Knowledge Base

| Field           | Type         | Constraints                | Mô tả                                                         |
| --------------- | ------------ | -------------------------- | ------------------------------------------------------------- |
| `id`            | UUID         | PK                         |                                                               |
| `title`         | VARCHAR(255) | NOT NULL                   | Tên tài liệu                                                  |
| `file_url`      | TEXT         | NOT NULL                   | S3 URL                                                        |
| `file_type`     | VARCHAR(20)  | NOT NULL                   | `pdf` / `docx` / `xlsx` / `csv` / `txt` / `md`                |
| `file_size`     | BIGINT       | NULL                       | Bytes                                                         |
| `tags`          | TEXT[]       | DEFAULT '{}'               | `{'decal', 'bảng_giá'}`                                       |
| `version`       | INTEGER      | DEFAULT 1                  | Version number                                                |
| `parent_id`     | UUID         | FK → kb_documents.id, NULL | Phiên bản trước                                               |
| `status`        | ENUM         | DEFAULT 'processing'       | `uploading` / `processing` / `indexed` / `error` / `archived` |
| `chunk_count`   | INTEGER      | DEFAULT 0                  | Số chunks đã tạo                                              |
| `error_message` | TEXT         | NULL                       | Chi tiết lỗi                                                  |
| `uploaded_by`   | UUID         | FK → users.id              |                                                               |
| `created_at`    | TIMESTAMPTZ  | DEFAULT NOW()              |                                                               |
| `updated_at`    | TIMESTAMPTZ  | DEFAULT NOW()              |                                                               |

**Indexes:**
- `idx_kb_doc_status` (status)
- `idx_kb_doc_tags` GIN (tags)

---

### 2.8 `kb_chunks` — Chunks vector hóa

| Field         | Type         | Constraints                             | Mô tả                         |
| ------------- | ------------ | --------------------------------------- | ----------------------------- |
| `id`          | UUID         | PK                                      |                               |
| `document_id` | UUID         | FK → kb_documents.id, ON DELETE CASCADE |                               |
| `chunk_index` | INTEGER      | NOT NULL                                | Thứ tự chunk trong tài liệu   |
| `content`     | TEXT         | NOT NULL                                | Nội dung text                 |
| `token_count` | INTEGER      | NULL                                    | Số tokens                     |
| `embedding`   | VECTOR(1536) | NOT NULL                                | Vector embedding              |
| `tags`        | TEXT[]       | DEFAULT '{}'                            | Kế thừa từ document + auto    |
| `metadata`    | JSONB        | DEFAULT '{}'                            | `{page, section, heading}`    |
| `is_active`   | BOOLEAN      | DEFAULT true                            | false khi document bị archive |
| `created_at`  | TIMESTAMPTZ  | DEFAULT NOW()                           |                               |

**Indexes:**
- `idx_chunk_doc` (document_id)
- `idx_chunk_embedding` USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
- `idx_chunk_tags` GIN (tags)

---

### 2.9 `quote_rules` — Bảng giá / Quy tắc tính giá

| Field             | Type         | Constraints   | Mô tả                                                                  |
| ----------------- | ------------ | ------------- | ---------------------------------------------------------------------- |
| `id`              | UUID         | PK            |                                                                        |
| `product_type`    | VARCHAR(50)  | NOT NULL      | `decal` / `hop` / `catalogue` / `tem_nhan`                             |
| `rule_name`       | VARCHAR(100) | NOT NULL      | VD: "In decal giấy"                                                    |
| `required_slots`  | JSONB        | NOT NULL      | `["size", "quantity", "material", "finishing"]`                        |
| `pricing_formula` | JSONB        | NOT NULL      | `{base_price, per_unit, tiers: [{min_qty, price}], surcharges: {...}}` |
| `leadtime_rules`  | JSONB        | DEFAULT '{}'  | `{standard_days, express_surcharge}`                                   |
| `tech_notes`      | TEXT         | NULL          | Ghi chú kỹ thuật mặc định                                              |
| `min_quantity`    | INTEGER      | DEFAULT 1     |                                                                        |
| `max_quantity`    | INTEGER      | NULL          |                                                                        |
| `is_active`       | BOOLEAN      | DEFAULT true  |                                                                        |
| `effective_from`  | DATE         | NOT NULL      | Ngày hiệu lực                                                          |
| `effective_to`    | DATE         | NULL          | Ngày hết hiệu lực                                                      |
| `created_by`      | UUID         | FK → users.id |                                                                        |
| `created_at`      | TIMESTAMPTZ  | DEFAULT NOW() |                                                                        |
| `updated_at`      | TIMESTAMPTZ  | DEFAULT NOW() |                                                                        |

**Indexes:**
- `idx_quote_product_active` (product_type, is_active, effective_from, effective_to)

---

### 2.10 `quote_requests` — Lịch sử tính giá

| Field             | Type        | Constraints                  | Mô tả                                      |
| ----------------- | ----------- | ---------------------------- | ------------------------------------------ |
| `id`              | UUID        | PK                           |                                            |
| `conversation_id` | UUID        | FK → conversations.id        |                                            |
| `suggestion_id`   | UUID        | FK → ai_suggestions.id, NULL |                                            |
| `rule_id`         | UUID        | FK → quote_rules.id, NULL    |                                            |
| `input_slots`     | JSONB       | NOT NULL                     | `{size: "A4", quantity: 1000, …}`          |
| `output`          | JSONB       | NULL                         | `{total, breakdown, leadtime, tech_notes}` |
| `status`          | ENUM        | DEFAULT 'calculated'         | `calculated` / `manual_required` / `error` |
| `created_at`      | TIMESTAMPTZ | DEFAULT NOW()                |                                            |

---

### 2.11 `audit_logs` — Nhật ký hành động

| Field         | Type        | Constraints         | Mô tả                                                                                                           |
| ------------- | ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`          | UUID        | PK                  |                                                                                                                 |
| `user_id`     | UUID        | FK → users.id, NULL | NULL = system action                                                                                            |
| `action`      | VARCHAR(50) | NOT NULL            | `message_sent` / `suggestion_accepted` / `suggestion_rejected` / `conversation_assigned` / `status_changed` / … |
| `entity_type` | VARCHAR(50) | NOT NULL            | `conversation` / `message` / `suggestion` / `kb_document` / …                                                   |
| `entity_id`   | UUID        | NOT NULL            | ID liên quan                                                                                                    |
| `old_value`   | JSONB       | NULL                | Giá trị cũ                                                                                                      |
| `new_value`   | JSONB       | NULL                | Giá trị mới                                                                                                     |
| `metadata`    | JSONB       | DEFAULT '{}'        | Thông tin bổ sung                                                                                               |
| `ip_address`  | INET        | NULL                |                                                                                                                 |
| `created_at`  | TIMESTAMPTZ | DEFAULT NOW()       |                                                                                                                 |

**Indexes:**
- `idx_audit_entity` (entity_type, entity_id, created_at DESC)
- `idx_audit_user_action` (user_id, action, created_at DESC)

---

### 2.12 `notifications` — Thông báo nội bộ

| Field        | Type         | Constraints   | Mô tả                                            |
| ------------ | ------------ | ------------- | ------------------------------------------------ |
| `id`         | UUID         | PK            |                                                  |
| `user_id`    | UUID         | FK → users.id |                                                  |
| `type`       | VARCHAR(50)  | NOT NULL      | `sla_warning` / `new_assignment` / `new_message` |
| `title`      | VARCHAR(255) | NOT NULL      |                                                  |
| `body`       | TEXT         | NULL          |                                                  |
| `link`       | TEXT         | NULL          | VD: `/conversations/{id}`                        |
| `is_read`    | BOOLEAN      | DEFAULT false |                                                  |
| `created_at` | TIMESTAMPTZ  | DEFAULT NOW() |                                                  |

**Indexes:**
- `idx_notif_user_read` (user_id, is_read, created_at DESC)

---

## 3. SQL Migration (tóm tắt)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'agent');
CREATE TYPE channel_type AS ENUM ('zalo_oa', 'facebook_page');
CREATE TYPE conversation_status AS ENUM (
  'new', 'in_progress', 'waiting_customer', 'waiting_file',
  'quoted', 'won', 'lost', 'closed'
);
CREATE TYPE conversation_priority AS ENUM ('urgent', 'high', 'normal', 'low');
CREATE TYPE sender_type AS ENUM ('customer', 'agent', 'system');
CREATE TYPE content_type AS ENUM ('text', 'image', 'file', 'sticker', 'location', 'quote_card');
CREATE TYPE message_status AS ENUM ('received', 'sending', 'sent', 'failed', 'delivered', 'read');
CREATE TYPE suggestion_status AS ENUM ('generating', 'generated', 'sent', 'edited', 'rejected');
CREATE TYPE suggestion_action AS ENUM ('sent_as_is', 'edited', 'manual');
CREATE TYPE kb_doc_status AS ENUM ('uploading', 'processing', 'indexed', 'error', 'archived');
CREATE TYPE quote_status AS ENUM ('calculated', 'manual_required', 'error');
```

---

## 4. Quan hệ chính

```
users 1──N conversations (assignee)
users 1──N audit_logs
users 1──N notifications
users 1──N kb_documents (uploaded_by)

channels 1──N contacts
channels 1──N conversations

contacts 1──N conversations

conversations 1──N messages
conversations 1──N ai_suggestions
conversations 1──N quote_requests

messages 1──0..1 ai_suggestions (suggestion_id)

kb_documents 1──N kb_chunks
kb_documents 1──0..1 kb_documents (parent_id — versioning)

quote_rules 1──N quote_requests
ai_suggestions 1──N quote_requests
```
