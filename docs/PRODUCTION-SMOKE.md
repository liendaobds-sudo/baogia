# Production smoke checklist — ZeplaoPrint

Chạy sau deploy (single-tenant). Đánh dấu từng dòng khi pass.

## 0. Env bắt buộc

- [ ] `NODE_ENV=production`
- [ ] `DB_TYPE=postgres` + user/password (không superuser nếu đã bật RLS)
- [ ] `JWT_SECRET` + `JWT_REFRESH_SECRET` (mạnh, khác dev)
- [ ] `JWT_EXPIRES_IN=1h` (hoặc ngắn hơn)
- [ ] `FRONTEND_URL` = origin FE thật (CORS)
- [ ] `NEXT_PUBLIC_API_URL=https://<api-host>/api/v1` (bắt buộc trên FE build)
- [ ] Redis up (`REDIS_HOST`/`REDIS_PORT`)
- [ ] `PUBLIC_QUOTE_API_KEY` nếu dùng public create-from-chat
- [ ] **Không** set `ENABLE_TEST_CHAT` trên prod (hoặc chỉ staging)

## 1. Health

- [ ] `GET /health` → 200 `{ status: ok }`
- [ ] `GET /api/v1/health` → DB ping ok
- [ ] `GET /api/v1/pricing/health` → engine ok

## 2. Auth

- [ ] Login admin → access + refresh token
- [ ] Gọi API có Bearer → 200
- [ ] Logout → token cũ 401
- [ ] Refresh trước khi hết hạn → token mới
- [ ] User agent không có permission → 403 đúng route

## 3. CSKH

- [ ] Inbox load danh sách hội thoại
- [ ] Mở 1 hội thoại → tin nhắn + WS real-time (nếu 2 tab)
- [ ] Gửi tin (Zalo OA / Personal nếu đã cấu hình)
- [ ] AI gợi ý (nếu có API key)
- [ ] Mini báo giá trong inbox → có số tiền
- [ ] CustomerCard tra SĐT → lookup ERP customers (không lỗi port)

## 4. Báo giá digital

- [ ] `/pricing/quotes/new` → chọn loose/bound → Tính giá
- [ ] Điền VAT khách → Lưu → xuất hiện trong `/pricing/quotes`
- [ ] Duyệt / clone / PDF HTML nếu có quyền

## 5. Báo giá offset

- [ ] `/pricing/quotes/offset` → to_roi (hoặc loại đang bật) → Tính giá
- [ ] Thêm giỏ → Lưu `/erp/orders` → list thấy
- [ ] Tổng item = trước VAT; header VAT 1 lần

## 6. Master data / admin

- [ ] Vật tư / sản phẩm / khách hàng list + sửa (có JWT)
- [ ] `/pricing/admin/users` → list từ `/users`
- [ ] `/pricing/admin/roles` → list từ `/rbac/roles`
- [ ] `/test-chat` **không** hiện menu; API 404 trên prod

## 7. Bảo mật nhanh

- [ ] `GET /api/v1/media/file?path=../../etc/passwd` không auth → 401
- [ ] Có JWT nhưng path escape → 404
- [ ] `POST /api/v1/public/v1/quote/create-from-chat` không key → 401/503
- [ ] Static `/uploads` không public trên prod

## 8. Multi-tenant (chỉ khi đã flip RLS)

Xem `backend/db/TENANT-RLS-RUNBOOK.md`.

- [ ] App dùng role `zeplao_app` (NOSUPERUSER)
- [ ] `TENANT_RLS_ENABLED=true`
- [ ] Tenant A không thấy inbox/quotes tenant B
- [ ] Super-admin dashboard stats đúng (bypass)

## Kết quả test tự động (mốc local — đo ngày 2026-08-23)

Đây là bằng chứng trên worktree hiện tại, không thay thế smoke trên staging/production.

| Workspace | Kết quả |
|-----------|---------|
| backend `npx jest --runInBand` | 147 suites pass, 1 skipped; 1.318 tests pass, 8 skipped |
| frontend `npx jest --ci --runInBand` | 76 suites pass; 392 tests pass |
| backend `npx tsc --noEmit -p tsconfig.json` | pass |
| frontend `npx tsc --noEmit` | pass |
| backend `npm run build` | pass |
| frontend `npm run build` | pass (cần network để tải Google Font trong môi trường sạch) |
