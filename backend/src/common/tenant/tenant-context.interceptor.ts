import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

/**
 * Nạp tenant context cho mỗi request HTTP đã xác thực.
 * Chạy SAU JwtAuthGuard (req.user đã có), và `enterWith` persist suốt chuỗi
 * handler trong cùng async context.
 *
 * G0 — KHÔNG đổi hành vi: nếu request chưa có user/tenantId thì bỏ qua (không
 * enforce). super_admin có thể impersonate qua header `x-tenant-id`.
 *
 * _Requirements: 2.1, 5.1, 5.2_
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
    constructor(private readonly tenant: TenantContextService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (context.getType() !== 'http') return next.handle();

        const req: any = context.switchToHttp().getRequest();
        const user = req?.user;

        if (user && user.tenantId != null) {
            let tenantId = Number(user.tenantId);

            // Super admin: cho phép impersonate tenant qua header x-tenant-id.
            if (user.role === 'super_admin') {
                const hdr = req.headers?.['x-tenant-id'];
                const raw = Array.isArray(hdr) ? hdr[0] : hdr;
                if (raw) {
                    const parsed = parseInt(String(raw), 10);
                    if (Number.isFinite(parsed)) tenantId = parsed;
                }
            }

            if (Number.isFinite(tenantId)) {
                this.tenant.enter({
                    tenantId,
                    userId: String(user.id ?? 'unknown'),
                    role: String(user.role ?? ''),
                });
            }
        }

        return next.handle();
    }
}
