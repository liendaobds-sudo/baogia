import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';
import { SubscriptionPlan } from '../../entities/subscription-plan.entity';

@Injectable()
export class TenantService implements OnModuleInit {
    private readonly logger = new Logger(TenantService.name);

    constructor(
        @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
        @InjectRepository(SubscriptionPlan) private planRepo: Repository<SubscriptionPlan>,
        @InjectDataSource() private dataSource: DataSource,
    ) {}

    async onModuleInit() {
        await this.seedDefaults();
    }

    // ─── Seed defaults ───
    private async seedDefaults() {
        // Seed default plans
        const planCount = await this.planRepo.count();
        if (planCount === 0) {
            await this.planRepo.save([
                {
                    code: 'free', name: 'Miễn phí', price: 0,
                    maxUsers: 2, maxQuotesPerMonth: 100, maxStorageMb: 200,
                    features: ['Báo giá cơ bản', 'Quản lý vật tư', '2 tài khoản'],
                    sortOrder: 1,
                },
                {
                    code: 'pro', name: 'Chuyên nghiệp', price: 500000, yearlyPrice: 5000000,
                    maxUsers: 10, maxQuotesPerMonth: 5000, maxStorageMb: 2000,
                    features: ['Tất cả tính năng Free', 'Báo giá nâng cao', 'Quản lý đơn hàng', 'Chatbot AI', '10 tài khoản'],
                    sortOrder: 2,
                },
                {
                    code: 'enterprise', name: 'Doanh nghiệp', price: 2000000, yearlyPrice: 20000000,
                    maxUsers: 50, maxQuotesPerMonth: 50000, maxStorageMb: 10000,
                    features: ['Tất cả tính năng Pro', 'API tích hợp', 'Hỗ trợ ưu tiên', 'Không giới hạn báo giá', '50 tài khoản'],
                    sortOrder: 3,
                },
            ]);
            this.logger.log('📦 Seeded 3 subscription plans (free, pro, enterprise)');
        }

        // Seed default tenant (current shop)
        const tenantCount = await this.tenantRepo.count();
        if (tenantCount === 0) {
            const freePlan = await this.planRepo.findOne({ where: { code: 'pro' } });
            const tenant = await this.tenantRepo.save({
                code: 'default',
                name: 'Xưởng In Mặc Định',
                slug: 'default',
                status: TenantStatus.ACTIVE,
                planId: freePlan?.id || 1,
                schemaName: 'public',  // All tables now in public schema
                maxUsers: 10,
                settings: { vat_rate: 10 },
            });
            this.logger.log(`📦 Seeded default tenant: ${tenant.name} (schema: public)`);
        }
    }

    // ─── CRUD ───

    async findAll() {
        return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
    }

    async findById(id: number) {
        return this.tenantRepo.findOne({ where: { id } });
    }

    async findByCode(code: string) {
        return this.tenantRepo.findOne({ where: { code } });
    }

    async create(data: Partial<Tenant>) {
        // Validate unique code
        const existing = await this.tenantRepo.findOne({ where: { code: data.code } });
        if (existing) throw new Error(`Tenant code "${data.code}" đã tồn tại`);

        // CONSOLIDATION (2026-06-19): hệ chạy SINGLE-SCHEMA `public`.
        // Không tạo schema riêng cho mỗi tenant nữa (trước đây sinh ra các schema rỗng
        // `tenant_*` gây nhầm lẫn). Mọi tenant dùng chung `public`.
        // Muốn bật multi-tenant thật: đặt schemaName = `tenant_<code>` và gọi lại
        // provisionTenantSchema(), đồng thời bật TenantSchemaMiddleware trong app.module.ts.
        const tenant = await this.tenantRepo.save({
            ...data,
            schemaName: 'public',
            status: data.status || TenantStatus.TRIAL,
        });

        this.logger.log(`✅ Created tenant: ${tenant.name} (schema: public, single-schema mode)`);
        return tenant;
    }

    async update(id: number, data: Partial<Tenant>) {
        await this.tenantRepo.update(id, data as any);
        return this.findById(id);
    }

    async suspend(id: number) {
        return this.update(id, { status: TenantStatus.SUSPENDED } as Partial<Tenant>);
    }

    async activate(id: number) {
        return this.update(id, { status: TenantStatus.ACTIVE } as Partial<Tenant>);
    }

    // ─── Schema Provisioning ───

    /**
     * Create a new PostgreSQL schema for a tenant and copy table structure from 'public' schema
     */
    private async provisionTenantSchema(schemaName: string) {
        this.logger.log(`🔧 Provisioning schema: ${schemaName}`);

        // Create schema
        await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

        // Get all tables in public schema
        const tables = await this.dataSource.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);

        // Copy table structure (no data) from public schema
        for (const { table_name } of tables) {
            try {
                await this.dataSource.query(
                    `CREATE TABLE IF NOT EXISTS "${schemaName}"."${table_name}" (LIKE "public"."${table_name}" INCLUDING ALL)`
                );
            } catch (e) {
                this.logger.warn(`⚠️ Could not clone table ${table_name}: ${e.message}`);
            }
        }

        this.logger.log(`✅ Schema "${schemaName}" provisioned with ${tables.length} tables`);
    }
}
