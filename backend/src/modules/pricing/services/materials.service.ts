import { Injectable, Logger, Optional, NotFoundException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Not, ILike, SelectQueryBuilder, FindOptionsWhere, DeepPartial } from 'typeorm';
import { Material, MaterialType, InventorySlip, InventorySlipItem } from '../../../entities';
import { MaterialCategory } from '../entities/material-categories.entity';
import { ProcessingOption } from '../entities/processing-options.entity';
import { ProcessingPricing } from '../../../entities/processing-pricing.entity';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { applyTenantToConnection } from '../../../common/tenant/tenant-transaction';
import {
    ProductType,
    Scope,
    ScopeFlags,
    filterForProductType,
    isActive,
    validateScopeFlags,
    deriveScopeLabel,
} from '../scope/resource-scope-rule';
import { UpdateScopeDto } from '../dto/update-scope.dto';
import { computeConversionFactor, weightedAvgCost } from '../lib/cost-helpers';

/**
 * Tham số lọc Phạm_Vi dùng chung cho các endpoint đọc Tài_Nguyên_Dùng_Chung.
 * - `scope`: khi có, chỉ trả tài nguyên thuộc Loại_Sản_Phẩm đó VÀ đang hoạt động (qua Quy_Tắc_Phạm_Vi).
 * - `activeOnly`: khi true (và không truyền `scope`), chỉ trả tài nguyên đang hoạt động.
 * - Không truyền gì → hành vi tương thích ngược (trả tất cả).
 */
export interface ScopeListQuery {
    scope?: ProductType;
    activeOnly?: boolean;
}

/** Các Loại_Sản_Phẩm in nhanh hợp lệ cho tham số `scope`. */
const VALID_PRODUCT_TYPES: ProductType[] = ['loose', 'bound', 'large_format'];

/**
 * Vật tư offset phải có đơn giá > 0: engine đọc `unitPrice` làm chi phí giấy
 * (`lookups.ts giaGiay`); thiếu/0 → chi phí giấy = 0 âm thầm, báo giá sai không nổ lỗi.
 * Giả định nghiệp vụ: giấy offset luôn có giá. Nếu sau này có case giấy khách tự cung
 * cấp (giá 0 hợp lệ), nới quy tắc tại đây.
 */
function offsetPriceValid(price: unknown): boolean {
    const n = typeof price === 'number' ? price : parseFloat(String(price));
    return Number.isFinite(n) && n > 0;
}

export interface PaginatedResult<T> {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
        has_prev: boolean;
        has_next: boolean;
    };
}

@Injectable()
export class MaterialsService {
    private readonly logger = new Logger(MaterialsService.name);

    constructor(
        @InjectRepository(Material) private repo: Repository<Material>,
        @InjectRepository(MaterialType) private typeRepo: Repository<MaterialType>,
        @InjectRepository(MaterialCategory) private catRepo: Repository<MaterialCategory>,
        @InjectRepository(ProcessingOption) private optRepo: Repository<ProcessingOption>,
        @InjectRepository(ProcessingPricing) private processingPricingRepo: Repository<ProcessingPricing>,
        @InjectDataSource() private dataSource: DataSource,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) { }

    // ─── Helper: base query with common JOINs ───

    private baseQuery(): SelectQueryBuilder<Material> {
        return this.repo.createQueryBuilder('m')
            .leftJoinAndSelect('paper_sizes', 'ps', 'ps.id = m.paper_size_id')
            .leftJoinAndSelect('units', 'u', 'u.id = m.unit_id')
            .leftJoinAndSelect('material_types', 'mt', 'mt.code = m.type');
    }

    // ─── Materials: List with full PHP-parity filters + pagination ───

