import { BaseTool } from './base.tool';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

@Injectable()
export class SearchKnowledgeBaseTool implements BaseTool {
    name = 'search_knowledge_base';
    description = 'Tìm kiến thức kỹ thuật về sản phẩm in ấn, chất liệu và quy cách. Kết quả KB không phải nguồn báo giá và không được dùng để nêu số tiền.';
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

    constructor(
        private readonly kbService: KnowledgeBaseService,
        private readonly tenant: TenantContextService,
    ) {}

    async execute(args: { query: string }, context: any): Promise<string> {
        const requestedTenantId = Number(context?.tenantId);
        const currentTenantId = this.tenant.currentTenantId();
        if (!Number.isSafeInteger(requestedTenantId) || requestedTenantId <= 0 || currentTenantId !== requestedTenantId) {
            return 'Không thể tra cứu cơ sở kiến thức: thiếu hoặc sai ngữ cảnh đơn vị.';
        }
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
