# Hướng dẫn dự án ZeplaoPrint

## Phạm vi

Repo này là ứng dụng web ZeplaoPrint:

- backend/: NestJS 11, TypeScript, TypeORM, PostgreSQL, Redis, BullMQ và Socket.IO.
- frontend/: Next.js 16 App Router, React 19, React Query và Zustand.
- .agents/skills/: bộ skill Codex duy nhất của dự án và được duy trì cùng codebase.

Không áp các giả định Tauri, FastAPI, Python, Rust, PDFium hoặc sidecar vào dự án này.

## Thứ tự nguồn sự thật

Khi tài liệu mâu thuẫn, ưu tiên theo thứ tự:

1. Code đang được đăng ký trên đường chạy thật và test bảo vệ nó.
2. Kiro spec đang hoạt động trong .kiro/specs/ và runbook vận hành mới nhất.
3. STRUCTURE.md, audit-rules.md và docs/; luôn kiểm ngày cập nhật.

Luôn truy vết entry point đến service/engine rồi tới consumer thật trước khi kết luận. Không sửa file sinh trong dist/, .next/ hoặc coverage/.

## Bất biến toàn dự án

- Giá, VAT, chiết khấu, bù hao và số con/tờ là dữ liệu tới hạn. Không fallback âm thầm về 0, không đổi golden chỉ để test xanh.
- VAT đến từ báo giá và chỉ được áp một lần. Engine/plugin phải giữ đúng hợp đồng VAT-exclusive của đường gọi tương ứng.
- Preview offset ưu tiên positions và meta do backend trả về; không tự tính lại một số con khác với cơ sở tính giá.
- Dữ liệu tenant phải giữ nguyên ngữ cảnh qua HTTP, queue, cron, WebSocket, cache và truy vấn DB. Cache dùng dữ liệu tổ chức phải có tenant trong key.
- Frontend guard chỉ là UX. Auth, RBAC, app-scope, method capability và tenant isolation phải được cưỡng chế ở backend/DB.
- Raw SQL production dùng PostgreSQL. Chú ý placeholder $1, identifier camelCase cần quote, và kiểu is_active không đồng nhất giữa các bảng cũ.
- Comment giải thích lý do và text UI dùng tiếng Việt rõ ràng; identifier code giữ thuật ngữ kỹ thuật ổn định. Gắn hậu tố đơn vị khi giá trị đi qua biên cm/mm/m2/rate.

## Cách làm việc

1. Đọc git status và bảo toàn thay đổi có sẵn của người dùng.
2. Xác định đúng luồng, nguồn sự thật và test gần nhất trước khi sửa.
3. Thay đổi nhỏ nhất đủ giải quyết nguyên nhân gốc; rà mọi consumer khi đổi hợp đồng dùng chung.
4. Chạy kiểm tra hẹp trước, rồi mở rộng theo rủi ro bằng skill zeplao-testing.
5. Báo đúng mức bằng chứng: code/typecheck, test tích hợp, build và runtime smoke là các mức khác nhau.

Không chạy deploy, áp migration/RLS trên DB đang phục vụ, xoay secret, gọi AI provider có phí, gửi tin thật hoặc thay đổi hệ thống ngoài repo nếu người dùng chưa yêu cầu rõ.

## Định tuyến skill

- Khám phá module hoặc trace luồng: zeplao-architecture.
- Sửa Next.js UI, route, state, API client hoặc Socket.IO: zeplao-frontend.
- Giá, VAT, báo giá, order, PDF hoặc parity: zeplao-pricing.
- Khuôn bế, box type, nesting hoặc preview hình học: zeplao-dieline.
- AI suggestion, RAG, prompt, provider hoặc constraint: zeplao-ai-pipeline.
- Thêm một sản phẩm in mới xuyên hệ thống: zeplao-add-product.
- Tenant, RLS, DB patch, RBAC, app-scope hoặc method capability: zeplao-data-tenancy.
- Chọn và chạy ma trận kiểm thử: zeplao-testing.
- Code review, audit sâu, security review hoặc performance investigation: zeplao-review.
