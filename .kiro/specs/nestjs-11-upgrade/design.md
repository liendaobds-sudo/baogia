# Design — Nâng cấp NestJS 10 → 11

## Overview

Nâng đồng bộ toàn bộ hệ `@nestjs/*` lên v11 để gỡ xung đột peer (swagger@11 vs common@10) và giảm lỗ hổng bảo mật, đồng thời giữ nguyên hành vi + test + schema. Thực hiện trên **nhánh git riêng** (git đã init), từng bước có kiểm thử, dễ rollback.

## Architecture

Chỉ thay đổi **tầng phụ thuộc + điểm chạm API NestJS**, KHÔNG đổi kiến trúc nghiệp vụ:
- `package.json`: bump `@nestjs/*` → v11 + các gói liên đới (socket.io/ws, multer, sqlite3 nếu cần) theo bản tương thích.
- Sửa breaking change API v11 tại điểm chạm (bootstrap, adapter socket, throttler config, swagger setup).
- Engine giá, entities, business services KHÔNG đổi logic.

### Breaking changes NestJS 11 cần rà (theo migration guide chính thức)
- **Node ≥ 20** (đã dùng 20 ở CI/VPS — OK).
- `@nestjs/throttler` v6→ (API `forRoot` mảng giữ nguyên ở v6; kiểm v11 tương thích).
- `@nestjs/config`, `@nestjs/schedule` đổi major — kiểm cách import/forRoot.
- Express 4 vẫn mặc định ở Nest 11 (không bắt buộc Express 5) — giảm rủi ro.
- Logger / lifecycle hooks thay đổi nhỏ — kiểm `main.ts`.
- `@nestjs/swagger@11`: API `DocumentBuilder`/`SwaggerModule` ổn định, đã là bản đang khai báo.

## Components and Interfaces

Điểm chạm cần kiểm/sửa (đã biết từ code):
- `main.ts`: `NestFactory.create`, `useGlobalPipes(ValidationPipe)`, `useGlobalFilters`, `helmet`, `cors`, `RedisIoAdapter` (socket), Swagger dev. Rà breaking change từng API.
- `app.module.ts`: `ThrottlerModule.forRootAsync`, `BullModule.forRootAsync`, `TypeOrmModule.forRootAsync`, `EventEmitterModule`, `ScheduleModule` — kiểm chữ ký v11.
- `gateway/redis-io.adapter.ts`: socket.io adapter (bump `socket.io`/`@socket.io/redis-adapter` nếu cần).
- Guards/interceptors/pipes custom (TenantContextInterceptor, ThrottlerGuard) — kiểm interface `NestInterceptor`/`CanActivate` v11.

## Data Models

KHÔNG đổi schema DB, KHÔNG đổi entity, KHÔNG migration dữ liệu. `synchronize:false` giữ nguyên. Đây là nâng cấp thuần thư viện + điểm chạm API.

## Correctness Properties

### Property 1: Cài sạch không cần legacy-peer-deps
`npm ci` (không cờ) thành công sau nâng cấp.
**Validates: Requirements 1.2**

### Property 2: Không hồi quy test
722/722 test backend pass + tsc exit 0 + frontend build pass.
**Validates: Requirements 3.1, 3.2, 3.3**

### Property 3: Bất biến giá
Cùng input báo giá ⇒ cùng `grand_total` như trước nâng cấp (engine không đổi).
**Validates: Requirements 3.4**

### Property 4: Giảm lỗ hổng
`npm audit --omit=dev`: 0 critical, HIGH giảm so với 12.
**Validates: Requirements 2.1**

## Error Handling

- Nâng cấp gây lỗi compile/test → sửa theo migration guide; nếu một gói chưa có bản v11 tương thích → ghi nhận, giữ v10 cho gói đó (cô lập) + đường giảm thiểu.
- Lỗi runtime socket/bull/cron sau nâng cấp → kiểm adapter/config v11; có smoke test khởi động.
- Mọi bước trên nhánh riêng → rollback bằng `git checkout` nếu hỏng.

## Testing Strategy

- `npx tsc --noEmit` + `npx jest --runInBand` (722) sau mỗi cụm bump.
- Frontend `npm run build`.
- Smoke khởi động backend: kiểm log socket/bull/cron/zca khởi tạo, gọi `/health`.
- Bộ test giá (quote-flow, pricing-advanced, vat) xác nhận Property 3.
- `npm ci` sạch + `npm audit --omit=dev` xác nhận Property 1 + 4.
