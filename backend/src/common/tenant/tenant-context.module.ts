import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantContextService } from './tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantConnectionInterceptor } from './tenant-connection.interceptor';

/**
 * Module global cung cấp TenantContextService cho toàn app + đăng ký interceptor:
 *  1. TenantContextInterceptor — nạp context (tenantId) từ request (luôn chạy).
 *  2. TenantConnectionInterceptor — mở connection RLS theo request (CHỈ khi
 *     TENANT_RLS_ENABLED=true; mặc định passthrough → không đổi hành vi).
 *
 * G0/G2 — context + khung enforcement sẵn sàng; RLS bật trong phiên flip có kiểm soát.
 */
@Global()
@Module({
    providers: [
        TenantContextService,
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
        { provide: APP_INTERCEPTOR, useClass: TenantConnectionInterceptor },
    ],
    exports: [TenantContextService],
})
export class TenantContextModule {}
