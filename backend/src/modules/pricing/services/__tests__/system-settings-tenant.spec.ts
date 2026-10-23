import { SystemSettingsService } from '../system-settings.service';

/**
 * `setup_fees` — cô lập tenant + sửa lỗi placeholder (audit 2026-08-29).
 *
 * Ba defect được khoá ở đây:
 *  1. 🔴 `updateFee` đánh số placeholder `$4 … $15` nhưng chỉ truyền 12 tham số ⇒
 *     `PUT /erp/setup-fees/:id` LUÔN lỗi trên PostgreSQL. (Cùng họ lỗi đã sửa ở `saveInkCosts`
 *     và `saveProductionCosts` nhưng bỏ sót chỗ này.)
 *  2. Kiểm trùng `code` quét toàn bảng ⇒ chặn nghiệp vụ + rò sự tồn tại dữ liệu tenant khác.
 *  3. `INSERT` không gắn `tenant_id` ⇒ sinh hàng NULL mới mà mọi tenant đọc được; `UPDATE`/`DELETE`
 *     chỉ theo `id` ⇒ IDOR chéo tenant.
 *
 * Kiểm bằng cách bắt SQL + params thật service dựng, KHÔNG cần PostgreSQL.
 */
describe('SystemSettingsService — setup_fees tenant scoping', () => {
    type Captured = { sql: string; params: unknown[] };

    const build = (tenant?: { tenantId: number; bypass?: boolean }) => {
        const calls: Captured[] = [];
        const dataSource = {
            query: jest.fn((sql: string, params: unknown[] = []) => {
                calls.push({ sql, params });
                // SELECT dup → rỗng; SELECT existing/currval → 1 dòng.
                if (/SELECT id FROM setup_fees WHERE code/i.test(sql)) return Promise.resolve([]);
                if (/currval/i.test(sql)) return Promise.resolve([{ id: 1 }]);
                if (/^\s*SELECT \*/i.test(sql)) {
                    return Promise.resolve([{
                        id: 1, code: 'CTP1', name: 'CTP', fee_type: 'ctp', category: 'all',
                        price_per_unit: 0, price_per_side: 1000, price_fixed: 0,
                        paper_size_id: null, min_sheets: 0, description: '', is_active: true,
                    }]);
                }
                return Promise.resolve([]);
            }),
        };
        const svc = new SystemSettingsService(
            {} as never, {} as never, {} as never, {} as never,
            dataSource as never,
            (tenant ? { get: () => tenant } : undefined) as never,
        );
        return { svc, calls };
    };

    /** Số placeholder lớn nhất `$N` trong một câu SQL. */
    const maxPlaceholder = (sql: string): number => {
        const found: string[] = sql.match(/\$(\d+)/g) ?? [];
        return found.reduce<number>((m, s) => Math.max(m, Number(s.slice(1))), 0);
    };

    describe('updateFee — placeholder khớp số tham số', () => {
        it('mọi câu SQL có $N ≤ số tham số truyền vào (chống lỗi bind)', async () => {
            const { svc, calls } = build({ tenantId: 7 });
            await svc.updateFee('1', { name: 'CTP mới' });
            expect(calls.length).toBeGreaterThan(0);
            for (const c of calls) {
                expect(maxPlaceholder(c.sql)).toBeLessThanOrEqual(c.params.length);
            }
        });

        it('câu UPDATE đánh số liên tục từ $1 (không bỏ khoảng)', async () => {
            const { svc, calls } = build({ tenantId: 7 });
            await svc.updateFee('1', { name: 'CTP mới' });
            const upd = calls.find((c) => /UPDATE setup_fees/i.test(c.sql))!;
            const used = new Set((upd.sql.match(/\$(\d+)/g) ?? []).map((s) => Number(s.slice(1))));
            for (let i = 1; i <= upd.params.length; i++) expect(used.has(i)).toBe(true);
        });

        it('UPDATE có ràng buộc tenant', async () => {
            const { svc, calls } = build({ tenantId: 7 });
            await svc.updateFee('1', { name: 'x' });
            const upd = calls.find((c) => /UPDATE setup_fees/i.test(c.sql))!;
            expect(upd.sql).toContain('tenant_id');
            expect(upd.params).toContain(7);
        });
    });

    describe('createFee', () => {
        it('kiểm trùng code CHỈ trong tenant hiện hành', async () => {
            const { svc, calls } = build({ tenantId: 7 });
            await svc.createFee({ code: 'ctp1', name: 'CTP', fee_type: 'ctp' });
            const dup = calls.find((c) => /SELECT id FROM setup_fees WHERE code/i.test(c.sql))!;
            expect(dup.sql).toContain('tenant_id');
            expect(dup.params).toEqual(['CTP1', 7]);
        });

        it('INSERT gắn tenant_id (không sinh hàng NULL mới)', async () => {
            const { svc, calls } = build({ tenantId: 7 });
            await svc.createFee({ code: 'ctp2', name: 'CTP', fee_type: 'ctp' });
            const ins = calls.find((c) => /INSERT INTO setup_fees/i.test(c.sql))!;
            expect(ins.sql).toContain('tenant_id');
            expect(ins.params).toContain(7);
            expect(maxPlaceholder(ins.sql)).toBe(ins.params.length);
        });

        it('bypass ⇒ INSERT giữ nguyên hình dạng cũ (không cột tenant_id)', async () => {
            const { svc, calls } = build({ tenantId: 7, bypass: true });
            await svc.createFee({ code: 'ctp3', name: 'CTP', fee_type: 'ctp' });
            const ins = calls.find((c) => /INSERT INTO setup_fees/i.test(c.sql))!;
            expect(ins.sql).not.toContain('tenant_id');
            expect(maxPlaceholder(ins.sql)).toBe(ins.params.length);
        });
    });

    describe('deleteFee / findFeeById', () => {
        it('DELETE có ràng buộc tenant (chống IDOR)', async () => {
            const { svc, calls } = build({ tenantId: 7 });
            await svc.deleteFee('1');
            expect(calls[0].sql).toContain('DELETE FROM setup_fees');
            expect(calls[0].sql).toContain('tenant_id');
            expect(calls[0].params).toEqual(['1', 7]);
        });

        it('KHÔNG có tenant context ⇒ fail-closed, không mở toàn bảng', async () => {
            const { svc, calls } = build(undefined);
            await svc.deleteFee('1');
            expect(calls[0].sql).toContain('AND 1 = 0');
        });

        it('findFeeById lọc theo tenant', async () => {
            const { svc, calls } = build({ tenantId: 9 });
            await svc.findFeeById('5');
            expect(calls[0].sql).toContain('sf.tenant_id');
            expect(calls[0].params).toEqual(['5', 9]);
        });
    });
});
