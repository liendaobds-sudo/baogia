# Database schema — nguồn sự thật & cách tái lập

## TL;DR

- **Nguồn sự thật của schema = TypeORM entities** (`src/entities/**` và `src/modules/pricing/entities/**`).
- Runtime: **PostgreSQL**, `synchronize: false` (xem `src/app.module.ts`).
- Schema Postgres production hiện tại được tạo bằng **`synchronize` MỘT LẦN** từ entities,
  rồi tắt đi. Bảng `migrations` **rỗng** → CHƯA từng chạy migration nào trên Postgres.
- Bản chụp schema tái lập (sinh từ DB thật): **`db/schema.postgres.sql`**.

## Các file

| File | Vai trò |
|---|---|
| `db/schema.postgres.sql` | Snapshot DDL đầy đủ (tables, sequences, PK/UNIQUE/FK/CHECK, indexes) sinh từ DB Postgres thật bằng chính các hàm DDL của Postgres (`format_type`, `pg_get_constraintdef`, `pg_indexes`). Dùng để dựng lại schema cho môi trường mới. **Snapshot hiện tại sinh 2026-06-25 ⇒ CHƯA gồm các patch sau ngày đó.** |
| `db/bootstrap-schema.js` | Áp `schema.postgres.sql` vào **DB rỗng** (có guard từ chối nếu đã có bảng nghiệp vụ). |
| `db/apply-patches.js` | **(mới 2026-07-25)** Áp các patch `db/*.sql` theo thứ tự tên file, ghi nhận vào bảng sổ `schema_patches`. Bắt buộc chạy sau `bootstrap-schema.js` khi dựng môi trường mới. |
| `db/2026-06-19_binding_ink_tables.sql` | Patch bảng `binding_types` / `ink_costs` (idempotent). |
| `src/migrations/_legacy/` | Migration cũ **chỉ dùng cú pháp SQLite**, KHÔNG hợp lệ cho Postgres và chưa từng chạy. Đã đưa ra khỏi glob migration để `migration:run` không gãy. Giữ lại làm tham chiếu lịch sử. |

## Dựng lại schema cho môi trường mới (Postgres)

> ⚠️ **BƯỚC 3 LÀ BẮT BUỘC.** Snapshot sinh 2026-06-25; sau đó có ~20 patch thêm cột/bảng mà
> code đang dùng. Bỏ bước 3 ⇒ `POST /erp/orders` (đường tạo báo giá DUY NHẤT còn sống) sẽ vỡ
> vì thiếu `quotes.customer_email` / `customer_contact` / `tenant_id`, và `GET /me/app-scope`
> vỡ vì thiếu bảng `tenant_app_scopes`.

```bash
# 1. Tạo DB rỗng
createdb zeplao_erp        # hoặc CREATE DATABASE zeplao_erp;
psql -d zeplao_erp -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;'

# 2. Áp schema snapshot (chỉ chạy trên DB rỗng)
cd backend
node db/bootstrap-schema.js

# 3. BẮT BUỘC — áp toàn bộ patch sau snapshot (ghi sổ vào bảng schema_patches)
node db/apply-patches.js --dry-run     # xem trước danh sách
node db/apply-patches.js

# 4. (tuỳ) seed master data
#    node src/database/seeds/...   (theo nhu cầu)

# 5. (chỉ khi bật multi-tenant) theo TENANT-RLS-RUNBOOK.md:
#    Pha A → tạo role NOSUPERUSER → Pha B → TENANT_RLS_ENABLED=true
#    (2 file Pha A/B bị loại khỏi apply-patches.js có chủ đích)
```

### Thiết lập đường cơ sở cho DB ĐANG CHẠY (làm MỘT LẦN)

DB hiện hành đã được áp patch bằng tay nên chưa có sổ. Ghi sổ mà không chạy lại SQL:

```bash
cd backend
node db/apply-patches.js --dry-run      # xem danh sách trước
node db/apply-patches.js --mark-only    # đánh dấu mọi patch hiện có là "đã áp"
```

> Đã xác minh 2026-07-25 trên DB thật: Pha A (`tenant_id` + `idx_*_tenant`) và toàn bộ patch
> cột (`quotes.customer_email/customer_contact/valid_until/delivery_time`, `tenant_app_scopes`…)
> **đã áp** ⇒ `--mark-only` là đúng cho DB này.

### Index hiệu năng — đường riêng, KHÔNG qua apply-patches

`2026-07-12_perf_indexes_quotes.sql` và `2026-07-25_perf_indexes_audit.sql` bị loại khỏi
`apply-patches.js` có chủ đích (xem `EXCLUDED`): `CREATE INDEX CONCURRENTLY` không chạy được
trong transaction, và đã xác minh **file 2026-07-12 CHƯA được áp** trên DB hiện hành.

Áp trong maintenance window (giờ thấp điểm), ngoài transaction:

```bash
psql -d zeplao_erp -f db/2026-07-12_perf_indexes_quotes.sql
psql -d zeplao_erp -f db/2026-07-25_perf_indexes_audit.sql
# kiểm tra: \di idx_quote*   và EXPLAIN ANALYZE theo hướng dẫn trong file
```

Từ sau đó, mỗi patch mới chỉ cần thêm file `db/YYYY-MM-DD_ten_patch.sql` (viết idempotent)
rồi chạy `node db/apply-patches.js`.

## Cập nhật snapshot sau khi đổi entity

Sau khi sửa entity và đồng bộ vào DB dev, regenerate snapshot từ DB thật:

```bash
cd backend
node db/dump-schema.js   # ghi đè db/schema.postgres.sql
```

> Lưu ý: `db/dump-schema.js` chỉ ĐỌC từ DB (read-only) rồi ghi file.

## Nợ kỹ thuật đã biết

- ~~**Entity trùng tên bảng**~~ ✅ **ĐÃ XỬ LÝ (2026-06-19)**: trước đây 5 bảng (`materials`,
  `paper_sizes`, `print_types`, `units`, `material_types`) có 2 entity ở `src/entities/` và
  `src/modules/pricing/entities/`. Bản pricing-local chỉ dùng làm KIỂU TypeScript — runtime đã
  luôn dùng bản canonical (vì `getRepositoryToken` keying theo TÊN class → trùng token, repo
  resolve về entity đăng ký trong `forFeature` = canonical). Đã xóa 5 file trùng, chuyển import
  sang canonical, và map property snake_case→camelCase trong `materials.service` (đồng thời sửa
  tham chiếu cột phantom `stock_quantity` → cột thật `stock`). `migration:generate` đã chạy lại
  được (trước đây gãy vì trùng `@Entity`).
- Vì dùng `synchronize` bootstrap thay cho migration, mọi thay đổi schema cần: (1) sửa entity,
  (2) áp vào DB (synchronize trên DB dev hoặc ALTER thủ công), (3) `node db/dump-schema.js` để
  cập nhật snapshot. Cần kỷ luật để snapshot không bị lệch entity.
