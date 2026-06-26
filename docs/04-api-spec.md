# API Specification — ZeplaoPrint AI Agent Assist

> **Phiên bản:** 1.0 · **Ngày:** 2026-03-02  
> **Base URL:** `https://api.ZeplaoPrint.vn/v1`  
> **Auth:** Bearer JWT Token (trừ webhook endpoints)

---

## 1. Tổng quan Endpoints

| #                  | Method | Endpoint                                    | Mô tả                                 | Auth            |
| ------------------ | ------ | ------------------------------------------- | ------------------------------------- | --------------- |
| **Auth**           |        |                                             |                                       |                 |
| 1                  | POST   | `/auth/login`                               | Đăng nhập                             | Public          |
| 2                  | POST   | `/auth/refresh`                             | Refresh token                         | Refresh Token   |
| 3                  | POST   | `/auth/logout`                              | Đăng xuất                             | JWT             |
| **Webhook**        |        |                                             |                                       |                 |
| 4                  | POST   | `/webhooks/zalo`                            | Nhận webhook Zalo OA                  | HMAC Verify     |
| 5                  | POST   | `/webhooks/facebook`                        | Nhận webhook FB (Phase 2)             | Verify Token    |
| **Conversations**  |        |                                             |                                       |                 |
| 6                  | GET    | `/conversations`                            | Danh sách hội thoại                   | JWT             |
| 7                  | GET    | `/conversations/:id`                        | Chi tiết hội thoại                    | JWT             |
| 8                  | PATCH  | `/conversations/:id`                        | Cập nhật (status, priority, assignee) | JWT             |
| 9                  | GET    | `/conversations/:id/messages`               | Lịch sử tin nhắn                      | JWT             |
| **Messages**       |        |                                             |                                       |                 |
| 10                 | POST   | `/messages/send`                            | Gửi tin nhắn qua kênh                 | JWT             |
| **AI Suggestions** |        |                                             |                                       |                 |
| 11                 | GET    | `/conversations/:id/suggestions`            | Danh sách suggestions                 | JWT             |
| 12                 | POST   | `/conversations/:id/suggestions/regenerate` | Tạo lại suggestion                    | JWT             |
| 13                 | PATCH  | `/suggestions/:id`                          | Cập nhật trạng thái suggestion        | JWT             |
| **Quote Engine**   |        |                                             |                                       |                 |
| 14                 | POST   | `/quote/calc`                               | Tính giá                              | JWT             |
| 15                 | GET    | `/quote/rules`                              | Danh sách rules                       | JWT (Admin)     |
| 16                 | POST   | `/quote/rules`                              | Tạo rule                              | JWT (Admin)     |
| 17                 | PUT    | `/quote/rules/:id`                          | Cập nhật rule                         | JWT (Admin)     |
| **Knowledge Base** |        |                                             |                                       |                 |
| 18                 | GET    | `/kb/documents`                             | Danh sách tài liệu                    | JWT             |
| 19                 | POST   | `/kb/documents`                             | Upload tài liệu                       | JWT (Admin)     |
| 20                 | DELETE | `/kb/documents/:id`                         | Xóa/Archive tài liệu                  | JWT (Admin)     |
| 21                 | GET    | `/kb/documents/:id/chunks`                  | Xem chunks                            | JWT             |
| 22                 | POST   | `/kb/search`                                | Tìm kiếm semantic                     | JWT             |
| **Users**          |        |                                             |                                       |                 |
| 23                 | GET    | `/users`                                    | Danh sách users                       | JWT (Admin/Sup) |
| 24                 | POST   | `/users`                                    | Tạo user                              | JWT (Admin)     |
| 25                 | PUT    | `/users/:id`                                | Cập nhật user                         | JWT (Admin)     |
| **Dashboard**      |        |                                             |                                       |                 |
| 26                 | GET    | `/dashboard/kpi`                            | KPI metrics                           | JWT (Sup/Admin) |
| 27                 | GET    | `/dashboard/sla`                            | SLA stats                             | JWT (Sup/Admin) |
| **Channels**       |        |                                             |                                       |                 |
| 28                 | GET    | `/channels`                                 | Danh sách kênh                        | JWT (Admin)     |
| 29                 | POST   | `/channels`                                 | Kết nối kênh mới                      | JWT (Admin)     |
| 30                 | PUT    | `/channels/:id`                             | Cập nhật kênh                         | JWT (Admin)     |
| **Notifications**  |        |                                             |                                       |                 |
| 31                 | GET    | `/notifications`                            | Danh sách thông báo                   | JWT             |
| 32                 | PATCH  | `/notifications/:id/read`                   | Đánh dấu đã đọc                       | JWT             |

