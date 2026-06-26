# Implementation Plan: Phân quyền Báo giá & Đơn hàng (RBAC)

## Overview

Spec này biến seam phân quyền permissive thành phân quyền được thực thi thật, với **ranh giới bảo mật thật ở backend**. Lõi quyết định được trích xuất thành **hàm thuần** (`canAccess`, `normalizeCapability`, `normalizeRole`, `resolvePermissions`, các tập quyền mặc định) để kiểm thử bằng property-based testing và dùng nhất quán hai phía.

Ngôn ngữ hiện thực: **TypeScript**, hai package:
- **backend** (NestJS, jest) — cần thêm `fast-check` vào `backend/devDependencies`.
- **frontend** (Next.js, jest + fast-check đã sẵn sàng).

Property tests dùng **fast-check** (≥100 iteration mỗi property), gắn tag `// Feature: rbac-quote-order-access, Property {n}: {mô tả}`. Mỗi bước xây dựng trên bước trước và kết thúc bằng việc nối dây vào guard backend, login response, và UI frontend. Không đổi schema (`synchronize=false`), tái dùng `users`/`roles`/`role_permissions`/`audit_logs`.

## Tasks

- [x] 1. Lõi quyết định thuần (pure decision core) backend + frontend
  - [x] 1.1 Tạo module quyết định thuần backend
    - Tạo `backend/src/modules/auth/access-decision.ts` với: `canAccess(permissions, required)` (logic OR, `'*'` toàn quyền, required rỗng → cho qua), `normalizeCapability(cap)` (đổi `':'`→`'.'`, idempotent), `normalizeRole(legacy)` (`manager`→`supervisor`, `staff`→`agent`), `resolvePermissions(role, loader)` (fail-closed `[]` khi loader ném lỗi)
    - Xuất các tập quyền mặc định `agentDefault`/`supervisorDefault`/`viewerDefault` suy dẫn từ `DEFAULT_ROLE_PERMISSIONS`; định nghĩa `WILDCARD`, `BYPASS_ROLES`
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 5.4, 5.3, 1.4, 1.5, 4.2, 2.2, 2.5, 2.7_

  - [x]* 1.2 Viết property tests cho lõi quyết định backend
    - Tạo `backend/src/modules/auth/access-decision.spec.ts`; thêm `fast-check` vào `backend/devDependencies`
    - **Property 1: Quyết định OR theo quyền** — **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 5.4**
    - **Property 2: Vai trò bypass luôn được phép** — **Validates: Requirements 1.2, 3.9, 4.6**
    - **Property 8: Chuẩn hoá capability chỉ đổi delimiter và idempotent** — **Validates: Requirements 5.3**
    - **Property 10: Fail-closed khi không tải được quyền** — **Validates: Requirements 4.2**
    - fast-check, ≥100 iteration; tag `Feature: rbac-quote-order-access, Property {n}`

  - [x] 1.3 Tạo bản sao module quyết định thuần frontend
    - Tạo `frontend/src/lib/access-decision.ts` giống hệt hành vi backend (`canAccess`, `normalizeCapability`, `WILDCARD`); là nguồn dùng cho `usePermissions`/`RouteAccessGuard`
    - _Requirements: 5.2, 5.3, 5.4_

  - [x]* 1.4 Viết property tests cho lõi quyết định frontend
    - Tạo `frontend/src/lib/access-decision.spec.ts` (jest + fast-check đã có)
    - **Property 1: Quyết định OR theo quyền** — **Validates: Requirements 5.4**
    - **Property 8: Chuẩn hoá capability chỉ đổi delimiter và idempotent** — **Validates: Requirements 5.3**
    - **Property 9: Quyết định frontend trùng backend cho cùng đầu vào** — **Validates: Requirements 5.4, 3.1**
    - fast-check, ≥100 iteration; tag `Feature: rbac-quote-order-access, Property {n}`

- [x] 2. Mô hình quyền: ánh xạ vai trò→quyền và re-seed idempotent
  - [x] 2.1 Tinh chỉnh `DEFAULT_ROLE_PERMISSIONS` cho split báo giá/đơn hàng
    - Sửa `DEFAULT_ROLE_PERMISSIONS` trong `backend/src/.../rbac.service.ts`: **bỏ** `order.create` khỏi `agent` (theo diff thiết kế), giữ `order.view` và các quyền việc hằng ngày; xác nhận `supervisor` có `quote.approve`/`order.approve`, `admin` = `['*']`, `viewer` chỉ quyền xem
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.1_

  - [x] 2.2 Thêm `reconcileSystemRolePermissions` chạy idempotent trong `onModuleInit`
    - Bổ sung vào `RbacService`: hàm upsert quyền cho 4 vai trò hệ thống (`is_system=true`) về đúng `DEFAULT_ROLE_PERMISSIONS` (thêm thiếu, gỡ thừa), gọi sau `seedDefaultRoles()` trong `onModuleInit`
    - KHÔNG đụng vai trò tuỳ biến (`is_system=false`) và KHÔNG xoá vai trò; bảo đảm chạy lại cho cùng kết quả
    - _Requirements: 4.3, 7.2_

  - [x]* 2.3 Viết property tests cho bất biến vai trò→quyền
    - Bổ sung vào `backend/src/modules/auth/access-decision.spec.ts`
    - **Property 3: Tập quyền mặc định của agent bao trùm việc hằng ngày** — **Validates: Requirements 2.2, 2.3, 4.4**
    - **Property 4: Tập quyền mặc định của agent loại trừ mọi quyền cam kết** — **Validates: Requirements 2.4**
    - **Property 5: Phân quyền theo route cho agent (mở việc hằng ngày, khoá việc cam kết)** — **Validates: Requirements 4.4, 4.5, 4.7**
    - **Property 6: Supervisor bao trùm việc hằng ngày của agent cộng quyền duyệt** — **Validates: Requirements 2.5**
    - **Property 7: Viewer chỉ-đọc, loại trừ mọi quyền biến đổi** — **Validates: Requirements 2.7**
    - fast-check, ≥100 iteration; tag `Feature: rbac-quote-order-access, Property {n}`

