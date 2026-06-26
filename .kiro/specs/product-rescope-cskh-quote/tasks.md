# Implementation Plan: Product Rescope CSKH + Báo giá

## Overview

Spec này phần lớn là quyết định quy hoạch, nhưng có một lõi logic thuần kiểm thử được: **Scope Registry** (artefact + types + validators), **IA Resolver** (suy dẫn menu từ registry), **vòng đời phân loại** (freeze/unfreeze/remove khả nghịch), và **bộ lọc khung nhìn Báo giá ↔ Đơn hàng** (Requirement 8 — thay đổi code duy nhất tại `quotes/page.tsx`).

Ngôn ngữ hiện thực: **TypeScript** (khớp codebase Next.js frontend + NestJS backend). Logic thuần đặt tại `frontend/src/lib/scope/`; artefact registry tại thư mục spec. Property-based tests dùng **fast-check** (≥100 iteration mỗi property). Mỗi bước xây dựng trên bước trước và kết thúc bằng việc nối dây (wiring) vào sidebar và trang Danh sách BG.

Nguyên tắc xuyên suốt: không đổi schema, `synchronize=false`, không thêm bảng/route backend, mọi bước hoàn tác được.

## Tasks

- [x] 1. Thiết lập Scope Registry types và artefact
  - [x] 1.1 Định nghĩa kiểu dữ liệu Scope Registry
    - Tạo `frontend/src/lib/scope/types.ts` với các kiểu `ScopeClass`, `Axis`, `ClassificationRule`, `ScopeEntry`, `ScopeRegistry`, `MenuItem`, `ViewKey` theo design
    - Bao gồm các trường bắt buộc có điều kiện: `reenable` (frozen), `backup` (removed), `dependsOnFrozen`, `unauthEndpointRisk`
    - _Requirements: 2.1, 2.4, 2.5, 5.7, 5.8, 7.3_

  - [x] 1.2 Tạo artefact `scope-registry.json` với phân loại ban đầu
    - Tạo `.kiro/specs/product-rescope-cskh-quote/scope-registry.json` theo cấu trúc `ScopeRegistry`
    - Gán `core` cho các bề mặt Lõi (Inbox, Contacts/CRM, KB, AI suggestions, mini báo giá, engine tính giá, vòng đời `/erp/orders`)
    - Gán `frozen` cho ERP nâng cao (inventory, rfm-scoring, production-cost, setup-fee, plate-pricing, offset-machine-advanced) và SaaS (multi-tenant, super-admin, subscription-plans, payments) kèm khối `reenable`
    - Liệt kê đủ 5 trang Cài đặt ẩn (`ai-quote`, `api-keys`, `api-docs`, `webhooks`, `product-configs`) mỗi trang đúng một nhóm
    - Gán `removed` cho title-map mồ côi `/pricing/orders`; ghi `baseline.mainMenuCount` cho mỗi app
    - _Requirements: 2.1, 2.5, 2.7, 2.8, 1.5, 4.4_

