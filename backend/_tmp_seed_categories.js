const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// 6 danh mục theo NHÓM CÔNG DỤNG (độc lập với quote_type — quote_type lo phần engine/form).
const CATEGORIES = [
  { code: 'office',      name: 'Văn phòng & Nhận diện', icon: 'fa-id-card',  sort: 1 },
  { code: 'marketing',   name: 'Ấn phẩm quảng cáo',     icon: 'fa-bullhorn', sort: 2 },
  { code: 'packaging',   name: 'Bao bì & Tem nhãn',     icon: 'fa-box',      sort: 3 },
  { code: 'largeformat', name: 'In khổ lớn',            icon: 'fa-panorama', sort: 4 },
  { code: 'event',       name: 'Sự kiện',               icon: 'fa-ticket',   sort: 5 },
  { code: 'publishing',  name: 'Xuất bản phẩm',         icon: 'fa-book',     sort: 6 },
];

// Gán sản phẩm → danh mục
const ASSIGN = {
  office:      ['NC-001', 'VP-001', 'VP-002', 'VP-003', 'PF-001'],
  marketing:   ['FR-001', 'BR-001', 'CT-001', 'VC-001', 'MN-001'],
  packaging:   ['BB-001', 'BB-002', 'TM-001'],
  largeformat: ['KL-001', 'KL-002', 'KL-003', 'KL-004'],
  event:       ['SK-001', 'SK-002'],
  publishing:  ['SC-001', 'LI-001'],
};

(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres', password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'zeplao_erp',
  });
  await c.connect();

  // 1) Tạo danh mục cha (parent_id NULL)
  for (const cat of CATEGORIES) {
    await c.query(
      `INSERT INTO unified_product_categories (code, name_vi, icon, parent_id, sort_order, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, $4, true, NOW(), NOW())
       ON CONFLICT (code) DO UPDATE SET name_vi = EXCLUDED.name_vi, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, is_active = true`,
      [cat.code, cat.name, cat.icon, cat.sort],
    );
    console.log(`✓ Danh mục: ${cat.code} — ${cat.name}`);
  }

  // 2) Gán sản phẩm
  let n = 0;
  for (const [catCode, codes] of Object.entries(ASSIGN)) {
    const r = await c.query(
      `UPDATE unified_products SET parent_category_code = $1 WHERE code = ANY($2)`,
      [catCode, codes],
    );
    n += r.rowCount;
    console.log(`  → ${catCode}: gán ${r.rowCount} sản phẩm (${codes.join(', ')})`);
  }

  await c.end();
  console.log(`Done. ${CATEGORIES.length} danh mục, gán ${n} sản phẩm.`);
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
