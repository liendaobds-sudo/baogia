import {
    Controller, Post, Body, Headers, UnauthorizedException, ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { QuoteService } from './quote.service';

/**
 * Public quote creation (chat widget / external).
 * Production: requires PUBLIC_QUOTE_API_KEY header (or X-Api-Key).
 * Always rate-limited; rejects when key configured but missing/wrong.
 */
@Controller('public/v1/quote')
export class PublicQuoteController {
    constructor(
        private readonly quoteService: QuoteService,
        private readonly config: ConfigService,
    ) { }

    @Post('create-from-chat')
    @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20/min per IP
    async createFromChat(
        @Body() body: any,
        @Headers('x-api-key') apiKeyHeader?: string,
        @Headers('authorization') authorization?: string,
    ) {
        this.assertPublicQuoteAccess(apiKeyHeader, authorization);

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

    private assertPublicQuoteAccess(apiKeyHeader?: string, authorization?: string): void {
        const requiredKey = this.config.get<string>('PUBLIC_QUOTE_API_KEY')?.trim();
        const isProduction = this.config.get<string>('NODE_ENV') === 'production';

        // Production without key configured → refuse (avoid open spam → tenant 1)
        if (isProduction && !requiredKey) {
            throw new ServiceUnavailableException(
                'Public quote API disabled: set PUBLIC_QUOTE_API_KEY in production.',
            );
        }

        // Dev without key → allow (local chat testing)
        if (!requiredKey) return;

        const bearer = authorization?.startsWith('Bearer ')
            ? authorization.slice(7).trim()
            : undefined;
        const provided = (apiKeyHeader || bearer || '').trim();
        if (!provided || provided !== requiredKey) {
            throw new UnauthorizedException('Invalid or missing API key for public quote');
        }
    }
}
