import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';

@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);

    constructor(
        @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
    ) { }

    async log(params: {
        userId?: string;
        action: string;
        entityType: string;
        entityId: string;
        oldValue?: any;
        newValue?: any;
        metadata?: Record<string, any>;
        ipAddress?: string;
    }) {
        const entry = this.auditRepo.create({
            userId: params.userId,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            oldValue: params.oldValue || null,
            newValue: params.newValue || null,
            metadata: params.metadata || {},
            ipAddress: params.ipAddress || '',
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
        const where: any = {};
        if (query.entityType) where.entityType = query.entityType;
        if (query.entityId) where.entityId = query.entityId;
        if (query.userId) where.userId = query.userId;
        if (query.action) where.action = query.action;

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
