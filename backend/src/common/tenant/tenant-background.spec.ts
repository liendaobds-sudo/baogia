/**
 * Tests cho tiện ích bọc tenant cho đường chạy nền (cron / BullMQ / zca-js).
 *
 * Chứng minh 2 tính chất then chốt của Task 3:
 *  - Flag TẮT (mặc định) → wrapper bị BỎ QUA hoàn toàn: chạy thẳng logic gốc, KHÔNG
 *    mở transaction, KHÔNG set biến phiên (hành vi byte-for-byte như cũ).
 *  - Flag BẬT → `withTenant` được gọi CHO TỪNG tenant, mỗi vòng set app.current_tenant.
 *
 * `runInTransaction` (CLS của typeorm-transactional) được mock để gọi thẳng callback —
 * phần transaction thật xác minh ở smoke test app thật (xem tenant-connection.interceptor.spec).
 *
 * _Requirements: 2.2, 4.1, 4.2_
 */
jest.mock('typeorm-transactional', () => ({
    runInTransaction: (fn: () => any) => fn(),
}));

import { forEachTenant, runInTenant, tenantRlsEnabled } from './tenant-background';
import { TenantContextService } from './tenant-context.service';

describe('tenant-background helpers', () => {
    const OLD = process.env.TENANT_RLS_ENABLED;
    afterEach(() => {
        if (OLD === undefined) delete process.env.TENANT_RLS_ENABLED;
        else process.env.TENANT_RLS_ENABLED = OLD;
        jest.restoreAllMocks();
    });

    const makeManager = (tenantRows: Array<{ id: number }> = []) => {
        const calls: Array<{ sql: string; p?: any[] }> = [];
        const manager = {
            query: jest.fn((sql: string, p?: any[]) => {
                calls.push({ sql, p });
                if (/FROM tenants/i.test(sql)) return Promise.resolve(tenantRows);
                return Promise.resolve([]);
            }),
        };
        return { manager, calls };
    };

    describe('forEachTenant (cron quét-nhiều-tenant)', () => {
        it('Flag TẮT → chạy fn MỘT lần, KHÔNG đụng manager, KHÔNG withTenant', async () => {
            process.env.TENANT_RLS_ENABLED = 'false';
            const tenant = new TenantContextService();
            const spy = jest.spyOn(tenant, 'withTenant');
            const { manager } = makeManager([{ id: 1 }, { id: 2 }]);
            const fn = jest.fn(async () => {});

            await forEachTenant(tenant, manager, fn);

            expect(fn).toHaveBeenCalledTimes(1);
            expect(manager.query).not.toHaveBeenCalled();
            expect(spy).not.toHaveBeenCalled();
        });

        it('Thiếu tenantCtx → chạy fn MỘT lần (hành vi gốc bất biến)', async () => {
            process.env.TENANT_RLS_ENABLED = 'true';
            const { manager } = makeManager([{ id: 1 }]);
            const fn = jest.fn(async () => {});

            await forEachTenant(undefined, manager, fn);

            expect(fn).toHaveBeenCalledTimes(1);
            expect(manager.query).not.toHaveBeenCalled();
        });

        it('Flag BẬT → lặp từng tenant, set_config đúng id, withTenant mỗi tenant', async () => {
            process.env.TENANT_RLS_ENABLED = 'true';
            const tenant = new TenantContextService();
            const spy = jest.spyOn(tenant, 'withTenant');
            const { manager, calls } = makeManager([{ id: 1 }, { id: 2 }]);
            const seenTenants: Array<number | null> = [];
            const fn = jest.fn(async () => { seenTenants.push(tenant.currentTenantId()); });

            await forEachTenant(tenant, manager, fn);

            // fn chạy đúng 2 lần (2 tenant)
            expect(fn).toHaveBeenCalledTimes(2);
            // withTenant gọi cho từng tenant
            expect(spy).toHaveBeenCalledTimes(2);
            expect(spy.mock.calls[0][0]).toBe(1);
            expect(spy.mock.calls[1][0]).toBe(2);
            // fn thấy đúng tenant context mỗi vòng
            expect(seenTenants).toEqual([1, 2]);
            // set_config gọi cho từng tenant với id đúng
            const setCfg = calls.filter(c => /set_config\('app\.current_tenant'/i.test(c.sql));
            expect(setCfg.map(c => c.p?.[0])).toEqual(['1', '2']);
        });

        it('Flag BẬT + 0 tenant → fn KHÔNG chạy', async () => {
            process.env.TENANT_RLS_ENABLED = 'true';
            const tenant = new TenantContextService();
            const { manager } = makeManager([]);
            const fn = jest.fn(async () => {});

            await forEachTenant(tenant, manager, fn);

            expect(fn).not.toHaveBeenCalled();
        });
    });

    describe('runInTenant (job nền có tenant đã biết)', () => {
        it('Flag TẮT → chạy fn thẳng, KHÔNG withTenant, KHÔNG set_config', async () => {
            process.env.TENANT_RLS_ENABLED = 'false';
            const tenant = new TenantContextService();
            const spy = jest.spyOn(tenant, 'withTenant');
            const { manager } = makeManager();
            const fn = jest.fn(async () => 'ok');

            const res = await runInTenant(tenant, manager, 7, fn);

            expect(res).toBe('ok');
            expect(fn).toHaveBeenCalledTimes(1);
            expect(spy).not.toHaveBeenCalled();
            expect(manager.query).not.toHaveBeenCalled();
        });

        it('Flag BẬT → withTenant(tenantId) + set_config(tenantId) rồi chạy fn', async () => {
            process.env.TENANT_RLS_ENABLED = 'true';
            const tenant = new TenantContextService();
            const spy = jest.spyOn(tenant, 'withTenant');
            const { manager, calls } = makeManager();
            let seen: number | null = null;
            const fn = jest.fn(async () => { seen = tenant.currentTenantId(); return 'done'; });

            const res = await runInTenant(tenant, manager, 42, fn);

            expect(res).toBe('done');
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy.mock.calls[0][0]).toBe(42);
            expect(seen).toBe(42);
            const setCfg = calls.find(c => /set_config\('app\.current_tenant'/i.test(c.sql));
            expect(setCfg?.p?.[0]).toBe('42');
        });
    });

    describe('tenantRlsEnabled', () => {
        it('chỉ true khi env = "true"', () => {
            process.env.TENANT_RLS_ENABLED = 'true';
            expect(tenantRlsEnabled()).toBe(true);
            process.env.TENANT_RLS_ENABLED = 'false';
            expect(tenantRlsEnabled()).toBe(false);
            delete process.env.TENANT_RLS_ENABLED;
            expect(tenantRlsEnabled()).toBe(false);
        });
    });
});
