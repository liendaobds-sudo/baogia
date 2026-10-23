# ZeplaoPrint — Bản đồ cấu trúc & ghi chú (cập nhật 2026-08-29)

Tài liệu này mô tả cấu trúc **thực tế** của hệ ZeplaoPrint, để tránh lẫn lộn giữa code đang
chạy, code cũ, và script rác. Đọc file này trước khi sửa.

> **Lịch sử soát:** bản 2026-06-15 đã trôi nhiều mục. Audit 2026-08-29 sửa lại §1 (bố cục repo),
> §2 (bản đồ engine giá), §3 (`admin-password.txt`), §4b (multi-tenant), §5 (`_archive/`),
> số đếm schema và §6.1. Nếu bạn thấy một phát biểu ở đây trái với code, **code thắng** —
> xem thứ tự nguồn sự thật trong `AGENTS.md`.

---

## 1. Phạm vi dự án (QUAN TRỌNG)

Repo **là chính thư mục `ZeplaoPrint/`** (root = nơi chứa file này). Không còn dự án nào khác
nằm cùng repo.

| Thư mục | Vai trò | Trạng thái |
|---|---|---|
| `backend/` | NestJS API (:4000) — CSKH/AI + pricing engine | ✅ ĐANG DÙNG |
| `frontend/` | Next.js (:3002) — giao diện agent + báo giá | ✅ ĐANG DÙNG |
| `.kiro/specs/` | Spec đang hoạt động (requirements/design/tasks) | ✅ ĐANG DÙNG |
| `.agents/skills/` | Bộ skill Codex của dự án | ✅ ĐANG DÙNG |
| `docs/` | Runbook vận hành, PRODUCTION-SMOKE, waste model | ✅ ĐANG DÙNG |
| `báo giá/` | **Nguồn dữ liệu pricebook offset** (xlsx + `PRICING_SPEC.md` + `data/*.json` ↔ bảng `offset_cfg_*`) + vài script Python một lần | 📚 THAM CHIẾU |
| `redis_bin/` | Redis cho Windows (binary + `.pdb` + `redis.windows.conf`) | ⚙️ TIỆN ÍCH DEV |

> Bản 2026-06-15 nói repo tên `Pricing/` có thêm `Web/` (storefront Vite+Supabase) và
> `_legacy_php/`. **Cả hai KHÔNG tồn tại** trong repo hiện tại (đã kiểm bằng `Test-Path`).
> Mọi hướng dẫn dạng `ZeplaoPrint/backend/...` nên đọc là `backend/...`.

---

## 2. Bốn bề mặt báo giá → HAI họ engine

⚠️ Bản cũ nói "cả ba luồng đều đổ về `PricingFacadeService` (nguồn sự thật duy nhất)". **Sai** —
offset có engine RIÊNG, không đi qua facade. Bản đồ đúng (khớp `audit-rules.md` §6):

```
(1) Chatbot AI         quote/extractors → QuoteService.calculateFromParsed → calculateViaErp ─┐
    (text Zalo, regex)                                                                        │
(2) Mini báo giá       POST /quote/pricing-calc → QuoteService.calculateMiniQuote ────────────┼─► PricingApiService
    (form, mini-quote-fields.ts)                                                              │   → PricingFacadeService
(3) Báo giá DIGITAL    POST /pricing/calculate ───────────────────────────────────────────────┘   (loose / bound / large_format)

(4) Báo giá OFFSET     POST /pricing/offset/calculate → EngineOffsetService → offset-engine/
                       (to_roi | bi_thu_folder | sp_khac | hop_giay | tui_giay)
                       Tổng cuối ở offset-engine/totals.ts — KHÔNG qua PricingFacadeService.

(5) Tầng method-agnostic  POST /quote-tool/compare|calculate → backend/src/quote/
                          method-registry + plugin digital/offset (engine chạy VAT-exclusive),
                          VAT áp MỘT LẦN ở tầng báo giá qua quote/vat.ts.

Lưu / PDF:  POST|PUT /erp/orders → OrdersService (recompute server-side cả 2 họ engine)
            → lib/quote-totals.ts (header) → quote-pdf.service.ts
```

Bề mặt phụ: `GET/POST /quick-prices` (`QuickPriceController`) = **bảng giá tra nhanh theo từ khóa**,
KHÔNG đi qua engine — tra bậc giá có sẵn. Lưu ý dễ lệch với giá engine.

### Bản đồ module backend (`src/modules/`)
- **Chatbot/hội thoại:** `zalo-personal/` (zca-js), `webhook/` (Zalo OA), `conversations/`, `messages/`,
  `gateway/` (WebSocket), `suggestions/` (AI gợi ý — đọc `ai-config.json`), `knowledge-base/` (RAG).
