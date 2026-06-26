# ZeplaoPrint — Bản đồ cấu trúc & ghi chú (cập nhật 2026-06-15)

Tài liệu này mô tả cấu trúc **thực tế** của hệ ZeplaoPrint sau đợt dọn dẹp, để tránh
lẫn lộn giữa code đang chạy, code cũ, và script rác. Đọc file này trước khi sửa.

---

## 1. Phạm vi dự án (QUAN TRỌNG)

Repo `Pricing/` chứa **nhiều dự án độc lập**. Hệ đang phát triển là **ZeplaoPrint**:

| Thư mục | Vai trò | Trạng thái |
|---|---|---|
| `ZeplaoPrint/backend/` | NestJS API (:4000) — chatbot + pricing engine | ✅ ĐANG DÙNG |
| `ZeplaoPrint/frontend/` | Next.js — giao diện agent | ✅ ĐANG DÙNG |
| `Web/` | Storefront khách (React+Vite+Supabase) | ⛔ DỰ ÁN RIÊNG — ngoài phạm vi |
| `_legacy_php/` | ERP/PricingPrint bản PHP cũ | ⛔ CODE CŨ — không phát triển |

> Khi audit/sửa hệ ZeplaoPrint: **chỉ làm việc trong `ZeplaoPrint/`**. Bỏ qua `Web/` và `_legacy_php/`.

---

## 2. Ba bề mặt báo giá → một engine chung

Cả ba luồng báo giá đều đổ về **`PricingFacadeService`** (nguồn sự thật duy nhất cho công thức giá):

```
(1) Chatbot AI        quote/extractors → QuoteService.calculateFromParsed → calculateViaErp ─┐
    (text Zalo, regex)                                                                        │
(2) Mini báo giá      POST /quote/pricing-calc → QuoteService.calculateMiniQuote ─────────────┼─► PricingApiService
    (form, field ở mini-quote-fields.ts)                                                      │   → PricingFacadeService
(3) Báo giá chi tiết  POST /pricing/calculate → PricingFacadeService trực tiếp ───────────────┘   (offset/loose/box/
    (OffsetInput đầy đủ; CRUD/PDF/gửi qua QuoteController + quote-crud.service)                     large-format/bound)
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
| `backend/ai-config.json` | `suggestions.controller.ts` (runtime) | Config AI chatbot. Chứa API key → đã gitignore. |
| `backend/.env` | toàn app | Biến môi trường. Đã gitignore. |
| `backend/admin-password.txt` | sinh bởi `auth.service.seedAdmin()` | ⚠️ Xem mục Bảo mật. |

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
- Bản chụp schema tái lập (sinh trực tiếp từ DB thật, 64 bảng / 44 sequence / 137 constraint /
  31 index): **`backend/db/schema.postgres.sql`**. Công cụ: `db/dump-schema.js` (đọc),
  `db/bootstrap-schema.js` (dựng DB rỗng, có guard). Hướng dẫn đầy đủ: `backend/db/README.md`.
- Đã sửa `src/config/typeorm.config.ts`: env-driven (khớp app.module), thêm `schema: 'public'`,
  vá path SQLite fallback (`_backup/erp-dev.sqlite` → `_backup/zeplao-dev.sqlite`).
- **Nợ kỹ thuật còn lại**: ~~vài entity TRÙNG tên bảng~~ ✅ **ĐÃ XỬ LÝ (2026-06-19)**: đã hợp nhất
  5 entity trùng (`materials`, `paper_sizes`, `print_types`, `units`, `material_types`) về một bản
  canonical duy nhất ở `src/entities/` (xóa bản pricing-local, chuyển import, map snake→camelCase
  trong `materials.service`, sửa cột phantom `stock_quantity`→`stock`). `migration:generate` đã
  chạy lại được. Chi tiết: `backend/db/README.md`.

---

## 5. `_archive/` — khu lưu trữ rác (đã dọn 2026-06-15)

Script chẩn đoán/sửa-vá/test một lần, log cũ, dump debug đã được **di chuyển** (không xóa) vào:
- `backend/_archive/` (dev-scripts / debug-artifacts / old-logs)
- `ZeplaoPrint/_archive/dev-scripts/`

Không file nào trong `_archive/` được app/build tham chiếu. Cần lại thì move ngược ra.
`build` chỉ biên dịch `src/**/*` (theo `tsconfig.json`), nên các script gốc không ảnh hưởng.

> 📦 `backend/_archive/tenant-cleanup-backup-2026-06-19.json` — backup các record tenant + user đã xóa
> trong đợt consolidate single-schema (mục 4b). Giữ lại để hoàn tác nếu cần.

---

## 4b. Single-schema consolidation (2026-06-19)

DB từng có di sản **multi-tenant** dở dang: schema rỗng `tenant_hoanglong` (31 bảng, 0 dòng) +
3 record `tenants` lệch (schema_name trỏ `erp`/`tenant_phatdat` không tồn tại) + 1 test user
`admin@phatdat.vn`. `TenantSchemaMiddleware` (switch `search_path` theo JWT) đã TẮT từ trước.

Đã dọn về **single-schema `public`** (có backup, xem mục 5):
- `DROP SCHEMA tenant_hoanglong CASCADE`; xóa 2 tenant rác (#2 hoanglong, #3 phatdat) + test user.
- Chuẩn hóa tenant #1 (default) → `schema_name='public'`, status active.
- Code: `tenant.service.create` và `super-admin.service` không còn gán `tenant_<code>` / không
  provision schema riêng nữa → mọi tenant dùng chung `public`. `provisionTenantSchema` giữ lại
  (chưa gọi) để bật multi-tenant thật sau này.
- Trạng thái cuối: chỉ còn schema `public`; 1 tenant; 1 user `admin@zeplao.vn`.

> 🔓 Muốn bật multi-tenant thật trở lại: (1) gán `schemaName = tenant_<code>` + gọi
> `provisionTenantSchema()`, (2) bật `TenantSchemaMiddleware` trong `app.module.ts`,
> (3) đổi TypeORM `schema:'public'` sang động theo tenant.

---

## 6. ⚠️ Cảnh báo bảo mật (cập nhật 2026-06-20 sau audit trace-code)

1. **`admin-password.txt`** đang chứa mật khẩu admin dạng plaintext. Đã thêm vào `.gitignore`.
   👉 Sau khi xác nhận đã đổi mật khẩu admin, **xóa file này thủ công**. (CHƯA xử lý — vẫn còn rủi ro.)
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
