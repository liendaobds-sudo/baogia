import { UsersService } from './users.service';
import { NotFoundException } from '@nestjs/common';

/**
 * Cô lập tenant khi quản lý nhân sự (audit finding → fix):
 *  - create: gán tenantId của admin (trước đây null ⇒ staff mồ côi, không hiện).
 *  - update/remove: chỉ tác động user CÙNG tenant (chống quản lý chéo-tenant).
 */
describe('UsersService — tenant scoping', () => {
    let repo: any;
    let svc: UsersService;

    beforeEach(() => {
        repo = {
            findOne: jest.fn(),
            create: jest.fn((d: any) => d),
            save: jest.fn(async (u: any) => ({ id: 'u1', ...u })),
            remove: jest.fn(async () => ({})),
        };
        svc = new UsersService(repo);
    });

    it('create gán tenantId của admin hiện hành', async () => {
        repo.findOne.mockResolvedValue(null); // email chưa tồn tại
        await svc.create({ email: 'a@x.vn', password: 'p', fullName: 'A', role: 'agent' } as any, 7);
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7 }));
    });

    it('update user KHÁC tenant → NotFound (không lộ tồn tại)', async () => {
        repo.findOne.mockResolvedValue({ id: 'u9', tenantId: 9 });
        await expect(svc.update('u9', { fullName: 'X' } as any, 7)).rejects.toThrow(NotFoundException);
        expect(repo.save).not.toHaveBeenCalled();
    });

    it('remove user KHÁC tenant → NotFound', async () => {
        repo.findOne.mockResolvedValue({ id: 'u9', tenantId: 9 });
        await expect(svc.remove('u9', 7)).rejects.toThrow(NotFoundException);
        expect(repo.remove).not.toHaveBeenCalled();
    });

    it('update user CÙNG tenant → cho phép', async () => {
        repo.findOne.mockResolvedValue({ id: 'u1', tenantId: 7, fullName: 'Old' });
        const res = await svc.update('u1', { fullName: 'New' } as any, 7);
        expect(res.fullName).toBe('New');
        expect(repo.save).toHaveBeenCalled();
    });
});
