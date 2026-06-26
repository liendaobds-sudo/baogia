import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';

/**
 * TenantGuard: Ensures every authenticated request has a valid tenant context.
 * 
 * - Extracts tenantId from JWT payload (set during login)
 * - Attaches tenant context to request for downstream services
 * - SUPER_ADMIN bypasses tenant check (cross-tenant access)
 * - Guards ERP endpoints so users can only access their own tenant's data
 */
@Injectable()
export class TenantGuard implements CanActivate {
    private readonly logger = new Logger(TenantGuard.name);

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // No user = not authenticated yet (handled by JwtAuthGuard)
        if (!user) return true;

        // SUPER_ADMIN can access any tenant
        if (user.role === 'super_admin') {
            // Allow header override for impersonation
            const headerTenantId = request.headers['x-tenant-id'];
            if (headerTenantId) {
                request.tenantId = parseInt(headerTenantId, 10);
                this.logger.debug(`Super admin impersonating tenant ${request.tenantId}`);
            }
            return true;
        }

        // Regular users MUST have a tenantId
        if (!user.tenantId) {
            throw new ForbiddenException('Tài khoản chưa được gán xưởng in (tenant). Liên hệ quản trị viên.');
        }

        // Attach tenantId to request for downstream use
        request.tenantId = user.tenantId;
        return true;
    }
}
