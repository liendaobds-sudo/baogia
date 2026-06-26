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
| `db/schema.postgres.sql` | Snapshot DDL đầy đủ (tables, sequences, PK/UNIQUE/FK/CHECK, indexes) sinh từ DB Postgres thật bằng chính các hàm DDL của Postgres (`format_type`, `pg_get_constraintdef`, `pg_indexes`). Dùng để dựng lại schema cho môi trường mới. |
| `db/bootstrap-schema.js` | Áp `schema.postgres.sql` vào **DB rỗng** (có guard từ chối nếu đã có bảng nghiệp vụ). |
| `db/2026-06-19_binding_ink_tables.sql` | Patch bảng `binding_types` / `ink_costs` (idempotent). |
| `src/migrations/_legacy/` | Migration cũ **chỉ dùng cú pháp SQLite**, KHÔNG hợp lệ cho Postgres và chưa từng chạy. Đã đưa ra khỏi glob migration để `migration:run` không gãy. Giữ lại làm tham chiếu lịch sử. |

## Dựng lại schema cho môi trường mới (Postgres)

```bash
# 1. Tạo DB rỗng
createdb zeplao_erp        # hoặc CREATE DATABASE zeplao_erp;

# 2. Áp schema snapshot (chỉ chạy trên DB rỗng)
cd backend
node db/bootstrap-schema.js

# 3. (tuỳ) patch bảng phụ + seed master data
#    psql ... -f db/2026-06-19_binding_ink_tables.sql
#    node src/database/seeds/...   (theo nhu cầu)
```

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
