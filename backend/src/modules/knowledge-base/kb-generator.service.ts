import { Injectable, Logger, Optional } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from '../pricing/services/products.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class KbGeneratorService {
    private readonly logger = new Logger(KbGeneratorService.name);
    private readonly dataDir: string;

    constructor(
        private readonly kbService: KnowledgeBaseService,
        private readonly configService: ConfigService,
        // Optional: KbGeneratorService còn được dựng trong test/CLI không cần PricingModule.
        // `generateFromPricing` sẽ báo lỗi rõ ràng nếu thiếu, thay vì gọi HTTP 401 như trước.
        @Optional() private readonly productsService?: ProductsService,
    ) {
        // Resolve data dir relative to project root (works for both dev and compiled)
        this.dataDir = path.resolve(process.cwd(), 'src', 'modules', 'knowledge-base', 'data');
    }

    /**
     * Load all static KB docs from the data/ directory
     */
    async loadStaticDocs(): Promise<{ loaded: number; skipped: number; errors: string[] }> {
        const result = { loaded: 0, skipped: 0, errors: [] as string[] };

        if (!fs.existsSync(this.dataDir)) {
            this.logger.warn(`Data directory not found: ${this.dataDir}`);
            return result;
        }

        const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
        this.logger.log(`📂 Found ${files.length} KB files in data/`);

        // Get existing docs to avoid duplicates
        const existing = await this.kbService.findAll();
        const existingTitles = new Set(existing.map(d => d.title.toLowerCase()));

        for (const file of files) {
            const title = file.replace(/\.(md|txt)$/, '');
            if (existingTitles.has(title.toLowerCase())) {
                this.logger.log(`⏭️ Skipping "${title}" — already exists`);
                result.skipped++;
                continue;
            }

            try {
                const filePath = path.join(this.dataDir, file);
                const buffer = fs.readFileSync(filePath);
                const ext = path.extname(file).replace('.', '');

                await this.kbService.uploadAndProcess(
                    {
                        originalname: file,
                        buffer,
                        mimetype: ext === 'md' ? 'text/markdown' : 'text/plain',
                        size: buffer.length,
                    },
                    undefined,
                    this.inferTags(title),
                );

                this.logger.log(`✅ Loaded KB: ${title}`);
                result.loaded++;
            } catch (err: any) {
                this.logger.error(`❌ Failed to load ${file}: ${err.message}`);
                result.errors.push(`${file}: ${err.message}`);
            }
        }

        return result;
    }

    /**
     * Generate KB docs from Pricing product templates
     */
    async generateFromPricing(): Promise<{ generated: number; errors: string[] }> {
        const result = { generated: 0, errors: [] as string[] };

        try {
            /**
             * Audit 2026-08-29: bản cũ `fetch('http://localhost:4000/api/v1/erp/products')` KHÔNG
             * kèm Authorization, trong khi `ProductsController` có `AuthGuard('jwt') +
             * PermissionsGuard` ⇒ luôn 401 ⇒ hàm này CHẮC CHẮN lỗi. `ai-suggest.service.ts` đã sửa
             * cùng loại lỗi bằng cách gọi service trực tiếp; nay áp dụng ở đây.
             * Lợi thêm: không tự gọi HTTP vào chính mình (tránh deadlock pool khi request nền).
             */
            if (!this.productsService) {
                throw new Error(
                    'ProductsService chưa sẵn sàng — generateFromPricing cần PricingModule được nạp.',
                );
            }
            const products = await this.productsService.findAllProducts();
            const templates: any[] = Array.isArray(products)
                ? products
                : ((products as any)?.data ?? []);

            if (templates.length === 0) {
                this.logger.warn('No product templates found in Pricing');
                return result;
            }

            this.logger.log(`📦 Found ${templates.length} Pricing product templates`);

            // Generate markdown content from templates
            const markdown = this.generateProductMarkdown(templates);

            // Check if we already have an Pricing-generated doc
            const existing = await this.kbService.findAll();
            const pricingDoc = existing.find(d => d.title.toLowerCase().includes('pricing-products'));

            if (pricingDoc) {
                // Delete old version and reload
                await this.kbService.deleteDocument(pricingDoc.id);
                this.logger.log('🔄 Replacing existing Pricing products KB doc');
            }

            // Upload as KB document
            const buffer = Buffer.from(markdown, 'utf-8');
            await this.kbService.uploadAndProcess(
                {
                    originalname: 'pricing-products-auto-generated.md',
                    buffer,
                    mimetype: 'text/markdown',
                    size: buffer.length,
                },
                undefined,
                ['pricing', 'san-pham', 'bao-gia', 'auto-generated'],
            );

            result.generated = templates.length;
            this.logger.log(`✅ Generated KB from ${templates.length} Pricing templates`);
        } catch (err: any) {
            this.logger.error(`❌ Pricing KB generation failed: ${err.message}`);
            result.errors.push(err.message);
        }

        return result;
    }

    /**
     * Generate structured markdown from Pricing product templates
     */
    private generateProductMarkdown(templates: any[]): string {
        const typeNames: Record<string, string> = {
            loose: 'Sản phẩm rời',
            bound: 'Sản phẩm đóng cuốn',
            large_format: 'Sản phẩm khổ lớn',
        };

        // Group by product_type
        const groups: Record<string, any[]> = {};
        for (const t of templates) {
            const type = t.product_type || 'other';
            if (!groups[type]) groups[type] = [];
            groups[type].push(t);
        }

        let md = '# Danh mục sản phẩm in ấn (Dữ liệu Pricing)\n\n';
        md += `> Tự động sinh từ ${templates.length} product templates trong Pricing.\n`;
        md += `> Cập nhật: ${new Date().toLocaleDateString('vi-VN')}\n\n`;

        for (const [type, products] of Object.entries(groups)) {
            md += `## ${typeNames[type] || type}\n\n`;

            for (const product of products) {
                md += `### ${product.name}\n`;
                md += `- **Mã**: ${product.code}\n`;
                md += `- **Loại**: ${typeNames[type] || type}\n`;

                if (product.keywords?.length > 0) {
                    md += `- **Từ khóa**: ${product.keywords.join(', ')}\n`;
                }

                const fields = product.fields || [];
                if (fields.length > 0) {
                    const required = fields.filter((f: any) => f.required);
                    const optional = fields.filter((f: any) => !f.required);

                    if (required.length > 0) {
                        md += `- **Thông tin BẮT BUỘC khi báo giá**:\n`;
                        for (const f of required) {
                            const question = f.ai_question || `${f.label}?`;
                            let optionsStr = '';
                            if (f.options?.labels?.length > 0) {
                                optionsStr = ` (Lựa chọn: ${f.options.labels.join(', ')})`;
                            } else if (f.options?.choices?.length > 0) {
                                optionsStr = ` (Lựa chọn: ${f.options.choices.join(', ')})`;
                            }
                            md += `  - ${f.label}: ${question}${optionsStr}\n`;
                        }
                    }

                    if (optional.length > 0) {
                        md += `- **Thông tin tùy chọn**:\n`;
                        for (const f of optional) {
                            let defaultStr = f.default_value ? ` (mặc định: ${f.default_value})` : '';
                            md += `  - ${f.label}${defaultStr}\n`;
                        }
                    }
                }

                md += '\n';
            }
        }

        return md;
    }

    /**
     * Infer tags from filename
     */
    private inferTags(filename: string): string[] {
        const tags: string[] = [];
        const lower = filename.toLowerCase();

        if (lower.includes('chat-lieu') || lower.includes('material')) tags.push('chat-lieu', 'giay');
        if (lower.includes('gia-cong') || lower.includes('finishing')) tags.push('gia-cong', 'can', 'ep-nhu');
        if (lower.includes('quy-cach') || lower.includes('ky-thuat')) tags.push('ky-thuat', 'file', 'thiet-ke');
        if (lower.includes('thoi-gian') || lower.includes('giao-hang')) tags.push('thoi-gian', 'giao-hang');
        if (lower.includes('cau-hoi') || lower.includes('faq')) tags.push('faq', 'hoi-dap');
        if (lower.includes('san-pham') || lower.includes('product')) tags.push('san-pham', 'danh-muc');
        if (lower.includes('bang-gia') || lower.includes('price')) tags.push('bang-gia', 'gia');

        return tags.length > 0 ? tags : ['general'];
    }
}
