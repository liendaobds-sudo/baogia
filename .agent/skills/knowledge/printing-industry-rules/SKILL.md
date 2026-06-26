# SKILL: printing-industry-rules

## Purpose
Quản lý và áp dụng quy tắc ràng buộc ngành in ấn vào hệ thống AI suggestion. Đảm bảo chatbot tư vấn đúng kỹ thuật, không để khách đặt hàng sai quy cách.

## Use When
- Thêm/sửa quy tắc ràng buộc (IF/THEN) cho ngành in
- Thêm sản phẩm mới vào hệ thống kiểm tra cứng
- Khách phản hồi AI tư vấn sai kỹ thuật
- Cần đồng bộ rules giữa KB docs, JSON knowledge, và code logic

## Required Inputs
- Loại sản phẩm cần thêm/sửa rule
- Quy tắc ràng buộc cụ thể (IF condition → THEN action)
- Mức severity: `hard_rule` | `warning` | `recommendation` | `info`
- Edge cases đã gặp

## Expected Output
- Rule được thêm/sửa ở **3 nơi đồng bộ**:
  1. `backend/src/data/knowledge/printing-constraints.json` — cho AI prompt injection
  2. `backend/src/modules/knowledge-base/data/quy-tac-rang-buoc-nganh-in.md` — cho KB search + admin UI
  3. `backend/src/modules/suggestions/ai-suggest.service.ts` → `checkPrintingConstraints()` — cho hard-coded validation

## Architecture — 3 Tầng Bảo Vệ

```
┌─────────────────────────────────────────────┐
│ Tầng 1: KB Search (RAG)                     │
│ → AI tìm rules liên quan từ KB chunks       │
│ → Phụ thuộc embedding similarity             │
├─────────────────────────────────────────────┤
│ Tầng 2: Prompt Injection                    │
│ → Rules inject trực tiếp vào system prompt  │
│ → Context-aware: chỉ rules liên quan        │
│ → Max 12 rules/lần, format compact          │
├─────────────────────────────────────────────┤
│ Tầng 3: Code Logic Check (HARD)             │
│ → checkPrintingConstraints() trong code     │
│ → LUÔN bắt, bất kể AI có tuân thủ không    │
│ → Prepend ⚠️ warnings vào AI response       │
└─────────────────────────────────────────────┘
```

## Execution — Thêm Rule Mới

### Bước 1: Thêm vào JSON knowledge
File: `backend/src/data/knowledge/printing-constraints.json`
```json
{
    "id": "XXX-001",
    "if": "Điều kiện",
    "then": "Hành động/ràng buộc",
    "reason": "Lý do kỹ thuật",
    "severity": "hard_rule",
    "suggestion": "Gợi ý thay thế (optional)"
}
```

### Bước 2: Cập nhật KB markdown
File: `backend/src/modules/knowledge-base/data/quy-tac-rang-buoc-nganh-in.md`
- Thêm rule dạng bullet: `- [XXX-001] Điều kiện → Hành động. Lý do.`
- Upload lại qua admin UI hoặc API `PUT /api/v1/kb/documents/:id/content`

### Bước 3: Thêm code check (nếu hard_rule)
File: `backend/src/modules/suggestions/ai-suggest.service.ts`
Trong method `checkPrintingConstraints()`:
```typescript
// [XXX-001] Mô tả rule
if (isProduct && someCondition) {
    warnings.push(`Cảnh báo chi tiết cho khách.`);
}
```

### Bước 4: Test
- Mở Test Chat → gửi tin nhắn cố tình vi phạm rule
- Kiểm tra ⚠️ warning xuất hiện trong AI suggestion
- Kiểm tra backend log có `🚨 Constraint violations detected`

## Quality Criteria
- Rule phải đúng kỹ thuật ngành in (confirm với chuyên gia)
- Cảnh báo phải viết bằng tiếng Việt thân thiện, dễ hiểu
- Không false positive (cảnh báo sai → mất uy tín)
- Không duplicate warnings
- Mỗi rule chỉ fire 1 lần per suggestion

## Verification
- [ ] Rule có ở cả 3 nơi (JSON, KB markdown, code check)?
- [ ] Test với tin nhắn vi phạm → warning xuất hiện?
- [ ] Test với tin nhắn hợp lệ → KHÔNG warning?
- [ ] Backend log confirm rule loaded?
- [ ] Prompt length vẫn < 16000 chars?

## Edge Cases
- Khách viết tắt ("C150" = Couche 150gsm, "A4" = Art 350gsm)
- Khách thay đổi spec giữa cuộc trò chuyện (300gsm → 150gsm)
- Nhiều sản phẩm trong 1 tin nhắn ("namecard + tờ rơi")
- Khách hỏi generic ("in giấy mỏng được không?")
- GSM từ tin nhắn cũ vs GSM mới (chỉ check lastMsg)

## Files
| File                                                                    | Vai trò                            |
| ----------------------------------------------------------------------- | ---------------------------------- |
| `backend/src/data/knowledge/printing-constraints.json`                  | Knowledge Layer — JSON rules       |
| `backend/src/modules/knowledge-base/data/quy-tac-rang-buoc-nganh-in.md` | Knowledge Layer — KB searchable    |
| `backend/src/modules/suggestions/context-inference.service.ts`          | Execution Layer — prompt injection |
| `backend/src/modules/suggestions/ai-suggest.service.ts`                 | Execution Layer — hard-coded check |

## Changelog
- v1.0 (2026-03-19): Tạo 50+ rules JSON, 28 hard/warning inject vào prompt
- v1.1 (2026-03-19): Context-aware filtering (max 12 rules/lần)
- v1.2 (2026-03-19): Hard-coded `checkPrintingConstraints()` — 22 checks, 14 product types
- v1.3 (2026-03-19): Fix duplicate warnings — dùng lastMsg cho GSM, fullContext cho product
