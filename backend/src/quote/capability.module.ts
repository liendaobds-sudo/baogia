import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MethodCapability } from '../entities/method-capability.entity';
import { CapabilityService } from './capability.service';

/**
 * CapabilityModule — cung cấp `CapabilityService` (Cờ_Năng_Lực Phương_Pháp_In) dùng chung.
 *
 * Tách riêng để CẢ pricing module (PricingController/OffsetController) LẪN quote module
 * (QuoteService mini/chatbot) và QuoteCapabilityModule đều import được mà KHÔNG tạo
 * phụ thuộc vòng (module này chỉ phụ thuộc entity + TenantContextService global).
 *
 * _Requirements: 4.x (enforcement mọi đường tính giá)_
 */
@Module({
    imports: [TypeOrmModule.forFeature([MethodCapability])],
    providers: [CapabilityService],
    exports: [CapabilityService],
})
export class CapabilityModule {}
