import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
    QuoteRule,
    QuickPrice,
    PricingConfig,
    // Pricing-aligned entities (read-only — Pricing Service owns them)
    MaterialType,
    Material,
    PaperSize,
    PricingTier,
    ProcessingPricing,
    LargeFormatPricing,
    ProductCategory,
    Product,
    ProductQuoteConfig,
    ProductAiField,
    PrintType,
    Unit,
    Quote,
    QuoteItem,
    Customer,
    AiConversation
} from '../../entities';
import { QuoteController } from './quote.controller';
import { QuoteTemplatesController } from './quote-templates.controller';
import { PublicQuoteController } from './public-quote.controller';
import { QuoteService } from './quote.service';
import { QuoteCrudService } from './quote-crud.service';
import { QuoteTemplatesService } from './quote-templates.service';
import { QuoteParserService } from './quote-parser.service';
import { ComparisonEngineService } from './comparison-engine.service';
import { CartStateService } from './cart-state.service';
import { QuickPriceController } from './quick-price.controller';
// REMOVED: PricingProxyController — PricingController in PricingModule handles all routes
// REMOVED: PricingBridgeService — PHP server no longer needed (calculator migrated to NestJS)
import { PricingApiService } from './pricing-api.service';


@Module({
    imports: [ PricingModule,
        // HTTP client (kept for legacy compat — PricingApiService now calls PricingFacade locally)
        HttpModule.register({
            timeout: 10000,
            maxRedirects: 3,
        }),
        TypeOrmModule.forFeature([
            QuoteRule, QuickPrice, PricingConfig,
            // Keep these for read-only use by QuoteParserService (material resolution)
            MaterialType, Material, PaperSize,
            PricingTier, ProcessingPricing,
            LargeFormatPricing,
            ProductCategory, Product, ProductQuoteConfig, ProductAiField,
            PrintType, Unit,
            Quote, QuoteItem, Customer, AiConversation
        ]),
    ],
    controllers: [
        QuoteController,
        QuoteTemplatesController,
        PublicQuoteController,
        QuickPriceController,
        // REMOVED: PricingProxyController — routes now handled by PricingController
    ],
    providers: [QuoteService, QuoteCrudService, QuoteTemplatesService, QuoteParserService, PricingApiService, ComparisonEngineService, CartStateService],
    exports: [QuoteService, QuoteCrudService, QuoteTemplatesService, QuoteParserService, PricingApiService, ComparisonEngineService, CartStateService],
})
export class QuoteModule { }
