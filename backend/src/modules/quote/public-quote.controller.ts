import { Controller, Post, Body } from '@nestjs/common';
import { QuoteService } from './quote.service';

@Controller('public/v1/quote')
export class PublicQuoteController {
    constructor(private readonly quoteService: QuoteService) { }

    @Post('create-from-chat')
    async createFromChat(@Body() body: any) {
        if (!body.sessionId) {
            return { success: false, error: 'Session ID is required' };
        }
        if (!body.quoteData || !body.quoteData.product || !body.quoteData.quantity) {
            return { success: false, error: 'Invalid quote data' };
        }
        if (!body.customerInfo || !body.customerInfo.name || !body.customerInfo.phone) {
            return { success: false, error: 'Customer name and phone are required' };
        }

        try {
            const result = await this.quoteService.createQuoteFromChat(body.sessionId, body.quoteData, body.customerInfo);
            return result;
        } catch (error: any) {
            return { success: false, error: error.message || 'Có lỗi xảy ra khi tạo báo giá' };
        }
    }
}
