# SKILL: review-ai-response

## Purpose
Phản biện và nâng chất lượng response AI trước khi release prompt/model changes. Dùng khi cần đánh giá chất lượng AI trả lời trên diện rộng hoặc sau khi thay đổi pipeline.

## Use When
- Sau khi thay đổi system prompt
- Sau khi switch/upgrade AI model
- Sau khi thêm knowledge base documents
- Sau khi thay đổi constraint rules
- Khi cần benchmark chất lượng AI

## Test Scenarios — 20 Cases

### Nhóm 1: Hỏi giá cơ bản (5 cases)
1. "in 500 namecard couche 300gsm cán mờ 2 mặt" → expect: báo giá chính xác
2. "in 200 tờ rơi A4 couche 150gsm cán bóng 1 mặt" → expect: báo giá + suggest cán mờ
3. "in 100 tem decal giấy 5x3cm" → expect: báo giá + hỏi hình dạng bế
4. "in banner 2x3m" → expect: báo giá + hỏi chất liệu
5. "in catalogue 20 trang A4" → expect: hỏi số lượng + chất liệu + đóng cuốn

### Nhóm 2: Vi phạm constraint (5 cases)
6. "namecard giấy 150gsm cán mờ" → expect: ⚠️ gsm quá mỏng + ⚠️ cán < 200gsm
7. "decal in 2 mặt" → expect: ⚠️ decal chỉ 1 mặt
8. "banner cán mờ" → expect: ⚠️ banner không cần cán
9. "hộp giấy couche 200gsm" → expect: ⚠️ hộp cần ≥ 300gsm
10. "catalogue 50 trang đóng ghim" → expect: ⚠️ >48 trang nên đóng keo

### Nhóm 3: Hỏi tư vấn (5 cases)
11. "in danh thiếp nên dùng giấy gì?" → expect: recommend couche/art 300gsm
12. "menu nhà hàng nên làm thế nào?" → expect: ≥250gsm, cán mờ, chống nước
13. "decal ngoài trời" → expect: PVC + mực eco-solvent + UV coating
14. "catalogue công ty 100 trang" → expect: đóng keo, ruột 150gsm, bìa 300gsm
15. "khác biệt giấy couche và art?" → expect: KB search result

### Nhóm 4: Edge cases (5 cases)
16. "C150" (viết tắt) → expect: nhận diện Couche 150gsm
17. "hello" → expect: chào hỏi, hỏi cần in gì
18. "giá rẻ hơn được không?" → expect: objection handling
19. "giao hàng khi nào?" → expect: thời gian sản xuất
20. "tôi muốn in giống mẫu này" (có ảnh) → expect: hỏi thêm thông số

## Scoring Rubric (1-5 per response)

| Tiêu chí   | 1 (Tệ)          | 3 (OK)              | 5 (Tốt)             |
| ---------- | --------------- | ------------------- | ------------------- |
| Chính xác  | Sai thông tin   | Đúng nhưng thiếu    | Đúng và đầy đủ      |
| Tự nhiên   | Robot/copy KB   | Tạm được            | Như nhân viên thật  |
| Hữu ích    | Không giúp gì   | Trả lời được        | Tư vấn thêm giá trị |
| Constraint | Bỏ qua lỗi      | Nhắc nhưng không rõ | Cảnh báo rõ + gợi ý |
| Giá cả     | Sai/hallucinate | Gần đúng            | Chính xác từ ERP    |

## Execution
1. Reset Test Chat
2. Chạy lần lượt 20 test cases
3. Score mỗi response theo rubric
4. Ghi nhận issues vào `gotchas.md`
5. Tổng hợp báo cáo quality

## Pass Criteria
- Average score ≥ 3.5/5 trên toàn bộ 20 cases
- Không có case nào score 1
- Tất cả constraint violations được detect (nhóm 2)
- 100% báo giá chính xác khi đủ thông tin (nhóm 1)

## Changelog
- v1.0 (2026-03-19): 20 test scenarios with scoring rubric
