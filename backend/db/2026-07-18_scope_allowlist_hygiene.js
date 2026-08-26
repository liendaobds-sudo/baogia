/**
 * Data hygiene — Phạm_Vi + Danh_Sách_Được_Phép (unified_products).
 *
 * 1) PRUNE: gỡ id ngoài phạm vi / orphan khỏi allowed_materials|paper_sizes|processing
 *    theo quote_type (loose|bound|large_format). Offset-type SP (to_roi…) bỏ qua.
 * 2) BACKFILL: SP digital còn allowlist rỗng → gán TẤT CẢ tài nguyên trong scope
 *    (materials substrate only; paper_sizes; processing active). Admin thu hẹp sau.
 * 3) LF paper_sizes: nếu 0 khổ có scope_large_format, bật cờ cho các khổ digital
 *    phổ biến (không đụng scope_offset-only) — LF thường dùng cuộn nhưng form vẫn
 *    có dropdown khổ ở vài màn.
 *
 * Idempotent. Dry-run: node ... --dry-run
 *
 * Run: node backend/db/2026-07-18_scope_allowlist_hygiene.js
 *      node backend/db/2026-07-18_scope_allowlist_hygiene.js --dry-run
 */

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

const DRY = process.argv.includes('--dry-run');
const PRINT_TYPES = new Set(['loose', 'bound', 'large_format']);

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const k = m[1];
        let v = m[2].replace(/^["']|["']$/g, '');
        if (process.env[k] === undefined) process.env[k] = v;
    }
}

function isOn(flag) {
    return flag === 1 || flag === true;
}

function inScope(row, productType) {
    if (productType === 'loose') return isOn(row.scope_loose);
    if (productType === 'bound') return isOn(row.scope_bound);
    if (productType === 'large_format') return isOn(row.scope_large_format);
    return false;
}

function parseJsonArray(val) {
    if (val == null) return [];
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        try {
            const p = JSON.parse(val);
            return Array.isArray(p) ? p.map(String) : [];
        } catch {
            return [];
        }
    }
    return [];
}

function sameIdList(a, b) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((x, i) => x === sb[i]);
}

