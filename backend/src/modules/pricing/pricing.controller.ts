/**
 * Pricing Controller
 *
 * Public and internal API endpoints for pricing calculations.
 * Port of: api/public/v1/calculate_price.php + api/public/v1/master_data.php
 *
 * Response format matches PHP exactly: { success: true, data: ... }
 */

import { Controller, Post, Get, Body, Query, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingService } from './pricing.service';
import { PricingFacadeService } from './services/pricing-facade.service';

@Controller('pricing')
export class PricingController {
    private readonly logger = new Logger(PricingController.name);

    constructor(
        private readonly pricingFacade: PricingFacadeService,
    ) { }

    // ════════════════════════════════════════════════
    // POST /api/v1/pricing/calculate — Calculate price
    // ════════════════════════════════════════════════

    @Post('calculate')
    async calculatePrice(@Body() input: Record<string, unknown>) {
        return this.pricingFacade.calculatePrice(input);
    }

    // ════════════════════════════════════════════════
    // GET /api/v1/pricing/master-data
    // ════════════════════════════════════════════════

    @Get('master-data')
    async getMasterData(@Query('type') type?: string, @Query('scope') scope?: string) {
        return this.pricingFacade.getMasterData(type, scope);
    }

    // ════════════════════════════════════════════════
    // GET /api/v1/pricing/health
    // ════════════════════════════════════════════════

    @Get('health')
    async health() {
        return {
            success: true,
            data: { status: 'ok', engine: 'nestjs', timestamp: new Date().toISOString() },
        };
    }
}
