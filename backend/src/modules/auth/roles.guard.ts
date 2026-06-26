import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../entities';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) =>
    (target: any, key?: string, descriptor?: any) => {
        Reflect.defineMetadata(ROLES_KEY, roles, descriptor?.value ?? target);
        return descriptor ?? target;
    };

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
            ROLES_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('Không có quyền truy cập');
        }

        // SUPER_ADMIN bypasses all role checks
        if (user.role === 'super_admin') {
            return true;
        }

        const hasRole = requiredRoles.includes(user.role);
        if (!hasRole) {
            throw new ForbiddenException(
                `Cần quyền ${requiredRoles.join(' hoặc ')} để truy cập`,
            );
        }

        return true;
    }
}
