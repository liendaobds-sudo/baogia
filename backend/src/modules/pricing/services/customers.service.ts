import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Customer, CustomerPriceGroup, CustomerInteraction } from '../../../entities';
import { CreateCustomerDto, UpdateCustomerDto } from '../dto/create-customer.dto';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

@Injectable()
export class CustomersService {
    private readonly logger = new Logger(CustomersService.name);

    constructor(
        @InjectRepository(Customer) private repo: Repository<Customer>,
        @InjectRepository(CustomerPriceGroup) private groupRepo: Repository<CustomerPriceGroup>,
        @InjectRepository(CustomerInteraction) private interactionRepo: Repository<CustomerInteraction>,
        @InjectDataSource() private dataSource: DataSource,
        // Optional: một số TestingModule cô lập không nạp TenantContextModule (@Global).
        @Optional() private readonly tenant?: TenantContextService,
    ) { }

    /** tenant hiện hành (non-bypass) để GHI; null cho system/không context. */
    private writeTenantId(): number | null {
        const ctx = this.tenant?.get?.();
        return ctx && !ctx.bypass ? ctx.tenantId : null;
    }

    /**
     * Ràng buộc tenant cho SQL raw (lưới an toàn khi RLS chưa flip): trả về mệnh đề
     * `AND (tenant_id = $N OR tenant_id IS NULL)` + tham số, hoặc rỗng khi ngoài context/bypass.
     * @param nextIdx chỉ số tham số kế tiếp ($1-based) để nối vào query hiện có.
     */
    private tenantSql(nextIdx: number, col = 'tenant_id'): { clause: string; params: any[] } {
        const ctx = this.tenant?.get?.();
        if (!ctx || ctx.bypass) return { clause: '', params: [] };
        return { clause: ` AND (${col} = $${nextIdx} OR ${col} IS NULL)`, params: [ctx.tenantId] };
    }