    async findAllMaterials(filters: {
        type?: string; category?: string; status?: string; keyword?: string;
        scope?: string; tab_scope?: string; material_format?: string;
        activeOnly?: boolean;
        page?: number; limit?: number;
    } = {}) {
        const qb = this.repo.createQueryBuilder('m')
            .select([
                'm.*',
                'ps.name as paper_size_name',
                'u.name as unit_name',
                'mt.name as type_name',
                'mt.tab_scope',
            ])
            .addSelect(subQuery =>
                subQuery.select('COALESCE(SUM(qi.sheets_needed), 0)')
                    .from('quote_items', 'qi')
                    .innerJoin('quotes', 'q', 'qi.quote_id = q.id')
                    .where('qi.material_id = m.id')
                    .andWhere("q.status NOT IN ('completed', 'cancelled', 'converted')"),
                'pending_quantity',
            )
            .addSelect(subQuery =>
                subQuery.select('COUNT(*) > 0')
                    .from('pricing_tiers', 'pt')
                    .where('pt.material_id = m.id'),
                'has_pricing_tier',
            )
            .leftJoin('paper_sizes', 'ps', 'ps.id = m.paper_size_id')
            .leftJoin('units', 'u', 'u.id = m.unit_id')
            .leftJoin('material_types', 'mt', 'mt.code = m.type');

        // ─── Filters ───
        if (filters.type) {
            qb.andWhere('m.type = :type', { type: filters.type });
        }
        if (filters.status) {
            if (filters.status === 'low_stock') {
                qb.andWhere('m.min_stock > 0 AND m.stock <= m.min_stock');
            } else if (filters.status === 'normal') {
                qb.andWhere('(m.min_stock = 0 OR m.min_stock IS NULL OR m.stock > m.min_stock)');
            } else {
                qb.andWhere('m.status = :status', { status: filters.status });
            }
        }
        if (filters.keyword) {
            qb.andWhere('(m.code LIKE :kw OR m.name LIKE :kw)', { kw: `%${filters.keyword}%` });
        }
        if (filters.scope) {
            // Lọc Phạm_Vi qua Quy_Tắc_Phạm_Vi canonical làm NGUỒN SỰ THẬT DUY NHẤT.
            // Tập scope hợp lệ lấy theo kiểu canonical `Scope` (offset + 3 loại in nhanh).
            const validScopes: Scope[] = ['loose', 'bound', 'large_format', 'offset'];
            if (validScopes.includes(filters.scope as Scope)) {
                // Cột scope_* của `materials` là BOOLEAN. Với cờ boolean, điều kiện SQL
                // `m.scope_${scope} = true` TƯƠNG ĐƯƠNG CHÍNH XÁC canonical `resourceInScope(r, scope)`
                // (canonical `isOn` coi true = Bật; false/NULL = Tắt) → group-agnostic, Req 1.6.
                // Giữ SQL (thay vì post-filter) để phân trang đếm/cắt đúng ở tầng DB.
                // (Postgres ném "operator does not exist: boolean = integer" nếu dùng = 1.)
                qb.andWhere(`m.scope_${filters.scope} = true`);
            }
        }
        // Lưu ý: bảng `materials` KHÔNG có cột `is_active` (xem material.entity.ts) → `filters.activeOnly`
        // là no-op ở đây (mọi vật tư coi như đang hoạt động). Vẫn nhận tham số để đồng nhất ScopeListQuery
        // với các endpoint Tài_Nguyên_Dùng_Chung khác (processing-options, paper-sizes).
        if (filters.category) {
            qb.andWhere('m.category_tab = :category', { category: filters.category });
        }
        if (filters.tab_scope) {
            const scopes = filters.tab_scope.split(',').map(s => s.trim());
            qb.andWhere('m.type IN (SELECT code FROM material_types WHERE tab_scope IN (:...tabScopes))', { tabScopes: scopes });
        }
        if (filters.material_format) {
            qb.andWhere('m.material_format = :materialFormat', { materialFormat: filters.material_format });
        }

        qb.orderBy('m.name', 'ASC');

        // ─── Pagination ───
        const page = filters.page ? Math.max(1, filters.page) : null;
        const limit = filters.limit ? Math.max(1, Math.min(500, filters.limit)) : null;

        if (page && limit) {
            const total = await qb.getCount();
            const offset = (page - 1) * limit;
            const items = await qb.offset(offset).limit(limit).getRawMany();
            const totalPages = Math.ceil(total / limit);

            return {
                items,
                pagination: {
                    page, limit, total, total_pages: totalPages,
                    has_prev: page > 1, has_next: page < totalPages,
                },
            };
        }

        return await qb.getRawMany();
    }

    // ─── Materials: Get by ID (with JOINs) ─── 

    async findMaterialById(id: string) {
        const result = await this.repo.createQueryBuilder('m')
            .select(['m.*', 'ps.name as paper_size_name', 'u.name as unit_name'])
            .leftJoin('paper_sizes', 'ps', 'ps.id = m.paper_size_id')
            .leftJoin('units', 'u', 'u.id = m.unit_id')
            .where('m.id = :id', { id })
            .getRawOne();
        return result || null;
    }

    // ─── Materials: Low stock ───

    async findLowStock() {
        return this.repo.createQueryBuilder('m')
            .select(['m.*', 'ps.name as paper_size_name', 'u.name as unit_name'])
            .leftJoin('paper_sizes', 'ps', 'ps.id = m.paper_size_id')
            .leftJoin('units', 'u', 'u.id = m.unit_id')
            .where('m.stock < m.min_stock')
            .orderBy('m.name', 'ASC')
            .getRawMany();
    }

