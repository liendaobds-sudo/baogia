import 'reflect-metadata';
import { SuperAdminController } from './super-admin.controller';

/**
 * Khoá hành vi accountability của control-plane (audit finding 🟠 → fix):
 * mọi thao tác super-admin nhạy cảm PHẢI ghi audit_logs với:
 *   - đúng actor (req.user.id), đúng action/entityType/entityId, kèm IP;
 *   - TUYỆT ĐỐI KHÔNG chứa giá trị bí mật (mật khẩu mới, token impersonation) ở BẤT KỲ
 *     cấp nào của payload.
 *
 * Ghi audit là fire-and-forget: lỗi ghi audit KHÔNG được ném ra làm hỏng nghiệp vụ.
 */
describe('SuperAdminController — audit trail control-plane', () => {
    let audit: { log: jest.Mock };
    let svc: any;
    let controller: SuperAdminController;
    const req = { user: { id: 'sa-1' }, ip: '1.2.3.4', headers: {} };

    beforeEach(() => {
        audit = { log: jest.fn().mockResolvedValue(undefined) };
        svc = {
            createTenant: jest.fn().mockResolvedValue({
                tenant: { id: 42, code: 'acme', name: 'Acme' },
                adminUser: { id: 'u1', email: 'admin@acme.vn', defaultPassword: 'S3cretPW!create' },
            }),
            resetTenantAdminPassword: jest.fn().mockResolvedValue({
                adminEmail: 'admin@acme.vn',
                newPassword: 'S3cretPW!reset',
            }),
            setTenantStatus: jest.fn().mockResolvedValue({ id: 5, status: 'suspended' }),
            impersonate: jest.fn().mockResolvedValue({
                token: 'SECRET.JWT.TOKEN',
                tenant: { id: 7, code: 'beta', name: 'Beta' },
                expiresIn: 300,
            }),
            confirmPayment: jest.fn().mockResolvedValue({ id: 9, tenantId: 3, amount: 1000 }),
        };
        controller = new SuperAdminController(svc, {} as any, {} as any, audit as any);
    });

    /** Payload đã ghi (arg đầu tiên của audit.log) dưới dạng chuỗi để soi rò rỉ bí mật. */
    const loggedArg = () => audit.log.mock.calls[0][0];
    const loggedStr = () => JSON.stringify(loggedArg());

    it('createTenant → ghi tenant.create, đúng actor/IP, KHÔNG lộ defaultPassword', async () => {
        await controller.createTenant({ name: 'Acme', code: 'acme' } as any, req);
        expect(audit.log).toHaveBeenCalledTimes(1);
        const p = loggedArg();
        expect(p.userId).toBe('sa-1');
        expect(p.action).toBe('tenant.create');
        expect(p.entityType).toBe('tenant');
        expect(p.entityId).toBe('42');
        expect(p.ipAddress).toBe('1.2.3.4');
        expect(loggedStr()).not.toContain('S3cretPW!create');
    });

    it('resetTenantAdminPassword → ghi tenant.reset_password, KHÔNG lộ newPassword', async () => {
        await controller.resetTenantAdminPassword('5', req);
        const p = loggedArg();
        expect(p.action).toBe('tenant.reset_password');
        expect(p.entityId).toBe('5');
        expect(p.metadata.adminEmail).toBe('admin@acme.vn');
        expect(loggedStr()).not.toContain('S3cretPW!reset');
    });

    it('setTenantStatus → ghi tenant.status kèm status', async () => {
        await controller.setTenantStatus('5', { status: 'suspended' }, req);
        const p = loggedArg();
        expect(p.action).toBe('tenant.status');
        expect(p.entityId).toBe('5');
        expect(p.metadata.status).toBe('suspended');
    });

    it('impersonate → ghi tenant.impersonate, KHÔNG lộ token', async () => {
        await controller.impersonate('7', req);
        const p = loggedArg();
        expect(p.action).toBe('tenant.impersonate');
        expect(p.entityId).toBe('7');
        expect(p.userId).toBe('sa-1');
        expect(loggedStr()).not.toContain('SECRET.JWT.TOKEN');
    });

    it('confirmPayment → ghi payment.confirm', async () => {
        await controller.confirmPayment('9', req);
        const p = loggedArg();
        expect(p.action).toBe('payment.confirm');
        expect(p.entityType).toBe('payment');
        expect(p.entityId).toBe('9');
    });

    it('lỗi ghi audit KHÔNG làm hỏng nghiệp vụ (fire-and-forget)', async () => {
        audit.log.mockRejectedValueOnce(new Error('audit sink down'));
        await expect(
            controller.setTenantStatus('5', { status: 'active' }, req),
        ).resolves.toMatchObject({ success: true });
    });
});