---

## 2. Chi tiết Request / Response

### 2.1 Auth

#### `POST /auth/login`

**Request:**
```json
{
  "email": "agent@inbinhminh.vn",
  "password": "securePassword123"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "dGhpcyBpc...",
  "expiresIn": 3600,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "agent@inbinhminh.vn",
    "fullName": "Nguyễn Văn A",
    "role": "agent",
    "avatarUrl": null
  }
}
```

**Response 401:**
```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Email hoặc mật khẩu không đúng"
}
```

---

### 2.2 Webhook Zalo

#### `POST /webhooks/zalo`

Zalo Platform gọi endpoint này khi có sự kiện.

**Headers:**
```
X-ZEvent-Signature: <HMAC-SHA256 signature>
Content-Type: application/json
```

**Request Body (tin nhắn text):**
```json
{
  "app_id": "123456",
  "event_name": "user_send_text",
  "timestamp": "1709366400000",
  "sender": {
    "id": "zalo_user_001"
  },
  "recipient": {
    "id": "oa_123456"
  },
  "message": {
    "msg_id": "msg_abc123",
    "text": "Cho mình hỏi giá in decal 1000 cái kích thước 5x5cm"
  }
}
```

**Request Body (ảnh):**
```json
{
  "app_id": "123456",
  "event_name": "user_send_image",
  "timestamp": "1709366400000",
  "sender": { "id": "zalo_user_001" },
  "recipient": { "id": "oa_123456" },
  "message": {
    "msg_id": "msg_abc124",
    "attachments": [
      {
        "payload": {
          "thumbnail": "https://...",
          "url": "https://..."
        },
        "type": "image"
      }
    ]
  }
}
```

**Response:** `200 OK` (Zalo chỉ cần status 200)

---

### 2.3 Conversations

#### `GET /conversations`

**Query Params:**
| Param        | Type    | Default | Mô tả                              |
| ------------ | ------- | ------- | ---------------------------------- |
| `status`     | string  | -       | Filter by status (comma-separated) |
| `assigneeId` | UUID    | -       | Filter by assignee                 |
| `priority`   | string  | -       | Filter by priority                 |
| `channelId`  | UUID    | -       | Filter by channel                  |
| `search`     | string  | -       | Tìm theo tên khách / nội dung      |
| `slaBreach`  | boolean | -       | Chỉ lấy vi phạm SLA                |
| `page`       | number  | 1       | Trang                              |
| `limit`      | number  | 20      | Số mục / trang (max 50)            |

