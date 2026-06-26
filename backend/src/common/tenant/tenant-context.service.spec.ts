/**
 * Tests cho TenantContextService (G0 — Task 1).
 * Xác minh: require() fail-loud khi ngoài scope; withTenant lồng nhau giữ đúng id;
 * runSystem bật bypass; enter() set context.
 *
 * _Requirements: 2.1, 2.3, 2.4_
 */
import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
    let svc: TenantContextService;
    beforeEach(() => { svc = new TenantContextService(); });

    it('get() trả undefined khi ngoài mọi scope', () => {
        expect(svc.get()).toBeUndefined();
        expect(svc.currentTenantId()).toBeNull();
    });

    it('require() THROW khi ngoài scope (fail-loud)', () => {
        expect(() => svc.require()).toThrow(/tenant context/i);
    });

    it('withTenant cung cấp context bên trong fn', async () => {
        const r = await svc.withTenant(7, () => {
            expect(svc.require().tenantId).toBe(7);
            expect(svc.currentTenantId()).toBe(7);
            return 'ok';
        });
        expect(r).toBe('ok');
        // Ra ngoài scope lại trống
        expect(svc.get()).toBeUndefined();
    });

    it('withTenant lồng nhau: scope con ghi đè đúng, scope cha khôi phục', async () => {
        await svc.withTenant(1, async () => {
            expect(svc.currentTenantId()).toBe(1);
            await svc.withTenant(2, () => {
                expect(svc.currentTenantId()).toBe(2);
            });
            expect(svc.currentTenantId()).toBe(1);
        });
    });

    it('runSystem bật bypass + tenantId hệ thống', async () => {
        await svc.runSystem(() => {
            const ctx = svc.require();
            expect(ctx.bypass).toBe(true);
            expect(ctx.role).toBe('system');
        });
    });

    it('enter() set context cho async hiện tại', () => {
        svc.enter({ tenantId: 42, userId: 'u1', role: 'admin' });
        expect(svc.currentTenantId()).toBe(42);
    });

    it('withTenant mặc định bypass=false', async () => {
        await svc.withTenant(3, () => {
            expect(svc.require().bypass).toBe(false);
        });
    });
});
