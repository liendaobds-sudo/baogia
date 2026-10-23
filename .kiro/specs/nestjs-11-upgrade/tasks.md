# Implementation Plan: Nâng cấp NestJS 10 → 11

> ✅ **ĐÃ HOÀN THÀNH — sổ sách trôi (audit 2026-08-29).** 8 checkbox để trống nhưng việc đã xong:
> `backend/package.json` khai `@nestjs/core`/`common`/`platform-express`/… ở `^11.0.0`,
> `@nestjs/cli` `^11`, và `.github/workflows/ci.yml` đã **bỏ `--legacy-peer-deps`** kèm comment
> "NestJS_Suite đã đồng bộ lên major 11 → không còn xung đột peer". Rà lại rồi tick để đóng spec.
>
> Lưu ý: mốc "722 pass" trong mục Notes bên dưới đã lạc hậu (xem `audit-rules.md` §2 — không
> hardcode số test vào tài liệu).

## Overview

Nâng đồng bộ hệ `@nestjs/*` lên v11 trên nhánh git riêng, từng cụm có kiểm thử, giữ nguyên hành vi + schema + parity giá. Mỗi task chỉ gồm thay đổi dependency/điểm-chạm API + verify.

## Notes

- Làm trên **nhánh riêng** (`git checkout -b upgrade/nestjs-11`); rollback bằng `git checkout`.
- Sau mỗi cụm: `npx tsc --noEmit` + `npx jest --runInBand` (722 pass) + smoke khởi động.
- KHÔNG đụng engine giá/entities. Giữ `synchronize:false`.
- Tham chiếu migration guide NestJS v11 chính thức cho từng breaking change.

## Tasks

- [ ] 1. Tạo nhánh + chốt baseline
  - `git checkout -b upgrade/nestjs-11`; ghi lại baseline: 722 test pass, `npm audit --omit=dev` = 32 (12 HIGH).
  - _Requirements: 3.1_

- [ ] 2. Bump core hệ NestJS lên v11
  - `@nestjs/common/core/platform-express/websockets/platform-socket.io` → ^11; cập nhật `@nestjs/cli/schematics/testing` (dev) → ^11.
  - _Requirements: 1.1, 1.4_

- [ ] 3. Bump các module NestJS phụ trợ
  - `@nestjs/config/jwt/passport/typeorm/schedule/throttler/bullmq/event-emitter/serve-static/axios` → bản tương thích v11; `@nestjs/swagger` giữ ^11 (đã có).
  - _Requirements: 1.1_

- [ ] 4. Bump gói liên đới + gỡ conflict sqlite
  - `socket.io`/`@socket.io/redis-adapter`/`ws`, `multer`, `sqlite3` (hoặc gỡ driver thừa nếu prod chỉ dùng Postgres) → tương thích v11; mục tiêu `npm ci` KHÔNG cần `--legacy-peer-deps`.
  - _Requirements: 1.2, 1.3_

- [ ] 5. Sửa breaking change tại điểm chạm
  - `main.ts` (NestFactory/pipe/filter/cors/helmet/RedisIoAdapter/Swagger), `app.module.ts` (forRoot/forRootAsync), `redis-io.adapter.ts`, guard/interceptor custom — theo migration guide.
  - _Requirements: 1.4, 3.6_

- [ ] 6. Verify không hồi quy
  - `npx tsc --noEmit` exit 0; `npx jest --runInBand` 722 pass; bộ test giá xác nhận parity; frontend `npm run build` pass.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 7. Smoke khởi động + audit
  - Khởi động backend: log socket/BullMQ/cron/zca khởi tạo OK, `/health` 200; `npm ci` sạch; `npm audit --omit=dev` 0 critical + HIGH giảm.
  - _Requirements: 1.2, 2.1, 3.6_

- [ ] 8. Ghi nhận lỗ hổng tồn dư + commit
  - Liệt kê CVE chưa vá được + lý do/giảm thiểu (Req 2.2); commit lockfile mới (Req 2.3); merge nhánh sau khi CI xanh.
  - _Requirements: 2.2, 2.3_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] },
    { "wave": 6, "tasks": ["6"] },
    { "wave": 7, "tasks": ["7"] },
    { "wave": 8, "tasks": ["8"] }
  ]
}
```

Phụ thuộc tuyến tính: 1 (baseline) → 2→3→4 (bump theo lớp) → 5 (sửa breaking) → 6 (verify) → 7 (smoke+audit) → 8 (ghi nhận+commit).
