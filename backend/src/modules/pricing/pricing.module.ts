import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { 
  Material, Unit, PaperSize, PrintType,
  MaterialType, Product, ProductCategory, PricingTier,  ProcessingPricing, LargeFormatPricing,
  SiteSetting, SystemSetting, ProductQuoteConfig, ProductAiField,
  Customer, CustomerPriceGroup, CustomerInteraction, Quote, QuoteItem, QuoteVersion, PricingConfig,
  SetupFee, ProductionCost,
  UnifiedProduct, UnifiedProductCategory,
  InventorySlip, InventorySlipItem,
  OffsetMachineConfig, PlatePricing, WasteRule
} from '../../entities';
import { Printer } from './entities/printers.entity';
import { MaterialCategory } from './entities/material-categories.entity';
import { ProcessingOption } from './entities/processing-options.entity';

import { UnitsService } from './services/units.service';
import { PaperSizesService } from './services/paper-sizes.service';
import { PrintersService } from './services/printers.service';
import { PrintTypesService } from './services/print-types.service';
import { MaterialCategoriesService } from './services/material-categories.service';
import { MaterialTypesService } from './services/material-types.service';
import { ProcessingOptionsService } from './services/processing-options.service';
import { SheetOptimizerService } from './services/sheet-optimizer.service';
import { LargeFormatCalculatorService } from './services/large-format-calculator.service';
import { BoundCalculatorService } from './services/bound-calculator.service';
import { PricingService } from './pricing.service';
import { PricingFacadeService } from './services/pricing-facade.service';

import { 
  ProductsController, ErpProductCategoriesController, ErpQuoteTemplatesController, ErpAiConfigController 
} from './controllers/products.controller';
import { 
  ErpMaterialsController, ErpMaterialTypesController, ErpMaterialCategoriesController, ErpProcessingOptionsController, ErpProcessingPricingController
} from './controllers/materials.controller';
import { 
  ErpOrdersController, ErpOrderVersionsController, ErpOrderPdfController 
} from './controllers/orders.controller';
import { 
  ErpCustomersController, ErpCustomerPriceGroupsController 
} from './controllers/customers.controller';
import { 
  ErpSystemSettingsController, ErpPricingConfigController, ErpSetupFeesController, ErpProductionCostsController 
} from './controllers/system-settings.controller';
import { 
  PaperSizesController, PricingTiersController, PrintTypesController, UnitsController, ErpPrintersController, LargeFormatPricingController 
} from './controllers/master-data.controller';
import { 
  ErpStatsController, ErpSyncStatusController, ErpHealthController 
} from './controllers/stats.controller';

import { PricingController } from './pricing.controller';
import { SettingsController } from './controllers/settings.controller';
import { ErpInventoryController } from './controllers/inventory.controller';
import { PricingDashboardController } from './controllers/pricing-dashboard.controller';

import { ProductsService } from './services/products.service';
import { MaterialsService } from './services/materials.service';
import { OrdersService } from './services/orders.service';
import { CustomersService } from './services/customers.service';
import { SystemSettingsService } from './services/system-settings.service';
import { MasterDataService } from './services/master-data.service';
import { StatsService } from './services/stats.service';
import { PricingDashboardService } from './services/pricing-dashboard.service';
import { QuotePdfService } from './services/quote-pdf.service';
import { RfmScoringService } from './services/rfm-scoring.service';
import { OffsetMasterDataService } from './services/offset-master-data.service';
import { OffsetController } from './controllers/offset.controller';
import { EngineOffsetService } from './offset-engine/engine-offset.service';
import { ConfigStore } from './offset-engine/config-store.service';
import { PricingMutationInterceptor } from './pricing-mutation.interceptor';
import { CapabilityModule } from '../../quote/capability.module';

@Module({
  imports: [
    MulterModule.register({}),
    CapabilityModule,
    TypeOrmModule.forFeature([
      Material, Unit, PaperSize,
      Printer, PrintType,
      MaterialCategory, MaterialType, ProcessingOption,
      Product, ProductCategory, PricingTier,
      ProcessingPricing, LargeFormatPricing,
      SiteSetting, SystemSetting, PricingConfig, ProductQuoteConfig, ProductAiField,
      Customer, CustomerPriceGroup, CustomerInteraction, Quote, QuoteItem, QuoteVersion,
      SetupFee, ProductionCost,
      UnifiedProduct, UnifiedProductCategory,
      InventorySlip, InventorySlipItem,
      OffsetMachineConfig, PlatePricing, WasteRule
    ])
  ],
  controllers: [
    ProductsController, ErpProductCategoriesController, ErpQuoteTemplatesController, ErpAiConfigController,
    ErpMaterialsController, ErpMaterialTypesController, ErpMaterialCategoriesController, ErpProcessingOptionsController, ErpProcessingPricingController,
    ErpOrdersController, ErpOrderVersionsController, ErpOrderPdfController,
    ErpCustomersController, ErpCustomerPriceGroupsController,
    ErpSystemSettingsController, ErpPricingConfigController, ErpSetupFeesController, ErpProductionCostsController,
    PaperSizesController, PricingTiersController, PrintTypesController, UnitsController, ErpPrintersController, LargeFormatPricingController,
    ErpInventoryController,
    ErpStatsController, ErpSyncStatusController, ErpHealthController,
    PricingController,
    SettingsController,
    PricingDashboardController,
    OffsetController,
  ],
  providers: [
    UnitsService, PaperSizesService,
    PrintersService, PrintTypesService,
    MaterialCategoriesService, MaterialTypesService, ProcessingOptionsService,
    SheetOptimizerService,
    LargeFormatCalculatorService, BoundCalculatorService, PricingService,
    PricingFacadeService,
    // Modulated Services ported from Monolithic CRUD
    ProductsService, MaterialsService, OrdersService, CustomersService,
    SystemSettingsService, MasterDataService, StatsService,
    PricingDashboardService, QuotePdfService, RfmScoringService,
    OffsetMasterDataService,
    EngineOffsetService, ConfigStore,
    // Phát 'pricing.changed' khi có request ghi vào master-data giá → QuoteService xoá cache
    { provide: APP_INTERCEPTOR, useClass: PricingMutationInterceptor },
  ],
  exports: [
    PricingFacadeService,
    PricingService,
    ProductsService,
    // Exported để tầng method-agnostic (OffsetMethodPlugin) bọc lại — KHÔNG đổi số học.
    EngineOffsetService,
  ]
})
export class PricingModule {}
