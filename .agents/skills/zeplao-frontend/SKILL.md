---
name: zeplao-frontend
description: "Sửa frontend ZeplaoPrint bằng Next.js App Router/React: page, component, hook, Zustand/React Query state, API client, Socket.IO, responsive UI, scope/capability guard và quote forms. Dùng cho mọi thay đổi trong frontend/. Chuyển sang zeplao-pricing khi thay số học giá."
---

# Frontend ZeplaoPrint

Frontend có hai bề mặt dùng chung backend và cơ chế auth:

- CSKH: frontend/src/app/(app).
- Báo giá: frontend/src/app/pricing.

Shared logic ở frontend/src/lib; quote logic thuần ở frontend/src/lib/quote; scope/capability ở frontend/src/lib/scope.

## Quy ước UI và state

- Text UI/thông báo lỗi dùng tiếng Việt rõ và hướng dẫn hành động. Identifier code dùng tiếng Anh ổn định.
- Dùng Tailwind và token hiện có trong frontend/src/app/globals.css. Dark mode mới là scaffold; không vô tình thêm hành vi dark chưa được thiết kế.
- Tái dùng toast, ConfirmModal, SearchableSelect, DataTable, CustomerInfo và component chung trước khi tạo bản mới.
- Tách phép biến đổi có logic thành pure function trong lib/ hoặc _utils/ và viết Jest test.
- React Query quản lý server state; Zustand/store quản lý workflow state như quote cart. Không tạo thêm nguồn sự thật song song.
- Optimistic update phải rollback khi API lỗi. Giữ cleanup listener/timer khi component đổi conversation hoặc unmount.
- Request tính giá có thể trả sai thứ tự; giữ sequence/latest-response guard trong hook/configurator, không để response cũ ghi đè input mới.

## API, auth và WebSocket

- NEXT_PUBLIC_API_URL là base production và phải gồm /api/v1. Dev mặc định backend :4000; frontend npm run dev ở :3002.
- Dùng seam sẵn có: frontend/src/lib/api.ts, authFetch trong auth context, hoặc pricing apiClient.ts theo module. Không tạo API client thứ tư.
- Giữ refresh-token retry một lần và error shape mà consumer hiện tại hiểu; nếu đổi response, sửa reader/hook cùng lượt.
- JWT hiện lưu localStorage là nợ bảo mật có blast radius lớn; không đổi incidental trong một task UI nhỏ.
- Socket cần join/leave room đúng conversation/tenant và cleanup handler; frontend room không thay backend authorization.
- Nội dung AI/markdown phải qua sanitizer hiện có trước khi render HTML.

## Scope và navigation

Không trộn:

- app axis: cskh, baogia, shared, none;
- lifecycle: core, frozen, removed;
- print method: digital, offset;
- resource scope: loose, bound, large_format, offset.

Menu/route phải đi qua registry/resolver và guard hiện có: FrozenRouteGuard, CskhRouteGuard, MethodRouteGuard, RouteAccessGuard, useEnabledApps và useEnabledMethods. Không hardcode menu mới vượt registry/capability.

Runtime registry ở frontend/src/lib/scope/scope-registry.json. Spec registry trong .kiro có thể khác do tiến trình triển khai; cập nhật có chủ đích và chạy test parity/validator, không chép đè mù.

Frontend guard phục vụ UX và có thể giữ màn hình ổn định lúc state đang load. Quyền thật luôn phải được backend cưỡng chế.

## Quote UI

- Dùng buildPricingPayload/readPricingResult và quote-units helpers thay vì map mới.
- DTO lưu order dùng snake_case; config đầy đủ nằm trong printing_detail để edit hydrate và server recompute.
- Đơn vị seam phải rõ: một số mini form dùng cm, configurator chi tiết dùng mm.
- Offset preview dùng meta/positions từ engine. Tổng offset chốt dùng quoteAlignedOffsetTotals, không result.khachTra trực tiếp.

Nạp zeplao-pricing cho VAT, discount, total, unit, payload replay hoặc parity.

## Verify

Trong frontend/:

~~~powershell
npx tsc --noEmit
npx jest <path-or-pattern> --runInBand
npx jest --ci
npm run build
~~~

Scope-only có npm run test:scope. Playwright đang có mismatch port 3000/3002; chỉ chạy sau khi xác minh cấu hình/môi trường. Với UI runtime, kiểm responsive, loading/error/empty, keyboard/accessibility cơ bản và đúng thao tác user.
