import { Injectable, Logger, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, IsNull, DataSource, In } from 'typeorm';
import { Product, ProductCategory, UnifiedProduct, UnifiedProductCategory, Material, ProductAiField } from '../../../entities';
import { ProductType, ScopeFlags, validateAllowedList } from '../scope/resource-scope-rule';

@Injectable()
export class ProductsService {
    private readonly logger = new Logger(ProductsService.name);

    constructor(
        @InjectRepository(Product) private repo: Repository<Product>,
        @InjectRepository(ProductCategory) private catRepo: Repository<ProductCategory>,
        @InjectRepository(UnifiedProduct) private tmplRepo: Repository<UnifiedProduct>,
        @InjectRepository(UnifiedProductCategory) private tmplCatRepo: Repository<UnifiedProductCategory>,
        @InjectDataSource() private dataSource: DataSource,
    ) { }

    private parseJsonSafe(val: unknown): Record<string, unknown> | unknown[] | null {
        if (!val) return null;
        if (typeof val === 'object') return val as Record<string, unknown>;
        try { return JSON.parse(val as string); } catch { return null; }
    }

    async findAllProducts() {
        const em = this.repo.manager;
        const templates = await em.query(`
            SELECT id, code, name_vi as name, quote_type as product_type, unit, ai_keywords as keywords, icon, is_active, sort_order, parent_category_code as parent_category, default_materials, default_finishing, form_config, description_vi as description, mini_quote_fields, has_auto_pricing, allowed_materials, allowed_paper_sizes, allowed_processing
            FROM unified_products WHERE is_active = true ORDER BY sort_order ASC, name_vi ASC`);
        const fields = await em.query(`
            SELECT id, product_id as template_id, field_code, field_name, field_type, is_required, is_enabled, default_value, ai_question, ai_keywords, answer_patterns, source_table, source_filter, sort_order
            FROM product_ai_fields WHERE is_enabled = true ORDER BY sort_order ASC`);

        const fieldsByTemplate = new Map<string, Record<string, unknown>[]>();
        for (const f of fields) {
            const key = String(f.template_id);
            if (!fieldsByTemplate.has(key)) fieldsByTemplate.set(key, []);
            fieldsByTemplate.get(key)!.push({
                id: f.id, field_code: f.field_code, field_name: f.field_name, field_type: f.field_type,
                // Cấp cả `is_required` (contract cũ) lẫn `required` (FE ProductRulesPanel đọc) để hết lệch.
                is_required: !!f.is_required, required: !!f.is_required,
                default_value: f.default_value, ai_question: f.ai_question,
                ai_keywords: this.parseJsonSafe(f.ai_keywords) || [], options: this.parseJsonSafe(f.answer_patterns),
                source_table: f.source_table, source_filter: this.parseJsonSafe(f.source_filter), sort_order: f.sort_order,
            });
        }
        return templates.map((t: any) => ({
            id: t.id, code: t.code, nameVi: t.name, name: t.name, name_vi: t.name,
            quoteType: t.product_type, product_type: t.product_type, quote_type: t.product_type,
            unit: t.unit || null,
            is_active: !!t.is_active, category_id: t.parent_category,
            product_id: t.id, aiKeywords: this.parseJsonSafe(t.keywords) || [], ai_keywords: this.parseJsonSafe(t.keywords) || [],
            ai_enabled: (this.parseJsonSafe(t.form_config) as any)?.ai_enabled !== false, has_auto_pricing: !!t.has_auto_pricing,
            icon: t.icon, sortOrder: t.sort_order, parent_category: t.parent_category,
            default_materials: this.parseJsonSafe(t.default_materials), default_finishing: this.parseJsonSafe(t.default_finishing),
            form_config: this.parseJsonSafe(t.form_config), description: t.description, fields: fieldsByTemplate.get(String(t.id)) || [],
            field_count: (fieldsByTemplate.get(String(t.id)) || []).length,
            required_count: (fieldsByTemplate.get(String(t.id)) || []).filter((f: any) => f.is_required).length,
            mini_quote_fields: this.parseJsonSafe(t.mini_quote_fields) || null,
            allowed_materials: this.parseJsonSafe(t.allowed_materials) || [],
            allowed_paper_sizes: this.parseJsonSafe(t.allowed_paper_sizes) || [],
            allowed_processing: this.parseJsonSafe(t.allowed_processing) || [],
        }));
    }


