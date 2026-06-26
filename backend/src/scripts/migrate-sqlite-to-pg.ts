/**
 * SQLite → PostgreSQL Data Migration Script
 * Migrates data from both SQLite databases to PostgreSQL
 */
import * as Database from 'better-sqlite3';
import { Client } from 'pg';
import * as path from 'path';

const PG_CONFIG = {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'zeplao_erp',
};

async function migrate() {
    const pgClient = new Client(PG_CONFIG);
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');

    // ═══════════════════════════════════════════
    //  1. Migrate ERP data (erp-dev.sqlite → erp schema)
    // ═══════════════════════════════════════════
    const erpDbPath = path.resolve(__dirname, '..', '..', 'erp-dev.sqlite');
    console.log(`\n📦 Opening ERP SQLite: ${erpDbPath}`);
    
    let erpDb: Database.Database;
    try {
        erpDb = new Database(erpDbPath, { readonly: true });
    } catch (e) {
        console.error('❌ Cannot open ERP SQLite:', e.message);
        await pgClient.end();
        return;
    }

    // Get all tables in SQLite
    const erpTables = erpDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    console.log(`Found ${erpTables.length} tables in ERP SQLite`);

    // Tables to migrate (order matters for FK constraints)
    const erpMigrationOrder = [
        'material_categories', 'material_types', 'materials', 'paper_sizes',
        'print_types', 'printers', 'processing_options',
        'production_costs', 'pricing_config', 'pricing_tiers',
        'setup_fees', 'site_settings', 'system_settings',
        'customers', 'customer_price_groups',
        'unified_product_categories', 'unified_products',
        'product_categories', 'products', 'product_ai_fields', 'product_quote_configs',
        'units', 'large_format_pricing', 'processing_pricing',
        'quotes', 'quote_items', 'quote_versions',
        'inventory_slips', 'inventory_slip_items',
    ];

    for (const tableName of erpMigrationOrder) {
        await migrateTable(erpDb, pgClient, tableName, 'erp');
    }
    erpDb.close();

    // ═══════════════════════════════════════════
    //  2. Migrate Main data (zeplao-dev.sqlite → public schema)
    // ═══════════════════════════════════════════
    const mainDbPath = path.resolve(__dirname, '..', '..', 'zeplao-dev.sqlite');
    console.log(`\n📦 Opening Main SQLite: ${mainDbPath}`);
    
    let mainDb: Database.Database;
    try {
        mainDb = new Database(mainDbPath, { readonly: true });
    } catch (e) {
        console.error('❌ Cannot open Main SQLite:', e.message);
        await pgClient.end();
        return;
    }

    const mainMigrationOrder = [
        'users', 'channels', 'contacts', 'conversations', 'conversation_participants',
        'messages', 'notifications', 'audit_logs', 'canned_responses',
        'internal_notes', 'follow_ups', 'appointments',
        'ai_conversations', 'ai_suggestions',
        'kb_documents', 'kb_chunks',
        'quick_prices', 'quote_rules',
    ];

    for (const tableName of mainMigrationOrder) {
        await migrateTable(mainDb, pgClient, tableName, 'public');
    }
    mainDb.close();

    // ═══════════════════════════════════════════
    //  3. Reset sequences
    // ═══════════════════════════════════════════
    console.log('\n🔄 Resetting PostgreSQL sequences...');
    await resetSequences(pgClient, 'erp');
    await resetSequences(pgClient, 'public');

    await pgClient.end();
    console.log('\n✅ Migration complete!');
}

async function migrateTable(sqliteDb: Database.Database, pgClient: Client, tableName: string, schema: string) {
    try {
        // Check table exists in SQLite
        const exists = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
        if (!exists) {
            console.log(`  ⏭️  ${schema}.${tableName} — not in SQLite, skipping`);
            return;
        }

        // Check table exists in PostgreSQL
        const pgExists = await pgClient.query(
            `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)`,
            [schema, tableName]
        );
        if (!pgExists.rows[0].exists) {
            console.log(`  ⏭️  ${schema}.${tableName} — not in PostgreSQL, skipping`);
            return;
        }

        // Get rows from SQLite
        const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[];
        if (rows.length === 0) {
            console.log(`  ⏭️  ${schema}.${tableName} — empty, skipping`);
            return;
        }

        // Check if PostgreSQL table already has data
        const pgCount = await pgClient.query(`SELECT COUNT(*) as cnt FROM "${schema}"."${tableName}"`);
        if (parseInt(pgCount.rows[0].cnt) > 0) {
            console.log(`  ⚠️  ${schema}.${tableName} — already has ${pgCount.rows[0].cnt} rows, skipping`);
            return;
        }

        // Get PostgreSQL columns to know which columns exist
        const pgCols = await pgClient.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
            [schema, tableName]
        );
        const pgColNames = new Set(pgCols.rows.map((r: { column_name: string }) => r.column_name));

        // Filter to only columns that exist in both SQLite and PostgreSQL
        const sqliteCols = Object.keys(rows[0]);
        const commonCols = sqliteCols.filter(c => pgColNames.has(c));

        if (commonCols.length === 0) {
            console.log(`  ⚠️  ${schema}.${tableName} — no matching columns, skipping`);
            return;
        }

        // Batch insert
        const colList = commonCols.map(c => `"${c}"`).join(', ');
        let inserted = 0;

        // Disable triggers temporarily for speed
        await pgClient.query(`ALTER TABLE "${schema}"."${tableName}" DISABLE TRIGGER ALL`);

        for (const row of rows) {
            const values = commonCols.map(c => row[c] ?? null);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
            
            try {
                await pgClient.query(
                    `INSERT INTO "${schema}"."${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                    values
                );
                inserted++;
            } catch (e) {
                // Skip individual row errors (type mismatches, etc.)
                if (inserted === 0) {
                    console.log(`  ❌ ${schema}.${tableName} — insert error: ${e.message.substring(0, 80)}`);
                }
            }
        }

        await pgClient.query(`ALTER TABLE "${schema}"."${tableName}" ENABLE TRIGGER ALL`);
        console.log(`  ✅ ${schema}.${tableName} — ${inserted}/${rows.length} rows migrated`);

    } catch (e) {
        console.log(`  ❌ ${schema}.${tableName} — error: ${e.message.substring(0, 100)}`);
    }
}

async function resetSequences(pgClient: Client, schema: string) {
    try {
        const seqs = await pgClient.query(`
            SELECT s.relname as seq_name, t.relname as table_name, a.attname as column_name
            FROM pg_class s
            JOIN pg_namespace n ON n.oid = s.relnamespace
            JOIN pg_depend d ON d.objid = s.oid
            JOIN pg_class t ON t.oid = d.refobjid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
            WHERE s.relkind = 'S' AND n.nspname = $1
        `, [schema]);

        for (const seq of seqs.rows) {
            try {
                await pgClient.query(
                    `SELECT setval('"${schema}"."${seq.seq_name}"', COALESCE((SELECT MAX("${seq.column_name}") FROM "${schema}"."${seq.table_name}"), 1), true)`
                );
            } catch { /* skip if table is empty */ }
        }
        console.log(`  ✅ ${schema} — ${seqs.rows.length} sequences reset`);
    } catch (e) {
        console.log(`  ⚠️ ${schema} sequences: ${e.message.substring(0, 80)}`);
    }
}

migrate().catch(e => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
});
