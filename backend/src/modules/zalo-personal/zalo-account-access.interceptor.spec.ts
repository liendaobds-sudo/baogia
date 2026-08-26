import { NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import { ZaloAccountAccessInterceptor, resolveZaloRequestTenantId } from './zalo-account-access.interceptor';

function makeQuery(account: any) {
    return {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(account),
    };
}

function httpContext(req: any): any {
    return {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => req }),
    };
}

describe('ZaloAccountAccessInterceptor', () => {
    it('scope account theo tenant lấy từ JWT trước khi gọi pool', async () => {
        const query = makeQuery({ id: 'acc-1' });
        const repo: any = { createQueryBuilder: jest.fn(() => query) };
        const interceptor = new ZaloAccountAccessInterceptor(repo);
        const next = { handle: jest.fn(() => of('ok')) };
        const req: any = {
            params: { id: 'acc-1' },
            headers: {},
            user: { id: 'u-1', role: 'admin', tenantId: 7 },
        };

        await interceptor.intercept(httpContext(req), next as any);

        expect(query.where).toHaveBeenCalledWith('zalo.id = :accountId', { accountId: 'acc-1' });
        expect(query.andWhere).toHaveBeenCalledWith('channel.tenantId = :tenantId', { tenantId: 7 });
        expect(req.zaloAccount).toEqual({ id: 'acc-1' });
        expect(next.handle).toHaveBeenCalledTimes(1);
    });

    it('trả 404 khi account không thuộc tenant để không lộ resource ID', async () => {
        const query = makeQuery(null);
        const interceptor = new ZaloAccountAccessInterceptor({ createQueryBuilder: () => query } as any);

        await expect(interceptor.intercept(httpContext({
            params: { id: 'tenant-a-account' },
            headers: {},
            user: { role: 'admin', tenantId: 9 },
        }), { handle: () => of('never') } as any)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('super-admin chỉ bị scope khi chủ động impersonate tenant', () => {
        expect(resolveZaloRequestTenantId({ user: { role: 'super_admin' }, headers: {} })).toBeNull();
        expect(resolveZaloRequestTenantId({
            user: { role: 'super_admin' },
            headers: { 'x-tenant-id': '12' },
        })).toBe(12);
    });
});
