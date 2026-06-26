/**
 * Bootstrap schema cho DATABASE RỖNG (fresh setup) từ snapshot db/schema.postgres.sql.
 *
 * AN TOÀN: script TỪ CHỐI chạy nếu schema `public` đã có bảng nghiệp vụ (chỉ chấp nhận
 * DB trống hoặc chỉ có bảng `migrations`). KHÔNG dùng cho DB đang có dữ liệu.
 *
 * Dùng:
 *   node db/bootstrap-schema.js               # đọc .env (DB_HOST/PORT/USERNAME/PASSWORD/DATABASE)
 *   FORCE=1 node db/bootstrap-schema.js       # bỏ qua guard (tự chịu rủi ro)
 *
 * Sau khi bootstrap schema, seed dữ liệu master qua các script seed sẵn có.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  if ((process.env.DB_TYPE || 'sqlite') !== 'postgres') {
    console.error('DB_TYPE != postgres — script này chỉ dành cho PostgreSQL.');
    process.exit(1);
  }
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'zeplao_erp',
  });
  await c.connect();

  const { rows } = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'migrations'",
  );
  if (rows.length > 0 && process.env.FORCE !== '1') {
    console.error(`❌ Schema 'public' đã có ${rows.length} bảng nghiệp vụ → TỪ CHỐI để tránh phá dữ liệu.`);
    console.error('   Nếu chắc chắn muốn áp dụng (DB rỗng/throwaway), chạy lại với FORCE=1.');
    await c.end();
    process.exit(2);
  }

  const sqlPath = path.join(__dirname, 'schema.postgres.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`Áp dụng ${sqlPath} ...`);
  await c.query(sql);
  console.log('✅ Bootstrap schema xong.');
  await c.end();
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
