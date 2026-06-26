import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @TenantId() — Extract tenantId from request context
 * Usage: getTenantData(@TenantId() tenantId: number) { ... }
 */
export const TenantId = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): number | null => {
        const request = ctx.switchToHttp().getRequest();
        return request.tenantId || request.user?.tenantId || null;
    },
);
