import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable, from } from 'rxjs';
import { TenantContextService } from './tenant-context.service';

/**
 * Enforcement đọc theo request: mở MỘT transaction/connection cho cả request, set
 * `app.current_tenant` (hoặc `app.bypass`), gắn EntityManager vào tenant context để
 * service dùng cho ĐỌC → Postgres RLS lọc đúng tenant trên cùng connection.
 *
 * ⚠️ MẶC ĐỊNH TẮT: chỉ hoạt động khi `TENANT_RLS_ENABLED=true`. Khi tắt → passthrough
 * hoàn toàn (không mở transaction, không đổi hành vi). Bật trong phiên flip có kiểm soát
 * SAU khi đã: tạo role NOSUPERUSER + áp RLS Pha B + service dùng `tenantCtx.manager()` cho đọc.
 *
 * _Requirements: 3.2, 3.3, 4.x_
 */
@Injectable()
export class TenantConnectionInterceptor implements NestInterceptor {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly tenant: TenantContextService,
    ) {}

    private get enabled(): boolean {
        return process.env.TENANT_RLS_ENABLED === 'true';
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (!this.enabled || context.getType() !== 'http') return next.handle();
        const ctx = this.tenant.get();
        if (!ctx) return next.handle(); // chưa có tenant context → để qua (guard khác lo)

        // Bọc toàn bộ handler trong 1 transaction có biến phiên tenant.
        const run = async () => {
            const qr = this.dataSource.createQueryRunner();
            await qr.connect();
            await qr.startTransaction();
            try {
                if (ctx.bypass) {
                    await qr.query(`SET LOCAL app.bypass = 'on'`);
                } else {
                    await qr.query(`SELECT set_config('app.current_tenant', $1, true)`, [String(ctx.tenantId)]);
                }
                this.tenant.attachManager(qr.manager);
                // rxjs Observable → Promise để chạy trong transaction.
                const { lastValueFrom } = await import('rxjs');
                const result = await lastValueFrom(next.handle());
                await qr.commitTransaction();
                return result;
            } catch (e) {
                await qr.rollbackTransaction();
                throw e;
            } finally {
                this.tenant.attachManager(undefined);
                await qr.release();
            }
        };

        return from(run());
    }
}
