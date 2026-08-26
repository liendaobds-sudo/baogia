---
name: zeplao-testing
description: "Chọn và chạy ma trận kiểm thử ZeplaoPrint cho backend NestJS/Jest và frontend Next.js/Jest/Playwright. Dùng sau thay đổi code, khi xác minh bug, trước build/release, hoặc khi cần biết test nào bảo vệ pricing, VAT, dieline, AI, scope và tenant. Không hardcode số suite/test lịch sử."
---

# Kiểm thử ZeplaoPrint

Chạy đúng workspace. Bắt đầu hẹp theo file/feature, sau đó mở rộng tương xứng với rủi ro.

## Lệnh chuẩn

Backend, cwd backend/:

~~~powershell
npx tsc --noEmit -p tsconfig.json
npx jest <pattern-or-path> --runInBand
npx jest --runInBand
npm run build
~~~

Frontend, cwd frontend/:

~~~powershell
npx tsc --noEmit
npx jest <pattern-or-path> --runInBand
npx jest --ci
npm run build
npx playwright test
~~~

Playwright config hiện còn tham chiếu port 3000 trong khi npm run dev chạy port 3002. Không dùng Playwright làm gate mặc định cho đến khi đã xác minh hoặc sửa seam này. Không chạy nếu môi trường/app phụ thuộc chưa sẵn sàng; ghi rõ phần chưa chạy. npm ci chỉ cần khi xác minh lockfile/cài sạch hoặc CI.

## Ánh xạ thay đổi sang test

| Vùng thay đổi | Kiểm tra tối thiểu |
|---|---|
| Backend service/controller | Typecheck backend + spec gần nhất |
| Frontend component/hook/lib | Typecheck frontend + spec gần nhất |
| API contract xuyên FE/BE | Cả hai typecheck + test controller/service + test consumer |
| Digital pricing | pricing-flow, pricing-advanced, facade/plugin và order recompute liên quan |
| Offset pricing/VAT | offset engine targeted + totals/property + price-preservation golden + UI total/PDF/order parity |
| Imposition/dieline | property/example của imposition, flat-dieline/nesting và preview SVG |
| AI/RAG/prompt | suggestion/constraint/validate-result spec; eval chỉ khi có điều kiện phù hợp |
| Scope/capability/RBAC | backend enforcement + frontend scope/route guard |
| Tenant/RLS | tenant unit/integration + coverage guard; RLS e2e chỉ trên PostgreSQL test |
| Cron/BullMQ/WebSocket đa tenant | tenant context + eligibility + retry/idempotency + overlap/multi-replica + emit đúng room |
| DB patch | parse/dry-run trên DB test hoặc bản sao; không dùng DB production làm test |

CI hiện hành trong .github/workflows/ci.yml là nguồn thật cho full gate. Đọc file đó trước khi tuyên bố parity với CI.

## Quy tắc vùng tới hạn

- Giá/VAT: giữ golden zero-tolerance khi mục tiêu là bảo toàn hành vi. Nếu số phải đổi, chứng minh business rule rồi soi diff kỳ vọng.
- Property test: một lần xanh không bác được lỗi flaky. Lưu seed của fast-check khi fail và chạy lại seed đó sau sửa.
- Tenant: test cả A không thấy B, ghi sai tenant bị chặn, baseline/bypass đúng chủ đích, và hành vi khi TENANT_RLS_ENABLED tắt nếu yêu cầu tương thích.
- Job nền: với cờ RLS bật, test thiếu context/tenantId fail-closed cho đường mới; eligibility theo status/subscription/app-scope đã chốt; một tenant lỗi; tick chồng/hai replica/retry; callback network không giữ transaction DB dài; emit dữ liệu tổ chức không fallback global. Đọc `../zeplao-data-tenancy/references/background-jobs.md` để chọn ma trận đầy đủ.
- Preview/parity: test object chưa đủ; khi thay hình học hoặc PDF, đối chiếu artifact/runtime nếu có thể.
- AI: unit test không được gọi provider thật. npm run eval:chat hoặc eval:rag có thể gọi dịch vụ/đọc dữ liệu; xác minh cấu hình và quyền trước.

## Mức bằng chứng khi bàn giao

Phân biệt rõ:

1. Static: đọc code/lint/typecheck.
2. Focused: test tái hiện hoặc test module.
3. Integration: nhiều tầng/DB test.
4. Build: artifact Next/Nest tạo được.
5. Runtime: chạy lại đúng thao tác người dùng.
6. Production smoke: chỉ theo docs/PRODUCTION-SMOKE.md trong môi trường được phép.

Không dùng mức thấp để tuyên bố mức cao. Báo lệnh, cwd, kết quả và phần chưa chạy.
