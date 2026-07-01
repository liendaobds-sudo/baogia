/**
 * Pricing Controller
 *
 * Public and internal API endpoints for pricing calculations.
 * Port of: api/public/v1/calculate_price.php + api/public/v1/master_data.php
 *
 * Response format matches PHP exactly: { success: true, data: ... }
 */

import { Controller, Post, Get, Body, Query, Logger, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingService } from './pricing.service';
import { PricingFacadeService } from './services/pricing-facade.service';
import { CapabilityService } from '../../quote/capability.service';
import { assertQuoteTypeEnabled } from '../../quote/assert-method-enabled';

@Controller('pricing')
export class PricingController {
    private readonly logger = new Logger(PricingController.name);

    constructor(
        private readonly pricingFacade: PricingFacadeService,
        private readonly capability: CapabilityService,
    ) { }

    // ════════════════════════════════════════════════
    // POST /api/v1/pricing/calculate — Calculate price
    // ════════════════════════════════════════════════

    @Post('calculate')
    @UseGuards(AuthGuard('jwt'))
    async calculatePrice(@Body() input: Record<string, unknown>) {
        // Enforce Cờ_Năng_Lực theo tenant: loại digital → phương pháp 'digital'.
        // Mặc định 'loose' (đồng bộ facade) khi thiếu type; loại lạ → 400; method tắt → 403.
        const quoteType = (input.type as string) || (input.product_type as string) || 'loose';
        await assertQuoteTypeEnabled(this.capability, quoteType);
        return this.pricingFacade.calculatePrice(input);
    }

    // ════════════════════════════════════════════════
    // GET /api/v1/pricing/master-data
    // ════════════════════════════════════════════════

    @Get('master-data')
    @UseGuards(AuthGuard('jwt'))
    async getMasterData(@Query('type') type?: string, @Query('scope') scope?: string) {
        return this.pricingFacade.getMasterData(type, scope);
    }

    // ════════════════════════════════════════════════
    // GET /api/v1/pricing/health — public (monitoring)
    // ════════════════════════════════════════════════

    @Get('health')
    async health() {
        return {
            success: true,
            data: { status: 'ok', engine: 'nestjs', timestamp: new Date().toISOString() },
        };
    }
}
