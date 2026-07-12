import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';
import { SubscriptionPlan } from '../../entities/subscription-plan.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { User, UserRole } from '../../entities/user.entity';
import { tenantRlsEnabled } from '../../common/tenant/tenant-background';
import { randomUUID, randomBytes } from 'crypto';

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
        username?: string;
        email?: string;
        phone?: string;
        planId?: number;
    }) {
        // Validate unique code
        const existing = await this.tenantRepo.findOne({ where: { code: data.code } });
        if (existing) throw new ForbiddenException(`Mã tenant "${data.code}" đã tồn tại`);

        // Định danh đăng nhập (cột users.email đóng vai trò "tên đăng nhập", unique):
        //  - Có `username` (không @) → `{username}@zeplao.vn` ⇒ đăng nhập chỉ cần gõ username
        //    (auth.service tự thử `{tên}@zeplao.vn`).
        //  - Có `email` hợp lệ → dùng email đó.
        //  - Không có gì → auto `admin@{code}.vn`.
        let loginEmail: string;
        if (data.username && data.username.trim()) {
            const u = data.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
            if (!u) throw new ForbiddenException('Tên đăng nhập không hợp lệ (chỉ gồm chữ thường, số, . _ -)');
            loginEmail = `${u}@zeplao.vn`;
        } else if (data.email && data.email.includes('@')) {
            loginEmail = data.email.trim().toLowerCase();
        } else {
            loginEmail = `admin@${data.code}.vn`;
        }

        // Chặn trùng định danh đăng nhập (email unique) → báo lỗi rõ thay vì vỡ DB.
        const dupUser = await this.userRepo.findOne({ where: { email: loginEmail } });
        if (dupUser) throw new ForbiddenException(`Tên đăng nhập/email "${loginEmail}" đã tồn tại`);

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

        // Auto-create admin user for this tenant.
        // BẢO MẬT: mật khẩu NGẪU NHIÊN mạnh (không đoán được) thay cho pattern cũ `${code}@2026`.
        // Trả về đúng 1 lần để super-admin bàn giao; super-admin có thể reset lại bất cứ lúc nào.
        const bcrypt = await import('bcryptjs');
        const defaultPassword = SuperAdminService.generateStrongPassword();
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        const adminEntity = Object.assign(new User(), {
            email: loginEmail,
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

    /**
     * Sinh mật khẩu ngẫu nhiên mạnh (crypto). Không đoán được — thay pattern cũ `${code}@2026`.
     * ~16 ký tự từ tập không nhập nhằng (bỏ O/0/I/l) + chèn ký tự đặc biệt để đủ độ phức tạp.
     */
    private static generateStrongPassword(): string {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
        const specials = '!@#$%^&*';
        const bytes = randomBytes(18);
        let out = '';
        for (let i = 0; i < 14; i++) out += alphabet[bytes[i] % alphabet.length];
        // Chèn 2 ký tự đặc biệt + 1 chữ số để chắc chắn đủ loại ký tự.
        out += specials[bytes[14] % specials.length];
        out += specials[bytes[15] % specials.length];
        out += (bytes[16] % 10).toString();
        return out;
    }

    // ─── Update / Lifecycle Tenant ───

    /**
     * Cập nhật thông tin cơ bản của tenant (không đổi `code`/`slug` để tránh vỡ tham chiếu).
     * Chỉ nhận các trường an toàn; bỏ qua field không hợp lệ.
     */
    async updateTenant(id: number, data: {
        name?: string; email?: string; phone?: string; address?: string;
        taxCode?: string; planId?: number; maxUsers?: number;
    }) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException(`Không tìm thấy tenant #${id}`);

        if (data.name !== undefined) tenant.name = String(data.name).trim().slice(0, 255);
        if (data.email !== undefined) tenant.email = data.email ? String(data.email).trim().slice(0, 255) : null as any;
        if (data.phone !== undefined) tenant.phone = data.phone ? String(data.phone).trim().slice(0, 20) : null as any;
        if (data.address !== undefined) tenant.address = data.address ? String(data.address).trim() : null as any;
        if (data.taxCode !== undefined) tenant.taxCode = data.taxCode ? String(data.taxCode).trim().slice(0, 50) : null as any;
        if (data.planId !== undefined) {
            if (data.planId === null) { tenant.planId = null as any; }
            else {
                const plan = await this.planRepo.findOne({ where: { id: data.planId } });
                if (!plan) throw new NotFoundException(`Không tìm thấy gói #${data.planId}`);
                tenant.planId = data.planId;
            }
        }
        if (data.maxUsers !== undefined) {
            const n = Number(data.maxUsers);
            if (!Number.isInteger(n) || n < 1) throw new ForbiddenException('maxUsers phải là số nguyên ≥ 1');
            tenant.maxUsers = n;
        }
        const saved = await this.tenantRepo.save(tenant);
        this.logger.log(`🏢 Tenant #${id} updated`);
        return saved;
    }

    /**
     * Đổi trạng thái vòng đời tenant (trial/active/suspended/cancelled).
     * Khi `suspended`/`cancelled`: vô hiệu hoá luôn user của tenant (chặn đăng nhập).
     * Khi trở lại `active`/`trial`: kích hoạt lại user.
     */
    async setTenantStatus(id: number, status: string) {
        const allowed = Object.values(TenantStatus) as string[];
        if (!allowed.includes(status)) {
            throw new ForbiddenException(`Trạng thái không hợp lệ: ${status}. Cho phép: ${allowed.join(', ')}`);
        }
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException(`Không tìm thấy tenant #${id}`);

        tenant.status = status as TenantStatus;
        await this.tenantRepo.save(tenant);

        // Đồng bộ trạng thái user: tạm ngưng/huỷ → khoá đăng nhập; kích hoạt lại → mở.
        const blocked = status === TenantStatus.SUSPENDED || status === TenantStatus.CANCELLED;
        await this.userRepo.update({ tenantId: id }, { isActive: !blocked });

        this.logger.log(`🏢 Tenant #${id} status → ${status} (users ${blocked ? 'disabled' : 'enabled'})`);
        return { id, status: tenant.status };
    }

    /**
     * Reset mật khẩu cho user ADMIN của tenant → sinh mật khẩu ngẫu nhiên mới, trả về 1 lần.
     * Dùng khi bàn giao lại tài khoản hoặc nghi lộ mật khẩu.
     */
    async resetTenantAdminPassword(id: number) {
        const tenant = await this.tenantRepo.findOne({ where: { id } });
        if (!tenant) throw new NotFoundException(`Không tìm thấy tenant #${id}`);

        const admin = await this.userRepo.findOne({
            where: { tenantId: id, role: UserRole.ADMIN },
            order: { id: 'ASC' },
        });
        if (!admin) throw new NotFoundException(`Tenant #${id} chưa có user ADMIN`);

        const bcrypt = await import('bcryptjs');
        const newPassword = SuperAdminService.generateStrongPassword();
        admin.passwordHash = await bcrypt.hash(newPassword, 10);
        admin.isActive = true;
        await this.userRepo.save(admin);

        this.logger.log(`🔑 Reset admin password for tenant #${id} (${admin.email})`);
        return { adminEmail: admin.email, newPassword };
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

            // Tạo trước (id do PK sequence cấp → duy nhất, an toàn tương tranh), rồi mới
            // đặt số hoá đơn theo id. Trước đây dùng count+1 → 2 payment đồng thời có thể trùng số.
            const payment = await paymentRepo.save({
                tenantId: data.tenantId,
                planId: data.planId,
                amount: data.amount,
                paymentMethod: data.paymentMethod || 'bank_transfer',
                billingPeriod: data.billingPeriod || 'monthly',
                notes: data.notes,
                status: PaymentStatus.PENDING,
            });

            payment.invoiceNumber = `INV-${new Date().getFullYear()}-${String(payment.id).padStart(5, '0')}`;
            await paymentRepo.save(payment);

            this.logger.log(`💰 Payment created: ${payment.invoiceNumber} — ${data.amount} VND for tenant ${data.tenantId}`);
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
        const plans = await this.planRepo.find({ order: { sortOrder: 'ASC' } });
        // Map entity (camelCase, price/yearlyPrice, features mảng) → contract snake_case mà
        // frontend dùng (price_monthly/price_yearly/max_users/is_active). Trước đây trả entity
        // thô nên FE hiển thị NaN/trống + features "0 1 2 3 4" (Object.keys của mảng).
        return plans.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            price_monthly: Number(p.price) || 0,
            price_yearly: Number(p.yearlyPrice) || 0,
            max_users: p.maxUsers ?? 0,
            max_quotes_per_month: p.maxQuotesPerMonth ?? 0,
            max_storage_mb: p.maxStorageMb ?? 0,
            features: Array.isArray(p.features) ? p.features : [],
            is_active: p.isActive,
            sort_order: p.sortOrder,
        }));
    }

    async updatePlan(id: number, data: Partial<SubscriptionPlan>) {
        await this.planRepo.update(id, data as any);
        return this.planRepo.findOne({ where: { id } });
    }

    // ─── Impersonation ───

    async impersonate(tenantId: number, superAdminId: string) {
        const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
        if (!tenant) throw new NotFoundException('Tenant not found');
        // Chặn impersonate tenant đã ngưng/huỷ: user của họ cũng đã bị vô hiệu hoá
        // (setTenantStatus), token impersonation sẽ vô nghĩa và dễ gây nhầm lẫn vận hành.
        if (tenant.status === TenantStatus.SUSPENDED || tenant.status === TenantStatus.CANCELLED) {
            throw new ForbiddenException(`Tenant is ${tenant.status}`);
        }

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
            // Đếm THEO tenant (trước đây COUNT(*) toàn bảng → mọi tenant cùng con số tổng).
            // Sau khi bật RLS: super-admin cần đếm cross-tenant (một tenant KHÁC tenant của
            // chính mình). Nếu chạy qua connection request (đã SET app.current_tenant = tenant
            // super-admin) thì RLS lọc về 0. → Dùng queryRunner RIÊNG với app.bypass='on' (hợp
            // lệ: cross-tenant có kiểm soát, route đã chặn SUPER_ADMIN). Cô lập trong transaction
            // này, KHÔNG rò bypass ra request. Cờ RLS TẮT → giữ nguyên đường cũ (dataSource.query).
            const rows = tenantRlsEnabled()
                ? await this.countTenantRowsBypass(schema, tenantId)
                : {
                    quotes: parseInt((await this.dataSource.query(`SELECT COUNT(*) as cnt FROM "${schema}".quotes WHERE tenant_id = $1`, [tenantId]))[0].cnt),
                    materials: parseInt((await this.dataSource.query(`SELECT COUNT(*) as cnt FROM "${schema}".materials WHERE tenant_id = $1`, [tenantId]))[0].cnt),
                };
            quoteCount = rows.quotes;
            materialCount = rows.materials;
        } catch { /* schema/cột tenant_id có thể chưa có → giữ 0 */ }

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

    /**
     * Đếm quotes/materials của MỘT tenant qua connection có `app.bypass='on'` — cho phép
     * super-admin đọc cross-tenant khi RLS đã bật. Dùng queryRunner riêng: bypass chỉ sống
     * trong transaction này (SET LOCAL), không ảnh hưởng request. `schema` đã được sanitize
     * ở caller (chỉ [a-zA-Z0-9_]).
     */
    private async countTenantRowsBypass(schema: string, tenantId: number): Promise<{ quotes: number; materials: number }> {
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            await qr.query(`SET LOCAL app.bypass = 'on'`);
            const [qc] = await qr.query(`SELECT COUNT(*) as cnt FROM "${schema}".quotes WHERE tenant_id = $1`, [tenantId]);
            const [mc] = await qr.query(`SELECT COUNT(*) as cnt FROM "${schema}".materials WHERE tenant_id = $1`, [tenantId]);
            await qr.commitTransaction();
            return { quotes: parseInt(qc.cnt), materials: parseInt(mc.cnt) };
        } catch (e) {
            await qr.rollbackTransaction();
            throw e;
        } finally {
            await qr.release();
        }
    }
}
