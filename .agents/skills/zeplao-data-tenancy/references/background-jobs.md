# Job nền đa tenant

Đọc tài liệu này khi thêm hoặc sửa cron, scheduler, BullMQ processor, callback nền hay emit realtime từ các đường đó.

## Hành vi hiện tại cần biết

- `backend/src/common/tenant/tenant-background.ts` cung cấp `forEachTenant` và `runInTenant`.
- Khi `TENANT_RLS_ENABLED` tắt, cả hai giữ hành vi legacy và chạy callback ngoài tenant scope.
- Khi cờ bật nhưng thiếu `TenantContextService`, cả hai hiện vẫn chạy callback ngoài scope. Test hiện tại khóa hành vi pass-through này; đó là compatibility seam, không phải mẫu an toàn cho job mới.
- `forEachTenant` lấy `SELECT id FROM tenants` không lọc status/app-scope và chạy tuần tự. Cả `forEachTenant` lẫn `runInTenant` giữ transaction + `SET LOCAL` suốt toàn bộ callback; một callback ném lỗi trong vòng lặp sẽ dừng các tenant sau nếu caller không có chính sách isolation riêng.
- Các cron hiện tại không cấu hình `waitForCompletion`. `@Cron` được đăng ký trên mỗi replica; helper không chống tick chồng, chạy trùng đa replica hay replay. `waitForCompletion: true` nếu dùng chỉ chống overlap trong cùng process, không thay distributed coordination.

Các service như `sla-monitor.service.ts`, `follow-up.service.ts` và `zalo-health-check.service.ts` cho thấy seam legacy, trong đó `TenantContextService` còn được inject `@Optional`. Một số đường hiện tại còn giữ transaction qua AI/network, như proactive outreach, media archiver, Zalo refresh và outbound processor; xem đây là debt cần cô lập khi chạm tới, không phải mẫu cho job mới.

BullMQ outbound hiện còn seam đặc biệt: producer trong `backend/src/modules/messages/messages.service.ts` không đưa `tenantId` vào payload; processor phải query conversation ngoài tenant scope để suy tenant. Dưới FORCE RLS mặc-định-đóng, lookup đó có thể không thấy row. Payload/job mới phải mang tenant ngay lúc enqueue; không dùng fallback suy tenant ngoài scope làm mẫu.

## Chọn hình dạng thực thi

### DB ngắn, bounded

Có thể dùng `forEachTenant` khi toàn bộ callback chỉ là một cụm query/update ngắn, có giới hạn rõ và chấp nhận một transaction cho mỗi tenant. Job mới phải inject `TenantContextService` bắt buộc và tự từ chối chạy nếu không xác lập được tenant scope.

Chốt trước:

- tiêu chí eligibility nào áp dụng: status/subscription, app-scope `cskh`/`baogia`, capability hoặc setting;
- một tenant lỗi có chặn tenant sau hay được ghi nhận rồi tiếp tục;
- giới hạn batch, timeout và lịch retry.

Không mặc định `SELECT id FROM tenants` đồng nghĩa với “mọi tenant cần xử lý”.

### AI, provider hoặc network chậm

Không giữ `forEachTenant`/`runInTenant` bao quanh toàn bộ cuộc gọi AI, Zalo, email hoặc HTTP dài. Dùng transaction ngắn để tìm và claim work, rồi enqueue payload có `tenantId` cùng khóa idempotency. Processor xác lập tenant trước mỗi đoạn đọc/ghi DB; network call nằm ngoài transaction dài, sau đó mở scope/transaction ngắn để ghi kết quả.

Payload tối thiểu thường cần `tenantId`, resource id, phiên bản/attempt và idempotency key. Không suy tenant từ row không còn nằm trong scope hoặc dùng tenant mặc định.

## Chống trùng và lỗi từng tenant

Chọn cơ chế phù hợp với side effect:

- atomic claim/status transition hoặc unique constraint trong DB;
- BullMQ `jobId` ổn định và retry có idempotency;
- distributed lock khi chỉ một replica được chạy tick;
- lease có thời hạn nếu worker có thể chết giữa chừng.

Chứng minh tick chồng, hai replica, retry sau timeout và replay không gửi tin/ghi tiền hai lần. Log/metric phải mang tenantId nhưng không lộ nội dung nhạy cảm. Một tenant lỗi phải theo chính sách đã chốt; không để tình cờ dừng toàn vòng lặp.

## Realtime

`backend/src/modules/gateway/events.gateway.ts` dùng `businessTarget(tenantId)`, nhưng hiện fallback về `server.emit` khi thiếu tenantId, kể cả lúc RLS bật. Với dữ liệu tổ chức, job/caller mới phải truyền tenantId tường minh và fail-closed nếu thiếu; không gọi global broadcast để “tiếp tục chạy”.

Room theo conversation/account vẫn cần kiểm ownership, không chỉ dựa vào UUID do client gửi. Hiện `canJoinConversation`/`canJoinAccount` query DataSource trực tiếp không `SET LOCAL`; dưới FORCE RLS có thể từ chối cả row hợp lệ, trong khi JWT thiếu tenant claim lại đi theo nhánh legacy cho join. Khi chạm seam này, phải xác lập tenant context trên connection hoặc dùng query đã scope và test cả token thiếu/sai tenant.

## Ma trận test tối thiểu

- Cờ RLS bật: từng tenant thấy đúng context và query không thấy tenant khác.
- Thiếu context hoặc thiếu tenantId: job mới từ chối trước DB/emit/side effect.
- Eligibility đã chốt (ví dụ status/subscription/app-scope): tenant đủ điều kiện chạy, tenant còn lại không chạy.
- Một tenant lỗi: kết quả của tenant sau đúng theo chính sách isolation/retry.
- Callback DB ngắn commit/rollback đúng; network chậm không giữ transaction mở.
- Tick chồng, hai worker/replica và retry không tạo side effect trùng.
- WebSocket tổ chức chỉ gọi room `tenant:<id>`; test âm xác nhận không rơi vào `server.emit`.
- Khi cờ RLS tắt, chỉ giữ compatibility nếu yêu cầu sản phẩm nói rõ; không để nhánh legacy che mất test fail-closed của đường mới.

Unit test helper hiện mock transaction và gateway spec mock DataSource; chúng không chứng minh cron/processor chạy đúng trên PostgreSQL với app role thật. Với thay đổi RLS hoặc connection scope, thêm integration/e2e phù hợp thay vì suy từ mock.
