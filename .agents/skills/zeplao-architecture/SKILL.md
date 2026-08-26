---
name: zeplao-architecture
description: "Bản đồ kiến trúc và luồng dữ liệu ZeplaoPrint. Dùng khi khám phá codebase, tìm file chịu trách nhiệm, trace request/event xuyên NestJS, Next.js, PostgreSQL, Redis, queue hoặc WebSocket, và trước thay đổi hợp đồng nhiều tầng. Không dùng thay cho quy tắc chi tiết về giá, AI hay RLS."
---

# Kiến trúc ZeplaoPrint

Mục tiêu là tìm đường chạy thật nhanh và tránh kết luận từ tài liệu hoặc tên file đã trôi.

## Bản đồ runtime

~~~text
Next.js 16 / React 19 (:3002)
    REST /api/v1 + Socket.IO
NestJS 11 (:4000)
    TypeORM transactions
PostgreSQL public schema
    Redis: cache, BullMQ, Socket.IO adapter
    Zalo OA / Zalo Personal / Facebook adapters
~~~

Backend bootstrap ở backend/src/main.ts; module graph ở backend/src/app.module.ts. Frontend dùng App Router trong frontend/src/app/. API chung ở frontend/src/lib/api.ts; vùng pricing có adapter response riêng tại frontend/src/app/pricing/_components/apiClient.ts.

## Bản đồ module

- CSKH: backend/src/modules/channels, conversations, messages, gateway, contacts, notes, canned-responses.
- AI/RAG: backend/src/modules/suggestions và knowledge-base.
- Báo giá cũ/tích hợp chatbot: backend/src/modules/quote.
- Tầng method-agnostic mới: backend/src/quote với registry và plugin digital/offset.
- Engine và ERP: backend/src/modules/pricing.
- Nền tảng: auth, rbac, users, tenants, super-admin, audit, redis, health.
- Frontend CSKH: frontend/src/app/(app).
- Frontend báo giá: frontend/src/app/pricing.
- Phạm vi/capability frontend: frontend/src/lib/scope và các route guard trong frontend/src/components.

## Luồng cần nhận diện trước khi sửa

### Tin nhắn và AI

Webhook hoặc Zalo Personal → MessageProcessorService → conversations/messages → AiSuggestService/AgentPipeline → KB, pricing và provider → suggestion lưu DB → EventsGateway → inbox.

Khi trace, kiểm cả đường nền và queue. Một request HTTP đúng tenant không chứng minh cron, BullMQ hoặc callback channel cũng đúng tenant.

### Báo giá

Có hai họ engine:

- Digital/large-format/bound/loose: PricingFacadeService và các calculator/service liên quan.
- Offset: EngineOffsetService và offset-engine/products.

Tầng backend/src/quote bọc hai engine bằng method plugin. Các bề mặt chatbot, mini quote, configurator, compare, lưu order và PDF không nhất thiết đọc cùng field. Luôn trace đến consumer số tiền cuối.

### Tenant và quyền

JWT/Auth → TenantContext → app-scope/method capability/RBAC → transaction TypeORM → PostgreSQL RLS. WebSocket room, cache và job nền là biên riêng, không tự kế thừa request context.

## Cách tìm nguồn sự thật

1. Tìm registration: AppModule, controller decorator, provider/module export, plugin registry hoặc route frontend.
2. Theo call chain tới hàm thực thi và repository/SQL/provider.
3. Tìm consumer của giá trị trả về bằng rg; field được tạo nhưng không ai đọc có thể là dead contract.
4. Đối chiếu test gần đường chạy. Test fixture không thực tế không thay thế runtime.
5. Chỉ sau đó dùng STRUCTURE.md, docs/ và Kiro spec để hiểu ý định.

## Khi đổi hợp đồng xuyên tầng

Rà cùng lúc:

- DTO/validation và controller.
- Service/engine và response/error shape.
- API client, hook/store và component.
- Persistence/PDF/WebSocket nếu chúng tiêu thụ cùng dữ liệu.
- Tenant/scope/permission ở backend, không chỉ ẩn UI.
- Test dương, test âm và test parity của consumer nhạy nhất.

Chuyển sang zeplao-pricing, zeplao-dieline, zeplao-ai-pipeline hoặc zeplao-data-tenancy khi đã xác định domain.

