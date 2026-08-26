import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AppScopeService } from './app-scope.service';
import { resolveRequestTenantContext } from '../tenant/request-tenant-context';

/**
 * CskhScopeGuard — chặn các controller thuộc Trục CSKH khi tenant hiện hành tắt CSKH.
 *
 * Gắn sau `AuthGuard('jwt')` và phân giải tenant trực tiếp từ `req.user`. Guard chạy
 * TRƯỚC interceptor trong lifecycle Nest, nên không dựa vào AsyncLocalStorage do
 * TenantContextInterceptor nạp. Route CSKH thiếu tenant hợp lệ luôn fail-closed.
 *
 * _Requirements: 4.1, 4.5, 4.6_
 */
@Injectable()
export class CskhScopeGuard implements CanActivate {
    constructor(private readonly appScope: AppScopeService) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        if (ctx.getType() !== 'http') return true;
        const req = ctx.switchToHttp().getRequest();
        const resolved = resolveRequestTenantContext(req);
        if (!resolved) {
            throw new ForbiddenException(
                'Không xác định được đơn vị cho tài nguyên CSKH.',
            );
        }

        const enabled = await this.appScope.isCskhEnabledForTenant(resolved.tenantId);
        if (!enabled) {
            throw new ForbiddenException('Trục CSKH không khả dụng cho đơn vị của bạn.');
        }
        return true;
    }
}
