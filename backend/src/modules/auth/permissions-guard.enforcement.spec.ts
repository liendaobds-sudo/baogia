/**
 * Integration test (DB-free) cho việc THỰC THI phân quyền ở backend.
 *
 * Feature: rbac-quote-order-access — Task 3.5 "Viết integration tests thực thi route".
 *
 * Cách tiếp cận: KHÔNG bootstrap AppModule (tránh phụ thuộc Postgres/Redis).
 * Thay vào đó kiểm chứng hai mặt là ranh giới bảo mật thật:
 *
 *   1. METADATA REFLECTION — mọi route handler của ErpOrdersController có
 *      @Permissions không rỗng (Req 3.2) và ánh xạ đúng bảng thiết kế
 *      (Req 3.3–3.7); ErpSystemSettingsController GET→settings.view,
 *      POST→settings.edit (Req 3.10).
 *
 *   2. GUARD DECISION — PermissionsGuard.canActivate quyết định đúng cho
 *      agent / admin / viewer với ExecutionContext + Reflector + AuditService
 *      được mock; xác nhận bypass admin (Req 3.9), 403 + audit khi thiếu quyền
 *      (Req 3.8, 6.1), và fail-closed theo tập quyền mặc định thực tế.
 */
import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
    PermissionsGuard,
    PERMISSIONS_KEY,
} from './permissions.guard';
import { agentDefault, viewerDefault } from './access-decision';
import { ErpOrdersController } from '../pricing/controllers/orders.controller';
import { ErpSystemSettingsController } from '../pricing/controllers/system-settings.controller';

/** Lấy danh sách tên các route handler (loại bỏ constructor) của một controller. */
function handlerNames(ctrl: new (...args: any[]) => any): string[] {
    return Object.getOwnPropertyNames(ctrl.prototype).filter(
        (name) => name !== 'constructor' && typeof ctrl.prototype[name] === 'function',
    );
}

/** Đọc @Permissions metadata gắn trực tiếp trên một handler. */
function permsOf(ctrl: new (...args: any[]) => any, handler: string): string[] | undefined {
    return Reflect.getMetadata(PERMISSIONS_KEY, ctrl.prototype[handler]);
}

// ---------------------------------------------------------------------------
// 1) METADATA REFLECTION
// ---------------------------------------------------------------------------
describe('Enforcement metadata — ErpOrdersController (Req 3.2–3.7)', () => {
    const handlers = handlerNames(ErpOrdersController);

    it('có route handler để kiểm tra (sanity)', () => {
        expect(handlers.length).toBeGreaterThan(0);
    });

    it('MỌI route handler có @Permissions không rỗng (không route nào lọt lưới)', () => {
        const missing = handlers.filter((h) => {
            const perms = permsOf(ErpOrdersController, h);
            return !perms || perms.length === 0;
        });
        expect(missing).toEqual([]);
    });

    // Bảng ánh xạ route → quyền theo design.md.
    const expectedMap: Record<string, string[]> = {
        expireQuotes: ['quote.view', 'order.view'],
        findAll: ['quote.view', 'order.view'],
        findOne: ['quote.view', 'order.view'],
        create: ['quote.create'],
        clone: ['quote.create'],
        submit: ['quote.edit'],
        approve: ['quote.approve'],
        reject: ['quote.approve'],
        send: ['quote.edit'],
        accept: ['order.approve'],
        complete: ['order.approve'],
        cancel: ['order.approve'],
        sendZalo: ['quote.edit'],
        sendEmail: ['quote.edit'],
        update: ['quote.edit'],
        remove: ['quote.delete'],
    };

    it.each(Object.entries(expectedMap))(
        'route %s yêu cầu đúng quyền %j',
        (handler, expected) => {
            expect(permsOf(ErpOrdersController, handler)).toEqual(expected);
        },
    );

    it('mọi handler thực tế đều được phủ trong bảng ánh xạ kỳ vọng', () => {
        const uncovered = handlers.filter((h) => !(h in expectedMap));
        expect(uncovered).toEqual([]);
    });
});

