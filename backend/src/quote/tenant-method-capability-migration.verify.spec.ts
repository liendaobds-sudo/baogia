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

    it('KHÔNG seed/xóa dữ liệu (không INSERT/DELETE — tenant kế thừa baseline)', () => {
        expect(/insert\s+into/i.test(sql)).toBe(false);
        expect(/delete\s+from/i.test(sql)).toBe(false);
    });

    it('KHÔI PHỤC baseline: UPDATE duy nhất là đưa unit_id=default về tenant_id NULL (KHÔNG backfill sang tenant cụ thể)', () => {
        // Pha A từng backfill method_capabilities SET tenant_id = 1, phá baseline. Migration này
        // sửa lại: chỉ được UPDATE về NULL cho hàng default; TUYỆT ĐỐI không SET tenant_id = <số>.
        const updates = sql.match(/update\s+method_capabilities[^;]*/gi) || [];
        expect(updates.length).toBe(1);
        const upd = updates[0] ?? '';
        expect(/set\s+tenant_id\s*=\s*null/i.test(upd)).toBe(true);
        expect(/where\s+unit_id\s*=\s*'default'/i.test(upd)).toBe(true);
        // Không được có backfill dạng SET tenant_id = <số nguyên>.
        expect(/set\s+tenant_id\s*=\s*\d/i.test(sql)).toBe(false);
    });

    it('bọc trong transaction (BEGIN/COMMIT)', () => {
        expect(/begin;/i.test(sql)).toBe(true);
        expect(/commit;/i.test(sql)).toBe(true);
    });
});
