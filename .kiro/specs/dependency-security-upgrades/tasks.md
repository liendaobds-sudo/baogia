# Implementation Plan: Dependency Security Upgrades

> 🔁 **MỞ LẠI rồi ĐÓNG TIẾP — audit 2026-08-29.**
>
> Spec này từng được coi là gần xong (27/29), nhưng audit phát hiện HIGH đã quay lại: backend
> **11 high** ở prod deps, frontend **4 high**. Nguyên nhân gốc: các `overrides` được ghim ĐÚNG BẰNG
> mốc cuối của dải bị ảnh hưởng (advisory là *inclusive*), ví dụ `tar ^7.5.19` cho advisory `≤7.5.20`
> ⇒ vẫn nằm trong dải.
>
> Đã xử lý trong đợt audit (đo bằng `npm audit`):
> - `overrides` nâng: `socket.io-parser ^4.2.7` (HIGH, WS mở Internet — reachability cao nhất),
>   `tar ^7.5.22`, `brace-expansion ^5.0.9`, `js-yaml ^4.3.2`, `fast-uri ^3.1.6`, `ip-address ^10.5.0`;
>   frontend thêm `nanoid ^3.3.18`, `socket.io-parser`, `js-yaml`.
> - `typeorm` → `^0.3.31` (đóng advisory `migration:generate`).
> - `sqlite3` chuyển sang **devDependencies** (production dùng `pg`) ⇒ cả chuỗi `node-gyp` ra khỏi
>   cây prod.
> - **Gỡ driver không dùng**: `mariadb`, `mysql`, `mysql2`, `sql.js` (grep xác nhận 0 import trong
>   `src/`; `app.module.ts` chỉ hỗ trợ `postgres` + `sqlite`). Kèm xoá test chết
>   `pricing/tests/fuzz-test.spec.ts` (so với API PHP đã decommission + MySQL `erp_print` không còn).
>
> Kết quả đo lại: **backend prod = 0 lỗ hổng; frontend = 0; toàn cây backend = 0 high/critical**
> (còn low/moderate thuần dev từ `sqlite3` → `node-gyp`).
>
> 👉 Việc còn lại: thêm một cổng CI chạy `npm audit --omit=dev --audit-level=high` cho cả hai
> workspace để HIGH không âm thầm quay lại lần nữa.

## Overview

Nâng cấp dependency mang tính breaking để đóng các CVE HIGH còn lại, theo thứ tự an toàn B0→B9 trong design (đo baseline → bump NestJS_Suite + typeorm + uuid → typeorm-transactional → tsc + sửa breaking API → jest backend → frontend next → build/typecheck/test frontend → audit after → dọn CI → commit lockfile + bảng so sánh).

Đây là feature **quản lý phụ thuộc + verification**, không thêm logic nghiệp vụ mới. Vì vậy không có property-based test mới; các trục parity giá và cô lập RLS được chứng minh bằng cách **chạy lại** golden/property/unit test ĐÃ tồn tại (789 test backend). Mọi kết luận "đã đóng / đã xanh / không hồi quy" phải `[VERIFIED]` bằng output lệnh thật, chưa chỉnh sửa, kèm timestamp (theo `audit-rules.md`).

Ngôn ngữ thực thi: TypeScript/JavaScript (backend NestJS tại `backend/`, frontend Next.js tại `frontend/`) — khớp codebase hiện có.

## Tasks

- [x] 1. Đo Audit_Baseline (B0) và ghi bằng chứng before
  - [x] 1.1 Chạy và lưu Audit_Baseline cho Backend và Frontend
    - Chạy `npm audit --omit=dev` tại `backend/` và `npm audit` tại `frontend/`
    - Tạo file bằng chứng `.kiro/specs/dependency-security-upgrades/audit-evidence.md` ghi `AuditRecord` cho mỗi scope: phase=baseline, command, counts {critical, high, moderate, low}, rawOutput (output thật chưa chỉnh sửa), timestamp ISO-8601
    - Ghi danh sách/tổng số test backend trước nâng cấp (789) để đối chiếu chống mất test về sau
    - _Requirements: 6.1, 6.2, 5.4_

