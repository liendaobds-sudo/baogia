/**
 * Tests cho tenantTransaction (G2 — helper, chưa bật RLS).
 * Xác minh: fail-loud khi thiếu context; set_config app.current_tenant cho tenant thường;
 * SET LOCAL app.bypass cho runSystem. _Requirements: 3.2, 2.4_
 */
import { tenantTransaction } from './tenant-transaction';
import { TenantContextService } from './tenant-context.service';

// DataSource giả: transaction(fn) chạy fn với EntityManager có query() mock.
function fakeDataSource() {
    const queries: Array<{ sql: string; params?: any[] }> = [];
    const em = { query: (sql: string, params?: any[]) => { queries.push({ sql, params }); return Promise.resolve([]); } };
    const dataSource: any = { transaction: (fn: any) => fn(em) };
    return { dataSource, queries };
}

describe('tenantTransaction', () => {
    let tenant: TenantContextService;
    beforeEach(() => { tenant = new TenantContextService(); });

    it('fail-loud khi không có tenant context', async () => {
        const { dataSource } = fakeDataSource();
        await expect(tenantTransaction(dataSource, tenant, async () => 'x')).rejects.toThrow(/tenant context/i);
    });

    it('tenant thường → set_config app.current_tenant = tenantId', async () => {
        const { dataSource, queries } = fakeDataSource();
        const out = await tenant.withTenant(5, () =>
            tenantTransaction(dataSource, tenant, async () => 'done'),
        );
        expect(out).toBe('done');
        expect(queries[0].sql).toMatch(/set_config\('app\.current_tenant'/i);
        expect(queries[0].params).toEqual(['5']);
    });

    it('runSystem → SET LOCAL app.bypass = on (không set current_tenant)', async () => {
        const { dataSource, queries } = fakeDataSource();
        await tenant.runSystem(() => tenantTransaction(dataSource, tenant, async () => 'ok'));
        expect(queries[0].sql).toMatch(/app\.bypass\s*=\s*'on'/i);
        expect(queries.some(q => /current_tenant/.test(q.sql))).toBe(false);
    });
});
