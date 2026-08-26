/**
 * apply-patches — Áp các patch SQL trong `db/` theo thứ tự, CÓ GHI NHẬN trạng thái.
 *
 * VẤN ĐỀ ĐÃ GIẢI QUYẾT (audit 2026-07-25):
 *   Snapshot `db/schema.postgres.sql` được sinh 2026-06-25, nhưng sau đó có ~23 file
 *   `db/*.sql` (+ `migrations/*.sql`) được áp TAY, không nằm trong bất kỳ đường tự động nào;
 *   bảng `migrations` của TypeORM rỗng và glob migration không khớp file nào. Hệ quả:
 *     • Không có cách nào biết một môi trường đã áp tới patch nào.
 *     • Dựng DB mới theo runbook (bootstrap từ snapshot) sẽ THIẾU cột/bảng mà code đang dùng
 *       (vd `quotes.customer_email`, `quotes.customer_contact`, `tenant_id` ~30 bảng,
 *       `tenant_app_scopes`, `pricing_config.value_text`) ⇒ POST /erp/orders vỡ ⇒ mất hẳn
 *       tính năng báo giá.
 *
 * CÁCH LÀM: bảng sổ `schema_patches(filename PK, checksum, applied_at)`. Mỗi file .sql trong
 * `db/` (trừ snapshot + file bị loại tường minh) là một patch, áp trong transaction riêng,
 * ghi sổ khi thành công. Patch trong repo đều viết idempotent (IF NOT EXISTS / WHERE NOT EXISTS),
 * nên áp lại trên DB đã có sẵn là an toàn.
 *
 * DÙNG:
 *   node db/apply-patches.js --dry-run     # chỉ liệt kê patch chưa áp (KHÔNG ghi gì)
 *   node db/apply-patches.js               # áp các patch chưa áp
 *   node db/apply-patches.js --mark-only   # ghi sổ TẤT CẢ patch là "đã áp" mà KHÔNG chạy SQL
 *                                          # → dùng MỘT LẦN trên DB hiện hành (đã áp tay) để
 *                                          #   thiết lập đường cơ sở, tránh chạy lại patch cũ.
 *
 * ⚠️ Trên DB production: chạy `--dry-run` trước, backup, rồi mới áp. Các patch RLS Pha A/B và
 *    seed dữ liệu KHÔNG nằm trong danh sách tự động (xem EXCLUDED bên dưới) vì cần thao tác
 *    có kiểm soát theo TENANT-RLS-RUNBOOK.md.
 */
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/**
 * Patch KHÔNG áp tự động (cần phiên có kiểm soát / không phải thay đổi schema thuần):
 *  - snapshot schema (dùng bootstrap-schema.js cho DB rỗng)
 *  - Pha A/B của RLS: đổi NOT NULL + policy + cần role NOSUPERUSER (xem TENANT-RLS-RUNBOOK.md)
 *  - seed dữ liệu mẫu/giả: không phải schema, có thể làm sai số liệu nghiệp vụ
 */
const EXCLUDED = new Set([
  'schema.postgres.sql',
  '2026-06-26_tenant_phaseA_add_tenant_id.sql',
  '2026-06-26_tenant_phaseB_enable_rls.sql',
  '2026-07-06_seed_fake_pricing.sql',
  '2026-07-09_backfill_null_tenant.sql',
  // Index hiệu năng: KHÔNG áp qua đường này.
  // Lý do: (1) trên bảng đã lớn cần `CREATE INDEX CONCURRENTLY`, mà CONCURRENTLY KHÔNG chạy
  // được trong transaction (script này bọc mỗi patch trong BEGIN/COMMIT); (2) đã xác minh
  // 2026-07-25 rằng file 2026-07-12 CHƯA được áp trên DB thật, nên nếu để trong danh sách thì
  // `--mark-only` sẽ đánh dấu sai là "đã áp" và index sẽ không bao giờ được tạo.
  // → Áp thủ công trong maintenance window, xem hướng dẫn trong chính 2 file này.
  '2026-07-12_perf_indexes_quotes.sql',
  '2026-07-25_perf_indexes_audit.sql',
]);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function listPatches() {
  return fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
    .sort(); // tên file có tiền tố ngày (YYYY-MM-DD) ⇒ sort = thứ tự thời gian
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const markOnly = process.argv.includes('--mark-only');

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

  // `--dry-run` phải THUẦN ĐỌC: không tạo cả bảng sổ. Nếu bảng chưa tồn tại thì coi như
  // chưa có patch nào được ghi nhận.
  let appliedMap = new Map();
  if (dryRun) {
    const { rows: exists } = await c.query("SELECT to_regclass('public.schema_patches') AS t");
    if (exists[0]?.t) {
      const { rows } = await c.query('SELECT filename, checksum FROM schema_patches');
      appliedMap = new Map(rows.map((r) => [r.filename, r.checksum]));
    } else {
      console.log('(chưa có bảng schema_patches — sẽ được tạo ở lần chạy thật)');
    }
  } else {
    await c.query(`
      CREATE TABLE IF NOT EXISTS schema_patches (
        filename   text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        marked_only boolean NOT NULL DEFAULT false
      )
    `);
    const { rows } = await c.query('SELECT filename, checksum FROM schema_patches');
    appliedMap = new Map(rows.map((r) => [r.filename, r.checksum]));
  }

  const patches = listPatches();
  const pending = patches.filter((f) => !appliedMap.has(f));

  // Cảnh báo nếu nội dung patch đã áp bị sửa sau đó (mất tính tái lập).
  for (const f of patches) {
    const known = appliedMap.get(f);
    if (!known) continue;
    const now = sha256(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    if (known !== now) {
      console.warn(`⚠️  ${f}: nội dung ĐÃ ĐỔI sau khi áp (sổ=${known}, hiện tại=${now}).`);
    }
  }

  console.log(`Tổng patch: ${patches.length} | đã áp: ${patches.length - pending.length} | chờ áp: ${pending.length}`);
  if (pending.length === 0) {
    console.log('✅ Không có patch nào cần áp.');
    await c.end();
    return;
  }
  pending.forEach((f) => console.log(`  • ${f}`));

  if (dryRun) {
    console.log('\n(--dry-run) Không thực thi gì.');
    await c.end();
    return;
  }

  for (const f of pending) {
    const sql = fs.readFileSync(path.join(__dirname, f), 'utf8');
    const checksum = sha256(sql);

    if (markOnly) {
      await c.query(
        'INSERT INTO schema_patches(filename, checksum, marked_only) VALUES ($1, $2, true) ON CONFLICT (filename) DO NOTHING',
        [f, checksum],
      );
      console.log(`📝 ghi sổ (không chạy): ${f}`);
      continue;
    }

    // Mỗi patch một transaction: lỗi ở patch nào thì dừng ngay, các patch trước vẫn được ghi sổ.
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query(
        'INSERT INTO schema_patches(filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()',
        [f, checksum],
      );
      await c.query('COMMIT');
      console.log(`✅ áp xong: ${f}`);
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      console.error(`❌ LỖI ở ${f}: ${e.message}`);
      console.error('   Đã rollback patch này. Sửa file rồi chạy lại; các patch trước vẫn giữ.');
      await c.end();
      process.exit(3);
    }
  }

  console.log('\n✅ Hoàn tất.');
  await c.end();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