- [x] 2. Nâng cấp và đồng bộ NestJS_Suite + TypeORM + uuid (B1)
  - [x] 2.1 Đồng bộ NestJS_Suite lên major 11 trong `backend/package.json`
    - Bump `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/websockets`, `@nestjs/testing`, `@nestjs/cli` (+ `@nestjs/schematics` tương thích) lên `^11`
    - Đặt `@nestjs/typeorm` → `^11`; giữ `@nestjs/swagger` ở `^11` để khớp peer `@nestjs/common@11`
    - Kiểm tra peer-range các gói phụ trợ (`@nestjs/bullmq`, `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/schedule`, `@nestjs/serve-static`, `@nestjs/throttler`, `@nestjs/event-emitter`, `@nestjs/axios`); chỉ bump khi peer yêu cầu Nest 11
    - Xác nhận `uuid` ở version ngoài danh sách CVE_High của baseline (hiện `^11.1.0`)
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 2.2 Cài đặt sạch không dùng --legacy-peer-deps
    - Chạy `npm install` tại `backend/` (KHÔNG `--legacy-peer-deps`)
    - Xác minh hoàn tất không phát sinh lỗi peer dependency `ERESOLVE`; nếu còn, dùng `npm ls` truy gói còn peer-range cũ và bump tiếp
    - _Requirements: 1.3_

- [x] 3. Nâng cấp typeorm-transactional tương thích (B2)
  - [x] 3.1 Bump `typeorm-transactional` lên version tương thích typeorm/Nest 11
    - Cập nhật `typeorm-transactional` trong `backend/package.json` lên version tương thích
    - Xác nhận package vẫn export `initializeTransactionalContext`, `addTransactionalDataSource`, `runInTransaction` (giữ contract API)
    - _Requirements: 4.2, 4.4_

- [x] 4. Thích ứng breaking API backend và typecheck (B3)
  - [x] 4.1 Sửa call-site theo API mới, giữ nguyên hành vi runtime
    - Rà soát và điều chỉnh nếu API đổi: `src/main.ts` (`initializeTransactionalContext`), `src/app.module.ts` (`addTransactionalDataSource` trong `dataSourceFactory`), `src/common/tenant/tenant-connection.interceptor.ts` và `src/modules/messages/message-processor.service.ts` (`runInTransaction`), `src/config/typeorm.config.ts` + `TypeOrmModule.forRootAsync`
    - Giữ nguyên ngữ nghĩa transaction và hành vi `SET LOCAL app.current_tenant` / `app.bypass`; KHÔNG dùng `@ts-ignore` để giấu lỗi
    - _Requirements: 1.6, 4.4_

  - [x] 4.2 Typecheck backend
    - Chạy `npx tsc --noEmit -p tsconfig.json` tại `backend/`
    - Xác minh 0 lỗi type; nếu lỗi, quay lại 4.1 sửa call-site theo API mới
    - _Requirements: 1.5_

- [x] 5. Checkpoint - Backend cài đặt sạch + typecheck pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Chạy regression suite backend và xác minh parity giá + RLS (B4)
  - [x] 6.1 Chạy toàn bộ test backend và ghi bằng chứng
    - Chạy `npx jest --runInBand` tại `backend/`
    - Xác minh passed ≥ 789, failed = 0; ghi output thật (số passed/failed) vào file bằng chứng
    - Nếu test fail do API đổi, truy nguyên root cause và sửa nguồn; KHÔNG sửa expected/tolerance, KHÔNG skip/disable
    - _Requirements: 5.1, 5.3, 5.4, 1.6_

  - [ ]* 6.2 Xác minh trục parity giá (golden + property test giá hiện có)
    - Kiểm tra pass 0-fail 0-skip cho `price-preservation.golden.spec.ts`, `offset-price-preservation.golden.spec.ts`, `break-even.property.spec.ts`, `phase3-migration.verify.spec.ts`, `quote-*.integration.spec.ts`
    - Coi fail flaky của fast-check là tín hiệu lỗi thật; không giảm NUM_RUNS / nâng tolerance
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 6.3 Xác minh trục cô lập tenant/RLS (test hiện có)
    - Kiểm tra pass cho `tenant-connection.interceptor.spec.ts`, `tenant-context.service.spec.ts`, `tenant-transaction.spec.ts`
    - Xác nhận tenant context set theo request đúng như hành vi trước nâng cấp
    - _Requirements: 4.1, 4.3_