    async findProductById(id: string) {
        const item = await this.tmplRepo.findOne({ where: { id: parseInt(id) } });
        if (!item) return null;
        const fc = this.parseJsonSafe(item.formConfig) as any || {};
        return {
            id: item.id, code: item.code, name_vi: item.nameVi, name_en: item.nameEn,
            quote_type: item.quoteType, unit: item.unit || null, category_id: item.parentCategoryCode,
            icon: item.icon, description_vi: item.descriptionVi,
            is_active: item.isActive, ai_keywords: item.aiKeywords,
            ai_enabled: fc.ai_enabled !== false, has_auto_pricing: item.hasAutoPricing,
            quote_config: {
                default_width: fc.item_width || 0,
                default_height: fc.item_height || 0,
                default_quantity: fc.default_quantity || undefined,
                default_print_side: fc.default_print_side || 'double',
                default_print_type: fc.default_print_type || '4c',
                default_material_id: fc.default_material_id || '',
                default_paper_size_id: fc.default_paper_size_id || '',
                lock_print_side: fc.lock_print_side || false,
                lock_print_type: fc.lock_print_type || false,
                allowed_materials: item.allowedMaterials || [],
                allowed_paper_sizes: item.allowedPaperSizes || [],
                allowed_processing: item.allowedProcessing || [],
                allowed_accessories: item.allowedAccessories || [],
            },
        };
    }

    async createProduct(data: any) {
        const { resolveUnitLabel } = await import('../lib/quote-units');
        const quoteType = data.quote_type || 'loose';
        const entity = this.tmplRepo.create({
            code: data.code,
            nameVi: data.name_vi,
            nameEn: data.name_en,
            quoteType,
            // Đơn vị số lượng: client gửi hoặc default theo quote_type (nguồn: quote-units.ts)
            unit: resolveUnitLabel({ unit: data.unit, quoteType }),
            parentCategoryCode: data.category_id || null,
            icon: data.icon || 'fa-box',
            descriptionVi: data.description_vi,
            isActive: data.is_active !== false,
            hasAutoPricing: data.has_auto_pricing !== false,
            aiKeywords: data.ai_keywords || [],
        });
        if (data.quote_config) {
            await this.applyQuoteConfig(entity, data.quote_config);
        }
        if (data.ai_enabled !== undefined) {
            entity.formConfig = this.mergeFormConfig(entity.formConfig, { ai_enabled: data.ai_enabled });
        }
        return this.tmplRepo.save(entity);
    }

    async updateProduct(id: string, data: any) {
        const product = await this.tmplRepo.findOne({ where: { id: parseInt(id) } });
        if (!product) throw new Error('Product not found');

        if (data.code !== undefined) product.code = data.code;
        if (data.name_vi !== undefined) product.nameVi = data.name_vi;
        if (data.name_en !== undefined) product.nameEn = data.name_en;
        if (data.quote_type !== undefined) product.quoteType = data.quote_type;
        if (data.unit !== undefined) {
            const { resolveUnitLabel } = await import('../lib/quote-units');
            product.unit = resolveUnitLabel({
                unit: data.unit,
                quoteType: data.quote_type ?? product.quoteType,
            });
        } else if (data.quote_type !== undefined && !product.unit) {
            // Đổi loại SP mà unit còn trống → gán default theo loại mới
            const { resolveUnitLabel } = await import('../lib/quote-units');
            product.unit = resolveUnitLabel({ quoteType: data.quote_type });
        }
        if (data.category_id !== undefined) product.parentCategoryCode = data.category_id || null;
        if (data.icon !== undefined) product.icon = data.icon;
        if (data.description_vi !== undefined) product.descriptionVi = data.description_vi;
        if (data.is_active !== undefined) product.isActive = data.is_active;
        if (data.has_auto_pricing !== undefined) product.hasAutoPricing = data.has_auto_pricing;
        if (data.ai_keywords !== undefined) product.aiKeywords = data.ai_keywords;

        if (data.quote_config) {
            await this.applyQuoteConfig(product, data.quote_config);
        }
        if (data.ai_enabled !== undefined) {
            product.formConfig = this.mergeFormConfig(product.formConfig, { ai_enabled: data.ai_enabled });
        }

        await this.tmplRepo.save(product);
        return this.findProductById(id);
    }