- [x] 2. Hiện thực kiểm chứng bất biến của Scope Registry
  - [x] 2.1 Implement validator well-formedness của registry
    - Tạo `frontend/src/lib/scope/validate-registry.ts`: kiểm `scope` thuộc đúng một nhóm, `id` duy nhất, `rule`/`reason`/`featureRef` không rỗng
    - _Requirements: 2.1, 2.5_

  - [x]* 2.2 Viết property test cho well-formedness
    - **Property 1: Registry well-formedness (phân loại trọn vẹn, không trùng)**
    - **Validates: Requirements 2.1, 2.5**
    - fast-check, ≥100 iteration; tag `Feature: product-rescope-cskh-quote, Property 1`

  - [x] 2.3 Implement classifier soundness (Core vs Frozen theo bề mặt)
    - Tạo `frontend/src/lib/scope/classify.ts`: hàm gán `core` cho bề mặt Lõi, `frozen` cho ERP nâng cao/SaaS
    - _Requirements: 2.2, 2.3_

  - [x]* 2.4 Viết property test cho classification soundness
    - **Property 2: Classification rule soundness**
    - **Validates: Requirements 2.2, 2.3**
    - fast-check, ≥100 iteration; tag `Property 2`

  - [x] 2.5 Implement validator cho khối `reenable` (frozen) và `backup` (removed)
    - Tạo `frontend/src/lib/scope/validate-transitions.ts`: frozen ⇒ có `reenable.trigger/steps/expected` (và `perTenant` nếu Multi_Tenant); removed ⇒ có `backup.codeBackupRef/dataBackupRef` và `restoreVerified=true`
    - _Requirements: 2.4, 5.7, 5.8_

  - [x]* 2.6 Viết property test cho điều kiện bật lại của frozen
    - **Property 3: Frozen entries luôn kèm điều kiện bật lại**
    - **Validates: Requirements 2.4, 5.8**
    - fast-check, ≥100 iteration; tag `Property 3`

  - [x]* 2.7 Viết property test cho sao lưu đã kiểm chứng của removed
    - **Property 4: Removed entries luôn kèm sao lưu đã kiểm chứng**
    - **Validates: Requirements 5.7**
    - fast-check, ≥100 iteration; tag `Property 4`

  - [x] 2.8 Implement kiểm tra phụ thuộc `dependsOnFrozen`
    - Tạo `frontend/src/lib/scope/validate-dependencies.ts`: entry `core` trỏ `dependsOnFrozen` tới X ⇒ X không bao giờ `removed`
    - Đồng thời kiểm mọi entry có endpoint không-auth phải có `unauthEndpointRisk ∈ {high, medium, low}`
    - _Requirements: 2.6, 7.3_

  - [x]* 2.9 Viết property test cho bất biến phụ thuộc
    - **Property 5: Phụ thuộc giữ thành phần Phụ ở frozen, không removed**
    - **Validates: Requirements 2.6**
    - fast-check, ≥100 iteration; tag `Property 5`

  - [x]* 2.10 Viết property test cho phân loại rủi ro endpoint không-auth
    - **Property 12: Endpoint không-auth luôn được ghi phân loại rủi ro**
    - **Validates: Requirements 7.3**
    - fast-check, ≥100 iteration; tag `Property 12`

- [x] 3. Checkpoint - Đảm bảo tests phần Registry pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Hiện thực vòng đời phân loại khả nghịch
  - [x] 4.1 Implement state machine chuyển trạng thái phân loại
    - Tạo `frontend/src/lib/scope/lifecycle.ts`: cấm chuyển trực tiếp `core → removed`; mọi tính năng phải qua `frozen` trước `removed`
    - _Requirements: 5.1_

  - [x]* 4.2 Viết property test cho ràng buộc không gỡ-trực-tiếp
    - **Property 6: Không gỡ bỏ khi chưa qua đóng băng**
    - **Validates: Requirements 5.1**
    - fast-check trên dãy chuyển trạng thái ngẫu nhiên, ≥100 iteration; tag `Property 6`

  - [x] 4.3 Implement freeze/unfreeze/remove-with-backup dạng apply + undo
    - Bổ sung vào `lifecycle.ts`: `apply(step, registry)` và `undo(...)`; `unfreeze(freeze(entry))` khôi phục về `core` không cần sao lưu ngoài
    - _Requirements: 5.4, 7.5_

  - [x]* 4.4 Viết property test cho tính khả nghịch (round-trip)
    - **Property 7: Mọi bước rút gọn đều hoàn tác được (round-trip)**
    - **Validates: Requirements 5.4, 7.5**
    - fast-check, ≥100 iteration; tag `Property 7`

