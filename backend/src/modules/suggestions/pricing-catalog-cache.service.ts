import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PricingCatalogCacheService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PricingCatalogCacheService.name);
    
    private pricingMaterials: any[] = [];
    private pricingTiers: any[] = [];
    private pricingProcessingOptions: any[] = [];
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(private readonly configService: ConfigService) {}

    private getPricingApiUrl(): string {
        // Phase 6: fetch from local NestJS instead of PHP
        return 'http://localhost:4000/api/v1';
    }

    async onModuleInit() {
        await this.loadPricingCatalog();
        // Refresh cache every 10 minutes
        this.cleanupInterval = setInterval(() => this.loadPricingCatalog(), 10 * 60 * 1000);
    }

    onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    private async loadPricingCatalog() {
        const apiKey = this.configService.get<string>('PRICING_API_KEY', '');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) Object.assign(headers, { 'x-api-key': apiKey });

        try {
            const pricingApi = this.getPricingApiUrl();
            const res = await fetch(`${pricingApi}/pricing/master-data?type=all`, { headers });
            if (!res.ok) {
                this.logger.warn(`⚠️ Pricing master-data returned ${res.status}`);
                return;
            }
            const data = await res.json();
            const payload = data.data || data;
            this.pricingMaterials = payload.materials || [];
            this.pricingProcessingOptions = payload.processing || [];
            // Pricing tiers are embedded as has_pricing count in materials (actual prices via calculate_price.php)
            this.pricingTiers = [];
            this.logger.log(`💰 Pricing catalog loaded: ${this.pricingMaterials.length} materials, ${this.pricingProcessingOptions.length} processing options`);
        } catch (err: any) {
            this.logger.warn(`⚠️ Could not load Pricing catalog: ${err.message}`);
        }
    }

    getMaterials() {
        return this.pricingMaterials;
    }

    getProcessingOptions() {
        return this.pricingProcessingOptions;
    }

    getTiers() {
        return this.pricingTiers;
    }
}
