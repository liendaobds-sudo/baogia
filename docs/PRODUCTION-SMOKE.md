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
- [ ] `TRUST_PROXY=1` **nếu** app chạy sau nginx/LB (thêm 2026-08-29). Không đặt khi có proxy ⇒
      `req.ip` là IP proxy cho MỌI client ⇒ rate-limit gộp một bucket (một client làm cạn quota cả
      site; `@Throttle` 20/phút của public-quote thành 20/phút TOÀN HỆ THỐNG) và log mất IP thật.
      Ngược lại, đặt khi KHÔNG có proxy ⇒ client tự bơm `X-Forwarded-For` để lách rate-limit.
      Boot ở production sẽ log cảnh báo nếu biến này trống.
- [ ] Chốt **một** nguồn env cho production: `backend/.env` hiện KHÔNG có `JWT_SECRET`
      (giá trị đến từ `.env` ở root) — dễ deploy thiếu.

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
- [ ] Có JWT của tenant B, path `t<A>/...` của tenant A → 404 (thêm 2026-08-29)
- [ ] `POST /api/v1/public/v1/quote/create-from-chat` không key → 401/503; body gây lỗi →
      thông báo CHUNG, không lộ message nội bộ
- [ ] Static `/uploads` không public trên prod
- [ ] **`GET /api/v1/dashboard/kpi` KHÔNG kèm Authorization → 401** (thêm 2026-08-29; trước đây
      route này trả 200 cho người chưa đăng nhập, kèm số liệu gộp mọi tenant).
      Kiểm cả `/dashboard/activity-hourly` và `/dashboard/trends`.
- [ ] `POST /api/v1/auth/login` sai mật khẩu 15 lần liên tiếp từ cùng IP → có 429
      (throttle riêng 10/phút, thêm 2026-08-29)
- [ ] `npm audit --omit=dev --audit-level=high` (backend) và `npm audit --audit-level=high`
      (frontend) → exit 0. CI đã có cổng này.

## 8. Multi-tenant (chỉ khi đã flip RLS)

Xem `backend/db/TENANT-RLS-RUNBOOK.md`.

- [ ] App dùng role `zeplao_app` (NOSUPERUSER) — **đổi mật khẩu** trước khi chạy
      `db/2026-06-26_tenant_app_role.sql` (file có mật khẩu mẫu trong repo và đã bị loại khỏi
      `apply-patches.js` để không tự chạy)
- [ ] Chạy `db/2026-07-09_customers_tenant_scoped_unique.sql` và
      `db/2026-08-13_auto_kb_tenant_backfill.sql` **SAU Pha A** (cả hai đã bị loại khỏi
      `apply-patches.js` vì phụ thuộc cột `tenant_id`; đều có guard nên chạy sai thứ tự chỉ NO-OP)
- [ ] `TENANT_RLS_ENABLED=true`
- [ ] App khởi động được — RLS preflight PASS (nếu manifest lệch catalog thì app **từ chối mở cổng
      HTTP**; audit 2026-08-29 đã gỡ 2 bảng phantom `daily_stats` + `production_cost_configs` khỏi
      manifest/Pha A/Pha B, trước đó phiên flip sẽ chết ngay ở bước này)
- [ ] Tenant A không thấy inbox/quotes tenant B
- [ ] Super-admin dashboard stats đúng (bypass); super_admin **không** impersonate ⇒ route
      tenant-plane trả rỗng (fail-closed, thay đổi có chủ đích 2026-08-29)
- [ ] Đếm lại `tenant_id IS NULL` trên bản sao trước khi gỡ quy ước `OR tenant_id IS NULL`
      (spec `tenant-data-isolation` task 32 còn mở)

## 9. Index hiệu năng (maintenance window)

`db/2026-07-12_perf_indexes_quotes.sql` + `db/2026-07-25_perf_indexes_audit.sql` nay dùng
`CREATE INDEX CONCURRENTLY` ⇒ **không khoá ghi**, nhưng **không được bọc transaction**
(chạy bằng `psql -f`, đừng thêm BEGIN/COMMIT).

- [ ] Áp 2 file trên (ngoài `apply-patches.js`, có chủ đích)
- [ ] Kiểm index INVALID nếu lệnh bị hủy giữa đường:
      `SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE NOT i.indisvalid;`
      → có kết quả thì `DROP INDEX` rồi chạy lại đúng lệnh đó.

