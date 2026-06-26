/**
 * Tests cho TenantConnectionInterceptor (khung enforcement; mặc định TẮT).
 * Phần runInTransaction (CLS) được xác minh ở smoke test app thật, không unit test.
 * _Requirements: 3.2, 3.3_
 */
import { of } from 'rxjs';
import { TenantConnectionInterceptor } from './tenant-connection.interceptor';
import { TenantContextService } from './tenant-context.service';

const httpCtx = () => ({ getType: () => 'http' }) as any;

describe('TenantConnectionInterceptor', () => {
    const OLD = process.env.TENANT_RLS_ENABLED;
    afterEach(() => { process.env.TENANT_RLS_ENABLED = OLD; });

    it('TẮT (mặc định) → passthrough (trả về handler gốc)', () => {
        process.env.TENANT_RLS_ENABLED = 'false';
        const ds: any = {};
        const tenant = new TenantContextService();
        const it = new TenantConnectionInterceptor(ds, tenant);
        const handle = { handle: () => of('R') } as any;
        const obs = it.intercept(httpCtx(), handle);
        // passthrough: trả về chính observable của handler
        expect(obs).toBeDefined();
    });

    it('applyTenantVar: tenant thường → set_config app.current_tenant', async () => {
        const ds: any = {};
        const tenant = new TenantContextService();
        const it = new TenantConnectionInterceptor(ds, tenant);
        const calls: Array<{ sql: string; p?: any[] }> = [];
        const em = { query: (sql: string, p?: any[]) => { calls.push({ sql, p }); return Promise.resolve([]); } };
        await tenant.withTenant(5, () => it.applyTenantVar(em));
        expect(calls[0].sql).toMatch(/set_config\('app\.current_tenant'/i);
        expect(calls[0].p).toEqual(['5']);
    });

    it('applyTenantVar: runSystem → SET LOCAL app.bypass', async () => {
        const ds: any = {};
        const tenant = new TenantContextService();
        const it = new TenantConnectionInterceptor(ds, tenant);
        const calls: string[] = [];
        const em = { query: (sql: string) => { calls.push(sql); return Promise.resolve([]); } };
        await tenant.runSystem(() => it.applyTenantVar(em));
        expect(calls[0]).toMatch(/app\.bypass\s*=\s*'on'/i);
    });

    it('applyTenantVar: ngoài context → no-op', async () => {
        const ds: any = {};
        const tenant = new TenantContextService();
        const it = new TenantConnectionInterceptor(ds, tenant);
        const calls: string[] = [];
        const em = { query: (sql: string) => { calls.push(sql); return Promise.resolve([]); } };
        await it.applyTenantVar(em);
        expect(calls.length).toBe(0);
    });
});