- [x] 3. Thực thi phân quyền ở backend (nguồn sự thật)
  - [x] 3.1 Gắn `@Permissions` lên mọi route `/erp/orders`
    - Sửa `ErpOrdersController`: thêm decorator theo bảng ánh xạ thiết kế — `findAll`/`findOne`/`expireQuotes` → `'quote.view','order.view'`; `create`/`clone` → `'quote.create'`; `update`/`submit`/`send`/`sendZalo`/`sendEmail` → `'quote.edit'`; `approve`/`reject` → `'quote.approve'`; `accept`/`complete`/`cancel` → `'order.approve'`; `remove` → `'quote.delete'`
    - Bảo đảm KHÔNG route nào của controller còn thiếu khai báo quyền
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.2 Gắn `@Permissions` lên route `/erp/system-settings`
    - Sửa `ErpSystemSettingsController`: `GET` → `'settings.view'`, `POST` (update) → `'settings.edit'`
    - _Requirements: 3.10_

  - [x] 3.3 Nối `PermissionsGuard` dùng `canAccess` + ghi nhật ký từ chối qua `AuditService`
    - Sửa `PermissionsGuard` gọi `canAccess(user.permissions, required)`, giữ bypass `admin`/`super_admin`; khi từ chối gọi `AuditService.log(...)` (không chặn luồng) rồi ném `ForbiddenException` (403, không thực hiện thao tác)
    - Tạo hàm thuần `buildDenialLog(req)` dựng payload gồm `userId`, `role`, `required`, `route` và **loại bỏ** mọi khoá nhạy cảm (`token`, `password`, `authorization`)
    - _Requirements: 3.8, 3.9, 6.1, 6.2, 6.3_

  - [x]* 3.4 Viết property test cho payload từ chối không chứa bí mật
    - Test thuần trên `buildDenialLog(req)` với generator sinh header/body ngẫu nhiên (gồm `authorization`, `password`)
    - **Property 11: Bản ghi từ chối không chứa bí mật** — **Validates: Requirements 6.1, 6.2**
    - fast-check, ≥100 iteration; tag `Feature: rbac-quote-order-access, Property 11`

  - [x]* 3.5 Viết integration tests thực thi route (Nest testing + supertest)
    - `agent`: `GET /erp/orders`, `POST /erp/orders`, `GET /erp/orders/:id` → **không 403**; `POST .../approve|complete|cancel`, `DELETE .../:id`, `POST /erp/system-settings` → **403**
    - `admin`/`super_admin` bypass mọi route; phản chiếu metadata: mỗi handler của `ErpOrdersController` có `@Permissions` không rỗng
    - Sau `onModuleInit`: 4 vai trò hệ thống đúng quyền, `reconcileSystemRolePermissions` idempotent (chạy 2 lần), không xoá vai trò tuỳ biến
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.5, 4.6, 4.7, 7.2_

- [x] 4. Gỡ fail-open và phơi quyền khi đăng nhập
  - [x] 4.1 Chuyển `jwt.strategy.ts` sang fail-closed
    - Sửa nhánh `catch` khi nạp `role_permissions`: gán `permissions = []` (KHÔNG `['*']`), log lỗi không lộ token; giữ `admin`/`super_admin` nhận `['*']` trước nhánh try/catch
    - _Requirements: 4.1, 4.2_

  - [x] 4.2 Trả `permissions` trong login response
    - Sửa `AuthService.login()` tính `permissions` bằng `loadPermissions(role)` (cùng logic fail-closed như `JwtStrategy`) và đính vào `user` trả về
    - _Requirements: 5.1, 7.4_

  - [x]* 4.3 Viết integration test cho login + fail-closed
    - Login `agent` → `response.user.permissions` chứa tập của agent; token cũ vẫn validate, quyền nạp ở lần xác thực kế
    - _Requirements: 5.1, 7.4, 4.2_