- **Báo giá:** `quote/` (parser, `extractors/`, crud, templates, public/quick controllers),
  `pricing/` (engine: `services/`, `services/offset/`, `controllers/`, master-data).
- **Nền tảng:** `auth/`, `rbac/`, `users/`, `tenants/`, `super-admin/`, `audit/`, `health/`, `redis/`.

---

## 3. File cấu hình runtime — KHÔNG di chuyển / xóa

| File | Ai đọc | Ghi chú |
|---|---|---|
| `backend/ai-config.json` | `config/ai-config.loader.ts` + `AiProviderService.getFileProviders` + `suggestions.controller.ts` | Config AI. Chứa API key → đã gitignore. **Mất/hỏng file này ⇒ AI rơi về `usedModel='template'` một cách IM LẶNG** (loader chỉ `catch` + warn). |
| `backend/automation-config.json` | `AutoReplyService.getAutomationConfig` | Công tắc + ngưỡng auto-reply. Đã gitignore. **Toàn cục, chưa có chiều tenant.** |
| `.env`, `backend/.env` | toàn app | Biến môi trường. Đã gitignore, chưa từng vào lịch sử git. Lưu ý `backend/.env` KHÔNG có `JWT_SECRET` — giá trị đến từ `.env` ở root; production nên chốt MỘT nguồn. |
| ~~`backend/admin-password.txt`~~ | — | ✅ **KHÔNG CÒN** (audit 2026-08-29 xác nhận file không tồn tại). `auth.service.seedAdmin()` nay **fail-fast đòi `ADMIN_DEFAULT_PASSWORD`** và không ghi credential ra đĩa. |

## 4. Database (điểm dễ nhầm nhất!)

**DB ĐANG CHẠY THẬT = PostgreSQL** (theo `backend/.env`): `DB_TYPE=postgres`, DB `zeplao_erp` @ localhost.
Các file `.sqlite`/`.db` bên dưới chỉ là **fallback dev không dùng tới** (kích hoạt khi `.env` thiếu/đổi `DB_TYPE=sqlite`).

| Nguồn | Trỏ tới | Ghi chú |
|---|---|---|
| `backend/.env` → app runtime | **Postgres `zeplao_erp`** | ✅ DB thật |
| `app.module.ts` fallback | `_backup/zeplao-dev.sqlite` | chỉ khi DB_TYPE=sqlite |
| `config/typeorm.config.ts` (CLI) fallback | `_backup/erp-dev.sqlite` | ⚠️ khác file app fallback |
| `backend/database.sqlite`, `backend/data/zeplao.db` | — | lịch sử, kiểm tra trước khi xóa |

> 🔧 Hệ quả quan trọng: vì DB thật là **Postgres**, mọi raw SQL phải dùng cú pháp Postgres.
> - Query dùng `$1` (placeholder PG) → ĐÚNG trên prod, chỉ hỏng nếu chạy SQLite dev.
> - Query dùng `?` + `DATE_SUB(NOW(), ...)` + `insertId` (kiểu **MySQL**) → **HỎNG trên Postgres**
>   (ví dụ `QuoteService.createQuoteFromChat` — xem báo cáo audit, lỗi tạo báo giá từ chatbot).
> - `is_active = 1` vs `is_active = true` dùng lẫn lộn → tùy kiểu cột mà một trong hai sẽ lỗi trên PG.
> - App runtime và CLI migration fallback trỏ 2 file SQLite khác nhau → thống nhất khi cần dùng SQLite.

### Quy ước cột `is_active` (đã chuẩn hóa 2026-06-19)

Postgres **chặt kiểu**, không tự ép `1 ↔ true` như MySQL. Cột `is_active` trong DB thật có **hai kiểu khác nhau** tùy bảng (đã probe `information_schema`):

| Kiểu cột | Bảng | Phải so sánh bằng |
|---|---|---|
| `smallint` / `integer` | `processing_options`, `printers`, `material_categories`, `accessories` | **`= 1`** (raw) hoặc `{ is_active: 1 }` (repo) |
| `boolean` | còn lại: `unified_products`, `material_types`, `offset_machine_config`, `plate_pricing`, `waste_rules`, `processing_pricing`, `setup_fees`, `production_costs`, `products`, `quick_prices`, `quote_rules`, `users`, `kb_chunks`, ... | **`= true`** hoặc `{ isActive: true }` |