- [x] 7. Nâng cấp frontend next + eslint-config-next (B5)
  - [x] 7.1 Bump `next` và `eslint-config-next` trong `frontend/package.json`
    - Đặt `next` → bản vá CVE_High gần nhất tương thích `react@19.2.3`
    - Đặt `eslint-config-next` khớp đúng version `next` đã chọn; giữ `overrides.ws`
    - Chạy `npm install` tại `frontend/` (KHÔNG `--legacy-peer-deps`)
    - _Requirements: 2.1, 2.2_

  - [x] 7.2 Thích ứng breaking API frontend (nếu có)
    - Điều chỉnh call-site theo API `next` mới, giữ nguyên hành vi runtime; không downgrade về bản dính CVE
    - _Requirements: 2.5_

- [x] 8. Build + typecheck + test frontend (B6)
  - [x] 8.1 Typecheck và build frontend
    - Chạy `npx tsc --noEmit` tại `frontend/` → 0 lỗi
    - Chạy `npm run build` tại `frontend/` → thành công
    - _Requirements: 2.3, 2.4_

  - [x]* 8.2 Chạy test frontend và ghi bằng chứng
    - Chạy `npx jest` tại `frontend/`; xác minh failed = 0
    - Ghi output thật vào file bằng chứng
    - _Requirements: 5.2, 5.3_

- [x] 9. Checkpoint - Backend + Frontend xanh sau nâng cấp
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Đo Audit_Result và lập bảng so sánh CVE (B7)
  - [x] 10.1 Chạy audit after và ghi Audit_Result
    - Chạy `npm audit --omit=dev` tại `backend/` và `npm audit` tại `frontend/`
    - Ghi `AuditRecord` phase=result (counts theo severity + rawOutput thật + timestamp) vào file bằng chứng; xác minh backend high = 0 và frontend high = 0
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 10.2 Lập bảng so sánh CVE_High before/after và ghi CVE tồn đọng (nếu có)
    - Thêm bảng so sánh `Audit_Baseline` vs `Audit_Result` (số CVE_High before/after cho Backend và Frontend) vào file bằng chứng
    - Nếu còn HIGH không đóng được bằng nâng cấp, ghi `ResidualCVE` cho mỗi mục: id (CVE/GHSA), reason, reachability
    - _Requirements: 6.6, 6.7_

- [x] 11. Dọn CI và build tái lập (B8, B9)
  - [x] 11.1 Bỏ `--legacy-peer-deps` khỏi CI và xác minh npm ci sạch
    - Sửa `.github/workflows/ci.yml`: bỏ `--legacy-peer-deps` ở cả job backend và frontend, chuyển về `npm ci` thuần
    - Xác minh `npm ci` (không legacy flag) cài đặt thành công từ lockfile cho cả `backend/` và `frontend/`
    - Fallback: nếu bỏ cờ làm bước cài đặt fail, giữ nguyên cờ và ghi rõ xung đột peer còn lại làm việc tồn đọng
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [x] 11.2 Commit lockfile đã cập nhật
    - Commit `package-lock.json` của cả Backend và Frontend (chỉ sau khi cổng test/build của cụm tương ứng đã xanh)
    - _Requirements: 7.1_

- [x] 12. Final checkpoint - Toàn bộ cổng xác minh [VERIFIED]
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP — ở đây chúng là các kiểm tra trục riêng (parity giá, RLS, test frontend) tách ra từ lần chạy suite tổng để truy nguyên nhanh; suite tổng (6.1, 8.1) vẫn bắt buộc.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation theo thứ tự nâng cấp B0→B9.
- Feature này KHÔNG có property test mới (xem Testing Strategy trong design); parity giá và RLS được chứng minh bằng cách chạy lại golden/property/unit test đã tồn tại.
- Mọi kết luận "đã đóng / đã xanh / không hồi quy" phải gắn `[VERIFIED]` kèm lệnh thật (đúng cwd), output chưa chỉnh sửa, timestamp.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2", "10.1"] },
    { "id": 11, "tasks": ["10.2", "11.1"] },
    { "id": 12, "tasks": ["11.2"] }
  ]
}
```
