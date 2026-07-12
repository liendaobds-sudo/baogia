import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(
        @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
        // Optional: một số TestingModule cô lập không nạp TenantContextModule.
        @Optional() private readonly tenant?: TenantContextService,
    ) { }

    /** tenant hiện hành để GHI (non-bypass); null cho system/không context. */
    private writeTenantId(): number | null {
        const ctx = this.tenant?.get?.();
        return ctx && !ctx.bypass ? ctx.tenantId : null;
    }

    async log(params: {
        userId?: string;
        action: string;
        entityType: string;
        entityId: string;
        oldValue?: any;
        newValue?: any;
        metadata?: Record<string, any>;
        ipAddress?: string;
        tenantId?: number | null;
    }) {
        // tenantId tường minh (caller biết tenant, vd PermissionsGuard chạy TRƯỚC
        // TenantContextInterceptor nên context chưa có) được ưu tiên; ngược lại lấy từ context.
        // Cần thiết sau khi bật RLS: audit_logs SET NOT NULL tenant_id → ghi với null sẽ vỡ.
        const tenantId = params.tenantId != null ? params.tenantId : this.writeTenantId();
        const entry = this.auditRepo.create({
            userId: params.userId,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            oldValue: params.oldValue || null,
            newValue: params.newValue || null,
            metadata: params.metadata || {},
            ipAddress: params.ipAddress || '',
            tenantId,
        });
        await this.auditRepo.save(entry);
        this.logger.debug(`📝 Audit: ${params.action} ${params.entityType}:${params.entityId} by ${params.userId || 'system'}`);
    }

    async findAll(query: {
        entityType?: string;
        entityId?: string;
        userId?: string;
        action?: string;
        page?: number;
        limit?: number;
    }) {
        const page = query.page || 1;
        const limit = Math.min(query.limit || 50, 100);
        const base: any = {};
        if (query.entityType) base.entityType = query.entityType;
        if (query.entityId) base.entityId = query.entityId;
        if (query.userId) base.userId = query.userId;
        if (query.action) base.action = query.action;

        // Lọc tenant tầng app: tenant hiện hành HOẶC NULL (log hệ thống/legacy); bypass/không
        // context → không lọc (trả nguyên `base`).
        const ctx = this.tenant?.get?.();
        const where = (!ctx || ctx.bypass)
            ? base
            : [{ ...base, tenantId: ctx.tenantId }, { ...base, tenantId: IsNull() }];

        const [data, total] = await this.auditRepo.findAndCount({
            where,
            relations: ['user'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            data: data.map(a => ({
                id: a.id,
                action: a.action,
                entityType: a.entityType,
                entityId: a.entityId,
                user: a.user ? { id: a.user.id, fullName: a.user.fullName } : null,
                oldValue: a.oldValue,
                newValue: a.newValue,
                createdAt: a.createdAt,
            })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }
}