    /** Gộp thêm khoá vào form_config JSON mà không mất các khoá cũ. */
    private mergeFormConfig(current: string | object | null | undefined, patch: Record<string, unknown>): string {
        const obj = current ? (typeof current === 'string' ? JSON.parse(current) : current) : {};
        return JSON.stringify({ ...obj, ...patch });
    }

    async deleteProduct(id: string) {
        await this.tmplRepo.delete(parseInt(id));
    }

    private async applyQuoteConfig(product: UnifiedProduct, qc: any) {
        // Validate Danh_Sách_Được_Phép theo Quy_Tắc_Phạm_Vi TRƯỚC khi ghi: nếu có phần tử
        // ngoài phạm vi của quote_type → ném 422 và KHÔNG persist. (Req 4.4, 4.5)
        await this.validateAllowedScopes(qc, product.quoteType);

        // Allowed lists → dedicated columns (with orphan cleanup)
        if (qc.allowed_materials !== undefined) {
            product.allowedMaterials = await this.cleanOrphanIds(qc.allowed_materials, 'materials');
        }
        if (qc.allowed_paper_sizes !== undefined) {
            product.allowedPaperSizes = await this.cleanOrphanIds(qc.allowed_paper_sizes, 'paper_sizes');
        }
        if (qc.allowed_processing !== undefined) {
            product.allowedProcessing = await this.cleanOrphanIds(qc.allowed_processing, 'processing_options');
        }
        if (qc.allowed_accessories !== undefined) {
            product.allowedAccessories = await this.cleanOrphanIds(qc.allowed_accessories, 'accessories');
        }

        // Other config → form_config JSON
        const existing = product.formConfig ? (typeof product.formConfig === 'string' ? JSON.parse(product.formConfig) : product.formConfig) : {};
        if (qc.default_width !== undefined) existing.item_width = qc.default_width;
        if (qc.default_height !== undefined) existing.item_height = qc.default_height;
        if (qc.default_print_side !== undefined) existing.default_print_side = qc.default_print_side;
        if (qc.default_print_type !== undefined) existing.default_print_type = qc.default_print_type;
        if (qc.default_material_id !== undefined) existing.default_material_id = qc.default_material_id;
        if (qc.default_paper_size_id !== undefined) existing.default_paper_size_id = qc.default_paper_size_id;
        if (qc.default_quantity !== undefined) existing.default_quantity = qc.default_quantity;
        if (qc.lock_print_side !== undefined) existing.lock_print_side = qc.lock_print_side;
        if (qc.lock_print_type !== undefined) existing.lock_print_type = qc.lock_print_type;
        product.formConfig = JSON.stringify(existing);
    }

    /** Remove IDs that no longer exist in the referenced table */
    private async cleanOrphanIds(ids: string[] | null | undefined, table: string): Promise<string[] | null> {
        if (!ids || !ids.length) return null;
        try {
            const numericIds = ids.map(id => parseInt(String(id))).filter(n => !isNaN(n));
            if (numericIds.length === 0) return null;
            const rows: { id: number }[] = await this.dataSource.query(
                `SELECT id FROM ${table} WHERE id = ANY($1)`, [numericIds]
            );
            const validIds = new Set(rows.map(r => String(r.id)));
            const cleaned = ids.filter(id => validIds.has(String(id)));
            const removed = ids.length - cleaned.length;
            if (removed > 0) {
                this.logger.log(`[cleanOrphanIds] Removed ${removed} orphan IDs from ${table}`);
            }
            return cleaned.length > 0 ? cleaned : null;
        } catch (err) {
            this.logger.warn(`[cleanOrphanIds] Failed for ${table}: ${err.message}`);
            return ids.length > 0 ? ids : null;
        }
    }

    /** Loại_Sản_Phẩm in nhanh chịu sự ràng buộc Phạm_Vi (offset/khác không validate ở đây). */
    private static readonly PRINT_PRODUCT_TYPES: ProductType[] = ['loose', 'bound', 'large_format'];

    /** Ba nhóm Tài_Nguyên_Dùng_Chung + bảng nguồn để validate Danh_Sách_Được_Phép. */
    private static readonly ALLOWED_SCOPE_GROUPS: { key: string; table: string; label: string }[] = [
        { key: 'allowed_processing', table: 'processing_options', label: 'Gia công' },
        { key: 'allowed_materials', table: 'materials', label: 'Vật tư' },
        { key: 'allowed_paper_sizes', table: 'paper_sizes', label: 'Khổ giấy' },
    ];

