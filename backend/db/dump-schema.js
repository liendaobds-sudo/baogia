/**
 * Introspect schema `public` của PostgreSQL thật và xuất snapshot DDL chính xác,
 * dùng chính các hàm DDL của Postgres (format_type, pg_get_constraintdef, pg_indexes).
 * Output → db/schema.postgres.sql
 *
 * READ-ONLY với DB. Dùng: node db/dump-schema.js
 * Đọc kết nối từ backend/.env (DB_HOST/PORT/USERNAME/PASSWORD/DATABASE).
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'zeplao_erp',
};

async function main() {
  const c = new Client(cfg);
  await c.connect();

  const out = [];
  out.push('-- ============================================================');
  out.push('-- PostgreSQL schema snapshot (public) — ZeplaoPrint ERP');
  out.push('-- Sinh bởi backend/db/dump-schema.js (introspection từ DB thật).');
  out.push('-- NGUỒN SỰ THẬT = TypeORM entities; file này là bản chụp tái lập của');
  out.push('-- những gì `synchronize` đã tạo. Regenerate sau khi đổi entity.');
  out.push(`-- Generated at: ${new Date().toISOString()}`);
  out.push('-- ============================================================');
  out.push('');
  out.push('SET search_path TO public;');
  out.push('');

  const seqs = await c.query(`SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' ORDER BY sequence_name`);
  if (seqs.rows.length) {
    out.push('-- ─── Sequences ───');
    for (const s of seqs.rows) out.push(`CREATE SEQUENCE IF NOT EXISTS "${s.sequence_name}";`);
    out.push('');
  }

  const tables = await c.query(`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
    ORDER BY c.relname`);

  for (const t of tables.rows) {
    const table = t.relname;
    const cols = await c.query(`
      SELECT a.attname AS name,
             format_type(a.atttypid, a.atttypmod) AS type,
             a.attnotnull AS notnull,
             pg_get_expr(d.adbin, d.adrelid) AS def
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid = ('public.' || $1)::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`, [table]);

    const lines = cols.rows.map((col) => {
      let line = `  "${col.name}" ${col.type}`;
      if (col.def !== null) line += ` DEFAULT ${col.def}`;
      if (col.notnull) line += ' NOT NULL';
      return line;
    });
    out.push(`-- ─── Table: ${table} ───`);
    out.push(`CREATE TABLE IF NOT EXISTS "${table}" (`);
    out.push(lines.join(',\n'));
    out.push(');');
    out.push('');
  }

  const cons = await c.query(`
    SELECT con.conrelid::regclass::text AS tbl, con.conname AS name,
           pg_get_constraintdef(con.oid) AS def, con.contype AS type
    FROM pg_constraint con
    JOIN pg_namespace n ON n.oid=con.connamespace
    WHERE n.nspname='public'
    ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 ELSE 3 END, con.conrelid::regclass::text`);
  if (cons.rows.length) {
    out.push('-- ─── Constraints (PK / UNIQUE / CHECK / FK) ───');
    for (const k of cons.rows) out.push(`ALTER TABLE ${k.tbl} ADD CONSTRAINT "${k.name}" ${k.def};`);
    out.push('');
  }

  const idx = await c.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='public'
      AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace)
    ORDER BY tablename, indexname`);
  if (idx.rows.length) {
    out.push('-- ─── Indexes ───');
    for (const i of idx.rows) out.push(`${i.indexdef};`);
    out.push('');
  }

  const target = path.join(__dirname, 'schema.postgres.sql');
  fs.writeFileSync(target, out.join('\n'), 'utf8');
  console.log(`WROTE ${target}`);
  console.log(`tables=${tables.rows.length} sequences=${seqs.rows.length} constraints=${cons.rows.length} indexes=${idx.rows.length}`);
  await c.end();
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
