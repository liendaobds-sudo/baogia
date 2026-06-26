# SKILL: verify-ai-suggestion

## Purpose
Kiểm tra chất lượng AI suggestion trước khi nhân viên gửi cho khách. Đảm bảo response đúng kỹ thuật, đúng giá, đúng ngữ cảnh, và không hallucinate.

## Use When
- AI suggestion có confidence < 70%
- Khách hỏi về sản phẩm/quy cách phức tạp
- Phát hiện AI trả lời sai → cần debug tại sao
- Review quality hàng loạt sau khi thay đổi prompt/model

## Required Inputs
- Conversation ID hoặc nội dung tin nhắn khách
- AI suggestion text
- Quote result (nếu có)

## Verification Checklist (4C Framework)

### 1. Correctness — Có đúng không?
- [ ] Giá báo có khớp ERP? (so sánh breakdown: vật tư, gia công, số lượng)
- [ ] Thông số kỹ thuật đúng? (gsm, size, số mặt in, gia công)
- [ ] Quy tắc ràng buộc có vi phạm? Chạy `checkPrintingConstraints()` đã bắt hết?
- [ ] Sản phẩm detect đúng? (não namecard mà nói catalogue?)
- [ ] Không hallucinate tính năng/giá/khuyến mãi?

### 2. Completeness — Có đủ không?
- [ ] Có hỏi đủ thông tin cần thiết? (size, số lượng, chất liệu, gia công)
- [ ] Missing info list có hợp lý? (không hỏi thừa, không thiếu)
- [ ] Có báo giá khi đủ thông tin?
- [ ] Có upsell/cross-sell phù hợp?

### 3. Context-fit — Có hợp ngữ cảnh?
- [ ] Giọng văn đúng? (thân thiện, gọi "anh/chị", xưng "em")
- [ ] Intent detect đúng? (hỏi_sản_phẩm vs hỏi_giá vs phàn_nàn)
- [ ] Sentiment phù hợp? (khách angry → ưu tiên xin lỗi trước)
- [ ] Ngành khách hàng có ảnh hưởng tư vấn? (F&B → cần chống nước)

### 4. Consequence — Dùng thật có ổn?
- [ ] Nếu nhân viên gửi nguyên văn → khách hiểu đúng?
- [ ] Giá có quá chênh so với thực tế? (>20% → cần manual review)
- [ ] Có hứa điều không làm được? (giao trong 1h, free thiết kế...)
- [ ] Khách có thể hiểu nhầm response?

## How to Debug Wrong Suggestions

### 1. Check backend logs
```bash
# Tìm log của conversation
grep -i "conversationId" backend logs
# Xem prompt đã inject
grep -i "Prompt length" logs
# Xem constraint warnings
grep -i "Constraint violations" logs
```

### 2. Check prompt content
- Xem product detection: `🏭 Matched template:` trong log
- Xem KB results: `📚 KB search results:` trong log  
- Xem constraint rules injected: `📏 Injecting X/Y constraint rules`

### 3. Check model behavior
- Gemini bị 429? → fallback sang Groq → chất lượng có thể giảm
- Model nào đang dùng? → check `✅ AI call succeeded with [model]`

## Anti-patterns
- ❌ AI báo giá cố định khi chưa có đủ thông tin → nên hỏi thêm
- ❌ AI nói "không thể" khi thực tế có thể (chỉ khó) → nên nói "được nhưng..."
- ❌ AI liệt kê quá nhiều option → nên recommend top 1-2
- ❌ AI copy nguyên văn KB document → nên tổng hợp tự nhiên

## Changelog
- v1.0 (2026-03-19): Initial verification skill with 4C framework
