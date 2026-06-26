import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { canAccess } from './access-decision';
import { buildDenialLog } from './denial-log';
import { AuditService } from '../audit/audit.service';

/**
 * Permission keys matching PHP's requirePermission() system:
 * - quote.view, quote.create, quote.edit, quote.delete
 * - material.view, material.create, material.edit, material.delete
 * - customer.view, customer.create, customer.edit, customer.delete
 * - pricing.view, pricing.create, pricing.edit, pricing.delete
 * - settings.view, settings.edit
 * - user.view, user.create, user.edit, user.delete
 * - role.view, role.edit
 * - admin.view
 */

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to set required permissions on a controller method.
 * If multiple permissions are given, the user needs AT LEAST ONE (OR logic), matching PHP's requireAnyPermission().
 * 
 * Usage:
 *   @Permissions('quote.view')
 *   @Permissions('settings.view', 'quote.view', 'quote.create')  // any of these
 */
export const Permissions = (...permissions: string[]) =>
    SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        // Module audit là @Global() nên AuditService inject được ở mọi nơi guard được khởi tạo.
        private readonly audit: AuditService,
    ) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
            PERMISSIONS_KEY,
            [context.getHandler(), context.getClass()],
        );

        // No permissions required → allow
        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Không có quyền truy cập');
        }

        // Admin/super_admin bypass all permission checks (matching PHP)
        const role = (user.role || '').toLowerCase();
        if (role === 'admin' || role === 'super_admin') {
            return true;
        }

        // Quyết định bằng lõi thuần dùng chung backend/frontend (logic OR + '*').
        const userPermissions: string[] = user.permissions || [];
        if (canAccess(userPermissions, requiredPermissions)) {
            return true;
        }

        // Ghi nhận 403 (không secrets) rồi từ chối (Req 6.1, 6.2, 6.3).
        // Audit là phụ trợ: lỗi ghi nhật ký KHÔNG được làm hỏng việc trả 403.
        try {
            const payload = buildDenialLog(request, user, requiredPermissions);
            void Promise.resolve(this.audit.log(payload)).catch(() => undefined);
        } catch {
            // nuốt mọi lỗi dựng/ghi audit
        }

        throw new ForbiddenException(
            `Cần quyền ${requiredPermissions.join(' hoặc ')} để truy cập`,
        );
    }
}
