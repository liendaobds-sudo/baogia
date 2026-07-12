import { SuperAdminService } from './super-admin.service';
import { TenantStatus } from '../../entities/tenant.entity';
import { UserRole } from '../../entities/user.entity';

/**
 * Unit tests cho các thao tác vòng đời tenant + bảo mật mật khẩu (Super Admin).
 * Mock repo — không cần DB.
 */
describe('SuperAdminService — tenant lifecycle & password security', () => {
  let svc: SuperAdminService;
  let tenantRepo: any;
  let userRepo: any;
  let planRepo: any;

  beforeEach(() => {
    tenantRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (t: any) => t),
      count: jest.fn(),
      find: jest.fn(),
    };
    userRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (u: any) => u),
      update: jest.fn(async () => ({ affected: 1 })),
      count: jest.fn(),
    };
    planRepo = { findOne: jest.fn() };
    svc = new SuperAdminService(
      tenantRepo, planRepo, {} as any, userRepo, {} as any, {} as any, {} as any,
    );
  });

  describe('generateStrongPassword (bảo mật)', () => {
    const gen = () => (SuperAdminService as any).generateStrongPassword() as string;

    it('KHÔNG dùng pattern đoán được `${code}@2026`', () => {
      const codes = ['hoangphu', 'abc', 'xuong1'];
      for (const code of codes) {
        for (let i = 0; i < 20; i++) {
          expect(gen()).not.toBe(`${code}@2026`);
        }
      }
    });

    it('đủ mạnh: ≥16 ký tự, có ký tự đặc biệt và chữ số', () => {
      for (let i = 0; i < 50; i++) {
        const p = gen();
        expect(p.length).toBeGreaterThanOrEqual(16);
        expect(/[!@#$%^&*]/.test(p)).toBe(true);
        expect(/[0-9]/.test(p)).toBe(true);
      }
    });

    it('ngẫu nhiên: 100 lần sinh không trùng nhau', () => {
      const set = new Set<string>();
      for (let i = 0; i < 100; i++) set.add(gen());
      expect(set.size).toBe(100);
    });
  });

  describe('createTenant — admin password không đoán được', () => {
    it('mật khẩu admin trả về KHÁC `${code}@2026`', async () => {
      tenantRepo.findOne.mockResolvedValue(null); // code chưa tồn tại
      const res = await svc.createTenant({ name: 'Xưởng Test', code: 'xuongtest' });
      expect(res.adminUser.defaultPassword).not.toBe('xuongtest@2026');
      expect(res.adminUser.defaultPassword.length).toBeGreaterThanOrEqual(16);
    });
  });

  describe('setTenantStatus', () => {
    it('từ chối trạng thái không hợp lệ', async () => {
      await expect(svc.setTenantStatus(1, 'bogus')).rejects.toThrow(/không hợp lệ/i);
    });

    it('suspended → khoá user của tenant (isActive=false)', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 1, status: TenantStatus.ACTIVE });
      await svc.setTenantStatus(1, TenantStatus.SUSPENDED);
      expect(userRepo.update).toHaveBeenCalledWith({ tenantId: 1 }, { isActive: false });
    });

    it('active → mở lại user (isActive=true)', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 2, status: TenantStatus.SUSPENDED });
      await svc.setTenantStatus(2, TenantStatus.ACTIVE);
      expect(userRepo.update).toHaveBeenCalledWith({ tenantId: 2 }, { isActive: true });
    });

    it('tenant không tồn tại → NotFound', async () => {
      tenantRepo.findOne.mockResolvedValue(null);
      await expect(svc.setTenantStatus(99, TenantStatus.ACTIVE)).rejects.toThrow(/Không tìm thấy/i);
    });
  });

  describe('updateTenant', () => {
    it('cập nhật name/email, giữ nguyên code', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 1, name: 'Old', code: 'x', email: null });
      const saved = await svc.updateTenant(1, { name: 'New Name', email: 'a@b.vn' });
      expect(saved.name).toBe('New Name');
      expect(saved.email).toBe('a@b.vn');
      expect(saved.code).toBe('x');
    });

    it('maxUsers không hợp lệ → lỗi', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 1 });
      await expect(svc.updateTenant(1, { maxUsers: 0 })).rejects.toThrow(/maxUsers/);
    });

    it('planId không tồn tại → NotFound', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 1 });
      planRepo.findOne.mockResolvedValue(null);
      await expect(svc.updateTenant(1, { planId: 777 })).rejects.toThrow(/gói/i);
    });
  });

  describe('resetTenantAdminPassword', () => {
    it('sinh mật khẩu mới, cập nhật hash, kích hoạt admin', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 1 });
      userRepo.findOne.mockResolvedValue({ id: 5, email: 'admin@x.vn', role: UserRole.ADMIN, isActive: false });
      const res = await svc.resetTenantAdminPassword(1);
      expect(res.adminEmail).toBe('admin@x.vn');
      expect(res.newPassword.length).toBeGreaterThanOrEqual(16);
      expect(userRepo.save).toHaveBeenCalled();
      const savedUser = userRepo.save.mock.calls[0][0];
      expect(savedUser.isActive).toBe(true);
      expect(savedUser.passwordHash).toBeTruthy();
    });

    it('tenant chưa có admin → NotFound', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 1 });
      userRepo.findOne.mockResolvedValue(null);
      await expect(svc.resetTenantAdminPassword(1)).rejects.toThrow(/ADMIN/);
    });
  });

  describe('impersonate — chặn tenant ngưng/huỷ', () => {
    it('tenant SUSPENDED → Forbidden (không cấp token)', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 1, status: TenantStatus.SUSPENDED });
      await expect(svc.impersonate(1, 'sa-1')).rejects.toThrow(/suspended/i);
    });

    it('tenant CANCELLED → Forbidden (không cấp token)', async () => {
      tenantRepo.findOne.mockResolvedValue({ id: 2, status: TenantStatus.CANCELLED });
      await expect(svc.impersonate(2, 'sa-1')).rejects.toThrow(/cancelled/i);
    });

    it('tenant không tồn tại → NotFound', async () => {
      tenantRepo.findOne.mockResolvedValue(null);
      await expect(svc.impersonate(99, 'sa-1')).rejects.toThrow(/not found/i);
    });
  });
});