## Kết quả test tự động (mốc local — đo ngày 2026-08-29, sau audit toàn diện)

Đây là bằng chứng trên worktree hiện tại, không thay thế smoke trên staging/production.
**Đây là nguồn mốc test duy nhất** — `audit-rules.md` không còn hardcode số nữa, trỏ về đây.

| Workspace | Kết quả |
|-----------|---------|
| backend `npx tsc --noEmit -p tsconfig.json` | pass (exit 0) |
| backend `npx jest --runInBand` | 157 suites pass, 1 skipped; **1.452 tests pass**, 8 skipped |
| backend `npm run build` | pass (exit 0) |
| backend `npm audit --omit=dev --audit-level=high` | **found 0 vulnerabilities** (exit 0) |
| frontend `npx tsc --noEmit` | pass (exit 0) |
| frontend `npx jest --ci` | 77 suites pass; **401 tests pass** |
| frontend `npm run build` | pass (cần network để tải Google Font trong môi trường sạch) |
| frontend `npm audit --audit-level=high` | **found 0 vulnerabilities** (exit 0) |

Suite bị skip là `tenant-isolation.e2e.spec.ts` — gated sau `RLS_E2E=1` + Postgres thật;
CI có job riêng `rls-e2e` chạy nó bằng role NOSUPERUSER.

Mốc trước (2026-08-23): backend 147 suites / 1.318 tests; frontend 76 suites / 392 tests.

Delta của đợt audit — **+8 suite / +64 test backend**:
`tenant-sql`, `dashboard.guard`, `media.tenant`, `quote-pdf-site-settings-tenant`,
`discount-base-contract`, `hop-giay-parent-sheet`, `imposition-nesting-parity`, `ai-audit-fixes`,
`system-settings-tenant`, `pricing-tenant-scope.guard`;
và **+1 suite / +9 test frontend** (`map-cart-item`).
Đồng thời **xoá 2 file test chết**: `pricing/tests/fuzz-test.spec.ts` (so với API PHP đã
decommission + MySQL `erp_print` không còn) và `offset-engine/__tests__/_probe-rte.spec.ts`
(chỉ `console.log` rồi `expect(true).toBe(true)` — đã thay bằng `imposition-nesting-parity`
có assert thật).

### Đợt audit độ thông minh & kiến thức chatbot AI (cùng ngày 2026-08-29)

Mốc giữa đợt: backend 155 suites / 1.382 tests → **157 suites / 1.452 tests** (**+2 suite /
+70 test**). Hai suite mới:

- `suggestions/ai-knowledge-pipeline.spec.ts` — chuẩn hoá tiếng Việt không dấu, hai nhóm kiến
  thức trước đây không bao giờ được inject (`delivery_production`, `fileDesignRules`), mâu thuẫn
  trong `printing-constraints.json`, phát hiện sản phẩm hộp giấy/viết tắt/đa sản phẩm, và
  kiểm mọi file trong `SEED_DOCS` thực sự tồn tại.
- `suggestions/eval/negative-dataset.spec.ts` — bộ eval NEGATIVE đầu tiên của dự án (17 case):
  yêu cầu bất khả thi về kỹ thuật phải sinh cảnh báo, và mọi trường hợp chưa có báo giá hợp lệ
  thì số tiền do model bịa ra phải bị gỡ.

Ngoài ra:
- `suggestions/eval/rag-metrics.spec.ts` tăng từ 8 lên 16 test (thêm nhóm đo intent).
- `suggestions/prompt-builder.service.spec.ts` tăng từ 30 lên 35 test. Chính test mới
  "KHÔNG vượt trần dù mọi khối context đều phình" đã phát hiện **4 khối context vẫn chưa có trần**
  (`customerProfileContext`, `productFieldsContext`, `quoteContext`, `orderHistoryContext`) —
  bản sửa vòng trước chỉ cap 6 khối. Nay đã cap đủ 10 khối; `taskInstructions` cố ý không cap.

Hai runner eval gọi provider có phí (`npm run eval:rag`, `npm run eval:chat`) **không** nằm trong
cổng này. Cả hai nay đã có ngưỡng regression và trả exit code khác 0 khi tụt (trước đó
`eval:chat` luôn `exit 0`).
