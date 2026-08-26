import {
    CallHandler,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    NestInterceptor,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable } from 'rxjs';
import { Repository } from 'typeorm';
import { ZaloAccount } from '../../entities/zalo-account.entity';
import { UserRole } from '../../entities/user.entity';

/**
 * Resolve tenant từ principal đã được JWT xác thực. Super-admin chỉ bị scope khi
 * chủ động impersonate bằng x-tenant-id; nếu không có header thì giữ quyền toàn hệ thống.
 */
export function resolveZaloRequestTenantId(req: any): number | null {
    const user = req?.user;
    if (!user) return null;

    if (user.role === UserRole.SUPER_ADMIN) {
        const raw = Array.isArray(req?.headers?.['x-tenant-id'])
            ? req.headers['x-tenant-id'][0]
            : req?.headers?.['x-tenant-id'];
        if (raw == null || raw === '') return null;
        const parsed = Number(raw);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    const tenantId = Number(user.tenantId);
    return Number.isInteger(tenantId) && tenantId > 0 ? tenantId : null;
}

/**
 * Chốt resource authorization cho mọi route /accounts/:id trước khi controller
 * gọi ZaloPoolService (pool in-memory không có RLS và không tự biết tenant).
 */
@Injectable()
export class ZaloAccountAccessInterceptor implements NestInterceptor {
    constructor(
        @InjectRepository(ZaloAccount)
        private readonly repo: Repository<ZaloAccount>,
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        if (context.getType() !== 'http') return next.handle();

        const req: any = context.switchToHttp().getRequest();
        const accountId = req?.params?.id;
        if (!accountId) return next.handle();

        const user = req?.user;
        if (!user) throw new ForbiddenException('Không có quyền truy cập tài khoản Zalo.');

        const tenantId = resolveZaloRequestTenantId(req);
        if (user.role !== UserRole.SUPER_ADMIN && tenantId == null) {
            throw new ForbiddenException('Tài khoản đăng nhập không có tenant hợp lệ.');
        }

        const query = this.repo.createQueryBuilder('zalo')
            .innerJoinAndSelect('zalo.channel', 'channel')
            .where('zalo.id = :accountId', { accountId });

        // Super-admin không impersonate có thể quản trị toàn hệ thống. Khi đã gửi
        // x-tenant-id thì cũng bị giới hạn đúng tenant đang thao tác.
        if (tenantId != null) {
            query.andWhere('channel.tenantId = :tenantId', { tenantId });
        }

        const account = await query.getOne();
        if (!account) {
            // Dùng 404 để không tiết lộ account ID có tồn tại ở tenant khác hay không.
            throw new NotFoundException('Tài khoản Zalo không tồn tại.');
        }

        req.zaloAccount = account;
        return next.handle();
    }
}