- [x] 5. Hiện thực IA Resolver suy dẫn menu từ registry
  - [x] 5.1 Implement `resolveMenu` và `isFrozenRoute`
    - Tạo `frontend/src/lib/scope/ia-resolver.ts`: `resolveMenu(registry, app)` chỉ giữ entry `core` đúng trục, loại `frozen`/`removed`; `isFrozenRoute(registry, path)` cho route guard
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [x]* 5.2 Viết property test cho IA soundness
    - **Property 8: IA soundness — menu chỉ chứa Core đúng trục, ẩn frozen/removed**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - fast-check, ≥100 iteration; tag `Property 8`

  - [x]* 5.3 Viết property test cho việc menu nhỏ lại sau rút gọn
    - **Property 9: Rút gọn làm menu nhỏ lại**
    - **Validates: Requirements 1.5**
    - fast-check, ≥100 iteration; tag `Property 9`

  - [x] 5.4 Implement hàm đánh giá rò rỉ Tính_Năng_Phụ trên menu
    - Bổ sung `frontend/src/lib/scope/ia-resolver.ts`: trả KHÔNG ĐẠT + danh sách mục không thuộc `core`
    - _Requirements: 1.7_

  - [x]* 5.5 Viết property test cho phát hiện rò rỉ
    - **Property 10: Đánh giá rút gọn phát hiện rò rỉ Tính_Năng_Phụ**
    - **Validates: Requirements 1.7**
    - fast-check (gồm registry "rò rỉ"), ≥100 iteration; tag `Property 10`

  - [x]* 5.6 Viết property test cho độ sâu menu ≤ 3
    - **Property 11: Chức năng chính tiếp cận trong tối đa 3 nhấp**
    - **Validates: Requirements 7.1**
    - fast-check trên cây menu suy ra, ≥100 iteration; tag `Property 11`

- [x] 6. Checkpoint - Đảm bảo tests phần Lifecycle + IA pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Nối dây IA Resolver vào hai app và route guard
  - [x] 7.1 Tích hợp `resolveMenu` vào `PricingSidebar` (App_BaoGia)
    - Sửa `frontend/src/app/pricing/_components/PricingSidebar.tsx` render menu từ `resolveMenu(registry, 'baogia')`
    - _Requirements: 4.2, 4.3, 4.5_

  - [x] 7.2 Tích hợp `resolveMenu` vào sidebar App_CSKH
    - Sửa sidebar tại `frontend/src/app/(app)/` render menu từ `resolveMenu(registry, 'cskh')`
    - _Requirements: 4.1, 4.3, 4.5_

  - [x] 7.3 Implement route guard cho tính năng frozen
    - Dùng `isFrozenRoute`: hiển thị "Tính năng hiện không khả dụng", giữ session, không ném lỗi chưa xử lý
    - _Requirements: 4.6_

  - [x]* 7.4 Viết unit test cho route guard
    - Kiểm thông báo hiển thị và session được giữ khi truy cập route frozen
    - _Requirements: 4.6_

- [x] 8. Dọn rác điều hướng
  - [x] 8.1 Gỡ title-map mồ côi `/pricing/orders`
    - Sửa `frontend/src/app/pricing/layout.tsx` gỡ title-map `/pricing/orders`; xác nhận KHÔNG đụng API `/erp/orders`
    - _Requirements: 2.8_

- [x] 9. Requirement 8 — Tách trình bày Báo giá và Đơn hàng
  - [x] 9.1 Implement `statusGroup` và `filterByView` (pure functions)
    - Tạo `frontend/src/lib/scope/quote-view.ts`: `QUOTE_STATUSES`, `ORDER_STATUSES` rời nhau; trạng thái ngoài tập → `all`; lọc client-side, không gọi endpoint mới
    - _Requirements: 8.2, 8.3, 8.5_

  - [x]* 9.2 Viết property test cho ánh xạ trạng thái rời nhau
    - **Property 13: Ánh xạ trạng thái Báo giá/Đơn hàng rời nhau**
    - **Validates: Requirements 8.3**
    - fast-check (gồm `cancelled`, `expired`, chuỗi rỗng, giá trị lạ), ≥100 iteration; tag `Property 13`

  - [x]* 9.3 Viết property test cho lọc đúng và không mất dữ liệu
    - **Property 14: Lọc khung nhìn vừa đúng vừa không mất dữ liệu**
    - **Validates: Requirements 8.4, 8.6**
    - fast-check, ≥100 iteration; tag `Property 14`

  - [x] 9.4 Tích hợp khung nhìn Báo giá | Đơn hàng | Tất cả vào Danh sách BG
    - Sửa `frontend/src/app/pricing/quotes/page.tsx`: 3 tab dùng `statusGroup`/`filterByView` trên dữ liệu đã tải từ `GET /erp/orders`; không thêm bảng/route
    - _Requirements: 8.1, 8.4, 8.5, 8.6_

  - [x]* 9.5 Viết unit test cho hành vi khung nhìn
    - Kiểm chuyển view không gọi endpoint mới; view "Tất cả" giữ mọi bản ghi
    - _Requirements: 8.1, 8.2_

