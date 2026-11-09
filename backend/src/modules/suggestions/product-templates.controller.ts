/**
 * Product Templates Controller
 * Exposes Pricing product templates, detection, and master data to frontend for Mini Quote Form.
 */
import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { getProductTemplates, detectProduct, findProductTemplate, extractFieldsFromChat } from '../quote/extractors';
import { QuoteService } from '../quote/quote.service';
import { ProductsService } from '../pricing/services/products.service';

@Controller('product-templates')
@UseGuards(AuthGuard('jwt'))
export class ProductTemplatesController {
    constructor(
        private readonly quoteService: QuoteService,
        private readonly productsService: ProductsService,
    ) { }

    /**
     * GET /api/v1/product-templates
     * Returns product templates LIVE from DB (not cached)
     */
    @Get()
    async getAllTemplates() {
        return this.productsService.findAllProducts();
    }

    /**
     * GET /api/v1/product-templates/master-data
     * Returns Pricing master data (materials, paper sizes, processing options) for real dropdowns
     * Optional: ?product_id=X to filter by product config
     */
    @Get('master-data')
    async getMasterData(@Query('product_id') productId?: string) {
        if (productId) {
            return this.quoteService.getMasterDataForProduct(parseInt(productId));
        }
        return this.quoteService.getMasterData();
    }

    /**
     * POST /api/v1/product-templates/detect
     * Detect product from body text and return matched template with fields
     */
    @Post('detect')
    detectFromText(@Body('text') text: string) {
        if (!text) return { detected: false };

        const match = detectProduct(text);
        if (!match) return { detected: false };

        const template = match.templateCode ? findProductTemplate(match.templateCode) : undefined;

        return {
            detected: true,
            product: match.product,
            type: match.type,
            confidence: match.confidence,
            template: template ? {
                id: template.id,
                code: template.code,
                name: template.name,
                product_type: (template as any).product_type || match.type || 'loose',
                product_id: (template as any).product_id || template.id || null,
                allowed_materials: (template as any).allowed_materials || [],
                allowed_paper_sizes: (template as any).allowed_paper_sizes || [],
                allowed_processing: (template as any).allowed_processing || [],
                mini_quote_fields: (template as any).mini_quote_fields || null,
                form_config: (template as any).form_config || null,
                default_materials: (template as any).default_materials || null,
                default_finishing: (template as any).default_finishing || null,
                has_auto_pricing: (template as any).has_auto_pricing !== false,
                ai_enabled: (template as any).ai_enabled !== false,
                fields: (template.fields || []).map(f => ({
                    field_code: f.field_code,
                    field_name: f.field_name,
                    field_type: f.field_type,
                    is_required: f.is_required,
                    ai_question: f.ai_question,
                    default_value: f.default_value,
                    options: f.options,
                    source_table: f.source_table,
                })),
            } : undefined,
        };
    }

    /**
     * POST /api/v1/product-templates/extract-fields
     * Extract form field values from body text using rule-based extractors.
     * Returns { fields: { [field_code]: value } }
     */
    @Post('extract-fields')
    async extractFields(
        @Body('text') text: string,
        @Body('product_id') productId?: number | string,
    ) {
        if (!text) return { fields: {} };

        let resolvedProductId = productId ? Number(productId) : null;
        if (!resolvedProductId) {
            const match = detectProduct(text);
            const tmpl = match?.templateCode ? findProductTemplate(match.templateCode) : undefined;
            resolvedProductId = Number((tmpl as any)?.product_id || tmpl?.id || 0) || null;
        }

        const masterData = resolvedProductId
            ? await this.quoteService.getMasterDataForProduct(resolvedProductId)
            : await this.quoteService.getMasterData();

        const fields = extractFieldsFromChat(text, {
            materials: masterData.materials || [],
            processingOptions: masterData.processingOptions || [],
        });

        return { fields };
    }
}
