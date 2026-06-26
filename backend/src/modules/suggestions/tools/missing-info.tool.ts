import { BaseTool } from './base.tool';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CheckMissingInfoTool implements BaseTool {
    name = 'check_missing_info';
    description = 'Kiểm tra xem khách đã cung cấp đủ thông vị chưa để tư vấn chính xác: số lượng, kích thước, chất liệu, gia công.';
    parameters = {
        type: 'object',
        properties: {
            product: { type: 'string', description: 'Sản phẩm khách muốn in' },
            customer_provided: {
                type: 'string',
                description: 'Tóm tắt những gì khách đã cung cấp',
            },
        },
        required: ['product', 'customer_provided'],
    };

    async execute(args: { product: string; customer_provided: string }, context: any): Promise<string> {
        const requiredFields = [
            { field: 'số lượng', keywords: ['số lượng', 'cái', 'bộ', 'tờ', 'hộp', 'cuốn', 'tấm'] },
            { field: 'kích thước', keywords: ['kích thước', 'khổ', 'cm', 'mm', 'a4', 'a5', 'a3'] },
            { field: 'chất liệu', keywords: ['chất liệu', 'giấy', 'couche', 'kraft', 'ivory', 'pvc'] },
            { field: 'gia công sau in', keywords: ['cán', 'bế', 'ép nhũ', 'dập nổi', 'uv', 'gia công'] },
        ];

        const providedLC = args.customer_provided.toLowerCase();
        const missing: string[] = [];
        const provided: string[] = [];

        for (const req of requiredFields) {
            if (req.keywords.some(kw => providedLC.includes(kw))) {
                provided.push(req.field);
            } else {
                missing.push(req.field);
            }
        }

        let result = `Sản phẩm: ${args.product}\n`;
        result += `Đã có: ${provided.length > 0 ? provided.join(', ') : 'chưa có thông tin nào'}\n`;
        result += `Cần hỏi thêm: ${missing.length > 0 ? missing.join(', ') : 'đã đủ thông tin cơ bản'}`;

        return result;
    }
}
