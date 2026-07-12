import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AppScopeService } from './app-scope.service';
import { TenantContextService } from '../tenant/tenant-context.service';

/**
 * CskhScopeGuard — chặn các controller thuộc Trục CSKH khi tenant hiện hành tắt CSKH.
 *
 * Gắn sau `AuthGuard('jwt')` (cần req.user → tenant context). Fail-open khi thiếu tenant
 * context (đường public/nội bộ chưa nạp context) để không phá hành vi hiện có; backend
 * vẫn fail-closed khi có context và CSKH tắt.
 *
 * _Requirements: 4.1, 4.5, 4.6_
 */
@Injectable()
export class CskhScopeGuard implements CanActivate {
    constructor(
        private readonly appScope: AppScopeService,
        private readonly tenant: TenantContextService,
    ) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        if (ctx.getType() !== 'http') return true;
        const tenantId = this.tenant.currentTenantId();
        if (tenantId == null) return true; // fail-open: thiếu context → không chặn (Req 4.6)
        const enabled = await this.appScope.isCskhEnabledForTenant(tenantId);
        if (!enabled) {
            throw new ForbiddenException('Trục CSKH không khả dụng cho đơn vị của bạn.');
        }
        return true;
    }
}