- Dùng SAI: `smallint = true` → `operator does not exist: smallint = boolean`; param `true` trên smallint → `invalid input syntax for type smallint: "true"`. `boolean = 1` (inline) → `operator does not exist: boolean = integer`.
- Lưu ý: param số `1` trên cột boolean thì PG TỰ ép OK; chỉ literal inline `= 1` mới lỗi.
- Đã sửa: `pricing.service.ts getProcessingCost` và `materials.service.ts findAllCategories` (đều là cột smallint, trước dùng `true`). Có guard test trong `tests/materials.service.spec.ts`.
- Tồn đọng đã xử lý (2026-06-19): bảng `binding_types` và `ink_costs` trước KHÔNG tồn tại trong Postgres (code vẫn truy vấn → bị `.catch` nuốt, chi phí đóng cuốn & mực luôn = 0). Đã tạo + seed định mức mẫu qua `backend/db/2026-06-19_binding_ink_tables.sql` (idempotent, `is_active boolean`). Đồng thời vá lỗi port placeholder: `saveInkCosts` (`$28-$32`→`$1-$5`) và `saveProductionCosts` (mọi field bị gán cùng `$21`/`$23` → sinh `$1..$N` đúng).

### Quy ước trích dẫn identifier camelCase trong raw SQL (Postgres)

Postgres **fold** identifier không trích dẫn về chữ thường → cột camelCase phải **đặt trong nháy kép** ở raw SQL, nếu không sẽ `column "..." does not exist`.

- Cột thường gặp: `"priceType"` (bảng `processing_options`). Repo/TypeORM tự quote nên không lỗi; chỉ raw SQL thủ công mới dính.
- Đã sửa (audit báo giá in KTS): `pricing.service.ts getProcessingCost` trước dùng `SELECT ... priceType` (không nháy) → mọi báo giá `loose`/`bound` có gia công bị lỗi trên Postgres. Đổi thành `"priceType"`, khớp đường offset (`offset-loose-calculator.service.ts`) vốn đã quote đúng. Guard test: `pricing.service.spec.ts` → describe `getProcessingCost` (assert SQL chứa `"priceType"`).
- Cùng đợt: sửa `getProcessingCost` nhánh `per_m2` (trước tính `price × số_tờ`, bỏ qua kích thước → đổi sang `price × diện_tích_tờ(m²) × số_tờ × số_mặt`); đồng bộ `quote/pricing.helper.ts calculateWasteSheets` với engine chuẩn `PricingService` (lệch ±1 tờ); `calculateLargeFormat` dùng `parseFloat` + cảnh báo khi `rollWidth < 10` (nghi nhập theo mét); gom N+1 query processing/accessories thành `Promise.all`.

---

## Nguồn schema & quy trình DB (chuẩn hóa 2026-06-19)

- **Nguồn sự thật của schema = TypeORM entities.** Runtime Postgres chạy `synchronize: false`.
- Schema Postgres production được tạo bằng **`synchronize` MỘT LẦN** từ entities rồi tắt — bảng
  `migrations` **rỗng** (đã probe `information_schema`) → **chưa từng chạy migration** trên Postgres.
- Migration cũ `1777244292577-InitialSchema` là **SQLite-only**, không hợp lệ cho Postgres → đã
  chuyển vào `src/migrations/_legacy/` (ra khỏi glob) để `migration:run` không gãy.
- Bản chụp schema tái lập: **`backend/db/schema.postgres.sql`** (sinh trực tiếp từ DB thật ngày
  2026-06-25 — **69 CREATE TABLE / 45 sequence / 143 constraint / 31 index**; bản 2026-06-15 ghi
  "64/44/137/31" đã trôi, đếm lại 2026-08-29). Công cụ: `db/dump-schema.js` (đọc),
  `db/bootstrap-schema.js` (dựng DB rỗng, có guard), `db/apply-patches.js` (áp patch sau snapshot,
  ghi sổ vào bảng `schema_patches`). Hướng dẫn đầy đủ: `backend/db/README.md`.
- ⚠️ Snapshot KHÔNG gồm các patch sau ngày dump. Dựng môi trường mới **bắt buộc** chạy
  `node db/apply-patches.js` (bước 3 trong README), nếu không sẽ thiếu
  `quotes.customer_email/customer_contact` và `POST /erp/orders` vỡ.
- Ngoài `db/`, còn `backend/migrations/*.sql` (tạo `offset_cfg_*`, `method_capabilities`,
  `customer_interactions`, `offset_machine_config`, `plate_pricing`, `waste_rules`…). Các file này
  **đang live** (`unified_products_offset.sql` được `src/quote/phase3-migration.verify.spec.ts`
  đọc) nhưng **KHÔNG nằm trong sổ `apply-patches.js`** — ghi nhận nợ tài liệu.