async function main() {
    loadEnv();
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'zeplao_erp',
    });
    await client.connect();
    console.log(DRY ? '=== DRY-RUN ===' : '=== APPLY ===');

    const report = {
        prunedProducts: [],
        backfilledProducts: [],
        lfPaperUpdated: 0,
        dirtyBefore: 0,
        emptyBefore: { materials: 0, paper: 0, processing: 0 },
    };

    // ── Load master resources ──
    const { rows: materials } = await client.query(`
        SELECT id, name, category_tab,
               scope_loose, scope_bound, scope_large_format, scope_offset
        FROM materials
    `);
    const { rows: papers } = await client.query(`
        SELECT id, name,
               scope_loose, scope_bound, scope_large_format,
               COALESCE(scope_offset, false) AS scope_offset
        FROM paper_sizes
    `);
    const { rows: procs } = await client.query(`
        SELECT id, name, is_active,
               scope_loose, scope_bound, scope_large_format,
               COALESCE(scope_offset, false) AS scope_offset
        FROM processing_options
    `);

    const matById = new Map(materials.map((r) => [String(r.id), r]));
    const paperById = new Map(papers.map((r) => [String(r.id), r]));
    const procById = new Map(procs.map((r) => [String(r.id), r]));

    const substrateOf = (pt) =>
        materials
            .filter(
                (m) =>
                    inScope(m, pt) &&
                    (m.category_tab === 'substrate_sheet' || m.category_tab === 'substrate_roll'),
            )
            .map((m) => String(m.id));

    const papersOf = (pt) => papers.filter((p) => inScope(p, pt)).map((p) => String(p.id));

    const procsOf = (pt) =>
        procs
            .filter((p) => {
                // processing is_active: smallint 1 or boolean true; null → treat active if flag set
                const active =
                    p.is_active === 1 ||
                    p.is_active === true ||
                    p.is_active == null;
                return active && inScope(p, pt);
            })
            .map((p) => String(p.id));

    // ── 3) LF paper_sizes hygiene ──
    const lfPapers = papers.filter((p) => inScope(p, 'large_format'));
    if (lfPapers.length === 0) {
        // Bật scope_large_format cho khổ digital (không phải offset-only)
        const candidates = papers.filter(
            (p) =>
                !isOn(p.scope_offset) ||
                isOn(p.scope_loose) ||
                isOn(p.scope_bound),
        );
        // Prefer khổ đã có loose/bound digital
        const toEnable = candidates.filter(
            (p) => isOn(p.scope_loose) || isOn(p.scope_bound),
        );
        const ids = (toEnable.length ? toEnable : candidates).map((p) => p.id);
        console.log(
            `LF paper_sizes: 0 hiện có → sẽ bật scope_large_format cho ${ids.length} khổ digital:`,
            ids,
        );
        report.lfPaperUpdated = ids.length;
        // refresh in-memory (kể cả dry-run) để backfill LF paper dùng tập đúng
        for (const p of papers) {
            if (ids.includes(p.id)) p.scope_large_format = true;
        }
        if (!DRY && ids.length) {
            await client.query(
                `UPDATE paper_sizes SET scope_large_format = true, updated_at = NOW()
                 WHERE id = ANY($1)`,
                [ids],
            );
        }
    } else {
        console.log(`LF paper_sizes: đã có ${lfPapers.length} khổ — bỏ qua.`);
    }

    // ── Load products ──
    const { rows: products } = await client.query(`
        SELECT id, code, name_vi, quote_type,
               allowed_materials, allowed_paper_sizes, allowed_processing
        FROM unified_products
        WHERE is_active = true
        ORDER BY id
    `);

    function filterAllowed(ids, byId, productType) {
        const kept = [];
        const removed = [];
        for (const raw of ids) {
            const id = String(raw);
            const row = byId.get(id);
            if (!row || !inScope(row, productType)) {
                removed.push(id);
            } else {
                kept.push(id);
            }
        }
        return { kept, removed };
    }

    for (const p of products) {
        if (!PRINT_TYPES.has(p.quote_type)) {
            // offset / to_roi / hop_giay… — giữ allowed_* null theo design
            continue;
        }

        let mats = parseJsonArray(p.allowed_materials);
        let papersA = parseJsonArray(p.allowed_paper_sizes);
        let procsA = parseJsonArray(p.allowed_processing);

        if (mats.length === 0) report.emptyBefore.materials++;
        if (papersA.length === 0) report.emptyBefore.paper++;
        if (procsA.length === 0) report.emptyBefore.processing++;

        // PRUNE
        const mF = filterAllowed(mats, matById, p.quote_type);
        const pF = filterAllowed(papersA, paperById, p.quote_type);
        const rF = filterAllowed(procsA, procById, p.quote_type);

        const prunedAny =
            mF.removed.length + pF.removed.length + rF.removed.length > 0;
        if (prunedAny) {
            report.dirtyBefore +=
                mF.removed.length + pF.removed.length + rF.removed.length;
            report.prunedProducts.push({
                id: p.id,
                name: p.name_vi,
                type: p.quote_type,
                removed: {
                    materials: mF.removed,
                    paper_sizes: pF.removed,
                    processing: rF.removed,
                },
            });
        }

        mats = mF.kept;
        papersA = pF.kept;
        procsA = rF.kept;

        // BACKFILL empty lists with full in-scope set
        let backfilled = false;
        const fillNote = {};
        if (mats.length === 0) {
            const fill = substrateOf(p.quote_type);
            if (fill.length) {
                mats = fill;
                fillNote.materials = fill.length;
                backfilled = true;
            }
        }
        if (papersA.length === 0) {
            const fill = papersOf(p.quote_type);
            if (fill.length) {
                papersA = fill;
                fillNote.paper_sizes = fill.length;
                backfilled = true;
            }
        }
        if (procsA.length === 0) {
            const fill = procsOf(p.quote_type);
            if (fill.length) {
                procsA = fill;
                fillNote.processing = fill.length;
                backfilled = true;
            }
        }
        if (backfilled) {
            report.backfilledProducts.push({
                id: p.id,
                name: p.name_vi,
                type: p.quote_type,
                fill: fillNote,
            });
        }

        const origM = parseJsonArray(p.allowed_materials);
        const origP = parseJsonArray(p.allowed_paper_sizes);
        const origR = parseJsonArray(p.allowed_processing);
        const changed =
            !sameIdList(origM, mats) ||
            !sameIdList(origP, papersA) ||
            !sameIdList(origR, procsA);

        if (changed && !DRY) {
            // Cột allowed_* là TEXT (simple-json) — ghi chuỗi JSON, không cast jsonb.
            await client.query(
                `UPDATE unified_products SET
                    allowed_materials = $2,
                    allowed_paper_sizes = $3,
                    allowed_processing = $4,
                    updated_at = NOW()
                 WHERE id = $1`,
                [
                    p.id,
                    JSON.stringify(mats.map(String)),
                    JSON.stringify(papersA.map(String)),
                    JSON.stringify(procsA.map(String)),
                ],
            );
        }
    }

    // ── Summary ──
    console.log('\n--- PRUNED (out-of-scope / orphan) ---');
    console.log(`Sản phẩm bị prune: ${report.prunedProducts.length}`);
    for (const row of report.prunedProducts) {
        console.log(
            `  #${row.id} ${row.name} [${row.type}]`,
            JSON.stringify(row.removed),
        );
    }

    console.log('\n--- BACKFILL (empty → full in-scope) ---');
    console.log(`Sản phẩm backfill: ${report.backfilledProducts.length}`);
    for (const row of report.backfilledProducts) {
        console.log(
            `  #${row.id} ${row.name} [${row.type}]`,
            JSON.stringify(row.fill),
        );
    }

    console.log('\n--- COUNTS BEFORE (empty allowlists among digital SP) ---');
    console.log(report.emptyBefore);
    console.log(`LF paper_sizes updated: ${report.lfPaperUpdated}`);
    console.log(`Dirty id instances removed: ${report.dirtyBefore}`);

    // Verify after
    if (!DRY) {
        const { rows: verify } = await client.query(`
            SELECT quote_type,
                   COUNT(*)::int AS n,
                   COUNT(*) FILTER (
                     WHERE allowed_materials IS NOT NULL
                       AND jsonb_array_length(COALESCE(allowed_materials::jsonb,'[]'::jsonb)) > 0
                   )::int AS with_mat,
                   COUNT(*) FILTER (
                     WHERE allowed_paper_sizes IS NOT NULL
                       AND jsonb_array_length(COALESCE(allowed_paper_sizes::jsonb,'[]'::jsonb)) > 0
                   )::int AS with_paper,
                   COUNT(*) FILTER (
                     WHERE allowed_processing IS NOT NULL
                       AND jsonb_array_length(COALESCE(allowed_processing::jsonb,'[]'::jsonb)) > 0
                   )::int AS with_proc
            FROM unified_products
            WHERE is_active AND quote_type IN ('loose','bound','large_format')
            GROUP BY quote_type
            ORDER BY quote_type
        `);
        console.log('\n--- AFTER (digital products with non-empty allowlists) ---');
        console.table(verify);

        const { rows: lfP } = await client.query(`
            SELECT COUNT(*)::int AS n FROM paper_sizes WHERE scope_large_format = true
        `);
        console.log('paper_sizes.scope_large_format count:', lfP[0].n);
    }

    await client.end();
    console.log(DRY ? '\nDry-run xong — chưa ghi DB.' : '\nĐã ghi DB.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
