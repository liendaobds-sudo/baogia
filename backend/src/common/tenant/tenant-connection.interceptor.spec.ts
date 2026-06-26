/**
 * Tests cho TenantConnectionInterceptor (khung enforcement đọc; mặc định TẮT).
 * _Requirements: 3.2, 3.3_
 */
import { lastValueFrom, of } from 'rxjs';
import { TenantConnectionInterceptor } from './tenant-connection.interceptor';
import { TenantContextService } from './tenant-context.service';

function httpCtx() {
    return { getType: () => 'http' } as any;
}
function fakeQr() {
    const calls: string[] = [];
    return {
        calls,
        connect: jest.fn(),
        startTransaction: jest.fn(),
        query: jest.fn((sql: string) => { calls.push(sql); return Promise.resolve([]); }),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: { __isManager: true },
    };
}

describe('TenantConnectionInterceptor', () => {
    const OLD = process.env.TENANT_RLS_ENABLED;
    afterEach(() => { process.env.TENANT_RLS_ENABLED = OLD; });

    it('TẮT (mặc định) → passthrough, KHÔNG mở queryRunner', async () => {
        process.env.TENANT_RLS_ENABLED = 'false';
        const ds: any = { createQueryRunner: jest.fn() };
        const tenant = new TenantContextService();
        const it = new TenantConnectionInterceptor(ds, tenant);
        const out = await lastValueFrom(
            await Promise.resolve(it.intercept(httpCtx(), { handle: () => of('R') } as any)),
        );
        expect(out).toBe('R');
        expect(ds.createQueryRunner).not.toHaveBeenCalled();
    });

    it('BẬT + có context → mở transaction, set_config, attach manager, commit', async () => {
        process.env.TENANT_RLS_ENABLED = 'true';
        const qr = fakeQr();
        const ds: any = { createQueryRunner: () => qr };
        const tenant = new TenantContextService();

        const result = await tenant.withTenant(9, async () => {
            const it = new TenantConnectionInterceptor(ds, tenant);
            const obs = it.intercept(httpCtx(), {
                handle: () => of('OK'),
            } as any);
            return lastValueFrom(obs);
        });

        expect(result).toBe('OK');
        expect(qr.startTransaction).toHaveBeenCalled();
        expect(qr.calls.some(s => /set_config\('app\.current_tenant'/.test(s))).toBe(true);
        expect(qr.commitTransaction).toHaveBeenCalled();
        expect(qr.release).toHaveBeenCalled();
    });
});