- Đã sửa `src/config/typeorm.config.ts`: env-driven (khớp app.module), thêm `schema: 'public'`,
  vá path SQLite fallback (`_backup/erp-dev.sqlite` → `_backup/zeplao-dev.sqlite`).
- **Nợ kỹ thuật còn lại**: ~~vài entity TRÙNG tên bảng~~ ✅ **ĐÃ XỬ LÝ (2026-06-19)**: đã hợp nhất
  5 entity trùng (`materials`, `paper_sizes`, `print_types`, `units`, `material_types`) về một bản
  canonical duy nhất ở `src/entities/` (xóa bản pricing-local, chuyển import, map snake→camelCase
  trong `materials.service`, sửa cột phantom `stock_quantity`→`stock`). `migration:generate` đã
  chạy lại được. Chi tiết: `backend/db/README.md`.

---

## 5. `_archive/` — khu lưu trữ rác

Script chẩn đoán/sửa-vá/test một lần, log cũ, dump debug được **di chuyển** (không xóa) vào
`backend/_archive/` (untracked + gitignored). Thư mục `_archive/` ở ROOT **không còn tồn tại**
(bản 2026-06-15 còn nhắc `ZeplaoPrint/_archive/dev-scripts/`).

Không file nào trong `_archive/` được app/build tham chiếu. Cần lại thì move ngược ra.
`build` chỉ biên dịch `src/**/*` (theo `tsconfig.json`), nên các script gốc không ảnh hưởng.

> 📦 `backend/_archive/tenant-cleanup-backup-2026-06-19.json` — backup các record tenant + user đã xóa
> trong đợt consolidate single-schema (mục 4b). Giữ lại để hoàn tác nếu cần.

---

## 4b. Multi-tenant: shared schema `public` + PostgreSQL RLS

### Lịch sử (2026-06-19)
DB từng có di sản **schema-per-tenant** dở dang: schema rỗng `tenant_hoanglong` + 3 record
`tenants` lệch + 1 test user. Đã dọn về single-schema `public` (backup ở
`backend/_archive/tenant-cleanup-backup-2026-06-19.json`); `TenantSchemaMiddleware` bị tắt
(`app.module.ts` đã comment `consumer.apply`) và `provisionTenantSchema` thành code chết.

### ⚠️ HƯỚNG HIỆN TẠI (đã đổi hoàn toàn — sửa 2026-08-29)

Bản 2026-06-15 hướng dẫn "muốn bật multi-tenant thì bật `TenantSchemaMiddleware` + đổi
`schema:'public'` sang động". **ĐỪNG LÀM THEO.** Multi-tenant đã được làm lại theo kiến trúc
khác: **một schema `public` + cột `tenant_id` + PostgreSQL Row Level Security**, KHÔNG đổi
`search_path`. Spec: `.kiro/specs/tenant-data-isolation`, `tenant-app-scope`,
`tenant-method-capability`. Runbook: `backend/db/TENANT-RLS-RUNBOOK.md`.

Ba lớp phải khớp (xem `.agents/skills/zeplao-data-tenancy/SKILL.md`):

| Lớp | Thành phần | Trạng thái |
|---|---|---|
| 1. Application context | `common/tenant/tenant-context.service.ts` (AsyncLocalStorage), `tenant-context.interceptor.ts`, `request-tenant-context.ts` (super_admin phải impersonate bằng `x-tenant-id`), `tenant-background.ts` (`runInTenant` / `forEachTenant` cho cron + BullMQ) | ✅ đang chạy |
| 2. Transaction context | `tenant-connection.interceptor.ts` — bọc handler trong `runInTransaction` + `set_config('app.current_tenant')`; `tenant-transaction.ts` `applyTenantToConnection` cho `createQueryRunner` (typeorm-transactional KHÔNG vá đường này) | ⚙️ chỉ chạy khi `TENANT_RLS_ENABLED=true` |
| 3. Database enforcement | Pha A `db/2026-06-26_tenant_phaseA_add_tenant_id.sql` (thêm cột) → role NOSUPERUSER `db/2026-06-26_tenant_app_role.sql` → Pha B `..._phaseB_enable_rls.sql` (RLS + FORCE + policy + trigger); `rls-manifest.ts` + `rls-preflight.ts` chặn boot nếu catalog lệch manifest | ⛔ CHƯA flip trên môi trường đang chạy |

