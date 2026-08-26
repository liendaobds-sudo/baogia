import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

import { PricingFacadeService } from '../pricing/services/pricing-facade.service';

/**
 * Pricing API Service — Local NestJS integration
 *
 * Previously called a separate Pricing Service via REST API.
 * Now calls the internal `PricingFacadeService` directly (same process).
 * All method signatures are IDENTICAL to the old version — callers don't change.
 */
@Injectable()
export class PricingApiService {
    private readonly logger = new Logger(PricingApiService.name);

    constructor(
        private readonly pricingFacade: PricingFacadeService,
    ) {
        this.logger.log(`Pricing API: Migration completed. Intercepting calls locally!`);
    }

    // ── Helper: Unwrap results ──

    private async callFacade<T = any>(methodName: string, ...args: any[]): Promise<T> {
        try {
            // @ts-ignore
            const result = await this.pricingFacade[methodName](...args);
            if (!result || result.success === false) {
                 this.logger.warn(`PricingFacade error: ${result?.error}`);
                 if (methodName === 'calculatePrice') {
                     throw new HttpException(
                         result?.error || 'Pricing calculation failed',
                         HttpStatus.BAD_REQUEST,
                     );
                 }
                 return result?.data || result;
            }
            return result.data || result;
        } catch (error: any) {
            // Preserve Nest HttpException status (BAD_REQUEST from validation, etc.)
            if (error instanceof HttpException) throw error;
            this.logger.error(`PricingFacade ${methodName} failed: ${error.message}`);
            throw new HttpException(
                error?.message || 'Pricing service unavailable',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }

    // ============================================
    // MASTER DATA
    // ============================================

    async getMasterData(productId?: number, type: string = 'all'): Promise<any> {
        const result = await this.callFacade('getMasterData', type);
        return result;
    }

    async getMaterials(scope?: 'loose' | 'bound' | 'large_format'): Promise<any[]> {
        const result = await this.callFacade('getMasterData', 'materials', scope);
        const arr = result?.materials || result;
        return (Array.isArray(arr) ? arr : []) as any[];
    }

    async getProcessingOptions(scope?: string): Promise<any[]> {
        const result = await this.callFacade('getMasterData', 'processing_options', scope);
        const arr = result?.processing_options || result;
        return (Array.isArray(arr) ? arr : []) as any[];
    }

    async getPaperSizes(): Promise<any[]> {
        const result = await this.callFacade('getMasterData', 'paper_sizes');
        const arr = result?.paper_sizes || result;
        return (Array.isArray(arr) ? arr : []) as any[];
    }

    async getFormOptions(): Promise<any> {
        const result = await this.callFacade('getMasterData', 'form_options');
        return result?.form_options || result || {
            shapes: ['rectangle', 'round', 'custom'],
            print_sides: ['single', 'double'],
            print_types: [],
        };
    }

    async getAccessories(): Promise<any[]> {
        const result = await this.callFacade('getMasterData', 'accessories');
        return (result?.accessories || result || []) as any[];
    }

    // ============================================
    // CALCULATE PRICE — Delegates to local PricingFacadeService
    // ============================================

    async calculateLoose(data: any): Promise<PricingResult> {
        return this.callFacade('calculatePrice', { type: 'loose', ...data });
    }

    async calculateBound(data: any): Promise<PricingResult> {
        return this.callFacade('calculatePrice', { type: 'bound', ...data });
    }

    async calculateLargeFormat(data: any): Promise<PricingResult> {
        return this.callFacade('calculatePrice', { type: 'large_format', ...data });
    }

    async calculatePrice(data: { type: string;[key: string]: any }): Promise<PricingResult> {
        return this.callFacade('calculatePrice', data);
    }

    // ============================================
    // BACKWARD COMPAT — Legacy get/post methods
    // ============================================

    async get(path: string): Promise<any> {
        this.logger.debug(`Legacy get() called but HTTP is disabled: ${path}`);
        return {};
    }

    async post(path: string, body: any): Promise<any> {
        this.logger.debug(`Legacy post() called but HTTP is disabled: ${path}`);
        return {};
    }

    // ============================================
    // HEALTH
    // ============================================

    async isHealthy(): Promise<boolean> {
        return true; // We are locally integrated now!
    }
}

// ============================================
// TYPES (same as before — kept for backward compat)
// ============================================

export interface PricingResult {
    type: string;
    material_cost?: number;
    processing_cost?: number;
    finishing_cost?: number;
    cover_cost?: number;
    inner_cost?: number;
    binding_cost?: number;
    subtotal: number;
    total: number;
    price_per_item: number;
    // Selling-price fields added by PricingFacadeService.calculatePrice (markup + VAT)
    cost_subtotal?: number;
    selling_subtotal?: number;
    selling_price_per_item?: number;
    vat_rate?: number;
    vat_amount?: number;
    grand_total?: number;
    grand_total_per_item?: number;
    markup_method?: string;
    markup_percent?: number;
    breakdown?: Record<string, any>;
    processing_details?: Array<{ name: string; cost: number }>;
    finishing_details?: Array<{ name: string; cost: number }>;
}
