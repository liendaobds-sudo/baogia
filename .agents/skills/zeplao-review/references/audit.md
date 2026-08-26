# Audit dọc và chiến dịch review

## Chuẩn bị

1. Đọc git status và chốt included/excluded.
2. Chọn audit unit là một hành động quan sát được, không phải tên module mơ hồ.
3. Đọc audit-rules.md, STRUCTURE.md và Kiro spec liên quan nhưng kiểm lại ngày, code và test. Không mang số suite/version hardcode vào kết luận.
4. Ghi baseline: input, output hiện tại, test liên quan và điều chưa thể chạy.

## Trace dọc

Theo chuỗi:

~~~text
UI/API/event
  → DTO/parser/store
  → controller/processor/plugin
  → service/engine
  → repository/provider/writer
  → persisted result/event/PDF
  → consumer hiển thị hoặc dùng lại
~~~

Tại mỗi biên, kiểm tên field, optional/default, enum, tiền, đơn vị, rounding, error shape, tenant, quyền và hành vi retry/idempotency.

## Thang bằng chứng

- UNKNOWN: chưa nối đủ đường chạy.
- TRACED: đã chứng minh entry tới sink và consumer bằng code.
- AUTO: có test kiểm bất biến.
- ARTIFACT: đã parse/đo output thật như PDF hoặc payload lưu.
- RUNTIME: đã chạy đúng thao tác người dùng.
- STALE: bằng chứng cũ không còn đáng tin sau thay đổi liên quan.

Một audit chỉ đọc code tối đa là TRACED.

## Wave ZeplaoPrint

1. Giá/VAT/chiết khấu/bù hao và persisted totals.
2. Imposition/dieline/preview/PDF parity.
3. Tenant/RLS/cache/queue/WebSocket.
4. Auth/RBAC/app-scope/method capability.
5. AI/RAG/constraint/provider/anti-hallucination.
6. Channel webhook, media và idempotency.
7. DB schema/patch/index/rollback.
8. Build, config, dependency và production smoke.

Sau một bug đã xác nhận, quét pattern anh em nhưng đưa mỗi hit về SUSPECTED trước khi kết luận.

## Sửa sau audit

Nhóm theo invariant và consumer, không theo kết quả rg. Chạy test hẹp sau mỗi cụm rồi full gate tương xứng. Nếu user báo vẫn lỗi, hủy kết luận hoàn thành cũ và tái hiện lại đúng chuỗi của user.

