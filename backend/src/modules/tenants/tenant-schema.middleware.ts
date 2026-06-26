import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * TenantSchemaMiddleware: Automatically switch PostgreSQL search_path
 * based on the tenant context from the JWT.
 * 
 * Flow:
 * 1. JwtStrategy validates token → sets req.user with tenantId
 * 2. TenantGuard validates tenant access
 * 3. THIS middleware sets search_path on the DB connection
 * 
 * For super_admin: uses 'public' schema (default) unless x-tenant-id header overrides
 * For regular users: uses tenant's schema from DB
 */
@Injectable()
export class TenantSchemaMiddleware implements NestMiddleware {
    private readonly logger = new Logger(TenantSchemaMiddleware.name);
    private schemaCache = new Map<number, string>();

    constructor(
        @InjectDataSource() private dataSource: DataSource,
    ) {}

    async use(req: Request, _res: Response, next: NextFunction) {
        const user = (req as any).user;
        if (!user) {
            // Not authenticated — skip, let guards handle it
            return next();
        }

        let targetSchema = 'public'; // Default schema

        // Determine which tenant schema to use
        const tenantId = (req as any).tenantId || user.tenantId;
        if (tenantId) {
            targetSchema = await this.resolveSchema(tenantId);
        }

        // Set search_path on the DataSource connection
        try {
            await this.dataSource.query(`SET search_path TO "${targetSchema}", public`);
        } catch (err) {
            this.logger.warn(`Failed to set search_path to ${targetSchema}: ${err.message}`);
            // Fall back to default
            await this.dataSource.query('SET search_path TO "public"');
        }

        next();
    }

    /**
     * Resolve tenant ID to schema name (with cache)
     */
    private async resolveSchema(tenantId: number): Promise<string> {
        if (this.schemaCache.has(tenantId)) {
            return this.schemaCache.get(tenantId)!;
        }

        try {
            const [tenant] = await this.dataSource.query(
                'SELECT schema_name FROM tenants WHERE id = $1',
                [tenantId],
            );
            const schema = tenant?.schema_name || 'public';
            this.schemaCache.set(tenantId, schema);

            // Evict cache after 5 minutes
            setTimeout(() => this.schemaCache.delete(tenantId), 5 * 60 * 1000);

            return schema;
        } catch {
            return 'public';
        }
    }
}
