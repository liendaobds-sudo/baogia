# Gotchas & Lessons Learned

Bài học từ lỗi thực tế — cập nhật sau mỗi incident để hệ skill thông minh hơn.

## AI Pipeline

### 2026-03-19: Duplicate constraint warnings
**Triệu chứng**: Mỗi cảnh báo ⚠️ xuất hiện 2 lần  
**Nguyên nhân**: `chatHistory` đã chứa `lastCustomerMsg`, nên `fullText = chatHistory + lastCustomerMsg` có text trùng lặp  
**Fix**: Dùng `lastMsg` (chỉ tin nhắn cuối) cho GSM extraction, `fullContext` cho product detection  
**Rule**: Luôn tách rõ scope detection — last message vs full context

### 2026-03-19: AI bỏ qua constraint rules trong prompt
**Triệu chứng**: Khách hỏi "C150 cán 2 mặt" → AI vẫn báo giá bình thường, không cảnh báo  
**Nguyên nhân**: Rules inject vào prompt nhưng AI model (đặc biệt Groq/Llama) không luôn tuân thủ  
**Fix**: Thêm tầng kiểm tra cứng `checkPrintingConstraints()` trong code — LUÔN bắt bất kể model  
**Rule**: Không tin tưởng 100% vào AI compliance — critical rules phải có code check

### 2026-03-19: Prompt length overflow
**Triệu chứng**: `⚠️ Prompt too long (18560 chars > 16000), truncating...`  
**Nguyên nhân**: Inject toàn bộ 28 constraint rules vào mỗi prompt  
**Fix**: Context-aware filtering — chỉ inject rules liên quan đến sản phẩm khách hỏi, max 12  
**Rule**: Luôn giữ prompt < 16000 chars, ưu tiên relevant > comprehensive

### 2026-03-19: GSM regex match false positives  
**Triệu chứng**: Regex `/c\s*(\d{2,3})/gi` match "c" (character) + bất kỳ số nào  
**Fix**: Giới hạn GSM range 70-400, chỉ match cụm có prefix rõ (couche, c, giấy, art, offset)  
**Rule**: Regex cho tiếng Việt cần test kỹ — dấu tiếng Việt + viết tắt = edge case hell

## Knowledge Base

### Upload endpoint 404
**Triệu chứng**: `POST /api/v1/knowledge-base/upload → 404`  
**Nguyên nhân**: Controller route là `@Controller('kb')` → endpoint đúng: `/api/v1/kb/upload`  
**Fix**: Dùng `/api/v1/kb/load-static` để import file từ server data directory  
**Rule**: Luôn check controller decorator cho route prefix

---

*Cập nhật file này mỗi khi gặp lỗi mới. Đây là Evolution Layer — hệ skill tự cải thiện.*
