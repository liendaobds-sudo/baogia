import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable, from, lastValueFrom } from 'rxjs';
import { runInTransaction } from 'typeorm-transactional';
import { TenantContextService } from './tenant-context.service';

/**
 * Enforcement đọc/ghi theo request: bọc handler trong `runInTransaction` (CLS) và set
 * `app.current_tenant`/`app.bypass` trên ĐÚNG connection của transaction đó. Nhờ
 * typeorm-transactional, MỌI repository inject vào service tự dùng connection này →
 * Postgres RLS lọc đúng tenant mà KHÔNG cần sửa từng service.
 *
 * ⚠️ MẶC ĐỊNH TẮT: chỉ chạy khi `TENANT_RLS_ENABLED=true`; tắt → passthrough hoàn toàn
 * (không transaction, không đổi hành vi). Bật trong phiên flip có kiểm soát.
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

    /** SQL set biến phiên theo context (tách riêng để test thuần). */
    async applyTenantVar(em: { query: (sql: string, p?: any[]) => Promise<any> }): Promise<void> {
        const ctx = this.tenant.get();
        if (!ctx) return;
        if (ctx.bypass) {
            await em.query(`SET LOCAL app.bypass = 'on'`);
        } else {
            await em.query(`SELECT set_config('app.current_tenant', $1, true)`, [String(ctx.tenantId)]);
        }
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        if (!this.enabled || context.getType() !== 'http') return next.handle();
        if (!this.tenant.get()) return next.handle();

        const run = () =>
            runInTransaction(async () => {
                // dataSource.manager trong runInTransaction = manager gắn-CLS của transaction.
                await this.applyTenantVar(this.dataSource.manager);
                return lastValueFrom(next.handle());
            });

        return from(run());
    }
}