    /**
     * Validate `allowed_processing`/`allowed_materials`/`allowed_paper_sizes` theo `quote_type`
     * dựa trên Quy_Tắc_Phạm_Vi (nguồn sự thật duy nhất). Nếu có phần tử ngoài phạm vi của
     * Loại_Sản_Phẩm → ném `UnprocessableEntityException` (422) kèm danh sách vi phạm và KHÔNG ghi DB.
     *
     * Tài nguyên không tồn tại (orphan) KHÔNG bị coi là vi phạm phạm vi ở đây — chúng được
     * `cleanOrphanIds` xử lý riêng; validate chỉ xét các tài nguyên thực sự tồn tại.
     *
     * _Requirements: 4.4, 4.5_
     */
    private async validateAllowedScopes(qc: any, quoteType: string | null | undefined): Promise<void> {
        const productType = (quoteType || 'loose') as ProductType;
        // Chỉ ràng buộc phạm vi cho ba Loại_Sản_Phẩm in nhanh; offset/khác bỏ qua.
        if (!ProductsService.PRINT_PRODUCT_TYPES.includes(productType)) return;

        const violations: { group: string; table: string; items: { id: number; name?: string }[] }[] = [];

        for (const g of ProductsService.ALLOWED_SCOPE_GROUPS) {
            const allowedRaw = qc?.[g.key];
            if (allowedRaw === undefined || allowedRaw === null) continue;

            const allowedIds = (Array.isArray(allowedRaw) ? allowedRaw : [])
                .map((id: any) => parseInt(String(id)))
                .filter((n: number) => !isNaN(n));
            if (!allowedIds.length) continue;

            const rows: any[] = await this.dataSource.query(
                `SELECT id, name, scope_loose, scope_bound, scope_large_format, scope_offset FROM ${g.table} WHERE id = ANY($1)`,
                [allowedIds],
            );

            const flagsById = new Map<number, ScopeFlags>();
            const nameById = new Map<number, string>();
            for (const r of rows) {
                const rid = Number(r.id);
                flagsById.set(rid, {
                    scope_loose: r.scope_loose,
                    scope_bound: r.scope_bound,
                    scope_large_format: r.scope_large_format,
                    scope_offset: r.scope_offset,
                });
                nameById.set(rid, r.name);
            }

            // Chỉ validate các tài nguyên tồn tại; orphan để cleanOrphanIds lo.
            const existingIds = allowedIds.filter((id: number) => flagsById.has(id));
            const result = validateAllowedList(existingIds, flagsById, productType);
            if (!result.ok) {
                violations.push({
                    group: g.label,
                    table: g.table,
                    items: result.outOfScope.map((id) => ({ id, name: nameById.get(id) })),
                });
            }
        }

        if (violations.length > 0) {
            throw new UnprocessableEntityException({
                success: false,
                error: 'Danh sách được phép chứa tài nguyên ngoài phạm vi của loại sản phẩm',
                quote_type: productType,
                details: violations,
            });
        }
    }

    async findAllCategories() {
        // Dùng unified_product_categories (cùng bảng mà sản phẩm gom nhóm theo parentCategoryCode=code).
        const cats = await this.tmplCatRepo.find({ where: { parentId: IsNull() }, order: { sortOrder: 'ASC', nameVi: 'ASC' } });
        return cats.map(c => ({ id: c.id, code: c.code, name_vi: c.nameVi, name: c.nameVi, icon: c.icon, is_active: c.isActive }));
    }

    async createCategory(data: any) {
        const ent = this.tmplCatRepo.create({
            code: data.code,
            nameVi: data.name_vi,
            icon: data.icon || 'fa-folder',
            parentId: null as any,
            sortOrder: data.sort_order ?? 0,
            isActive: data.is_active !== false,
        });
        return this.tmplCatRepo.save(ent);
    }

    async updateCategory(id: string, data: any) {
        const ent = await this.tmplCatRepo.findOne({ where: { id: parseInt(id) } });
        if (!ent) throw new Error('Category not found');
        if (data.code !== undefined) ent.code = data.code;
        if (data.name_vi !== undefined) ent.nameVi = data.name_vi;
        if (data.icon !== undefined) ent.icon = data.icon;
        if (data.is_active !== undefined) ent.isActive = data.is_active;
        return this.tmplCatRepo.save(ent);
    }