    // ─── Materials: Missing pricing tiers ───

    async findMissingPricing(limit?: number) {
        const qb = this.repo.createQueryBuilder('m')
            .select([
                'm.id', 'm.code', 'm.name', 'm.type', 'm.stock', 'm.category',
                'm.scope_loose', 'm.scope_bound', 'm.scope_large_format',
                'ps.name as paper_size_name', 'u.name as unit_name', 'mt.name as type_name',
            ])
            .leftJoin('paper_sizes', 'ps', 'ps.id = m.paper_size_id')
            .leftJoin('units', 'u', 'u.id = m.unit_id')
            .leftJoin('material_types', 'mt', 'mt.code = m.type')
            .leftJoin('pricing_tiers', 'pt', 'pt.material_id = m.id')
            .where('pt.id IS NULL')
            .andWhere('(m.scope_loose = true OR m.scope_bound = true OR m.scope_large_format = true)')
            .orderBy('m.name', 'ASC');

        if (limit) qb.limit(limit);

        const materials = await qb.getRawMany();

        const countQb = this.repo.createQueryBuilder('m')
            .leftJoin('pricing_tiers', 'pt', 'pt.material_id = m.id')
            .where('pt.id IS NULL')
            .andWhere('(m.scope_loose = true OR m.scope_bound = true OR m.scope_large_format = true)');
        const total = await countQb.getCount();

        return {
            count: total,
            showing: materials.length,
            materials,
            message: total > 0
                ? `${total} vật tư dùng cho báo giá chưa có định mức`
                : 'Tất cả vật tư dùng cho báo giá đã có định mức',
        };
    }

    // ─── Materials: Check code uniqueness ───

    async checkCode(code: string, excludeId?: string) {
        if (!code) return { exists: false };
        const where: FindOptionsWhere<Material> = { code };
        if (excludeId) where.id = Not(parseInt(excludeId));
        const existing = await this.repo.findOne({ where });
        return { exists: !!existing, code };
    }

    // ─── Materials: Check name uniqueness ───

    async checkName(name: string, excludeId?: string) {
        if (!name) return { exists: false };
        const qb = this.repo.createQueryBuilder('m')
            .where('LOWER(m.name) = LOWER(:name)', { name });
        if (excludeId) qb.andWhere('m.id != :excludeId', { excludeId });
        const existing = await qb.getOne();
        return {
            exists: !!existing,
            name,
            existing_code: existing?.code || null,
        };
    }

    // ─── Materials: Create (with auto-code, duplicate checks) ───

