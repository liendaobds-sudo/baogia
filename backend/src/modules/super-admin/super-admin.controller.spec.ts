import 'reflect-metadata';
import { SuperAdminController } from './super-admin.controller';
import { ROLES_KEY } from '../auth/roles.guard';
import { UserRole } from '../../entities/user.entity';

/**
 * Khóa hành vi bảo mật: mọi route super-admin CHỈ dành cho SUPER_ADMIN (platform),
 * KHÔNG cho admin cấp tenant (tránh leo thang quyền chéo-tenant — audit finding 🔴).
 */
describe('SuperAdminController — role restriction', () => {
  it('class-level @Roles chỉ chứa SUPER_ADMIN (không có ADMIN)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SuperAdminController) as UserRole[];
    expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    expect(roles).not.toContain(UserRole.ADMIN);
  });
});