- [x] 10. Checkpoint cuối - Đảm bảo toàn bộ tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Tách route Báo giá / Đơn hàng + seam RBAC (Requirement 8 reworked)
  - [x] 11.1 Tách entry `quote-order-lifecycle` thành hai entry `core` riêng trong Scope Registry
    - Cập nhật ĐỒNG THỜI cả hai bản (giữ byte-identical): `.kiro/specs/product-rescope-cskh-quote/scope-registry.json` VÀ `frontend/src/lib/scope/scope-registry.json`
    - Tách entry lõi `quote-order-lifecycle` thành hai entry `core` trên trục `baogia`: `quotes` (navItem `quotes`, route `/pricing/quotes`) và `orders` (navItem `orders`, route `/pricing/orders`); cả hai `rule = 2.2`, cùng `featureRef`/`backendRoutes` tham chiếu `/erp/orders`
    - Giữ registry well-formed (Property 1) và bất biến IA (Property 8); đảm bảo `baseline.mainMenuCount` của `baogia` vẫn lớn hơn nghiêm ngặt số mục `core` sau tách (Property 9)
    - _Requirements: 2.2, 4.4, 4.7, 8.1_

  - [x] 11.2 Trích xuất component dùng chung `QuoteOrderListView`
    - Tạo component `QuoteOrderListView` (props: `defaultView: ViewKey`, `title?`) từ logic hiện có trong `frontend/src/app/pricing/quotes/page.tsx`, bảo toàn nguyên hành vi/render hiện tại
    - Component nạp dữ liệu qua `GET /erp/orders` với tham số `status` và dùng `statusGroup`/`filterByView` từ `frontend/src/lib/scope/quote-view.ts`; render 3 khung nhìn Báo giá | Đơn hàng | Tất cả
    - _Requirements: 8.2, 8.3, 8.5, 8.7_

  - [x] 11.3 Refactor trang Báo giá dùng `QuoteOrderListView`
    - Sửa `frontend/src/app/pricing/quotes/page.tsx` chỉ render `QuoteOrderListView` với `defaultView='quote'`; không thay đổi hành vi quan sát được
    - _Requirements: 8.1, 8.2_

  - [x] 11.4 Tạo trang Đơn hàng thật tại `/pricing/orders`
    - Tạo trang mới `frontend/src/app/pricing/orders/page.tsx` render `QuoteOrderListView` với `defaultView='order'`; nạp từ `GET /erp/orders`, không thêm bảng/route/endpoint backend
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 11.5 Implement `RouteAccessGuard` (seam RBAC cấp route)
    - Tạo component `RouteAccessGuard` (props: `requiredCapability?`, `requiredRole?`, `children`) mặc định permissive (luôn render children); là điểm DUY NHẤT để cắm policy RBAC sau này
    - Compose với `FrozenRouteGuard`: frozen-guard ngoài, access-guard trong
    - _Requirements: 8.8_

  - [x] 11.6 Áp dụng `RouteAccessGuard` độc lập cho hai route Báo giá / Đơn hàng
    - Bọc `/pricing/quotes` và `/pricing/orders` bằng `RouteAccessGuard` với capability placeholder độc lập (ví dụ `'quote:create'` và `'order:view'`), nằm trong `FrozenRouteGuard`
    - _Requirements: 8.8_

  - [x] 11.7 Cập nhật `PricingSidebar` render hai mục trục Báo giá
    - Sửa `frontend/src/app/pricing/_components/PricingSidebar.tsx` render hai mục riêng dẫn xuất từ `resolveMenu`: Báo giá → `/pricing/quotes` và Đơn hàng → `/pricing/orders`
    - _Requirements: 4.7, 8.1_

  - [x]* 11.8 Viết unit tests cho component, trang Đơn hàng và seam RBAC
    - `QuoteOrderListView`: khởi tạo đúng khung nhìn theo `defaultView`; chuyển view KHÔNG gọi endpoint mới
    - `/pricing/orders` render khung nhìn Đơn hàng (`defaultView='order'`); `RouteAccessGuard` permissive cho qua với mọi props và compose đúng với `FrozenRouteGuard`
    - _Requirements: 8.2, 8.3, 8.8_

  - [x]* 11.9 Viết test kiểm registry vẫn well-formed / IA đúng sau khi tách
    - Chạy lại kiểm well-formedness (Property 1) và IA soundness (Property 8) trên registry sau khi tách `quotes`/`orders`; xác nhận `resolveMenu(registry, 'baogia')` chứa đúng hai mục mới
    - _Requirements: 2.2, 4.4, 4.7, 8.1_

