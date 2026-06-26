import { BaseTool } from './base.tool';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetProductInfoTool implements BaseTool {
    name = 'get_product_info';
    description = 'Lấy thông tin chi tiết về một sản phẩm in ấn cụ thể: chất liệu khuyến nghị, kích thước phổ biến, gia công phù hợp.';
    parameters = {
        type: 'object',
        properties: {
            product_name: {
                type: 'string',
                description: 'Tên sản phẩm, ví dụ: "namecard", "tem nhãn", "tờ rơi", "catalogue"',
            },
        },
        required: ['product_name'],
    };

    async execute(args: { product_name: string }, context: any): Promise<string> {
        const knowledge = context.printingKnowledge;
        if (!knowledge?.products) {
            return 'Không có dữ liệu sản phẩm trong hệ thống.';
        }

        const nameLC = args.product_name.toLowerCase();
        for (const [key, product] of Object.entries<any>(knowledge.products)) {
            const keywords: string[] = product.keywords || [];
            if (key === nameLC || keywords.some(kw => nameLC.includes(kw.toLowerCase()))) {
                const info: string[] = [`Sản phẩm: ${product.displayName}`];

                if (product.usageRules) {
                    info.push('Gợi ý theo ngữ cảnh:');
                    for (const rule of product.usageRules.slice(0, 3)) {
                        if (rule.material?.name) {
                            info.push(`  - ${(rule.context || []).join(', ')}: nên dùng ${rule.material.name}${rule.material.size ? ` (${rule.material.size})` : ''}`);
                        }
                    }
                }

                if (product.upsell) {
                    info.push(`Gợi ý upsell: ${product.upsell.join(', ')}`);
                }

                return info.join('\n');
            }
        }

        return `Không tìm thấy thông tin chi tiết về sản phẩm "${args.product_name}".`;
    }
}