    async createMaterial(data: any) {
        if (!data.name) throw new Error('Name is required');
        if (data.stock !== undefined && parseFloat(String(data.stock)) < 0) throw new Error('Tồn kho không được âm');
        if (data.min_stock !== undefined && parseFloat(String(data.min_stock)) < 0) throw new Error('Tồn kho tối thiểu không được âm');

        // Auto-generate code
        let code = data.code ? data.code.trim() : '';
        if (!code) {
            const now = new Date();
            const dateStr = now.getFullYear().toString().slice(-2) +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0');
            const micro = Date.now().toString().slice(-4);
            code = `MAT-${dateStr}-${micro}${Math.floor(Math.random() * 10)}`;
        }

        // Check duplicate code
        const existingCode = await this.repo.findOne({ where: { code } });
        if (existingCode) throw new Error(`Material code already exists (${code})`);

        // Check duplicate name
        const existingName = await this.repo.createQueryBuilder('m')
            .where('LOWER(m.name) = LOWER(:name)', { name: data.name.trim() })
            .getOne();
        if (existingName) throw new Error(`Material name already exists (${data.name})`);

        const stockValue = data.stock_quantity || data.stock || 0;

        // Vật tư offset bắt buộc có đơn giá > 0 (engine đọc làm chi phí giấy — fail fast).
        // MIỄN cho khổ xả (sheet_role='child'): con KHÔNG có giá riêng, giá dẫn xuất từ vật tư
        // khổ nhập cha (giá cha / số khổ xả trên tờ nhập). Chỉ khổ nhập (parent) + vật tư thường mới cần giá.
        const willBeOffset = data.scope_offset !== undefined ? !!Number(data.scope_offset) : false;
        const isChildSheet = data.sheet_role === 'child';
        if (willBeOffset && !isChildSheet && !offsetPriceValid(data.unit_price)) {
            throw new BadRequestException('Vật tư In Offset phải có đơn giá (giá giấy) lớn hơn 0.');
        }

        // Map input (snake_case từ DTO/frontend) → property canonical (camelCase) của
        // entity Material chung. Bỏ các field KHÔNG phải cột thật trong bảng `materials`
        // (display_name, size_spec, stock_quantity, stock_unit_type). Scope/charge là BOOLEAN.
        const material = this.repo.create({
            code,
            name: data.name,
            type: data.type || 'other',
            categoryTab: data.category_tab || null,
            category: data.category || 'printing',
            paperSizeId: data.paper_size_id || null,
            sheetRole: data.sheet_role || null,
            parentMaterialId: data.parent_material_id || null,
            unitId: data.unit_id || null,
            unit: data.unit || 'tờ',
            width: data.width || null,
            height: data.height || null,
            unitPrice: data.unit_price || 0,
            pricePerSheet: data.pricePerSheet || null,
            setupFee: data.setupFee || 0,
            stock: stockValue,
            minStock: data.min_stock || 0,
            status: data.status || 'normal',
            scopeLoose: data.scope_loose !== undefined ? !!Number(data.scope_loose) : true,
            scopeBound: data.scope_bound !== undefined ? !!Number(data.scope_bound) : false,
            scopeLargeFormat: data.scope_large_format !== undefined ? !!Number(data.scope_large_format) : false,
            scopeOffset: data.scope_offset !== undefined ? !!Number(data.scope_offset) : false,
            rollWidth: data.roll_width || null,
            chargeFullWidth: data.charge_full_width !== undefined ? !!Number(data.charge_full_width) : false,
            pricePerSqm: data.price_per_sqm || null,
            minChargeArea: data.min_charge_area || null,
            rollLength: data.roll_length || null,
            gsm: data.gsm || null,
            notes: data.notes || null,
            wastePercent: data.waste_percent || null,
            costPrice: data.cost_price || 0,
            materialFormat: data.material_format || 'sheet',
            priceUnit: data.price_unit || 'sheet',
        } as DeepPartial<Material>);

        const saved = await this.repo.save(material);
        this.logger.log(`Material created: ${saved.code} — ${saved.name}`);
        // Khổ nhập (parent) + có danh sách khổ xả tick → sinh vật tư con thật (self-FK về cha).
        if (Array.isArray(data.child_sheets) && data.child_sheets.length > 0) {
            await this.syncChildSheets(saved, data.child_sheets);
        }
        return saved;
    }

    /**
     * Sinh vật tư con (khổ xả) từ danh sách khổ tick trong màn vật tư cha (khổ nhập).
     * Mỗi con: mã TỰ SINH `${cha.code}-${w}x${h}`, `sheet_role='child'`, `parent_material_id=cha.id`,
     * KHÔNG có giá (dẫn xuất từ cha lúc tính giá). Kế thừa `scope_offset`/`type`/`unit` từ cha.
     * Idempotent theo mã: con đã tồn tại → bỏ qua (không nhân đôi khi sửa lại cha).
     */
    async syncChildSheets(parent: Material, childSheets: Array<{ width: number; height: number; name?: string }>): Promise<void> {
        for (const cs of childSheets) {
            const w = Number(cs.width);
            const h = Number(cs.height);
            if (!(w > 0 && h > 0)) continue; // khổ không hợp lệ → bỏ
            const childCode = `${parent.code}-${w}x${h}`;
            const dup = await this.repo.findOne({ where: { code: childCode } });
            if (dup) continue; // đã có → idempotent
            const child = this.repo.create({
                code: childCode,
                name: cs.name?.trim() || `${parent.name} (${w}×${h}mm)`,
                type: parent.type,
                category: parent.category,
                categoryTab: parent.categoryTab,
                sheetRole: 'child',
                parentMaterialId: parent.id,
                width: w,
                height: h,
                unit: parent.unit,
                unitPrice: 0, // giá dẫn xuất từ cha, không nhập tay
                scopeOffset: parent.scopeOffset,
                scopeLoose: false,
                scopeBound: false,
                scopeLargeFormat: false,
                materialFormat: 'sheet',
                priceUnit: 'sheet',
                status: 'normal',
                stock: 0,
                minStock: 0,
            } as DeepPartial<Material>);
            await this.repo.save(child);
            this.logger.log(`Child sheet created: ${childCode} (parent ${parent.code})`);
        }
    }

    // ─── Materials: Update (dynamic fields, stock_adjustment, UoM lock) ───

