---
description: Quy trình code review trước khi hoàn thành task
---

# Code Review Workflow

## Sử dụng Skills liên quan
- Skill Verification: `.agent/skills/verification/verify-ai-suggestion/SKILL.md`
- Skill Review: `.agent/skills/review/review-ai-response/SKILL.md`

## Steps

// turbo-all

1. Kiểm tra TypeScript compilation
```bash
cd c:\xampp\htdocs\Pricing\ZeplaoPrint\backend && npx tsc --noEmit
```

2. Chạy unit tests liên quan
```bash
cd c:\xampp\htdocs\Pricing\ZeplaoPrint\backend && npx jest --passWithNoTests --testPathPattern="suggestions|knowledge-base"
```

3. Kiểm tra backend khởi động thành công
- Verify log: `🚀 ZeplaoPrint API running on http://localhost:4000/api/v1`
- Verify: Không có `ERROR` trong startup logs

4. Review theo 4C Framework (từ skill verify-ai-suggestion)
- **Correctness**: Logic đúng? Data đúng? Format đúng?
- **Completeness**: Đủ edge cases? Đủ error handling?
- **Context-fit**: Phù hợp architecture hiện tại? Naming conventions?
- **Consequence**: Deploy production có rủi ro gì?

5. Cập nhật gotchas nếu có bài học mới
- File: `.agent/skills/gotchas.md`