    async deleteCategory(id: string) {
        // Gỡ gán ở sản phẩm trước để không còn parentCategoryCode mồ côi.
        const cat = await this.tmplCatRepo.findOne({ where: { id: parseInt(id) } });
        if (cat) {
            await this.tmplRepo.update({ parentCategoryCode: cat.code } as any, { parentCategoryCode: null as any });
        }
        await this.tmplCatRepo.delete(parseInt(id));
    }

    // -- Quote Templates / Unified Products
    async getGroupedTemplates() {
        const parents = await this.tmplCatRepo.find({ where: { isActive: true, parentId: IsNull() }, order: { sortOrder: 'ASC' } });
        const templates = await this.tmplRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });

        const grouped: Record<string, { code: string; name: string; icon: string; templates: Record<string, unknown>[] }> = {};
        for (const p of parents) grouped[p.code] = { code: p.code, name: p.nameVi, icon: p.icon, templates: [] };
        grouped['other'] = { code: 'other', name: 'Danh mục chung', icon: 'fa-ellipsis-h', templates: [] };

        for (const t of templates) {
            const parentCode = t.parentCategoryCode || 'other';
            const mapped = {
                id: t.id, code: t.code, name: t.nameVi, product_type: t.quoteType, unit: t.unit,
                parent_category: t.parentCategoryCode, keywords: t.aiKeywords || [],
                default_materials: this.parseJsonSafe(t.defaultMaterials), default_finishing: this.parseJsonSafe(t.defaultFinishing),
                icon: t.icon, sort_order: t.sortOrder,
            };
            if (grouped[parentCode]) grouped[parentCode].templates.push(mapped);
            else grouped['other'].templates.push(mapped);
        }
        return { categories: Object.values(grouped).filter((g) => g.templates.length > 0), total_templates: templates.length };
    }

    async searchTemplates(q: string) {
        const results = await this.tmplRepo.createQueryBuilder('p').where('p.is_active = true').andWhere('p.parent_category_code IS NOT NULL').andWhere('(p.name_vi LIKE :q OR p.code LIKE :q)', { q: `%${q}%` }).orderBy('p.sort_order', 'ASC').limit(20).getMany();
        return results.map(r => ({ code: r.code, name: r.nameVi, product_type: r.quoteType, parent_category: r.parentCategoryCode, icon: r.icon }));
    }

    async getTemplateByCode(code: string) {
        return this.tmplRepo.findOne({ where: { code, isActive: true } });
    }

    // ─── Mini Quote Field Configuration ─────────────────
    async getMiniQuoteFieldConfig(productId: number) {
        const product = await this.tmplRepo.findOne({ where: { id: productId } });
        if (!product) return null;

        const quoteType = product.quoteType || 'loose';
        const { getMasterFieldsForType, getDefaultMiniQuoteFields } = await import('../constants/mini-quote-fields');
        const masterFields = getMasterFieldsForType(quoteType);
        const enabledCodes = product.miniQuoteFields || getDefaultMiniQuoteFields(quoteType);

        return {
            product_id: product.id,
            product_code: product.code,
            product_name: product.nameVi,
            quote_type: quoteType,
            master_fields: masterFields.map(f => ({
                ...f,
                enabled: enabledCodes.includes(f.code),
            })),
            enabled_fields: enabledCodes,
            is_custom: product.miniQuoteFields !== null, // false = using defaults
        };
    }

    async updateMiniQuoteFields(productId: number, fieldCodes: string[]) {
        const product = await this.tmplRepo.findOne({ where: { id: productId } });
        if (!product) throw new Error('Product not found');

        const { getMasterFieldsForType } = await import('../constants/mini-quote-fields');
        const validCodes = getMasterFieldsForType(product.quoteType || 'loose').map(f => f.code);
        const filtered = fieldCodes.filter(c => validCodes.includes(c));

        product.miniQuoteFields = filtered.length > 0 ? filtered : null;
        await this.tmplRepo.save(product);
        return { updated: true, fields: product.miniQuoteFields };
    }

    async batchUpdateMiniQuoteFields(productIds: number[], fieldCodes: string[]) {
        const results: { id: number; code: string; success: boolean }[] = [];
        for (const id of productIds) {
            try {
                const product = await this.tmplRepo.findOne({ where: { id } });
                if (!product) { results.push({ id, code: '', success: false }); continue; }

                const { getMasterFieldsForType } = await import('../constants/mini-quote-fields');
                const validCodes = getMasterFieldsForType(product.quoteType || 'loose').map(f => f.code);
                const filtered = fieldCodes.filter(c => validCodes.includes(c));

                product.miniQuoteFields = filtered.length > 0 ? filtered : null;
                await this.tmplRepo.save(product);
                results.push({ id, code: product.code, success: true });
            } catch {
                results.push({ id, code: '', success: false });
            }
        }
        return results;
    }

    // ─── AI Fields CRUD (Tab "Luật Sản Phẩm") ────────────────
    // Dùng raw query đồng bộ với findAllProducts. Trả về field đã map sang shape
    // frontend (field_code/field_name/is_required/required) để UI hiển thị đúng ngay.

    private mapAiFieldRow(f: any) {
        return {
            id: f.id, template_id: f.product_id, product_id: f.product_id,
            field_code: f.field_code, field_name: f.field_name, field_type: f.field_type,
            // Cấp cả `is_required` (BE cũ) lẫn `required` (FE đọc) để không lệch contract.
            is_required: !!f.is_required, required: !!f.is_required,
            is_enabled: !!f.is_enabled, default_value: f.default_value,
            ai_question: f.ai_question, sort_order: f.sort_order,
        };
    }

    async createAiField(productId: number, data: any) {
        const product = await this.tmplRepo.findOne({ where: { id: productId } });
        if (!product) throw new NotFoundException('Sản phẩm không tồn tại');

        const rows = await this.dataSource.query(
            `INSERT INTO product_ai_fields
                (product_id, field_code, field_name, field_type, is_required, is_enabled, ai_question, sort_order)
             VALUES ($1, $2, $3, $4, $5, true, $6, $7)
             RETURNING id, product_id, field_code, field_name, field_type, is_required, is_enabled, default_value, ai_question, sort_order`,
            [
                productId,
                data.field_code || data.field_name || 'new_field',
                data.field_name || data.label || 'Trường mới',
                data.field_type || 'text',
                data.required ?? data.is_required ?? false,
                data.ai_question || null,
                data.sort_order ?? 99,
            ],
        );
        return this.mapAiFieldRow(rows[0]);
    }

    async updateAiField(fieldId: number, data: any) {
        const existing = await this.dataSource.query(
            `SELECT id FROM product_ai_fields WHERE id = $1`, [fieldId],
        );
        if (!existing || existing.length === 0) throw new NotFoundException('Trường không tồn tại');

        // Chỉ cập nhật các cột được gửi lên (partial update), map required→is_required.
        const sets: string[] = [];
        const params: any[] = [];
        const push = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`); };
        if (data.field_name !== undefined || data.label !== undefined) push('field_name', data.field_name ?? data.label);
        if (data.field_code !== undefined) push('field_code', data.field_code);
        if (data.field_type !== undefined) push('field_type', data.field_type);
        if (data.required !== undefined || data.is_required !== undefined) push('is_required', data.required ?? data.is_required);
        if (data.ai_question !== undefined) push('ai_question', data.ai_question);
        if (data.sort_order !== undefined) push('sort_order', data.sort_order);
        if (sets.length === 0) {
            const cur = await this.dataSource.query(`SELECT * FROM product_ai_fields WHERE id = $1`, [fieldId]);
            return this.mapAiFieldRow(cur[0]);
        }
        params.push(fieldId);
        const rows = await this.dataSource.query(
            `UPDATE product_ai_fields SET ${sets.join(', ')} WHERE id = $${params.length}
             RETURNING id, product_id, field_code, field_name, field_type, is_required, is_enabled, default_value, ai_question, sort_order`,
            params,
        );
        return this.mapAiFieldRow(rows[0]);
    }

    async deleteAiField(fieldId: number) {
        const res = await this.dataSource.query(
            `DELETE FROM product_ai_fields WHERE id = $1 RETURNING id`, [fieldId],
        );
        if (!res || res.length === 0) throw new NotFoundException('Trường không tồn tại');
        return { deleted: true, id: fieldId };
    }
}