- [x] 12. Checkpoint cuối Requirement 8 - Đảm bảo toàn bộ test scope frontend pass và tsc sạch
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Kích hoạt route guard đóng băng ở cấp layout (Req 4.6)
  - [x] 13.1 Nối dây `FrozenRouteGuard` vào layout App_BaoGia
    - Bọc `children` trong `frontend/src/app/pricing/layout.tsx` bằng `FrozenRouteGuard` với `registry={scopeRegistry}`; xác nhận các route Lõi (`/pricing`, `/pricing/quotes`, `/pricing/orders`, `/pricing/products`, `/pricing/materials`, `/pricing/customers`...) KHÔNG bị chặn
    - _Requirements: 4.6_

  - [x] 13.2 Nối dây `FrozenRouteGuard` vào layout App_CSKH
    - Bọc `children` trong `frontend/src/app/(app)/layout.tsx` bằng `FrozenRouteGuard`; route frozen (`/super-admin`, `/settings/api-keys`...) hiển thị thông báo, route Lõi (`/inbox`, `/contacts`, `/ai`, `/dashboard`, `/reports`, `/settings`, `/test-chat`) KHÔNG bị chặn
    - _Requirements: 4.6_

  - [x]* 13.3 Viết test xác nhận guard cấp layout không chặn route Lõi và chặn route frozen
    - Kiểm `isFrozenRoute(registry, path)` trả `false` cho mọi route Lõi của hai app và `true` cho các route frozen tiêu biểu
    - _Requirements: 4.6_

  - [x] 13.4 Checkpoint - chạy lại test scope + tsc sạch
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Các task gắn `*` là tuỳ chọn (property tests, unit tests) và có thể bỏ qua khi cần MVP nhanh; task hiện thực lõi không bao giờ gắn `*`.
- Mỗi task tham chiếu tới sub-requirement cụ thể để truy vết.
- Property tests dùng fast-check, ≥100 iteration, tag theo định dạng `Feature: product-rescope-cskh-quote, Property {n}`.
- Các tiêu chí về phiên đăng nhập, RBAC, bảo toàn dữ liệu DB, hiệu năng, file cấu hình, và tuyên bố kiến trúc được phủ bằng integration/smoke/doc-review (theo Testing Strategy của design), không tạo task code riêng vì không phải dạng "for all input X, P(X)" hoặc phụ thuộc dịch vụ ngoài.
- Không đổi schema, `synchronize=false`, không thêm bảng/route backend (Req 6.x, 8.5).
- Nhóm 11 bổ sung cho Requirement 8 sau khi rework: tách Báo giá/Đơn hàng thành hai route + hai mục điều hướng + seam RBAC cấp route; chỉ thay đổi frontend, tái dùng các hàm thuần `statusGroup`/`filterByView` tại `frontend/src/lib/scope/quote-view.ts`; không thêm endpoint/bảng backend.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.3", "2.5", "2.8", "4.1", "4.3", "5.1", "5.4", "9.1"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.6", "2.7", "2.9", "2.10", "4.2", "4.4", "5.2", "5.3", "5.5", "5.6", "7.1", "7.2", "7.3", "8.1", "9.2", "9.3"] },
    { "id": 3, "tasks": ["7.4", "9.4"] },
    { "id": 4, "tasks": ["9.5"] },
    { "id": 5, "tasks": ["11.1", "11.2", "11.5"] },
    { "id": 6, "tasks": ["11.3", "11.4", "11.7"] },
    { "id": 7, "tasks": ["11.6"] },
    { "id": 8, "tasks": ["11.8", "11.9"] }
  ]
}
```