    /** Tìm 1 KH theo field (phone/code) TRONG tenant hiện hành (+ NULL dùng chung); bỏ lọc khi bypass/no-ctx. */
    private async findOneByFieldInTenant(field: 'phone' | 'code', value: string): Promise<Customer | null> {
        const qb = this.repo.createQueryBuilder('c').where(`c.${field} = :v`, { v: value });
        const ctx = this.tenant?.get?.();
        if (ctx && !ctx.bypass) qb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid: ctx.tenantId });
        return qb.getOne();
    }

    /** Chặn thao tác chéo tenant trên 1 bản ghi đã nạp. */
    private assertSameTenant(row: { tenantId?: number | null } | any): void {
        const ctx = this.tenant?.get?.();
        if (!ctx || ctx.bypass) return;
        const t = row?.tenantId ?? row?.tenant_id ?? null;
        if (t != null && t !== ctx.tenantId) {
            throw new Error('Customer not found');
        }
    }

    // ─── Customers: List with pagination, search, tag & segment filters ───

    async findAllCustomers(filters: {
        search?: string; tag?: string; segment?: string;
        lifecycle_stage?: string;
        page?: number; limit?: number;
    } = {}) {
        const page = Math.max(1, filters.page || 1);
        const limit = Math.min(100, Math.max(10, filters.limit || 50));
        const offset = (page - 1) * limit;

        const qb = this.repo.createQueryBuilder('c')
            .select(['c.*'])
            .addSelect(sq => sq.select('COUNT(*)').from('quotes', 'o').where('o.customer_id = c.id'), 'total_orders')
            .addSelect(sq => sq.select('COALESCE(SUM(o.total), 0)').from('quotes', 'o').where('o.customer_id = c.id'), 'total_spent');

        if (filters.search) {
            qb.andWhere('(c.name LIKE :s OR c.phone LIKE :s OR c.code LIKE :s)', { s: `%${filters.search}%` });
        }
        if (filters.tag) {
            qb.andWhere("c.tags::jsonb @> :tag::jsonb", { tag: JSON.stringify(filters.tag) });
        }
        if (filters.segment) {
            qb.andWhere('c.rfm_segment = :segment', { segment: filters.segment });
        }
        if (filters.lifecycle_stage) {
            qb.andWhere('c.lifecycle_stage = :lifecycle', { lifecycle: filters.lifecycle_stage });
        }
        // Cô lập tenant (tầng app): chỉ KH của tenant hiện hành HOẶC dùng chung (NULL).
        const ctx = this.tenant?.get?.();
        if (ctx && !ctx.bypass) {
            qb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid: ctx.tenantId });
        }

        const total = await qb.getCount();
        const rows = await qb
            .orderBy('c.created_at', 'DESC')
            .offset(offset)
            .limit(limit)
            .getRawMany();
        // Trim PII nhạy cảm khỏi danh sách (chi tiết mới trả đầy đủ qua findCustomerById).
        const customers = rows.map((r: any) => {
            const { bank_account, bank_name, supabase_uid, notes, ...safe } = r;
            return safe;
        });
        const totalPages = Math.ceil(total / limit);

        return {
            data: customers,
            pagination: {
                page, limit, total, total_pages: totalPages,
                has_more: page < totalPages,
            },
        };
    }

    // ─── Customer: Get by ID with orders + debt ───

    async findCustomerById(id: string) {
        const t = this.tenantSql(2);
        const [customer] = await this.dataSource.query(
            `SELECT * FROM customers WHERE id = $1${t.clause}`, [id, ...t.params]);
        if (!customer) return null;

        // Orders with paid_amount — lọc theo tenant (không gộp báo giá tenant khác).
        const ot = this.tenantSql(2, 'o.tenant_id');
        const orders = await this.dataSource.query(`
            SELECT o.* FROM quotes o WHERE o.customer_id = $1${ot.clause} ORDER BY o.created_at DESC
        `, [id, ...ot.params]).catch(() => []);

        // Debt calculation
        let orderDebt = 0;
        for (const order of orders) {
            order.remaining_amount = parseFloat(order.total || 0);
            if (order.status !== 'cancelled') {
                orderDebt += order.remaining_amount;
            }
        }

        // CRM transactions debt
        let crmDebtChange = 0;
        try {
            const crmTxns = await this.dataSource.query(
                'SELECT type, SUM(amount) as total FROM customer_transactions WHERE customer_id = $1 GROUP BY type', [id],
            );
            for (const t of crmTxns) {
                if (t.type === 'adjustment') crmDebtChange += parseFloat(t.total);
                else if (t.type === 'payment') crmDebtChange -= parseFloat(t.total);
            }
        } catch { /* table doesn't exist */ }

        customer.orders = orders;
        customer.current_debt = orderDebt + crmDebtChange;
        customer.total_orders = orders.length;
        customer.total_spent = orders.reduce((sum: number, o: Record<string, unknown>) => sum + parseFloat(String(o.total) || '0'), 0);

        return customer;
    }

    // ─── Customer: Lookup by Phone ───

    async lookupByPhone(phone: string) {
        if (!phone) return { found: false, message: 'Số điện thoại không được để trống' };

        // Normalize phone
        phone = phone.replace(/[\s\-\.]/g, '').replace(/^(\+84|84)/, '0');

        const t = this.tenantSql(3, 'c.tenant_id');
        const [customer] = await this.dataSource.query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM quotes o WHERE o.customer_id = c.id) as total_orders,
                   (SELECT COALESCE(SUM(o.total), 0) FROM quotes o WHERE o.customer_id = c.id) as total_spent,
                   (SELECT MAX(o.created_at) FROM quotes o WHERE o.customer_id = c.id) as last_order_date
            FROM customers c WHERE (c.phone = $1 OR c.phone LIKE $2)${t.clause} LIMIT 1
        `, [phone, `%${phone}`, ...t.params]);

        if (!customer) {
            return {
                found: false, phone,
                message: 'Chưa có thông tin khách hàng với số điện thoại này',
                greeting: 'Xin chào! Rất vui được phục vụ quý khách.',
                isNewCustomer: true,
            };
        }

        // Recent orders
        const recentOrders = await this.dataSource.query(`
            SELECT id, code, created_at, total, status FROM quotes 
            WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 3
        `, [customer.id]).catch(() => []);

        return {
            found: true,
            customer: {
                id: customer.id, code: customer.code, name: customer.name,
                phone: customer.phone, email: customer.email, address: customer.address,
                company: customer.company || null,
            },
            stats: {
                totalOrders: parseInt(customer.total_orders),
                totalSpent: parseFloat(customer.total_spent),
                lastOrderDate: customer.last_order_date,
            },
            recentOrders,
            isNewCustomer: false,
        };
    }

    // ─── Customer: Smart Lookup ───

    async smartLookup(query: string) {
        if (!query || query.length < 3) {
            return { found: false, message: 'Cần nhập ít nhất 3 ký tự để tìm kiếm' };
        }
        query = query.trim();
        const normalizedPhone = query.replace(/[\s\-\.]/g, '').replace(/^(\+84|84)/, '0');

        const t = this.tenantSql(7, 'c.tenant_id');
        const [customer] = await this.dataSource.query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM quotes o WHERE o.customer_id = c.id) as total_orders,
                   (SELECT COALESCE(SUM(o.total), 0) FROM quotes o WHERE o.customer_id = c.id) as total_spent 
            FROM customers c 
            WHERE (c.phone = $1 OR c.phone LIKE $2 OR c.email = $3 OR c.tax_code = $4 OR c.code = $5 OR c.code LIKE $6)${t.clause} LIMIT 1
        `, [normalizedPhone, `%${normalizedPhone}`, query, query, query, `%${query}`, ...t.params]);

        if (!customer) return { found: false, query, message: 'Không tìm thấy khách hàng' };

        // Last order
        const [lastOrder] = await this.dataSource.query(`
            SELECT id, code, customer_name, customer_phone, customer_address, customer_unit, total, created_at
            FROM quotes WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1
        `, [customer.id]).catch(() => [null]);

        return {
            found: true,
            customer: {
                id: customer.id, code: customer.code, name: customer.name,
                phone: customer.phone, email: customer.email, address: customer.address,
                company: customer.company || null, tax_code: customer.tax_code || null,
            },
            stats: {
                totalOrders: parseInt(customer.total_orders),
                totalSpent: parseFloat(customer.total_spent),
            },
            last_order: lastOrder || null,
        };
    }

    // ─── Customer: Create (with auto-code, phone normalization, duplicate checks) ───

    async createCustomer(data: CreateCustomerDto) {
        if (!data.name) throw new Error('Customer name is required');

        // Auto-generate code
        if (!data.code) {
            const maxResult = await this.repo.createQueryBuilder('c')
                .select('MAX(c.id)', 'max_id')
                .getRawOne();
            const nextId = (parseInt(maxResult.max_id || '0') + 1);
            data.code = `KH${String(nextId).padStart(4, '0')}`;
        } else {
            // Trùng mã CHỈ xét trong tenant hiện hành (unique theo tenant).
            const dup = await this.findOneByFieldInTenant('code', data.code);
            if (dup) throw new Error('Customer code already exists');
        }

        // Normalize + check duplicate phone (theo tenant)
        if (data.phone) {
            data.phone = data.phone.replace(/[\s\-\.]/g, '').replace(/^(\+84|84)/, '0');
            const existing = await this.findOneByFieldInTenant('phone', data.phone);
            if (existing) throw new Error(`Số điện thoại đã tồn tại (Khách hàng: ${existing.name})`);
        }

        const customer = this.repo.create({
            code: data.code,
            name: data.name,
            customer_type: data.customer_type || 'individual',
            phone: data.phone ?? '',
            email: data.email ?? '',
            address: data.address ?? '',
            billing_address: data.billing_address ?? '',
            contact_person: data.contact_person ?? '',
            contact_phone: data.contact_phone ?? '',
            company: data.company ?? '',
            organization_name: data.organization_name ?? '',
            representative: data.representative ?? '',
            position: data.position ?? '',
            tax_code: data.tax_code ?? '',
            bank_account: data.bank_account ?? '',
            bank_name: data.bank_name ?? '',
            notes: data.notes ?? '',
            lifecycle_stage: data.lifecycle_stage || 'lead',
            source: data.source || 'web',
            product_interest: data.product_interest ?? '',
            tenantId: this.writeTenantId(),
        } as any);

        const saved = await this.repo.save(customer);
        const result = Array.isArray(saved) ? saved[0] : saved;
        this.logger.log(`Customer created: ${result.code} — ${result.name}`);

        return result;
    }

    // ─── Customer: Update ───

    async updateCustomer(id: string, data: UpdateCustomerDto) {
        const existing = await this.repo.findOne({ where: { id: parseInt(id) } });
        if (!existing) throw new Error('Customer not found');
        this.assertSameTenant(existing);

        // Check duplicate phone (theo tenant, loại trừ chính bản ghi đang sửa)
        if (data.phone) {
            data.phone = data.phone.replace(/[\s\-\.]/g, '').replace(/^(\+84|84)/, '0');
            const qb = this.repo.createQueryBuilder('c')
                .where('c.phone = :p', { p: data.phone })
                .andWhere('c.id != :id', { id: parseInt(id) });
            const ctx = this.tenant?.get?.();
            if (ctx && !ctx.bypass) qb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid: ctx.tenantId });
            const dup = await qb.getOne();
            if (dup) throw new Error(`Số điện thoại đã tồn tại (Khách hàng: ${(dup as any).name})`);
        }

        // Apply fields
        const allowedFields = [
            'name', 'customer_type', 'phone', 'email', 'address', 'billing_address',
            'contact_person', 'contact_phone', 'company', 'organization_name',
            'representative', 'position', 'tax_code', 'bank_account', 'bank_name', 'notes',
            'lifecycle_stage', 'lost_reason', 'follow_up_date', 'product_interest', 'source',
        ];

        for (const field of allowedFields) {
            if (data[field] !== undefined) (existing as any)[field] = data[field];
        }

        const updated = await this.repo.save(existing);
        this.logger.log(`Customer updated: ${(updated as any).code}`);
        return updated;
    }

    // ─── Customer: Delete (with dependency check) ───

    async deleteCustomer(id: string) {
        const customer = await this.repo.findOne({ where: { id: parseInt(id) } });
        if (!customer) throw new Error('Customer not found');
        this.assertSameTenant(customer);

        // Check dependencies (theo tenant) — if query fails, abort delete (don't swallow error)
        const dt = this.tenantSql(2, 'tenant_id');
        const [orderCount] = await this.dataSource.query(`SELECT COUNT(*) as cnt FROM quotes WHERE customer_id = $1${dt.clause}`, [id, ...dt.params]);
        if (parseInt(orderCount.cnt) > 0) {
            throw new Error(`Không thể xóa khách hàng đang có ${orderCount.cnt} báo giá. Hãy xóa báo giá trước.`);
        }

        await this.repo.remove(customer);
        this.logger.log(`Customer deleted: ${(customer as any).code}`);
    }

    // ─── Customer Price Groups ───

    async findAllGroups() { return this.groupRepo.find({ order: { name: 'ASC' } }); }
    async createGroup(data: Partial<CustomerPriceGroup>) { return this.groupRepo.save(this.groupRepo.create(data)); }
    async updateGroup(id: string, data: Partial<CustomerPriceGroup>) {
        await this.groupRepo.update(parseInt(id), data);
        return this.groupRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteGroup(id: string) { await this.groupRepo.delete(parseInt(id)); }

    // ─── Customer Interactions (Sales Pipeline) ───

    async findInteractions(customerId: string) {
        // Chỉ trả tương tác nếu KH thuộc tenant hiện hành (findCustomerById đã lọc tenant).
        const owner = await this.findCustomerById(customerId);
        if (!owner) return [];
        return this.interactionRepo.find({
            where: { customerId: parseInt(customerId) },
            order: { createdAt: 'DESC' },
        });
    }

    async createInteraction(data: {
        customer_id: number; type: string; content?: string;
        lost_reason?: string; product_interest?: string;
        follow_up_date?: string; quote_id?: number; created_by?: number;
    }) {
        const interaction = this.interactionRepo.create({
            customerId: data.customer_id,
            type: data.type || 'note',
            content: data.content || '',
            lostReason: data.lost_reason || null,
            productInterest: data.product_interest || null,
            followUpDate: data.follow_up_date ? new Date(data.follow_up_date) : null,
            quoteId: data.quote_id || null,
            createdBy: data.created_by || null,
        } as any);
        const saved = await this.interactionRepo.save(interaction);

        // Sync follow-up date and lost_reason to customer record
        const updates: Record<string, unknown> = {};
        if (data.follow_up_date) updates['follow_up_date'] = data.follow_up_date;
        if (data.lost_reason) {
            updates['lost_reason'] = data.lost_reason;
            updates['lifecycle_stage'] = 'lost';
        }
        if (data.product_interest) updates['product_interest'] = data.product_interest;
        if (Object.keys(updates).length > 0) {
            const sets = Object.entries(updates).map(([k], i) => `${k} = $${i + 2}`).join(', ');
            await this.dataSource.query(
                `UPDATE customers SET ${sets} WHERE id = $1`,
                [data.customer_id, ...Object.values(updates)],
            );
        }

        this.logger.log(`Interaction created for customer #${data.customer_id}: ${data.type}`);
        return Array.isArray(saved) ? saved[0] : saved;
    }

    // ─── Auto-create or link customer when a Quote is created ───

    async autoResolveFromQuote(data: {
        customer_name: string; customer_phone?: string;
        customer_unit?: string; tax_code?: string;
        customer_address?: string; quote_id?: number;
    }): Promise<number | null> {
        if (!data.customer_phone) return null;

        const phone = data.customer_phone.replace(/[\s\-\.]/g, '').replace(/^(\+84|84)/, '0');

        // Try to find existing customer by phone — CHỈ trong tenant hiện hành (không link chéo tenant).
        const existing = await this.findOneByFieldInTenant('phone', phone);
        if (existing) {
            // Upgrade lifecycle if still lead
            if ((existing as any).lifecycle_stage === 'lead') {
                await this.dataSource.query(
                    "UPDATE customers SET lifecycle_stage = 'prospect' WHERE id = $1",
                    [existing.id],
                );
            }
            // Log the interaction
            await this.createInteraction({
                customer_id: existing.id,
                type: 'quote_created',
                content: `Tạo báo giá mới cho ${data.customer_name}`,
                quote_id: data.quote_id,
            });
            return existing.id;
        }

        // Create new customer as Prospect
        try {
            const newCustomer = await this.createCustomer({
                name: data.customer_name,
                phone: phone,
                company: data.customer_unit || '',
                tax_code: data.tax_code || '',
                address: data.customer_address || '',
                lifecycle_stage: 'prospect',
                source: 'quote',
            } as CreateCustomerDto);

            await this.createInteraction({
                customer_id: (newCustomer as any).id,
                type: 'quote_created',
                content: `Khách hàng được tạo tự động từ báo giá`,
                quote_id: data.quote_id,
            });

            this.logger.log(`Auto-created customer from quote: ${data.customer_name} (${phone})`);
            return (newCustomer as any).id;
        } catch (e) {
            this.logger.warn(`Auto-create customer failed: ${e instanceof Error ? e.message : e}`);
            return null;
        }
    }

    // ─── Upgrade lifecycle when a Quote is completed ───

    async upgradeOnQuoteComplete(customerId: number) {
        // Lọc tenant: chỉ nâng cấp KH thuộc tenant hiện hành (phòng liên kết chéo).
        const st = this.tenantSql(2, 'tenant_id');
        const [customer] = await this.dataSource.query(`SELECT lifecycle_stage FROM customers WHERE id = $1${st.clause}`, [customerId, ...st.params]);
        if (!customer) return;

        if (['lead', 'prospect', 'lost'].includes(customer.lifecycle_stage)) {
            const ut = this.tenantSql(2, 'tenant_id');
            await this.dataSource.query(
                `UPDATE customers SET lifecycle_stage = 'customer', last_order_at = NOW() WHERE id = $1${ut.clause}`,
                [customerId, ...ut.params],
            );
            await this.createInteraction({
                customer_id: customerId,
                type: 'stage_change',
                content: `Chuyển trạng thái: ${customer.lifecycle_stage} → customer (Hoàn thành đơn hàng)`,
            });
            this.logger.log(`Customer #${customerId} upgraded to 'customer'`);
        }
    }
}