Bảng có hàng **baseline `tenant_id IS NULL`** dùng chung: `method_capabilities`,
`tenant_app_scopes` — có policy read/write riêng, KHÔNG đưa vào loop `SET NOT NULL`/trigger.

Lưới an toàn khi RLS chưa flip: `common/tenant/tenant-sql.ts` (`tenantSqlScope` /
`tenantQbCondition`) — **fail-closed** khi không có tenant context, `bypass` phải tường minh.

CI có job riêng `rls-e2e` (Postgres 16 + role NOSUPERUSER) chứng minh cô lập chéo tenant thật.

> 🔓 Muốn flip RLS: theo `TENANT-RLS-RUNBOOK.md`. Điều kiện tiên quyết còn hở tại 2026-08-29:
> app đang nối bằng superuser (`DB_USERNAME=postgres`), quy ước `OR tenant_id IS NULL` chưa gỡ
> (spec `tenant-data-isolation` task 26 + 32), và cần đếm lại số hàng `tenant_id IS NULL`.

---

## 6. ⚠️ Cảnh báo bảo mật (cập nhật 2026-08-29 sau audit toàn diện)

1. ~~**`admin-password.txt`** chứa mật khẩu admin plaintext~~ ✅ **ĐÃ XỬ LÝ**: file không còn tồn
   tại; `seedAdmin()` fail-fast đòi `ADMIN_DEFAULT_PASSWORD`, không ghi credential ra đĩa.
1b. ~~`GET /api/v1/dashboard/kpi|activity-hourly|trends` **không có guard**~~ ✅ **ĐÃ SỬA**
   (2026-08-29): `DashboardController` nay có `AuthGuard('jwt')` ở cấp class + service lọc tenant.
   Comment cũ "Public endpoint — called by PricingPrint dashboard" là tàn dư app PHP đã decommission.
1c. ~~`/erp/dashboard`, `/erp/stats`, PDF `site_settings` đọc chéo tenant~~ ✅ **ĐÃ SỬA** cùng đợt.
1d. `db/2026-06-26_tenant_app_role.sql` tạo role với mật khẩu mẫu trong repo — nay đã bị loại khỏi
   `apply-patches.js` (`EXCLUDED`); **phải đổi mật khẩu trước khi chạy tay**.
2. ~~**Phân quyền fail-open** trong `auth/jwt.strategy.ts`~~ ✅ **ĐÃ SỬA**: `validate()` query
   `public.role_permissions` bằng cú pháp Postgres (`$1`) khớp DB thật; nhánh `catch` set
   `permissions = []` (**fail-closed**, có comment rõ "grant nothing"), KHÔNG còn cấp `['*']` khi lỗi.
3. ~~**Entity `Material` trùng đôi**~~ ✅ **ĐÃ SỬA**: chỉ còn MỘT `@Entity('materials')` tại
   `src/entities/material.entity.ts` (đã verify bằng grep); bản pricing-local đã xóa.
4. **JWT lưu trong `localStorage`** (`frontend/src/lib/api.ts`, key `zh_token`) → bề mặt đánh cắp
   token qua XSS. Cân nhắc chuyển sang httpOnly cookie (task riêng — blast radius rộng FE/BE).

### Nợ kỹ thuật khác (audit 2026-06-20)

- ✅ Đã gỡ debug log ghi đĩa đồng bộ trong hot path `message-processor.service.ts`
  (`viewer.log` / `outbound.log` / `error.log` qua `fs.appendFileSync`).
- ✅ Đã xóa dead code: `quote/pricing.helper.ts` (không import ở đâu, trùng công thức với
  `PricingService`) và `suggestions/suggestions.service.ts` (không đăng ký provider/không inject).
- ✅ Đã vá 2 catch nuốt lỗi âm thầm trong `pricing-facade.service.ts`: tra `accessories` và
  `large_format_pricing` nay log lỗi; nhánh khổ lớn KHÔNG còn trả giá 0đ khi thiếu đơn giá m²
  (đổi sang `success:false` thay vì `subtotal = area × 0`).
- ⏳ TỒN ĐỌNG (cần eval, chưa sửa): nhánh agent trong `ai-suggest.service.ts` chạy 1 vòng LLM rồi
  chỉ dùng `toolCalls`, bỏ `agentResult.response`, sau đó gọi `callWithFallback` lần nữa để lấy
  JSON có cấu trúc. Đây là chủ đích (agent text ≠ schema JSON downstream cần) nên KHÔNG sửa mù —
  cần chạy `npm run eval:chat` trước khi tối ưu.

(Chi tiết đầy đủ xem báo cáo audit kèm theo.)
