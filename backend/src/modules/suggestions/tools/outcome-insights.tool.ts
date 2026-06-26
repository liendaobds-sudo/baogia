import { BaseTool } from './base.tool';
import { OutcomeLearningService } from '../outcome-learning.service';
import { Injectable } from '@nestjs/common';

/**
 * Tool: get_outcome_insights
 * Gives the AI agent access to aggregate learning insights
 * from past won/lost conversations.
 */
@Injectable()
export class OutcomeInsightsTool implements BaseTool {
    name = 'get_outcome_insights';
    description = 'Xem thống kê và xu hướng từ các cuộc hội thoại đã kết thúc (chốt đơn / mất khách). Dùng khi cần biết tỷ lệ thành công, phong cách trả lời hay dẫn đến chốt đơn, hoặc cần điều chỉnh cách tiếp cận.';
    parameters = {
        type: 'object',
        properties: {
            intent: {
                type: 'string',
                description: 'Intent hiện tại nếu có (objection, comparison, quote...)',
            },
            product: {
                type: 'string',
                description: 'Loại sản phẩm (namecard, decal, banner...)',
            },
        },
    };

    constructor(private readonly outcomeLearning: OutcomeLearningService) {}

    async execute(args: { intent?: string; product?: string }, context: any): Promise<string> {
        const result = await this.outcomeLearning.buildOutcomeContext(args.intent, args.product);
        return result || 'Chưa có đủ dữ liệu kết quả để phân tích (cần ít nhất 3 cuộc hội thoại đã kết thúc).';
    }
}