    async updateMaterial(id: string, data: any) {
        const existing = await this.repo.findOne({ where: { id: parseInt(id) } });
        if (!existing) throw new Error('Material not found');

        // Check duplicate code
        if (data.code) {
            const dup = await this.repo.findOne({ where: { code: data.code.trim(), id: Not(parseInt(id)) } });
            if (dup) throw new Error('Material code already exists');
        }

        // Check duplicate name
        if (data.name) {
            const dup = await this.repo.createQueryBuilder('m')
                .where('LOWER(m.name) = LOWER(:name)', { name: data.name.trim() })
                .andWhere('m.id != :id', { id })
                .getOne();
            if (dup) throw new Error('Material name already exists');
        }

        // Lock UoM if transactions exist
        if (data.unit !== undefined || data.unit_id !== undefined) {
            try {
                const txnCount = await this.dataSource.getRepository(InventorySlipItem)
                    .count({ where: { material_id: parseInt(id) } });
                if (txnCount > 0) {
                    throw new Error(`Không thể đổi đơn vị khi vật tư đã có ${txnCount} giao dịch kho.`);
                }
            } catch (e: unknown) {
                if (e instanceof Error && e.message.includes('Không thể đổi')) throw e;
            }
        }

        // Apply allowed fields — map snake_case (input) → property canonical (camelCase) của
        // entity Material chung. Bỏ field KHÔNG phải cột thật trong `materials`
        // (display_name, size_spec, stock_quantity, stock_unit_type, last_import_price).
        const FIELD_MAP: Record<string, string> = {
            code: 'code', name: 'name', type: 'type', category_tab: 'categoryTab', category: 'category',
            paper_size_id: 'paperSizeId', sheet_role: 'sheetRole', parent_material_id: 'parentMaterialId', unit_id: 'unitId', unit: 'unit', width: 'width', height: 'height',
            unit_price: 'unitPrice', pricePerSheet: 'pricePerSheet', setupFee: 'setupFee', stock: 'stock',
            min_stock: 'minStock', status: 'status', scope_loose: 'scopeLoose', scope_bound: 'scopeBound',
            scope_large_format: 'scopeLargeFormat', scope_offset: 'scopeOffset', roll_width: 'rollWidth', charge_full_width: 'chargeFullWidth',
            price_per_sqm: 'pricePerSqm', min_charge_area: 'minChargeArea', roll_length: 'rollLength',
            cost_price: 'costPrice', gsm: 'gsm', notes: 'notes',
        };
        const BOOL_PROPS = new Set(['scopeLoose', 'scopeBound', 'scopeLargeFormat', 'scopeOffset', 'chargeFullWidth']);

        for (const [snake, camel] of Object.entries(FIELD_MAP)) {
            if (data[snake] !== undefined) {
                (existing as any)[camel] = BOOL_PROPS.has(camel) ? !!Number(data[snake]) : data[snake];
            }
        }

        // Handle stock_adjustment (delta value) — cột thật là `stock`.
        const customData = data as Record<string, unknown>;
        if (customData.stock_adjustment !== undefined) {
            const adjustment = parseFloat(String(customData.stock_adjustment));
            if (adjustment !== 0) {
                const currentStock = parseFloat(existing.stock?.toString() || '0');
                existing.stock = Math.max(0, currentStock + adjustment) as any;
            }
        }

        // `stock_quantity` KHÔNG phải cột thật → nếu client gửi, đồng bộ vào `stock`.
        if (data.stock === undefined && data.stock_quantity !== undefined) {
            existing.stock = data.stock_quantity;
        }

        // Vật tư offset (sau cập nhật) bắt buộc đơn giá > 0 — chặn trước khi lưu (fail fast).
        if (existing.scopeOffset && !offsetPriceValid(existing.unitPrice)) {
            throw new BadRequestException('Vật tư In Offset phải có đơn giá (giá giấy) lớn hơn 0.');
        }

        const updated = await this.repo.save(existing);
        this.logger.log(`Material updated: ${updated.code} — ${updated.name}`);
        return updated;
    }

    // ─── Materials: Delete (with dependency check + cascade pricing_tiers) ───