**Response 200:**
```json
{
  "data": [
    {
      "id": "conv_001",
      "channel": {
        "id": "ch_001",
        "type": "zalo_oa",
        "name": "OA In Bình Minh"
      },
      "contact": {
        "id": "ct_001",
        "displayName": "Chị Hương",
        "avatarUrl": "https://...",
        "tags": ["khách_cũ"]
      },
      "assignee": {
        "id": "user_001",
        "fullName": "Nguyễn Văn A"
      },
      "status": "in_progress",
      "priority": "high",
      "subject": "In decal 5x5cm",
      "productType": "decal",
      "lastMessage": {
        "content": "Cho mình hỏi giá in decal 1000 cái",
        "senderType": "customer",
        "createdAt": "2026-03-02T10:30:00Z"
      },
      "unreadCount": 2,
      "slaBreached": false,
      "slaDeadline": "2026-03-02T10:40:00Z",
      "lastMessageAt": "2026-03-02T10:30:00Z",
      "createdAt": "2026-03-02T10:28:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

#### `PATCH /conversations/:id`

**Request:**
```json
{
  "assigneeId": "user_002",
  "status": "quoted",
  "priority": "urgent"
}
```

**Response 200:**
```json
{
  "id": "conv_001",
  "status": "quoted",
  "priority": "urgent",
  "assignee": {
    "id": "user_002",
    "fullName": "Trần Thị B"
  },
  "updatedAt": "2026-03-02T10:35:00Z"
}
```

---

### 2.4 Messages

#### `GET /conversations/:id/messages`

**Query Params:**
| Param    | Type         | Default |
| -------- | ------------ | ------- |
| `before` | ISO datetime | -       |
| `limit`  | number       | 50      |

**Response 200:**
```json
{
  "data": [
    {
      "id": "msg_001",
      "conversationId": "conv_001",
      "senderType": "customer",
      "senderId": "zalo_user_001",
      "content": "Cho mình hỏi giá in decal 1000 cái kích thước 5x5cm",
      "contentType": "text",
      "attachments": [],
      "status": "received",
      "createdAt": "2026-03-02T10:30:00Z"
    },
    {
      "id": "msg_002",
      "conversationId": "conv_001",
      "senderType": "agent",
      "senderId": "user_001",
      "content": "Dạ chào chị Hương! Em xin hỏi thêm...",
      "contentType": "text",
      "attachments": [],
      "status": "sent",
      "suggestionId": "sug_001",
      "suggestionAction": "edited",
      "createdAt": "2026-03-02T10:31:00Z"
    }
  ],
  "hasMore": false
}
```

#### `POST /messages/send`

**Request:**
```json
{
  "conversationId": "conv_001",
  "content": "Dạ chào chị Hương! Giá in decal giấy 5x5cm, số lượng 1.000 cái là 850.000đ (đã bao gồm bế). Thời gian giao hàng 3-4 ngày làm việc ạ.",
  "contentType": "text",
  "attachments": [],
  "suggestionId": "sug_001",
  "suggestionAction": "edited",
  "idempotencyKey": "send_conv001_1709366500"
}
```

**Response 202:**
```json
{
  "messageId": "msg_003",
  "status": "sending",
  "idempotencyKey": "send_conv001_1709366500"
}
```

**Response 409 (duplicate):**
```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Tin nhắn đã được gửi trước đó",
  "existingMessageId": "msg_003"
}
```

---

### 2.5 AI Suggestions

#### `GET /conversations/:id/suggestions`

**Response 200:**
```json
{
  "data": [
    {
      "id": "sug_001",
      "conversationId": "conv_001",
      "triggerMessageId": "msg_001",
      "replies": [
        {
          "text": "Dạ chào anh/chị! Giá in decal giấy 5x5cm:\n- 500 cái: 550.000đ\n- 1.000 cái: 850.000đ\n- 2.000 cái: 1.400.000đ\nĐã bao gồm chi phí bế. Thời gian giao 3-4 ngày làm việc ạ.",
          "label": "Báo giá đầy đủ"
        },
        {
          "text": "Dạ chào anh/chị! Em cần hỏi thêm để báo giá chính xác:\n1. Chất liệu decal (giấy / nhựa PP / vinyl)?\n2. Có cần cán màng (bóng/mờ) không ạ?\n3. Anh/chị có file thiết kế chưa?",
          "label": "Hỏi thêm thông tin"
        }
      ],
      "missingInfo": [
        { "slot": "material", "question": "Chất liệu decal: giấy / nhựa PP / vinyl?" },
        { "slot": "lamination", "question": "Cán màng: bóng / mờ / không cán?" }
      ],
      "sources": [
        {
          "docId": "doc_001",
          "chunkId": "chunk_042",
          "docName": "Bảng giá decal 2026.xlsx",
          "excerpt": "Decal giấy 5x5cm, in offset 4 màu: 500c = 550k, 1000c = 850k...",
          "score": 0.92
        }
      ],
      "confidence": 0.85,
      "warnings": [],
      "quoteResult": {
        "productType": "decal",
        "total": 850000,
        "breakdown": {
          "in": 600000,
          "be": 200000,
          "giay": 50000
        },
        "leadtimeDays": 3,
        "techNotes": "File thiết kế cần có bleed 2mm"
      },
      "intent": "ask_price",
      "promptVersion": "v1.2",
      "model": "gpt-4o-2025-08",
      "latencyMs": 3200,
      "status": "generated",
      "createdAt": "2026-03-02T10:30:05Z"
    }
  ]
}
```

#### `POST /conversations/:id/suggestions/regenerate`

**Request:**
```json
{
  "instruction": "Trả lời ngắn gọn hơn, chỉ báo giá 1000 cái"
}
```

**Response 202:**
```json
{
  "suggestionId": "sug_002",
  "status": "generating"
}
```

#### `PATCH /suggestions/:id`

**Request (reject):**
```json
{
  "status": "rejected",
  "rejectionReason": "giá_sai"
}
```

**Response 200:**
```json
{
  "id": "sug_001",
  "status": "rejected",
  "rejectionReason": "giá_sai",
  "updatedAt": "2026-03-02T10:32:00Z"
}
```

---

### 2.6 Quote Engine

#### `POST /quote/calc`

**Request:**
```json
{
  "productType": "decal",
  "size": {
    "width": 5,
    "height": 5,
    "unit": "cm"
  },
  "quantity": 1000,
  "material": "paper",
  "printing": "offset_4c",
  "finishing": ["die_cut"],
  "lamination": null,
  "conversationId": "conv_001"
}
```

**Response 200:**
```json
{
  "id": "qr_001",
  "productType": "decal",
  "total": 850000,
  "currency": "VND",
  "breakdown": {
    "printing": 600000,
    "dieCut": 200000,
    "material": 50000
  },
  "leadtime": {
    "standardDays": 3,
    "expressDays": 1,
    "expressSurcharge": 300000
  },
  "techNotes": "File thiết kế cần có bleed 2mm. Máy in offset tối thiểu 500 tờ/lần chạy.",
  "ruleId": "rule_001",
  "requiresManualQuote": false
}
```

**Response 200 (cần báo giá thủ công):**
```json
{
  "productType": "custom",
  "total": null,
  "requiresManualQuote": true,
  "reason": "Sản phẩm kích thước đặc biệt, vui lòng liên hệ bộ phận sản xuất",
  "missingSlots": ["special_finishing_detail"]
}
```

---

### 2.7 Knowledge Base

#### `POST /kb/documents`

**Request (multipart/form-data):**
```
file: [binary]
title: "Bảng giá decal 2026"
tags: ["decal", "bảng_giá"]
```

**Response 201:**
```json
{
  "id": "doc_001",
  "title": "Bảng giá decal 2026",
  "fileUrl": "https://s3.../kb/doc_001.xlsx",
  "fileType": "xlsx",
  "fileSize": 245760,
  "tags": ["decal", "bảng_giá"],
  "version": 1,
  "status": "processing",
  "chunkCount": 0,
  "uploadedBy": "user_admin_001",
  "createdAt": "2026-03-02T09:00:00Z"
}
```

#### `POST /kb/search`

**Request:**
```json
{
  "query": "giá in decal giấy 5x5cm offset",
  "tags": ["decal"],
  "topK": 5,
  "minScore": 0.7
}
```

**Response 200:**
```json
{
  "results": [
    {
      "chunkId": "chunk_042",
      "documentId": "doc_001",
      "documentTitle": "Bảng giá decal 2026",
      "content": "Decal giấy, in offset 4 màu:\n- 5x5cm: 500c = 550k, 1000c = 850k, 2000c = 1.400k\n- 7x7cm: 500c = 650k, 1000c = 1.050k...",
      "score": 0.92,
      "tags": ["decal", "bảng_giá"],
      "metadata": { "page": 2, "section": "Decal giấy" }
    },
    {
      "chunkId": "chunk_043",
      "documentId": "doc_001",
      "documentTitle": "Bảng giá decal 2026",
      "content": "Phụ thu: Cán bóng +15%, cán mờ +12%. Bế theo hình +30%.",
      "score": 0.84,
      "tags": ["decal", "bảng_giá"],
      "metadata": { "page": 3, "section": "Phụ thu" }
    }
  ]
}
```

---

### 2.8 Dashboard KPI

#### `GET /dashboard/kpi`

**Query Params:**
| Param     | Type     | Default      |
| --------- | -------- | ------------ |
| `from`    | ISO date | 7 ngày trước |
| `to`      | ISO date | Hôm nay      |
| `agentId` | UUID     | Tất cả       |

**Response 200:**
```json
{
  "period": {
    "from": "2026-02-23",
    "to": "2026-03-02"
  },
  "responseTime": {
    "averageSeconds": 245,
    "medianSeconds": 180,
    "p95Seconds": 600,
    "trend": -12.5
  },
  "suggestionUsage": {
    "total": 320,
    "sentAsIs": 128,
    "edited": 134,
    "rejected": 58,
    "sentAsIsPercent": 40.0,
    "editedPercent": 41.9,
    "rejectedPercent": 18.1
  },
  "conversations": {
    "total": 156,
    "byStatus": {
      "new": 3,
      "in_progress": 12,
      "waiting_customer": 24,
      "quoted": 45,
      "won": 62,
      "lost": 10
    }
  },
  "sla": {
    "complianceRate": 94.2,
    "totalBreaches": 9
  },
  "topQuestions": [
    { "topic": "Giá in decal", "count": 42 },
    { "topic": "Thời gian giao hàng", "count": 38 },
    { "topic": "Giá in hộp", "count": 31 },
    { "topic": "File thiết kế yêu cầu", "count": 25 },
    { "topic": "Chính sách đổi trả", "count": 18 }
  ]
}
```

---

## 3. WebSocket Events

**Namespace:** `/ws`  
**Auth:** JWT token trong handshake query

### Server → Client Events

| Event                  | Payload                        | Mô tả                             |
| ---------------------- | ------------------------------ | --------------------------------- |
| `new_message`          | `{conversationId, message}`    | Tin nhắn mới từ khách             |
| `new_suggestion`       | `{conversationId, suggestion}` | AI suggestion mới                 |
| `message_status`       | `{messageId, status, error?}`  | Cập nhật trạng thái gửi           |
| `conversation_updated` | `{conversationId, changes}`    | Thay đổi status/assignee/priority |
| `sla_warning`          | `{conversationId, deadline}`   | Cảnh báo SLA                      |
| `notification`         | `{notification}`               | Thông báo nội bộ                  |

### Client → Server Events

| Event                | Payload            | Mô tả                           |
| -------------------- | ------------------ | ------------------------------- |
| `join_conversation`  | `{conversationId}` | Subscribe updates cho hội thoại |
| `leave_conversation` | `{conversationId}` | Unsubscribe                     |
| `typing`             | `{conversationId}` | Agent đang gõ (broadcast)       |
| `mark_read`          | `{conversationId}` | Đánh dấu đã đọc                 |

---

## 4. Error Response Format

Tất cả lỗi theo chuẩn format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Thiếu trường bắt buộc: quantity",
  "details": [
    { "field": "quantity", "rule": "required", "message": "Số lượng là bắt buộc" }
  ],
  "traceId": "abc123-def456"
}
```

| Status Code | Dùng khi                             |
| ----------- | ------------------------------------ |
| 400         | Validation error                     |
| 401         | Chưa đăng nhập / token hết hạn       |
| 403         | Không có quyền (RBAC)                |
| 404         | Resource không tồn tại               |
| 409         | Conflict (duplicate idempotency key) |
| 429         | Rate limit exceeded                  |
| 500         | Internal server error                |
| 502         | Upstream error (Zalo API fail)       |

---

## 5. Rate Limiting

| Endpoint Group      | Limit                    |
| ------------------- | ------------------------ |
| Auth                | 10 req/min per IP        |
| Webhook (inbound)   | 1000 req/min per channel |
| API (authenticated) | 200 req/min per user     |
| Quote Engine        | 30 req/min per user      |
| KB Upload           | 10 req/hour per user     |
| AI Regenerate       | 20 req/min per user      |
