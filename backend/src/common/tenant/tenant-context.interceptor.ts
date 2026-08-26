import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';
import { resolveRequestTenantContext } from './request-tenant-context';

/**
 * Nạp tenant context cho mỗi request HTTP đã xác thực.
 * Chạy SAU JwtAuthGuard (req.user đã có), và `enterWith` persist suốt chuỗi
 * handler trong cùng async context.
 *
 * Nếu request chưa có user/tenantId hợp lệ thì bỏ qua; guard của từng trục chịu
 * trách nhiệm fail-closed. super_admin có thể impersonate qua `x-tenant-id`.
 *
 * _Requirements: 2.1, 5.1, 5.2_
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
    constructor(private readonly tenant: TenantContextService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (context.getType() !== 'http') return next.handle();

        const req = context.switchToHttp().getRequest();
        const resolved = resolveRequestTenantContext(req);
        if (resolved) this.tenant.enter(resolved);

        return next.handle();
    }
}
