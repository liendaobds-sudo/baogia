import 'reflect-metadata';
import { CustomersService } from '../services/customers.service';
import { ErpCustomersController } from './customers.controller';
import { PERMISSIONS_KEY } from '../../auth/permissions.guard';

/**
 * Audit /pricing/customers (finding → fix):
 *  - Cô lập tenant: create gán tenantId hiện hành; update/remove chặn thao tác chéo tenant.
 *  - RBAC: mọi endpoint gắn @Permissions('customer.*') đúng động từ (view/create/edit/delete).
 */
describe('CustomersService — tenant scoping', () => {
    let repo: any;
    let groupRepo: any;
    let interactionRepo: any;
    let dataSource: any;
    let tenant: any;
    let svc: CustomersService;

    const makeTenant = (tenantId: number | null, bypass = false) => ({
        get: jest.fn(() => (tenantId == null && !bypass ? null : { tenantId, bypass })),
    });

    beforeEach(() => {
        repo = {
            findOne: jest.fn(),
            create: jest.fn((d: any) => d),
            save: jest.fn(async (u: any) => (Array.isArray(u) ? u : { id: 1, ...u })),
            remove: jest.fn(async () => ({})),
            createQueryBuilder: jest.fn(() => ({
                select: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                getRawOne: jest.fn(async () => ({ max_id: '0' })),
                getOne: jest.fn(async () => null), // không trùng phone/code trong tenant
            })),
        };
        groupRepo = {};
        interactionRepo = {};
        dataSource = { query: jest.fn(async () => []) };
        tenant = makeTenant(7);
        svc = new CustomersService(repo, groupRepo, interactionRepo, dataSource, tenant);
    });

    it('createCustomer gán tenantId của tenant hiện hành', async () => {
        repo.findOne.mockResolvedValue(null); // không trùng phone/code
        await svc.createCustomer({ name: 'Khách A', phone: '0900000000' } as any);
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7 }));
    });

    it('updateCustomer trên KH KHÁC tenant → chặn (Customer not found)', async () => {
        repo.findOne.mockResolvedValue({ id: 9, tenantId: 9 });
        await expect(svc.updateCustomer('9', { name: 'X' } as any)).rejects.toThrow('Customer not found');
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('deleteCustomer trên KH KHÁC tenant → chặn', async () => {
        repo.findOne.mockResolvedValue({ id: 9, tenantId: 9 });
        await expect(svc.deleteCustomer('9')).rejects.toThrow('Customer not found');
        expect(repo.remove).not.toHaveBeenCalled();
    });

    it('updateCustomer CÙNG tenant → cho phép', async () => {
        repo.findOne.mockResolvedValueOnce({ id: 1, tenantId: 7, code: 'KH0001' });
        const res = await svc.updateCustomer('1', { name: 'Mới' } as any);
        expect((res as any).name).toBe('Mới');
        expect(repo.save).toHaveBeenCalled();
    });

    it('createCustomer: trùng SĐT TRONG tenant → chặn (unique theo tenant)', async () => {
        // getOne trả 1 KH trùng trong tenant → ném lỗi.
        repo.createQueryBuilder = jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn(async () => ({ max_id: '0' })),
            getOne: jest.fn(async () => ({ id: 2, name: 'Trùng' })),
        }));
        await expect(svc.createCustomer({ name: 'A', phone: '0900000000' } as any))
            .rejects.toThrow(/Số điện thoại đã tồn tại/);
    });

    it('findOneByFieldInTenant áp mệnh đề lọc tenant khi có context', async () => {
        const andWhere = jest.fn().mockReturnThis();
        repo.createQueryBuilder = jest.fn(() => ({
            where: jest.fn().mockReturnThis(),
            andWhere,
            getOne: jest.fn(async () => null),
        }));
        await (svc as any).findOneByFieldInTenant('phone', '0900');
        expect(andWhere).toHaveBeenCalledWith(
            expect.stringContaining('tenant_id'),
            expect.objectContaining({ tid: 7 }),
        );
    });
});

describe('ErpCustomersController — RBAC permission metadata', () => {
    const proto = ErpCustomersController.prototype as any;
    const perms = (method: string) => Reflect.getMetadata(PERMISSIONS_KEY, proto[method]);

    it.each([
        ['findAll', ['customer.view']],
        ['findOne', ['customer.view']],
        ['create', ['customer.create']],
        ['update', ['customer.edit']],
        ['remove', ['customer.delete']],
        ['getInteractions', ['customer.view']],
        ['addInteraction', ['customer.create']],
        ['calculateRfm', ['customer.edit']],
    ])('%s yêu cầu %j', (method, expected) => {
        expect(perms(method as string)).toEqual(expected);
    });
});
