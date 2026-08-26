/**
 * Backfill material_name / paper_size_name cho quote_items thiếu tên
 * (báo giá digital lưu trước khi denormalize).
 *
 * Chạy: node db/2026-07-18_backfill_quote_item_names.js
 * (cwd = backend/, cần .env DB_*)
 */
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: +(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'zeplao_erp',
  });
  await c.connect();

  const mat = await c.query(`
    UPDATE quote_items qi
    SET material_name = m.name
    FROM materials m
    WHERE qi.material_id = m.id
      AND (qi.material_name IS NULL OR btrim(qi.material_name) = '')
    RETURNING qi.id
  `);
  console.log('material_name updated:', mat.rowCount);

  const paper = await c.query(`
    UPDATE quote_items qi
    SET paper_size_name = p.name
    FROM paper_sizes p
    WHERE qi.paper_size_id = p.id
      AND (qi.paper_size_name IS NULL OR btrim(qi.paper_size_name) = '')
    RETURNING qi.id
  `);
  console.log('paper_size_name updated:', paper.rowCount);

  // Enrich printing_detail.configParams.materialName nếu có material_id
  const items = await c.query(`
    SELECT qi.id, qi.material_id, qi.paper_size_id, qi.material_name, qi.paper_size_name, qi.printing_detail
    FROM quote_items qi
    WHERE qi.printing_detail IS NOT NULL
  `);
  let pdUpdated = 0;
  for (const row of items.rows) {
    let pd = row.printing_detail;
    if (typeof pd === 'string') {
      try { pd = JSON.parse(pd); } catch { continue; }
    }
    if (!pd || typeof pd !== 'object') continue;
    const cfg = { ...(pd.configParams || {}) };
    let dirty = false;
    if (row.material_name && !cfg.materialName) {
      cfg.materialName = row.material_name;
      dirty = true;
    }
    if (row.paper_size_name && !cfg.paperSizeName) {
      cfg.paperSizeName = row.paper_size_name;
      dirty = true;
    }
    if (!dirty) continue;
    pd.configParams = cfg;
    await c.query('UPDATE quote_items SET printing_detail = $1 WHERE id = $2', [
      JSON.stringify(pd),
      row.id,
    ]);
    pdUpdated++;
  }
  console.log('printing_detail.configParams enriched:', pdUpdated);

  await c.end();
  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
