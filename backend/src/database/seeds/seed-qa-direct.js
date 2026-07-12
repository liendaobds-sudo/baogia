/**
 * Seed Q&A (canned_responses) TRỰC TIẾP vào PostgreSQL — KHÔNG qua API/login.
 *
 * Đọc các mảng Q&A từ những file seed hiện có (seed-qa-*.js), gộp + khử trùng theo `title`,
 * rồi INSERT idempotent vào bảng `canned_responses` (bỏ qua title đã tồn tại).
 *
 * Dùng khi cần khôi phục bộ mẫu Trả lời nhanh mà không phụ thuộc backend đang chạy / tài
 * khoản admin. Kết nối DB lấy từ backend/.env (DB_* ).
 *
 * Run:  node src/database/seeds/seed-qa-direct.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Nạp .env của backend (không phụ thuộc thứ tự thư mục).
try { require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); } catch { /* dotenv optional */ }

const SEED_FILES = ['seed-qa-templates.js', 'seed-qa-v2.js', 'seed-qa-v3.js', 'seed-qa-compare.js'];

/**
 * Trích mảng literal `const QA... = [ ... ];` từ text nguồn mà KHÔNG thực thi phần
 * seed()/network. Bracket-matching có nhận biết chuỗi (', ", `) để không bị nhiễu bởi
 * ký tự [ ] nằm trong nội dung.
 */
function extractArray(src) {
    const m = src.match(/const\s+QA(?:_TEMPLATES)?\s*=\s*/);
    if (!m) return [];
    let i = src.indexOf('[', m.index);
    if (i < 0) return [];
    const start = i;
    let depth = 0, str = null, esc = false;
    for (; i < src.length; i++) {
        const ch = src[i];
        if (str) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === str) str = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { str = ch; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') { depth--; if (depth === 0) { i++; break; } }
    }
    const literal = src.slice(start, i);
    // Data thuần từ chính source của dự án → eval an toàn trong phạm vi script seed.
    // eslint-disable-next-line no-new-func
    return new Function('return ' + literal)();
}

function loadAllQA() {
    const byTitle = new Map();
    for (const f of SEED_FILES) {
        const p = path.join(__dirname, f);
        if (!fs.existsSync(p)) { console.log(`⏭️  Bỏ qua (không có): ${f}`); continue; }
        let arr = [];
        try { arr = extractArray(fs.readFileSync(p, 'utf-8')); }
        catch (e) { console.log(`⚠️  Lỗi trích ${f}: ${e.message}`); continue; }
        let n = 0;
        for (const qa of arr) {
            if (!qa || !qa.title || !qa.content) continue;
            if (!byTitle.has(qa.title)) { byTitle.set(qa.title, qa); n++; }
        }
        console.log(`📄 ${f}: ${arr.length} mẫu (mới: ${n})`);
    }
    return [...byTitle.values()];
}

function dbConfig() {
    return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'zeplao_erp',
    };
}

async function main() {
    const items = loadAllQA();
    console.log(`\n🧩 Tổng mẫu duy nhất: ${items.length}`);
    if (items.length === 0) { console.log('Không có mẫu để nạp.'); return; }

    const client = new Client(dbConfig());
    await client.connect();
    try {
        // tenant mặc định (nhỏ nhất) để gán tenant_id; fallback NULL nếu bảng tenants trống.
        let tenantId = null;
        try {
            const tr = await client.query('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
            tenantId = tr.rows[0]?.id ?? null;
        } catch { /* bảng tenants có thể không có → để NULL */ }

        // Bảng có cột tenant_id không? (Pha A). Nếu không thì INSERT không kèm cột đó.
        const colCheck = await client.query(
            "SELECT 1 FROM information_schema.columns WHERE table_name='canned_responses' AND column_name='tenant_id'",
        );
        const hasTenantCol = colCheck.rowCount > 0;

        let created = 0, skipped = 0;
        for (const qa of items) {
            const title = String(qa.title).slice(0, 100);
            const exists = await client.query('SELECT 1 FROM canned_responses WHERE title = $1 LIMIT 1', [title]);
            if (exists.rowCount > 0) { skipped++; continue; }

            const category = String(qa.category || 'chung').slice(0, 50);
            const triggerKeywords = String(qa.triggerKeywords || '');
            const autoReply = qa.autoReply === true;

            if (hasTenantCol) {
                await client.query(
                    `INSERT INTO canned_responses (title, content, category, shortcut, is_global, trigger_keywords, auto_reply, tenant_id)
                     VALUES ($1,$2,$3,'/',true,$4,$5,$6)`,
                    [title, String(qa.content), category, triggerKeywords, autoReply, tenantId],
                );
            } else {
                await client.query(
                    `INSERT INTO canned_responses (title, content, category, shortcut, is_global, trigger_keywords, auto_reply)
                     VALUES ($1,$2,$3,'/',true,$4,$5)`,
                    [title, String(qa.content), category, triggerKeywords, autoReply],
                );
            }
            created++;
        }
        const total = await client.query('SELECT count(*)::int AS n FROM canned_responses');
        console.log(`\n🎉 Xong! Tạo mới: ${created}, bỏ qua (đã có): ${skipped}. Tổng trong DB: ${total.rows[0].n} (tenant_id=${tenantId})`);
    } finally {
        await client.end();
    }
}

main().catch((e) => { console.error('❌ Lỗi seed:', e.message); process.exit(1); });
