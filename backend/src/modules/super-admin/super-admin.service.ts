import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';
import { SubscriptionPlan } from '../../entities/subscription-plan.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { User, UserRole } from '../../entities/user.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class SuperAdminService {
    private readonly logger = new Logger(SuperAdminService.name);

    constructor(
        @InjectRepository(Tenant) private tenantRepo: Repository<Tenant>,
        @InjectRepository(SubscriptionPlan) private planRepo: Repository<SubscriptionPlan>,
        @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
        @InjectRepository(User) private userRepo: Repository<User>,
        @InjectDataSource() private dataSource: DataSource,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) {}

    // ─── Dashboard / Revenue Summary ───

    async getRevenueSummary() {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const [totalRevenue] = await this.paymentRepo.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'`
        );
        const [monthlyRevenue] = await this.paymentRepo.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid' AND paid_at >= $1`,
            [startOfMonth]
        );
        const [lastMonthRevenue] = await this.paymentRepo.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2`,
            [startOfLastMonth, startOfMonth]
        );

        const totalTenants = await this.tenantRepo.count();
        const activeTenants = await this.tenantRepo.count({ where: { status: TenantStatus.ACTIVE } });
        const trialTenants = await this.tenantRepo.count({ where: { status: TenantStatus.TRIAL } });

        const monthlyNum = parseFloat(monthlyRevenue.total);
        const lastMonthNum = parseFloat(lastMonthRevenue.total);
        const growthRate = lastMonthNum > 0 ? ((monthlyNum - lastMonthNum) / lastMonthNum * 100) : 0;

        return {
            totalRevenue: parseFloat(totalRevenue.total),
            monthlyRevenue: monthlyNum,
            lastMonthRevenue: lastMonthNum,
            growthRate: Math.round(growthRate * 10) / 10,
            totalTenants,
            activeTenants,
            trialTenants,
            suspendedTenants: totalTenants - activeTenants - trialTenants,
        };
    }

    async getMonthlyRevenue(months = 12) {
        // Issue #5 fix: Parameterized query instead of string interpolation
        const rows = await this.paymentRepo.query(`
            SELECT 
                TO_CHAR(paid_at, 'YYYY-MM') as month,
                SUM(amount) as revenue,
                COUNT(*) as payment_count
            FROM payments 
            WHERE status = 'paid' AND paid_at >= NOW() - make_interval(months => $1)
            GROUP BY TO_CHAR(paid_at, 'YYYY-MM')
            ORDER BY month ASC
        `, [months]);
        return rows;
    }

    // ─── Payments ───

    // Issue #1/#3 fix: Add getAllTenants for the Tenants tab
    async getAllTenants() {
        const tenants = await this.tenantRepo.find({ order: { createdAt: 'DESC' } });
        // Enrich with user count and plan name
        const enriched = await Promise.all(tenants.map(async (t) => {
            const usersCount = await this.userRepo.count({ where: { tenantId: t.id, isActive: true } });
            const plan = t.planId ? await this.planRepo.findOne({ where: { id: t.planId } }) : null;
            return {
                id: t.id,
                name: t.name,
                slug: t.slug || t.code,
                plan: plan?.code || 'free',
                status: t.status,
                created_at: t.createdAt?.toISOString() || '',
                users_count: usersCount,
                email: t.email,
                phone: t.phone,
                subscriptionEndsAt: t.subscriptionEndsAt,
            };
        }));
        return enriched;
    }

    // ─── Create Tenant ───

    async createTenant(data: {
        name: string;
        code: string;
        email?: string;
        phone?: string;
        planId?: number;
    }) {
        // Validate unique code
        const existing = await this.tenantRepo.findOne({ where: { code: data.code } });
        if (existing) throw new ForbiddenException(`Mã tenant "${data.code}" đã tồn tại`);

        // Create tenant
        const tenantEntity = Object.assign(new Tenant(), {
            name: data.name,
            code: data.code,
            slug: data.code,
            email: data.email || null,
            phone: data.phone || null,
            planId: data.planId || null,
            status: TenantStatus.TRIAL,
            // CONSOLIDATION (2026-06-19): single-schema `public`. Không trỏ schema riêng
            // (trước đây gán `tenant_<code>` nhưng KHÔNG provision → schema ảo gây nhầm lẫn).
            schemaName: 'public',
            maxUsers: 5,
        });
        const tenant = await this.tenantRepo.save(tenantEntity);

        // Auto-create admin user for this tenant
        const bcrypt = await import('bcryptjs');
        const defaultPassword = `${data.code}@2026`;
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        const adminEntity = Object.assign(new User(), {
            email: data.email || `admin@${data.code}.vn`,
            passwordHash,
            fullName: `Admin ${data.name}`,
            role: UserRole.ADMIN,
            tenantId: tenant.id,
            isActive: true,
        });
        const adminUser = await this.userRepo.save(adminEntity);

        this.logger.log(`🏢 Tenant created: ${data.code} (${data.name}) — Admin: ${adminUser.email}`);

        return {
            tenant,
            adminUser: {
                id: adminUser.id,
                email: adminUser.email,
                defaultPassword,
            },
        };
    }

    // Issue #7 fix: Add pagination support
    async getPayments(tenantId?: number, page = 1, limit = 50) {
        const qb = this.paymentRepo.createQueryBuilder('p')
            .orderBy('p.created_at', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);
        if (tenantId) qb.where('p.tenant_id = :tenantId', { tenantId });
        const [data, total] = await qb.getManyAndCount();
        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    // Issue #6 fix: Use transaction to prevent invoice number race condition
    async createPayment(data: {
        tenantId: number;
        planId?: number;
        amount: number;
        paymentMethod?: string;
        billingPeriod?: string;
        notes?: string;
    }) {
        return this.dataSource.transaction(async (manager) => {
            const paymentRepo = manager.getRepository(Payment);
            const count = await paymentRepo.count();
            const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

            const payment = await paymentRepo.save({
                tenantId: data.tenantId,
                planId: data.planId,
                amount: data.amount,
                paymentMethod: data.paymentMethod || 'bank_transfer',
                billingPeriod: data.billingPeriod || 'monthly',
                invoiceNumber,
                notes: data.notes,
                status: PaymentStatus.PENDING,
            });

            this.logger.log(`💰 Payment created: ${invoiceNumber} — ${data.amount} VND for tenant ${data.tenantId}`);
            return payment;
        });
    }

    async confirmPayment(paymentId: number) {
        const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.status === PaymentStatus.PAID) throw new ForbiddenException('Already paid');

        payment.status = PaymentStatus.PAID;
        payment.paidAt = new Date();

        // Calculate period
        const now = new Date();
        payment.periodStart = now;
        if (payment.billingPeriod === 'yearly') {
            payment.periodEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
        } else {
            payment.periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        }
        await this.paymentRepo.save(payment);

        // Activate tenant + extend subscription
        const tenant = await this.tenantRepo.findOne({ where: { id: payment.tenantId } });
        if (tenant) {
            tenant.status = TenantStatus.ACTIVE;
            tenant.subscriptionEndsAt = payment.periodEnd;
            if (payment.planId) tenant.planId = payment.planId;
            await this.tenantRepo.save(tenant);
        }

        this.logger.log(`✅ Payment confirmed: ${payment.invoiceNumber} — Tenant ${payment.tenantId} activated until ${payment.periodEnd.toISOString().slice(0, 10)}`);
        return payment;
    }

    // ─── Plans ───

    async getPlans() {
        return this.planRepo.find({ order: { sortOrder: 'ASC' } });
    }

    async updatePlan(id: number, data: Partial<SubscriptionPlan>) {
        await this.planRepo.update(id, data as any);
        return this.planRepo.findOne({ where: { id } });
    }

    // ─── Impersonation ───

    async impersonate(tenantId: number, superAdminId: string) {
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
        if (!tenant) throw new NotFoundException('Tenant not found');
        if (tenant.status === TenantStatus.SUSPENDED) throw new ForbiddenException('Tenant is suspended');

        // Find tenant's admin user
        let tenantAdmin = await this.userRepo.findOne({
            where: { tenantId, role: UserRole.ADMIN, isActive: true },
        });

        // If no admin, find any active user
        if (!tenantAdmin) {
            tenantAdmin = await this.userRepo.findOne({
                where: { tenantId, isActive: true },
            });
        }

        if (!tenantAdmin) throw new NotFoundException('No active user found for this tenant');

        // Generate short-lived token (5 min) for tenant context
        const token = this.jwtService.sign(
            {
                sub: tenantAdmin.id,
                email: tenantAdmin.email,
                role: tenantAdmin.role,
                tenantId: tenant.id,
                impersonatedBy: superAdminId,
                jti: randomUUID(),
            },
            {
                secret: this.configService.get('JWT_SECRET'),
                expiresIn: '5m',
            },
        );

        this.logger.warn(`🔓 Super admin ${superAdminId} impersonating tenant: ${tenant.code} (${tenant.name})`);

        return {
            token,
            tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
            expiresIn: 300,
        };
    }

    // ─── Tenant Usage Stats ───

    async getTenantStats(tenantId: number) {
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
        if (!tenant) throw new NotFoundException('Tenant not found');

        const userCount = await this.userRepo.count({ where: { tenantId, isActive: true } });

        // Issue #2 fix: Sanitize schemaName — only allow alphanumeric + underscore
        const rawSchema = tenant.schemaName || 'public';
        const schema = rawSchema.replace(/[^a-zA-Z0-9_]/g, '');
        if (schema !== rawSchema) {
            this.logger.warn(`⚠️ Schema name sanitized: "${rawSchema}" → "${schema}" for tenant ${tenantId}`);
        }

        let quoteCount = 0;
        let materialCount = 0;
        try {
            const [qc] = await this.dataSource.query(`SELECT COUNT(*) as cnt FROM "${schema}".quotes`);
            quoteCount = parseInt(qc.cnt);
            const [mc] = await this.dataSource.query(`SELECT COUNT(*) as cnt FROM "${schema}".materials`);
            materialCount = parseInt(mc.cnt);
        } catch { /* schema may not have data yet */ }

        const plan = tenant.planId ? await this.planRepo.findOne({ where: { id: tenant.planId } }) : null;

        return {
            tenant,
            plan,
            usage: {
                users: userCount,
                maxUsers: tenant.maxUsers,
                quotes: quoteCount,
                maxQuotes: plan?.maxQuotesPerMonth || 0,
                materials: materialCount,
            },
        };
    }
}