describe('Enforcement metadata — ErpSystemSettingsController (Req 3.10)', () => {
    it('findAll (GET) yêu cầu settings.view', () => {
        expect(permsOf(ErpSystemSettingsController, 'findAll')).toEqual(['settings.view']);
    });

    it('update (POST) yêu cầu settings.edit', () => {
        expect(permsOf(ErpSystemSettingsController, 'update')).toEqual(['settings.edit']);
    });

    it('mọi route handler có @Permissions không rỗng', () => {
        const missing = handlerNames(ErpSystemSettingsController).filter((h) => {
            const perms = permsOf(ErpSystemSettingsController, h);
            return !perms || perms.length === 0;
        });
        expect(missing).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 2) GUARD DECISION (PermissionsGuard.canActivate)
// ---------------------------------------------------------------------------

/** Dựng ExecutionContext giả với req.user cho trước. */
function mockContext(user: any): ExecutionContext {
    const noop = () => undefined;
    return {
        getHandler: () => noop,
        getClass: () => class {},
        switchToHttp: () => ({
            getRequest: () => ({
                user,
                method: 'POST',
                originalUrl: '/erp/orders/x',
                url: '/erp/orders/x',
                route: { path: '/erp/orders/:id/approve' },
                ip: '127.0.0.1',
            }),
        }),
    } as unknown as ExecutionContext;
}

/** Reflector trả về `required` cố định cho mọi getAllAndOverride. */
function mockReflector(required: string[]): Reflector {
    return { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
}

/** AuditService giả chỉ ghi nhận lời gọi `log`. */
function mockAudit() {
    return { log: jest.fn().mockResolvedValue(undefined) } as any;
}

describe('PermissionsGuard.canActivate — agent (Req 3.3–3.8, 4.5, 4.7)', () => {
    const agentUser = { id: 'u-agent', role: 'agent', permissions: [...agentDefault] };

    const allowedRequired: Array<[string, string[]]> = [
        ['quote.view (đọc)', ['quote.view', 'order.view']],
        ['quote.create (tạo báo giá)', ['quote.create']],
        ['quote.edit (sửa báo giá)', ['quote.edit']],
        ['order.view (xem đơn)', ['order.view']],
    ];

    it.each(allowedRequired)('CHO PHÉP việc hằng ngày: %s', (_label, required) => {
        const audit = mockAudit();
        const guard = new PermissionsGuard(mockReflector(required), audit);
        expect(guard.canActivate(mockContext(agentUser))).toBe(true);
        expect(audit.log).not.toHaveBeenCalled();
    });

    const deniedRequired: Array<[string, string[]]> = [
        ['quote.approve (duyệt báo giá)', ['quote.approve']],
        ['order.approve (hoàn thành/huỷ đơn)', ['order.approve']],
        ['quote.delete (xoá báo giá)', ['quote.delete']],
        ['settings.edit (sửa cài đặt)', ['settings.edit']],
    ];

    it.each(deniedRequired)('TỪ CHỐI (403) việc cam kết: %s + ghi audit', (_label, required) => {
        const audit = mockAudit();
        const guard = new PermissionsGuard(mockReflector(required), audit);
        expect(() => guard.canActivate(mockContext(agentUser))).toThrow(ForbiddenException);
        expect(audit.log).toHaveBeenCalledTimes(1);
        // Payload audit chứa đủ trường và KHÔNG có khoá nhạy cảm.
        const payload = audit.log.mock.calls[0][0];
        expect(payload.userId).toBe('u-agent');
        expect(payload.metadata.role).toBe('agent');
        expect(payload.metadata.required).toEqual(required);
        expect(JSON.stringify(payload).toLowerCase()).not.toContain('authorization');
        expect(JSON.stringify(payload).toLowerCase()).not.toContain('password');
    });
});

describe('PermissionsGuard.canActivate — admin/super_admin bypass (Req 3.9, 4.6)', () => {
    it.each([['admin'], ['super_admin'], ['ADMIN'], ['Super_Admin']])(
        'role %s được phép bất kể quyền yêu cầu, KHÔNG ghi audit',
        (role) => {
            const audit = mockAudit();
            const guard = new PermissionsGuard(mockReflector(['quote.approve', 'order.approve']), audit);
            const user = { id: 'u-admin', role, permissions: [] };
            expect(guard.canActivate(mockContext(user))).toBe(true);
            expect(audit.log).not.toHaveBeenCalled();
        },
    );
});

describe('PermissionsGuard.canActivate — viewer chỉ-đọc (Req 2.7)', () => {
    const viewerUser = { id: 'u-viewer', role: 'viewer', permissions: [...viewerDefault] };

    it.each([
        ['quote.view', ['quote.view']],
        ['order.view', ['order.view']],
        ['report.view', ['report.view']],
    ])('CHO PHÉP xem: %s', (_label, required) => {
        const audit = mockAudit();
        const guard = new PermissionsGuard(mockReflector(required), audit);
        expect(guard.canActivate(mockContext(viewerUser))).toBe(true);
        expect(audit.log).not.toHaveBeenCalled();
    });

    it.each([
        ['quote.create', ['quote.create']],
        ['quote.edit', ['quote.edit']],
        ['quote.approve', ['quote.approve']],
        ['order.approve', ['order.approve']],
        ['quote.delete', ['quote.delete']],
        ['settings.edit', ['settings.edit']],
    ])('TỪ CHỐI (403) biến đổi: %s', (_label, required) => {
        const audit = mockAudit();
        const guard = new PermissionsGuard(mockReflector(required), audit);
        expect(() => guard.canActivate(mockContext(viewerUser))).toThrow(ForbiddenException);
        expect(audit.log).toHaveBeenCalledTimes(1);
    });
});

describe('PermissionsGuard.canActivate — biên (Req 3.8)', () => {
    it('không có required → cho qua (route chưa khai báo quyền)', () => {
        const guard = new PermissionsGuard(mockReflector([]), mockAudit());
        const user = { id: 'u', role: 'agent', permissions: [...agentDefault] };
        expect(guard.canActivate(mockContext(user))).toBe(true);
    });

    it('không có user (chưa xác thực qua guard quyền) → 403', () => {
        const guard = new PermissionsGuard(mockReflector(['quote.view']), mockAudit());
        expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
    });
});
