import { BaseTool } from './base.tool';
import { ConversationSearchService } from '../conversation-search.service';
import { Injectable } from '@nestjs/common';

/**
 * Tool: search_similar_conversations
 * Allows the AI agent to proactively search for similar won conversations
 * when it needs reference material for a complex question.
 */
@Injectable()
export class SearchSimilarConvTool implements BaseTool {
    name = 'search_similar_conversations';
    description = 'Tìm các cuộc hội thoại thành công TƯƠNG TỰ trong quá khứ. Dùng khi khách hỏi câu phức tạp và cần tham khảo cách đã tư vấn thành công trước đây. Trả về câu trả lời đã dẫn đến chốt đơn.';
    parameters = {
        type: 'object',
        properties: {
            product: {
                type: 'string',
                description: 'Loại sản phẩm (namecard, decal, banner, catalogue...)',
            },
            question: {
                type: 'string',
                description: 'Câu hỏi/vấn đề khách đang đặt ra (tiếng Việt)',
            },
        },
        required: ['question'],
    };

    constructor(private readonly convSearch: ConversationSearchService) {}

    async execute(args: { product?: string; question: string }, context: any): Promise<string> {
        const result = await this.convSearch.buildSimilarConversationContext(
            args.product, args.question,
        );
        return result || 'Chưa có cuộc hội thoại tương tự nào được tìm thấy.';
    }
}
