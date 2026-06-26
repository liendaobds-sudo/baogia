import { BaseTool } from './base.tool';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SearchKnowledgeBaseTool implements BaseTool {
    name = 'search_knowledge_base';
    description = 'Tìm kiếm thông tin về sản phẩm in ấn, chất liệu, giá tham khảo, quy cách trong cơ sở kiến thức. Dùng khi cần tra cứu thông tin chuyên môn.';
    parameters = {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Câu tìm kiếm tiếng Việt, ví dụ: "decal nhựa PVC chống nước" hoặc "giấy couche 150gsm"',
            },
        },
        required: ['query'],
    };

    constructor(private readonly kbService: KnowledgeBaseService) {}

    async execute(args: { query: string }, context: any): Promise<string> {
        const results = await this.kbService.searchChunks(args.query, 3);
        if (results.length === 0) {
            return 'Không tìm thấy thông tin liên quan trong cơ sở kiến thức.';
        }
        return results.map((c, i) => {
            const heading = (c.metadata as any)?.heading || '';
            return `[Kết quả ${i + 1}${heading ? ` — ${heading}` : ''}]:\n${c.content.substring(0, 500)}`;
        }).join('\n\n');
    }
}
