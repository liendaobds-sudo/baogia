import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from '../services/products.service';
import { Product } from '../../../entities';

@Controller('erp/products')
export class ProductsController {
    constructor(private readonly service: ProductsService) { }

    @Get()
    async findAll() {
        return { success: true, data: await this.service.findAllProducts() };
    }

    @Get('categories')
    async getCategories() {
        return { success: true, data: await this.service.findAllCategories() };
    }
    @Get('debug-fields')
    async debugFields() {
        return { success: true, fields: await this.service['repo'].manager.query('SELECT * FROM product_ai_fields LIMIT 10') };
    }

    // ─── Mini Quote Field Config ─────────────────
    @Get('mini-quote-fields/master-registry')
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
    async getMiniQuoteFields(@Param('id') id: string) {
        const data = await this.service.getMiniQuoteFieldConfig(parseInt(id));
        if (!data) return { success: false, error: 'Product not found' };
        return { success: true, data };
    }

    @Put(':id/mini-quote-fields')
    async updateMiniQuoteFields(@Param('id') id: string, @Body() body: { fields: string[] }) {
        try {
            const result = await this.service.updateMiniQuoteFields(parseInt(id), body.fields || []);
            return { success: true, data: result };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    }

    @Put('batch-mini-quote-fields')
    async batchUpdateMiniQuoteFields(@Body() body: { product_ids: number[]; fields: string[] }) {
        if (!body.product_ids.length) return { success: false, error: 'No product IDs provided' };
        const results = await this.service.batchUpdateMiniQuoteFields(body.product_ids, body.fields || []);
        return { success: true, data: results };
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        if (id === 'categories') return this.getCategories();
        if (id === 'debug-fields') return this.debugFields(); // Fallback for route collision
        const data = await this.service.findProductById(id);
        if (!data) return { success: false, error: 'Not found' };
        return { success: true, data };
    }

    @Post()
    async create(@Body() data: Partial<Product>) {
        if (!data.nameVi || !data.code) return { success: false, error: 'Name and code are required' };
        return { success: true, data: await this.service.createProduct(data), message: 'Product created' };
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() data: Partial<Product>) {
        return { success: true, data: await this.service.updateProduct(id, data), message: 'Updated' };
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await this.service.deleteProduct(id);
        return { success: true, data: null, message: 'Deleted' };
    }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/product-categories')
export class ErpProductCategoriesController {
    constructor(private readonly service: ProductsService) { }

    @Get()
    async findAll() {
        return { success: true, data: await this.service.findAllCategories() };
    }

    @Post()
    async create(@Body() data: any) {
        if (!data?.code || !data?.name_vi) return { success: false, error: 'Thiếu mã hoặc tên danh mục' };
        return { success: true, data: await this.service.createCategory(data) };
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() data: any) {
        return { success: true, data: await this.service.updateCategory(id, data) };
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await this.service.deleteCategory(id);
        return { success: true, data: null };
    }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/quote-templates')
export class ErpQuoteTemplatesController {
    constructor(private readonly service: ProductsService) { }

    @Get()
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