    async deleteMaterial(id: string) {
        const material = await this.repo.findOne({ where: { id: parseInt(id) } });
        if (!material) throw new Error('Material not found');

        const dependencies: string[] = [];

        // Check inventory_slip_items
        try {
            const invCount = await this.dataSource.getRepository(InventorySlipItem)
                .count({ where: { material_id: parseInt(id) } });
            if (invCount > 0) dependencies.push(`Phiếu kho: ${invCount} bản ghi`);
        } catch { /* table doesn't exist */ }

        // Check quote_items
        try {
            const [quoteCount] = await this.dataSource.query(
                'SELECT COUNT(*) as cnt FROM quote_items WHERE material_id = $1', [id],
            );
            if (parseInt(quoteCount.cnt) > 0) dependencies.push(`Báo giá: ${quoteCount.cnt} bản ghi`);
        } catch { /* table doesn't exist */ }

        if (dependencies.length > 0) {
            throw new Error(`Không thể xóa vật tư "${material.name}" vì đang được sử dụng: ${dependencies.join(', ')}.`);
        }

        // Cascade delete pricing_tiers then material (in transaction)
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
            await applyTenantToConnection(qr, this.tenantCtx);
            await qr.query('DELETE FROM pricing_tiers WHERE material_id = $1', [id]);
            await qr.manager.remove(material);
            await qr.commitTransaction();
            this.logger.log(`Material deleted: ${material.code} — ${material.name}`);
        } catch (e) {
            await qr.rollbackTransaction();
            throw e;
        } finally {
            await qr.release();
        }
    }

    // ─── Material Types (already using Repository) ───
    async findAllTypes() { return this.typeRepo.find({ order: { sortOrder: 'ASC', name: 'ASC' } }); }
    async createType(data: Partial<MaterialType>) { return this.typeRepo.save(this.typeRepo.create(data)); }
    async updateType(id: string, data: Partial<MaterialType>) {
        await this.typeRepo.update(parseInt(id), data);
        return this.typeRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteType(id: string) { await this.typeRepo.delete(parseInt(id)); }

    // ─── Material Categories (already using Repository) ───
    async findAllCategories(activeOnly?: string) {
        const where: Record<string, unknown> = {};
        // material_categories.is_active là smallint → dùng 1 (không phải boolean true).
        // TypeORM sẽ bind tham số; `true` trên cột smallint ném "invalid input syntax for type smallint".
        if (activeOnly === '1') where.is_active = 1;
        return this.catRepo.find({ where, order: { sort_order: 'ASC', name: 'ASC' } });
    }
    async createCategory(data: Partial<MaterialCategory>) { return this.catRepo.save(this.catRepo.create(data)); }
    async updateCategory(id: string, data: Partial<MaterialCategory>) {
        await this.catRepo.update(parseInt(id), data);
        return this.catRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteCategory(id: string) { await this.catRepo.delete(parseInt(id)); }

    // ─── Processing Options (already using Repository) ───
    /**
     * Liệt kê Gia_Công, lọc qua Quy_Tắc_Phạm_Vi canonical (nguồn sự thật duy nhất).
     *
     * - Có `scope` (loose|bound|large_format): trả các Gia_Công `isActive && resourceInScope(r, scope)`
     *   (Tài_Nguyên_Chỉ_Offset và tài nguyên không hoạt động bị loại tự nhiên qua `filterForProductType`).
     * - Không `scope` nhưng `activeOnly`: chỉ trả Gia_Công đang hoạt động.
     * - Không truyền gì: hành vi tương thích ngược — trả TẤT CẢ (không phá nơi gọi cũ).
     *
     * _Requirements: 1.3, 1.4, 3.1, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2_
     */
    async findAllProcessingOptions(query: ScopeListQuery = {}) {
        const options = await this.optRepo.find({ order: { type: 'ASC', name: 'ASC' } });

        const scope = query.scope && VALID_PRODUCT_TYPES.includes(query.scope) ? query.scope : undefined;
        if (scope) {
            return filterForProductType(options, scope);
        }
        if (query.activeOnly) {
            return options.filter((opt) => isActive(opt.is_active));
        }
        return options;
    }
    async createProcessingOption(data: Partial<ProcessingOption>) { return this.optRepo.save(this.optRepo.create(data)); }
    async updateProcessingOption(id: string, data: Partial<ProcessingOption>) {
        await this.optRepo.update(parseInt(id), data);
        return this.optRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteProcessingOption(id: string) { await this.optRepo.delete(parseInt(id)); }

    /**
     * Cập nhật Cờ_Phạm_Vi cho một Gia_Công (Màn_Quản_Trị_Phạm_Vi).
     *
     * `processing_options` dùng smallint snake_case (`scope_loose/bound/large_format`) + boolean
     * `scope_offset`. Validate qua `validateScopeFlags` TRƯỚC khi ghi: nếu không hợp lệ → ném
     * UnprocessableEntityException kèm `invalidFlags`, KHÔNG ghi (giữ nguyên giá trị cũ — Req 5.8).
     * Chỉ ghi các cờ thực sự được gửi lên (cập nhật một phần). Trả tài nguyên sau cập nhật + nhãn
     * `deriveScopeLabel`.
     *
     * _Requirements: 5.1, 5.2, 5.5, 5.8, 6.2_
     */
    async updateProcessingOptionScope(id: string, dto: UpdateScopeDto) {
        const existing = await this.optRepo.findOne({ where: { id: parseInt(id) } });
        if (!existing) throw new NotFoundException('Processing option not found');

        const validation = validateScopeFlags(dto);
        if (!validation.ok) {
            throw new UnprocessableEntityException({ success: false, invalidFlags: validation.invalidFlags });
        }

        // Cột smallint → ghi nguyên giá trị 0/1; scope_offset là boolean.
        if (dto.scope_loose !== undefined) existing.scope_loose = dto.scope_loose;
        if (dto.scope_bound !== undefined) existing.scope_bound = dto.scope_bound;
        if (dto.scope_large_format !== undefined) existing.scope_large_format = dto.scope_large_format;
        if (dto.scope_offset !== undefined) existing.scope_offset = dto.scope_offset;

        await this.optRepo.save(existing);
        const updated = (await this.optRepo.findOne({ where: { id: parseInt(id) } }))!;
        this.logger.log(`Processing option scope updated: id=${id}`);
        return { data: updated, scopeLabel: deriveScopeLabel(updated as ScopeFlags) };
    }

    /**
     * Cập nhật Cờ_Phạm_Vi cho một Vật_Tư (Màn_Quản_Trị_Phạm_Vi).
     *
     * `materials` dùng BOOLEAN camelCase (`scopeLoose/scopeBound/scopeLargeFormat/scopeOffset`) ↔
     * DB snake_case. Validate qua `validateScopeFlags` TRƯỚC khi ghi (smallint 0/1, offset bool);
     * không hợp lệ → 422 + `invalidFlags`, KHÔNG ghi (Req 5.8). Cờ smallint 0/1 chuyển sang boolean
     * khi ghi. Trả tài nguyên sau cập nhật + nhãn `deriveScopeLabel`.
     *
     * _Requirements: 5.1, 5.2, 5.5, 5.8, 6.2_
     */
    async updateMaterialScope(id: string, dto: UpdateScopeDto) {
        const existing = await this.repo.findOne({ where: { id: parseInt(id) } });
        if (!existing) throw new NotFoundException('Material not found');

        const validation = validateScopeFlags(dto);
        if (!validation.ok) {
            throw new UnprocessableEntityException({ success: false, invalidFlags: validation.invalidFlags });
        }

        // Cột boolean → chuyển smallint 0/1 sang false/true; scope_offset đã là boolean.
        if (dto.scope_loose !== undefined) existing.scopeLoose = !!Number(dto.scope_loose);
        if (dto.scope_bound !== undefined) existing.scopeBound = !!Number(dto.scope_bound);
        if (dto.scope_large_format !== undefined) existing.scopeLargeFormat = !!Number(dto.scope_large_format);
        if (dto.scope_offset !== undefined) existing.scopeOffset = dto.scope_offset;

        // Bật offset qua Màn Quản trị Phạm vi cũng phải có đơn giá > 0 (đóng đường vòng qua guard create/update).
        if (existing.scopeOffset && !offsetPriceValid(existing.unitPrice)) {
            throw new BadRequestException('Vật tư In Offset phải có đơn giá (giá giấy) lớn hơn 0.');
        }

        await this.repo.save(existing);
        const updated = (await this.repo.findOne({ where: { id: parseInt(id) } }))!;
        const flags: ScopeFlags = {
            scope_loose: updated.scopeLoose,
            scope_bound: updated.scopeBound,
            scope_large_format: updated.scopeLargeFormat,
            scope_offset: updated.scopeOffset,
        };
        this.logger.log(`Material scope updated: id=${id}`);
        return { data: updated, scopeLabel: deriveScopeLabel(flags) };
    }

    // ─── Processing Pricing (Tiered) ───
    async findAllProcessingPricing() {
        return this.processingPricingRepo.find({
            relations: ['processingOption'],
            order: { processingOptionId: 'ASC', quantityFrom: 'ASC' }
        });
    }
    async createProcessingPricing(data: Partial<ProcessingPricing>) {
        return this.processingPricingRepo.save(this.processingPricingRepo.create(data));
    }
    async updateProcessingPricing(id: string, data: Partial<ProcessingPricing>) {
        await this.processingPricingRepo.update(parseInt(id), data);
        return this.processingPricingRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteProcessingPricing(id: string) {
        await this.processingPricingRepo.delete(parseInt(id));
    }

    // ─── Inventory Adjustments (Nhập / Xuất / Ghi nhận tồn) ───
    async createInventorySlip(data: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // 1. Create slip
            await applyTenantToConnection(queryRunner, this.tenantCtx);
            const slip = queryRunner.manager.create(InventorySlip, {
                type: data.type,
                status: data.status || 'confirmed',
                reason: data.reason,
                notes: data.notes
            } as DeepPartial<InventorySlip>);
            const savedSlip = await queryRunner.manager.save(slip);

            // 2. Create items & update stock
            if (data.items && Array.isArray(data.items)) {
                for (const item of data.items) {
                    // Load vật tư TRƯỚC để quy đổi đơn vị mua (cần gsm/khổ) + tính giá vốn bình quân.
                    const material = await queryRunner.manager.findOne(Material, { where: { id: item.material_id } });

                    // ── Nhập theo LÔ: quy đổi đơn vị mua → đơn vị cơ sở (tờ/m²) ──
                    // FE có thể gửi purchase_unit + purchase_qty + purchase_price (giá/1 ĐV mua).
                    // Backend TỰ tính factor từ vật tư (không tin FE, trừ override ram) + unit_cost_base
                    // = giá lô ÷ factor. Không gửi field lô → giữ luồng cũ (quantity trực tiếp).
                    const purchaseUnit = item.purchase_unit as string | undefined;
                    let baseQty: number;
                    let convFactor = 1;
                    let purchaseQty: number | null = null;
                    let unitCostBase: number | null = null;

                    if (purchaseUnit && material) {
                        const conv = computeConversionFactor(material, purchaseUnit, item.conversion_factor);
                        if (conv.error) throw new Error(`Vật tư "${material.name}": ${conv.error}`);
                        convFactor = conv.factor;
                        purchaseQty = parseFloat(String(item.purchase_qty ?? item.quantity ?? 0));
                        baseQty = purchaseQty * convFactor;
                        // Giá vốn / ĐV cơ sở của lô = giá / 1 ĐV mua ÷ factor.
                        if (item.purchase_price != null && convFactor > 0) {
                            unitCostBase = parseFloat(String(item.purchase_price)) / convFactor;
                        }
                    } else {
                        baseQty = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity || 0);
                        // Không nhập theo lô nhưng có unit_price → coi là giá vốn/ĐV cơ sở trực tiếp.
                        if (item.unit_price != null) unitCostBase = parseFloat(String(item.unit_price));
                    }

                    const slipItem = queryRunner.manager.create(InventorySlipItem, {
                        slip_id: savedSlip.id,
                        material_id: item.material_id,
                        quantity: baseQty,
                        unit_price: item.unit_price ?? item.purchase_price,
                        purchase_unit: purchaseUnit,
                        purchase_qty: purchaseQty ?? undefined,
                        conversion_factor: convFactor,
                        unit_cost_base: unitCostBase ?? undefined,
                        notes: item.notes
                    } as DeepPartial<InventorySlipItem>);
                    await queryRunner.manager.save(slipItem);

                    // Update material stock — cột thật là `stock` (stock_quantity KHÔNG tồn tại).
                    if (material) {
                        let currentStock = parseFloat(material.stock?.toString() || '0');
                        const qty = baseQty;

                        if (data.type === 'import') {
                            // Giá vốn bình quân gia quyền TRƯỚC khi cộng tồn (cần tồn cũ làm trọng số).
                            // Chỉ cập nhật khi lô này có giá (unitCostBase > 0) — nhập không giá giữ nguyên cost cũ.
                            if (unitCostBase != null && unitCostBase > 0) {
                                const oldCost = parseFloat(material.costPrice?.toString() || '0');
                                material.costPrice = weightedAvgCost(oldCost, currentStock, unitCostBase, qty);
                            }
                            currentStock += qty;
                        } else if (data.type === 'export') {
                            if (currentStock < qty) {
                                throw new Error(`Tồn kho không đủ cho vật tư "${material.name}": hiện có ${currentStock}, cần xuất ${qty}`);
                            }
                            currentStock -= qty;
                        } else if (data.type === 'adjust') {
                            if (data.reason === 'set') currentStock = qty;
                            else if (data.reason === 'add') currentStock += qty;
                            else if (data.reason === 'subtract') currentStock -= qty;
                        }

                        material.stock = currentStock;
                        await queryRunner.manager.save(material);
                    }
                }
            }

            await queryRunner.commitTransaction();
            this.logger.log(`Inventory slip created: ${savedSlip.id} (${data.type})`);
            return { success: true, data: savedSlip };
        } catch (err) {
            await queryRunner.rollbackTransaction();
            this.logger.error(`Inventory slip failed: ${err.message}`, err.stack);
            return { success: false, error: err.message };
        } finally {
            await queryRunner.release();
        }
    }
}
