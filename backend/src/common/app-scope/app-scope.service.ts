import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TenantAppScope } from '../../entities/tenant-app-scope.entity';
import { TenantContextService } from '../tenant/tenant-context.service';

/** Trục_Ứng_Dụng. `baogia` là lõi bất khả tắt; `cskh` bật/tắt được theo tenant. */
export type AppKey = 'baogia' | 'cskh';

/** Trục tuỳ chọn duy nhất hiện có (Báo_Giá luôn bật nên không lưu cờ). */
const CSKH: AppKey = 'cskh';

/**
 * AppScopeService — quản lý Cờ_Phạm_Vi Trục_Ứng_Dụng theo tenant.
 *
 * Hai không gian trong cùng bảng `tenant_app_scopes`:
 *  - **Baseline** (`tenant_id IS NULL`): mặc-định-nền, seed `cskh=true`. Dùng cho tenant
 *    CHƯA cấu hình (tương thích ngược — mọi tenant hiện hữu thấy cả hai Trục).
 *  - **Theo tenant** (`tenant_id=<id>`): cấu hình tường minh.
 *
 * Trục Báo_Giá LUÔN khả dụng và KHÔNG có cờ tắt (Req 1.2).
 *
 * _Requirements: 1, 2, 3, 6_
 */
@Injectable()
export class AppScopeService {
    constructor(
        @InjectRepository(TenantAppScope)
        private readonly repo: Repository<TenantAppScope>,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) {}

    /** Cờ baseline cho CSKH (mặc-định-nền). Không có hàng ⇒ coi như bật (tương thích ngược). */
    private async baselineCskh(): Promise<boolean> {
        const row = await this.repo.findOne({ where: { tenantId: IsNull(), appKey: CSKH } });
        return row?.enabled ?? true;
    }

    /**
     * CSKH có khả dụng cho một tenant không (Req 2).
     *  - Tenant có hàng tường minh → dùng hàng đó.
     *  - Không có → kế thừa baseline.
     *  - `tenantId == null` (thiếu context) → baseline (fail-open — Req 4.6).
     */
    async isCskhEnabledForTenant(tenantId: number | null): Promise<boolean> {
        if (tenantId == null) return this.baselineCskh();
        const explicit = await this.repo.findOne({ where: { tenantId, appKey: CSKH } });
        if (explicit) return explicit.enabled;
        return this.baselineCskh();
    }

    /**
     * Runtime resolver dùng cho enforcement: lấy tenant từ context.
     * `baogia` LUÔN có trong tập; `cskh` theo cờ. Thiếu context → coi CSKH bật (baseline).
     */
    async resolveEnabledApps(): Promise<AppKey[]> {
        const tenantId = this.tenantCtx?.currentTenantId() ?? null;
        const apps: AppKey[] = ['baogia'];
        if (await this.isCskhEnabledForTenant(tenantId)) apps.push('cskh');
        return apps;
    }

    /** Trạng thái + nguồn cho màn quản trị (Req 6.1). */
    async getScopeForTenant(tenantId: number): Promise<{ cskh: boolean; source: 'explicit' | 'inherited' }> {
        const explicit = await this.repo.findOne({ where: { tenantId, appKey: CSKH } });
        if (explicit) return { cskh: explicit.enabled, source: 'explicit' };
        return { cskh: await this.baselineCskh(), source: 'inherited' };
    }

    /**
     * Bật/tắt CSKH cho một tenant (Req 6.2). Materialize hàng tường minh.
     * KHÔNG có ràng buộc "last app" — Báo_Giá luôn bật nên tắt CSKH luôn hợp lệ.
     */
    async setCskhForTenant(tenantId: number, enabled: boolean): Promise<TenantAppScope> {
        let row = await this.repo.findOne({ where: { tenantId, appKey: CSKH } });
        if (row) {
            row.enabled = enabled;
        } else {
            row = this.repo.create({ tenantId, appKey: CSKH, enabled });
        }
        return this.repo.save(row);
    }
}
