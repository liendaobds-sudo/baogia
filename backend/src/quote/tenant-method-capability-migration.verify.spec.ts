import * as fs from 'fs';
import * as path from 'path';

/**
 * Xác minh migration tenant-method-capability an toàn & idempotent (Task 2.3).
 *
 * Migration dùng cú pháp PostgreSQL (ADD COLUMN IF NOT EXISTS + partial unique index),
 * không chạy được trên SQLite in-memory → kiểm TĨNH theo mẫu `rls-coverage.guard.spec.ts`:
 *  - Có guard idempotent trên cả ALTER COLUMN và CREATE INDEX.
 *  - Partial index đúng điều kiện `tenant_id IS NOT NULL`.
 *  - KHÔNG backfill (không INSERT/UPDATE/DELETE) → tenant hiện hữu kế thừa baseline (Req 7.3).
 *
 * _Requirements: 7.1, 7.2, 7.3, 7.5_
 */
const MIGRATION_PATH = path.resolve(
    __dirname,
    '../../db/2026-07-01_tenant_method_capability.sql',
);

describe('tenant-method-capability migration — an toàn & idempotent', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    const norm = sql.replace(/\s+/g, ' ').toLowerCase();

    it('thêm cột tenant_id có guard IF NOT EXISTS (idempotent)', () => {
        expect(norm).toContain(
            'alter table method_capabilities add column if not exists tenant_id integer',
        );
    });

    it('tạo partial unique index có guard IF NOT EXISTS (idempotent)', () => {
        expect(norm).toContain(
            'create unique index if not exists uq_method_cap_tenant_method',
        );
        expect(norm).toContain('(tenant_id, method_id)');
        expect(norm).toContain('where tenant_id is not null');
    });

    it('KHÔNG backfill / không đổi dữ liệu (tương thích ngược — tenant kế thừa baseline)', () => {
        expect(/insert\s+into/i.test(sql)).toBe(false);
        expect(/update\s+method_capabilities/i.test(sql)).toBe(false);
        expect(/delete\s+from/i.test(sql)).toBe(false);
    });

    it('bọc trong transaction (BEGIN/COMMIT)', () => {
        expect(/begin;/i.test(sql)).toBe(true);
        expect(/commit;/i.test(sql)).toBe(true);
    });
});
