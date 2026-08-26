# Quy tắc ngành in trong AI

ZeplaoPrint hiện có ba lớp liên quan nhưng không hoàn toàn trùng vai trò:

1. Knowledge JSON: backend/src/data/knowledge/printing-constraints.json, được ContextInferenceService load và lọc để đưa vào prompt.
2. KB searchable: backend/src/modules/knowledge-base/data/quy-tac-rang-buoc-nganh-in.md cùng tài liệu kỹ thuật liên quan.
3. Hard validator: backend/src/modules/suggestions/printing-constraints.ts, pure function chạy sau LLM.

Không bắt buộc mọi recommendation phải hardcode. Chỉ rule gây sai kỹ thuật/đơn hàng rõ ràng mới cần lớp 3; rule tư vấn mềm có thể ở JSON/KB.

## Khi thêm rule

1. Xác nhận với nguồn nghiệp vụ/chuyên gia; định nghĩa điều kiện, severity, lý do và gợi ý thay thế.
2. Thêm/sửa JSON để prompt biết rule nếu phù hợp.
3. Cập nhật KB nếu nhân viên/semantic search cần tra cứu nội dung đó.
4. Với hard rule, sửa pure validator và viết ít nhất:
   - case vi phạm;
   - case hợp lệ gần kề;
   - case nhiều sản phẩm/spec cũ-mới để tránh false positive;
   - case duplicate warning.
5. Kiểm ContextInferenceService chỉ inject nhóm liên quan và không vượt cap context hiện hành.

lastCustomerMsg và full history có mục đích khác nhau. Thông số mới như GSM nên ưu tiên message cuối; product intent có thể cần recent context. Không nối hai nguồn rồi regex khiến cùng dữ liệu được đếm hai lần.