- [x] 5. Checkpoint backend - Đảm bảo toàn bộ test backend pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Nối dây phân quyền vào frontend (lớp UX)
  - [x] 6.1 Phơi `permissions` qua `auth-context` + helper `usePermissions`/`hasPermission`
    - Sửa `frontend/src/lib/auth-context.tsx`: thêm `permissions: string[]` vào interface `User` (mặc định `[]` cho phiên cũ); thêm hook `usePermissions()` trả `permissions` và `hasPermission(cap)` dùng `canAccess` + `normalizeCapability` từ `@/lib/access-decision`
    - _Requirements: 5.1, 5.2_

  - [x] 6.2 Biến `RouteAccessGuard` thành guard thật
    - Sửa `frontend/src/components/RouteAccessGuard.tsx`: dùng `usePermissions` + `canAccess(permissions, [normalizeCapability(requiredCapability)])`; không có capability → permissive; thiếu quyền → render thông báo "Không đủ quyền truy cập" (không ném lỗi); giữ compose `FrozenRouteGuard` (ngoài) → `RouteAccessGuard` (trong)
    - _Requirements: 5.4, 5.5, 5.8_

  - [x] 6.3 Hoà giải capability `':'`→`'.'` trên hai trang đã nối dây
    - Sửa `pricing/quotes/page.tsx` (`"quote:create"`→`"quote.create"`) và `pricing/orders/page.tsx` (`"order:view"`→`"order.view"`)
    - _Requirements: 5.3_

  - [x] 6.4 Ẩn/vô hiệu hoá nút cam kết trong `QuoteOrderListView`
    - Bọc nút Duyệt/Từ chối (theo `quote.approve`), Hoàn thành/Huỷ/KH chấp nhận (theo `order.approve`), Xoá (theo `quote.delete`) bằng `hasPermission(...)`; ẩn khi không đủ quyền
    - _Requirements: 5.6, 5.7_

  - [x] 6.5 Sửa nhãn vai trò hard-code trong `(app)/layout.tsx`
    - Thay nhãn cố định "Quản trị viên" bằng nhãn suy từ `user.role` qua bản đồ `ROLE_LABELS` (`super_admin`/`admin`/`supervisor`/`agent`/`viewer`)
    - _Requirements: 1.7_

  - [x] 6.6 Hoà giải từ vựng vai trò trong `admin/users`
    - Sửa `frontend/src/app/pricing/admin/users/page.tsx`: options và `roleMap` đổi `manager`→`supervisor`, `staff`→`agent`; hiển thị 4 giá trị chuẩn `admin`/`supervisor`/`agent`/`viewer`, `defaultValue: 'agent'`
    - _Requirements: 1.3, 1.4, 1.5_

  - [x]* 6.7 Viết unit tests frontend (jest + @testing-library/react)
    - `usePermissions` trả `permissions` từ `auth-context`; `RouteAccessGuard` có quyền → render children, thiếu quyền → render thông báo không ném lỗi; `QuoteOrderListView` `agent` không thấy nút Duyệt/Hoàn thành/Huỷ, `supervisor`/`admin` thấy; compose `FrozenRouteGuard`→`RouteAccessGuard` bảo toàn; `admin/users` hiển thị `supervisor/agent`; `(app)/layout` hiển thị nhãn theo `user.role`
    - _Requirements: 5.2, 5.4, 5.5, 5.6, 5.8, 1.3, 1.7_

- [x] 7. Checkpoint frontend - Đảm bảo toàn bộ test frontend pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Checkpoint cuối - Chạy đầy đủ test suite và xác nhận không suy yếu product-rescope
  - Chạy test suite backend và frontend, `tsc` sạch cho cả hai package
  - Chạy lại `npm run test:scope` của frontend để xác nhận spec `product-rescope-cskh-quote` (FrozenRouteGuard, hai route `/pricing/quotes` & `/pricing/orders`, scope registry) KHÔNG bị suy yếu
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 5.8, 7.5_

## Notes

- Các task gắn `*` là tuỳ chọn (property tests, unit/integration tests) và có thể bỏ qua khi cần MVP nhanh; task hiện thực lõi không bao giờ gắn `*`.
- Mỗi task tham chiếu tới sub-requirement cụ thể để truy vết.
- Property tests dùng fast-check, ≥100 iteration, tag theo định dạng `Feature: rbac-quote-order-access, Property {n}`. Backend phủ P1, P2, P3, P4, P5, P6, P7, P8, P10, P11; frontend phủ P1, P8, P9.
- Backend là ranh giới bảo mật thật; ẩn UI frontend chỉ là biện pháp trải nghiệm (Req 5.7).
- Không đổi schema, `synchronize=false`, tái dùng `users`/`roles`/`role_permissions`/`audit_logs`; không phát sinh truy vấn DB cho mỗi lần kiểm tra quyền (Req 7.2, 7.6).
- Các tiêu chí về seeding DB, login API, cấu hình guard, tương thích phiên, và tuyên bố kiến trúc được phủ bằng integration/unit/smoke theo Testing Strategy của design.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1", "3.1", "3.2", "4.1", "6.3", "6.5", "6.6"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.2", "3.3", "4.2", "6.1"] },
    { "id": 2, "tasks": ["2.3", "3.4", "6.2", "6.4"] },
    { "id": 3, "tasks": ["3.5", "4.3", "6.7"] }
  ]
}
```
