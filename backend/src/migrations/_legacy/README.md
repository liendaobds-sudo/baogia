# Migrations legacy (KHÔNG dùng)

`1777244292577-InitialSchema.sqlite.ts` là migration **chỉ dùng cú pháp SQLite**
(`integer PRIMARY KEY AUTOINCREMENT`, `datetime('now')`, `tinyint`) — **không hợp lệ
trên PostgreSQL** và **chưa từng chạy** trên DB Postgres (bảng `migrations` rỗng).

Đã đưa ra khỏi glob migration (`src/migrations/*`) để `migration:run` không gãy.
Giữ lại chỉ để tham chiếu lịch sử.

Nguồn sự thật của schema hiện tại = TypeORM entities + snapshot `backend/db/schema.postgres.sql`.
Xem `backend/db/README.md`.
