import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantAppScope } from '../../entities/tenant-app-scope.entity';
import { AppScopeService } from './app-scope.service';
import { AppScopeController } from './app-scope.controller';

/**
 * Module global cung cấp AppScopeService (Cờ_Phạm_Vi Trục_Ứng_Dụng theo tenant).
 *
 * Tách riêng để controller Trục CSKH (conversations/messages/contacts/suggestions),
 * đường chạy nền (message-processor/follow-up), và super-admin đều import được mà
 * không tạo phụ thuộc vòng (chỉ phụ thuộc entity + TenantContextService global).
 *
 * _Requirements: 3.1_
 */
@Global()
@Module({
    imports: [TypeOrmModule.forFeature([TenantAppScope])],
    controllers: [AppScopeController],
    providers: [AppScopeService],
    exports: [AppScopeService],
})
export class AppScopeModule {}
