# Security review ZeplaoPrint

## Trust boundary ưu tiên

- Internet/channel → webhook Zalo/Facebook: raw-body signature, replay/dedup, channel ownership.
- Browser → API: JWT/refresh, CORS, validation, throttling, RBAC và tenant context.
- API → PostgreSQL: parameterized SQL, RLS, transaction context và explicit bypass.
- Queue/cron/Socket.IO → tenant data: job payload tenant, room tenant và cache key.
- Upload/media → filesystem: auth, canonical path, traversal, content/size và production exposure.
- Conversation/KB → LLM/provider: prompt injection, cross-tenant context, secret/PII logging và hallucinated price.
- CI/deploy → secrets/dependencies: tracked secret, unsafe defaults, action/dependency provenance.

## Triage

1. Xác định nguồn attacker kiểm soát.
2. Theo mọi biến đổi/validation đến sink hoặc tài sản.
3. Tìm guard ở backend/DB; UI guard không phải control bảo mật.
4. Chứng minh route reachable trong cấu hình production.
5. Tìm phản chứng và accepted behavior trước khi gán severity.

Các chốt cụ thể cần kiểm:

- backend/src/main.ts: rawBody, CORS, helmet, static uploads và RLS preflight.
- backend/src/modules/auth, rbac và common/tenant.
- backend/src/modules/channels/adapters và webhook controller.
- backend/src/modules/messages media controllers.
- backend/src/modules/gateway/events.gateway.ts.
- backend/src/modules/knowledge-base và suggestions.
- docs/PRODUCTION-SMOKE.md và backend/db/TENANT-RLS-RUNBOOK.md.

## Validation an toàn

Dùng fixture cục bộ, test âm và DB test/bản sao. Không đánh production, không gửi webhook/tin nhắn thật, không in secret/PII, không chạy branch không tin cậy trước khi đọc script. Nếu không thể chứng minh an toàn, ghi proof gap thay vì nâng finding thành VERIFIED.

