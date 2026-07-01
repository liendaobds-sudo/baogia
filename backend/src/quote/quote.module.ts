/**
 * QuoteModule (tầng method-agnostic — Phase 1) — Công_Cụ_Báo_Giá hợp nhất.
 *
 * Wiring tầng năng lực + registry + plugin:
 *  - `TypeOrmModule.forFeature([MethodCapability])` cho CapabilityService.
 *  - `PricingModule` cung cấp `PricingFacadeService`, `PricingService` (digital) và
 *    `EngineOffsetService` (offset) để các plugin bọc lại — KHÔNG đổi số học (Req 6.1).
 *  - `MethodRegistry` + `DigitalMethodPlugin` + `OffsetMethodPlugin`: plugin tự đăng ký
 *    vào registry qua OnModuleInit.
 *  - `QuoteController` expose API Cờ_Năng_Lực.
 *
 * Lưu ý: lớp này từng trùng tên `QuoteModule` với module CRUD báo giá ở `modules/quote`;
 * nay đổi tên thành `QuoteCapabilityModule` để tránh nhầm định danh. Hai controller cùng
 * dùng tiền tố `/quote` nhưng KHÔNG trùng route (controller này chỉ phục vụ `capabilities`).
 *
 * _Requirements: 1.2, 1.3, 1.6, 1.8, 2.1_
 */
import { Module } from '@nestjs/common';
import { PricingModule } from '../modules/pricing/pricing.module';
import { CapabilityModule } from './capability.module';
import { CapabilityService } from './capability.service';
import { ComparatorService } from './comparator.service';
import { MethodRegistry } from './method-registry.service';
import { DigitalMethodPlugin } from './plugins/digital-method.plugin';
import { OffsetMethodPlugin } from './plugins/offset-method.plugin';
import { QuoteController } from './quote.controller';

@Module({
    imports: [
        CapabilityModule,
        PricingModule,
    ],
    controllers: [QuoteController],
    providers: [
        MethodRegistry,
        DigitalMethodPlugin,
        OffsetMethodPlugin,
        ComparatorService,
    ],
    exports: [CapabilityModule, MethodRegistry, ComparatorService],
})
export class QuoteCapabilityModule {}
