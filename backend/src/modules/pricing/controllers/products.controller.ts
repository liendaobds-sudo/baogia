import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from '../services/products.service';
import { Product, UserRole } from '../../../entities';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { PermissionsGuard, Permissions } from '../../auth/permissions.guard';

// Audit 2026-07-25: controller này trước đây chỉ có AuthGuard ⇒ mọi user đăng nhập (kể cả
// `viewer`) TẠO/SỬA/XOÁ được sản phẩm và cấu hình mini-quote — tức thay đổi cơ sở báo giá.
// Nay: đọc cần `pricing.view`, ghi cần `pricing.edit` (4 role hệ thống: view có đủ, edit chỉ
// admin/supervisor).
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/products')
export class ProductsController {
    constructor(private readonly service: ProductsService) { }

    @Get()
    @Permissions('pricing.view')
    async findAll() {
        return { success: true, data: await this.service.findAllProducts() };
    }

    @Get('categories')
    @Permissions('pricing.view')
    async getCategories() {
        return { success: true, data: await this.service.findAllCategories() };
    }

    // ─── Mini Quote Field Config ─────────────────
    @Get('mini-quote-fields/master-registry')
    @Permissions('pricing.view')
    async getMasterRegistry(@Query('quote_type') quoteType?: string) {
        const { getMasterFieldsForType, getDefaultMiniQuoteFields } = await import('../constants/mini-quote-fields');
        const type = quoteType || 'loose';
        return {
            success: true,
            data: {
                quote_type: type,
                fields: getMasterFieldsForType(type),
                defaults: getDefaultMiniQuoteFields(type),
            },
        };
    }

    @Get(':id/mini-quote-fields')
    @Permissions('pricing.view')
    async getMiniQuoteFields(@Param('id') id: string) {
        const data = await this.service.getMiniQuoteFieldConfig(parseInt(id));
        if (!data) return { success: false, error: 'Product not found' };
        return { success: true, data };
    }

    @Put(':id/mini-quote-fields')
    @Permissions('pricing.edit')
    async updateMiniQuoteFields(@Param('id') id: string, @Body() body: { fields: string[] }) {
        try {
            const result = await this.service.updateMiniQuoteFields(parseInt(id), body.fields || []);
            return { success: true, data: result };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }

    @Put('batch-mini-quote-fields')
    @Permissions('pricing.edit')
    async batchUpdateMiniQuoteFields(@Body() body: { product_ids: number[]; fields: string[] }) {
        if (!body.product_ids.length) return { success: false, error: 'No product IDs provided' };
        const results = await this.service.batchUpdateMiniQuoteFields(body.product_ids, body.fields || []);
        return { success: true, data: results };
    }

    // ─── AI Fields (Tab "Luật Sản Phẩm") ─────────────
    @Post(':id/ai-fields')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async addAiField(@Param('id') id: string, @Body() body: any) {
        return { success: true, data: await this.service.createAiField(parseInt(id), body || {}), message: 'Đã thêm trường' };
    }

    @Get(':id')
    @Permissions('pricing.view')
    async findOne(@Param('id') id: string) {
        if (id === 'categories') return this.getCategories();
        const data = await this.service.findProductById(id);
        if (!data) return { success: false, error: 'Not found' };
        return { success: true, data };
    }

    @Post()
    @Permissions('pricing.edit')
    async create(@Body() data: Partial<Product>) {
        if (!data.nameVi || !data.code) return { success: false, error: 'Name and code are required' };
        return { success: true, data: await this.service.createProduct(data), message: 'Product created' };
    }

    @Put(':id')
    @Permissions('pricing.edit')
    async update(@Param('id') id: string, @Body() data: Partial<Product>) {
        return { success: true, data: await this.service.updateProduct(id, data), message: 'Updated' };
    }

    @Delete(':id')
    @Permissions('pricing.edit')
    async remove(@Param('id') id: string) {
        await this.service.deleteProduct(id);
        return { success: true, data: null, message: 'Deleted' };
    }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/product-categories')
export class ErpProductCategoriesController {
    constructor(private readonly service: ProductsService) { }

    @Get()
    @Permissions('pricing.view')
    async findAll() {
        return { success: true, data: await this.service.findAllCategories() };
    }

    @Post()
    @Permissions('pricing.edit')
    async create(@Body() data: any) {
        if (!data?.code || !data?.name_vi) return { success: false, error: 'Thiếu mã hoặc tên danh mục' };
        return { success: true, data: await this.service.createCategory(data) };
    }

    @Put(':id')
    @Permissions('pricing.edit')
    async update(@Param('id') id: string, @Body() data: any) {
        return { success: true, data: await this.service.updateCategory(id, data) };
    }

    @Delete(':id')
    @Permissions('pricing.edit')
    async remove(@Param('id') id: string) {
        await this.service.deleteCategory(id);
        return { success: true, data: null };
    }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/quote-templates')
export class ErpQuoteTemplatesController {
    constructor(private readonly service: ProductsService) { }

    // `quote.view` (không phải pricing.edit): đây là dữ liệu mẫu sản phẩm mà nhân viên cần để
    // lập báo giá — mọi role hệ thống đều có quyền này.
    @Get()
    @Permissions('quote.view')
    async handleAction(@Query('action') action?: string, @Query('code') code?: string, @Query('q') q?: string) {
        switch (action || 'list') {
            case 'list': return { success: true, data: await this.service.getGroupedTemplates() };
            case 'search': return { success: true, data: { results: await this.service.searchTemplates(q || '') } };
            case 'get': {
                if (!code) return { success: false, error: 'Missing code' };
                const t = await this.service.getTemplateByCode(code);
                if (!t) return { success: false, error: 'Not found' };
                return { success: true, data: { id: t.id, code: t.code, name: t.nameVi, product_type: t.quoteType, default_materials: t.defaultMaterials ? JSON.parse(t.defaultMaterials) : [], default_finishing: t.defaultFinishing ? JSON.parse(t.defaultFinishing) : [], form_config: t.formConfig ? JSON.parse(t.formConfig) : [] } };
            }
            default: return { success: false, error: 'Unknown action' };
        }
    }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/ai-config')
export class ErpAiConfigController {
    @Get()
    async getAiConfig() { return { success: true, data: [] }; }
}

// AI field edit/delete theo fieldId (Tab "Luật Sản Phẩm"). Thêm-field nằm ở
// ProductsController POST /erp/products/:id/ai-fields (cần product context).
@UseGuards(AuthGuard('jwt'))
@Controller('erp/ai-fields')
export class ErpAiFieldsController {
    constructor(private readonly service: ProductsService) { }

    @Put(':fieldId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async update(@Param('fieldId') fieldId: string, @Body() body: any) {
        return { success: true, data: await this.service.updateAiField(parseInt(fieldId), body || {}), message: 'Đã cập nhật' };
    }

    @Delete(':fieldId')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async remove(@Param('fieldId') fieldId: string) {
        await this.service.deleteAiField(parseInt(fieldId));
        return { success: true, data: null, message: 'Đã xóa' };
    }
}
