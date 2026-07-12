/**
 * UsersService — Unit Tests (mocked TypeORM repo)
 *
 * Khóa hành vi bảo mật của `findAll`: danh sách nhân sự của một tenant PHẢI lọc theo
 * `tenantId` VÀ loại bỏ `super_admin` (control-plane, không phải nhân sự tenant).
 * Regression này bắt nguồn từ việc super admin dùng chung tenantId=1 → nếu không loại,
 * họ lọt vào danh sách nhân sự khi xem/impersonate tenant đó.
 *
 * Run: npx jest --testPathPattern=users.service.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Not } from 'typeorm';

import { UsersService } from './users.service';
import { User, UserRole } from '../../entities';

describe('UsersService.findAll', () => {
    let service: UsersService;
    let repo: { find: jest.Mock };

    beforeEach(async () => {
        repo = { find: jest.fn().mockResolvedValue([]) };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: getRepositoryToken(User), useValue: repo },
            ],
        }).compile();
        service = module.get<UsersService>(UsersService);
    });

    it('lọc theo tenantId VÀ loại super_admin (control-plane không phải nhân sự tenant)', async () => {
        await service.findAll(4);

        expect(repo.find).toHaveBeenCalledTimes(1);
        const arg = repo.find.mock.calls[0][0];
        expect(arg.where.tenantId).toBe(4);
        // role phải là Not(SUPER_ADMIN) — dùng cùng operator TypeORM để so khớp.
        expect(arg.where.role).toEqual(Not(UserRole.SUPER_ADMIN));
    });

    it('không bao giờ trả super_admin dù họ dùng chung tenantId', async () => {
        // Mô phỏng repo tôn trọng filter: chỉ trả user không phải super_admin.
        repo.find.mockResolvedValue([
            { id: '1', email: 'admin@test.vn', role: UserRole.ADMIN },
        ]);

        const result = await service.findAll(1);
        expect(result.data.every((u: any) => u.role !== UserRole.SUPER_ADMIN)).toBe(true);
    });
});
