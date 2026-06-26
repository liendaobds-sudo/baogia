import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { UnifiedProductCategory, UnifiedProduct } from '../../entities';

@Injectable()
export class QuoteTemplatesService {
    constructor(@InjectDataSource() private dataSource: DataSource) {}

    async getGroupedCategories() {
        const parents = await this.dataSource.getRepository(UnifiedProductCategory)
            .find({
                where: { isActive: true, parentId: IsNull() },
                order: { sortOrder: 'ASC' }
            });

        const templates = await this.dataSource.getRepository(UnifiedProduct).createQueryBuilder('p')
            .where('p.isActive = :active', { active: true })
            .andWhere('p.parentCategoryCode IS NOT NULL')
            .orderBy('p.sortOrder', 'ASC')
            .getMany();

        const grouped = new Map<string, any>();
        for (const parent of parents) {
            grouped.set(parent.code, {
                code: parent.code,
                name: parent.nameVi,
                icon: parent.icon,
                templates: []
            });
        }
        
        grouped.set('other', { code: 'other', name: 'Khác', icon: 'fa-ellipsis-h', templates: [] });

        for (const t of templates) {
            const parentCode = t.parentCategoryCode || 'other';
            const group = grouped.get(parentCode) || grouped.get('other');
            
            group.templates.push({
                id: t.id,
                code: t.code,
                name: t.nameVi,
                product_type: t.quoteType,
                unit: t.unit,
                parent_category: t.parentCategoryCode,
                keywords: Array.isArray(t.aiKeywords) ? t.aiKeywords : (t.aiKeywords ? JSON.parse(t.aiKeywords as any) : []),
                default_materials: t.defaultMaterials ? JSON.parse(t.defaultMaterials) : {},
                default_finishing: t.defaultFinishing ? JSON.parse(t.defaultFinishing) : {},
                icon: t.icon,
                sort_order: t.sortOrder
            });
        }

        const categories = Array.from(grouped.values()).filter(g => g.templates.length > 0);
        return { categories, total_templates: templates.length };
    }

    async getParents() {
        const parents = await this.dataSource.getRepository(UnifiedProductCategory)
            .find({
                where: { isActive: true, parentId: IsNull() },
                order: { sortOrder: 'ASC' }
            });

        return {
            parents: parents.map(p => ({
                code: p.code,
                name: p.nameVi,
                icon: p.icon,
                sort_order: p.sortOrder
            }))
        };
    }

    async getTemplateByCode(code: string) {
        const p = await this.dataSource.getRepository(UnifiedProduct).findOne({
            where: { code, isActive: true }
        });

        if (!p) return null;

        const parent = p.parentCategoryCode 
            ? await this.dataSource.getRepository(UnifiedProductCategory).findOne({ where: { code: p.parentCategoryCode } })
            : null;

        return {
            id: p.id,
            code: p.code,
            name: p.nameVi,
            product_type: p.quoteType,
            parent_category: p.parentCategoryCode,
            keywords: Array.isArray(p.aiKeywords) ? p.aiKeywords : (p.aiKeywords ? JSON.parse(p.aiKeywords as any) : []),
            default_materials: p.defaultMaterials ? JSON.parse(p.defaultMaterials) : {},
            default_finishing: p.defaultFinishing ? JSON.parse(p.defaultFinishing) : {},
            form_config: p.formConfig ? JSON.parse(p.formConfig) : {},
            icon: p.icon,
            description: p.descriptionVi,
            parent_name: parent ? parent.nameVi : null,
            parent_icon: parent ? parent.icon : null
        };
    }

    async getTemplateDefaults(code: string) {
        const template = await this.getTemplateByCode(code);
        if (!template) return null;

        const p = await this.dataSource.getRepository(UnifiedProduct).findOne({ where: { code } });

        const defaults: any = {
            product_type: template.product_type,
            template_code: template.code,
            template_name: template.name,
            parent_category: template.parent_category,
            product_id: template.id,
            unit: p?.unit || 'Tờ',
        };

        if (Object.keys(template.default_materials).length > 0) defaults.material_filter = template.default_materials;
        if (Object.keys(template.default_finishing).length > 0) defaults.finishing = template.default_finishing;
        if (Object.keys(template.form_config).length > 0) defaults.form_config = template.form_config;

        // Whitelist filters
        if (p?.allowedMaterials?.length) defaults.allowed_materials = p.allowedMaterials;
        if (p?.allowedPaperSizes?.length) defaults.allowed_paper_sizes = p.allowedPaperSizes;
        if (p?.allowedProcessing?.length) defaults.allowed_processing = p.allowedProcessing;
        if (p?.allowedAccessories?.length) defaults.allowed_accessories = p.allowedAccessories;

        return defaults;
    }

    async searchTemplates(query: string) {
        const templates = await this.dataSource.getRepository(UnifiedProduct).createQueryBuilder('p')
            .leftJoinAndMapOne('p.parentCategory', UnifiedProductCategory, 'c', 'p.parentCategoryCode = c.code')
            .where('p.isActive = :active', { active: true })
            .andWhere('p.parentCategoryCode IS NOT NULL')
            .andWhere('(p.nameVi LIKE :q OR p.code LIKE :q OR p.aiKeywords LIKE :q)', { q: `%${query}%` })
            .orderBy('p.sortOrder', 'ASC')
            .take(20)
            .getMany();

        return {
            results: templates.map((p: any) => ({
                code: p.code,
                name: p.nameVi,
                product_type: p.quoteType,
                parent_category: p.parentCategoryCode,
                icon: p.icon,
                parent_name: p.parentCategory ? p.parentCategory.nameVi : null
            }))
        };
    }
}
