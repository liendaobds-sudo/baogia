import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { MethodCapability } from '../entities/method-capability.entity';
import { MethodId } from './types/method-plugin.types';
import { TenantContextService } from '../common/tenant/tenant-context.service';

/** Đơn_Vị ngầm định khi multi-tenant tắt (Design — "Định nghĩa Đơn_Vị"). */
export const DEFAULT_UNIT_ID = 'default';

/** unit_id cho hàng cấu hình THEO TENANT (giữ UNIQUE(unit_id, method_id) cũ không đụng baseline). */
export function tenantUnitId(tenantId: number): string {
    return `tenant:${tenantId}`;
}

/**
 * Ném khi cố tắt Phương_Pháp_Khả_Dụng cuối cùng của một Đơn_Vị/Tenant đang vận hành
 * (đã có ≥1 phương pháp khả dụng). Tầng API ánh xạ lỗi này → HTTP 409 (Req 1.6, 6.3).
 */
export class LastEnabledMethodError extends Error {
    constructor(
        public readonly unitId: string,
        public readonly methodId: MethodId,
    ) {
        super(
            `Không thể tắt phương pháp khả dụng cuối cùng ('${methodId}') của Đơn_Vị '${unitId}' đang vận hành.`,
        );
        this.name = 'LastEnabledMethodError';
    }
}

/**
 * CapabilityService — quản lý Cờ_Năng_Lực.
 *
 * Hai không gian trong cùng bảng `method_capabilities`:
 *  - **Baseline/global** (`tenant_id IS NULL`, `unit_id='default'`): mặc định nền, seed
 *    digital=true/offset=true. Dùng cho tenant CHƯA cấu hình (tương thích ngược — Req 2).
 *  - **Theo tenant** (`tenant_id=<id>`, `unit_id='tenant:<id>'`): cấu hình tường minh.
 *
 * Chữ ký cũ theo `unitId` được GIỮ NGUYÊN (test & /quote-tool cũ chạy tiếp).
 * API mới theo tenant phục vụ enforcement + admin.
 *
 * _Requirements: 1.1, 1.7, 2.x, 3.x, 6.x_
 */
@Injectable()
export class CapabilityService {
    constructor(
        @InjectRepository(MethodCapability)
        private readonly repo: Repository<MethodCapability>,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) {}

    // ─────────────────────────────────────────────
    // API CŨ theo Đơn_Vị (backward-compat — KHÔNG đổi)
    // ─────────────────────────────────────────────

    /** Tập Phương_Pháp_Khả_Dụng (cờ đang bật) của Đơn_Vị (Req 1.2, 1.3). */
    async getEnabledMethods(unitId: string = DEFAULT_UNIT_ID): Promise<MethodId[]> {
        const rows = await this.repo.find({ where: { unitId, enabled: true } });
        return rows.map((r) => r.methodId);
    }

    /** Một phương pháp có đang khả dụng cho Đơn_Vị không. Chưa có bản ghi ⇒ false (Req 1.7). */
    async isEnabled(
        unitId: string = DEFAULT_UNIT_ID,
        methodId: MethodId,
    ): Promise<boolean> {
        const row = await this.repo.findOne({ where: { unitId, methodId } });
        return row?.enabled ?? false;
    }

    /**
     * Bật/tắt Cờ_Năng_Lực cho một cặp (unitId, methodId) (Req 1.2, 1.3).
     * Ném {@link LastEnabledMethodError} khi tắt phương pháp khả dụng cuối cùng
     * của Đơn_Vị đã có ≥1 phương pháp khả dụng (Req 1.6).
     */
    async setFlag(
        unitId: string = DEFAULT_UNIT_ID,
        methodId: MethodId,
        enabled: boolean,
    ): Promise<MethodCapability> {
        if (!enabled) {
            const enabledMethods = await this.getEnabledMethods(unitId);
            const isCurrentlyEnabled = enabledMethods.includes(methodId);
            if (isCurrentlyEnabled && enabledMethods.length === 1) {
                throw new LastEnabledMethodError(unitId, methodId);
            }
        }

        let row = await this.repo.findOne({ where: { unitId, methodId } });
        if (row) {
            row.enabled = enabled;
        } else {
            row = this.repo.create({ unitId, methodId, enabled });
        }
        return this.repo.save(row);
    }

    /** Liệt kê toàn bộ cờ năng lực (bật và tắt) của Đơn_Vị. */
    async listFlags(unitId: string = DEFAULT_UNIT_ID): Promise<MethodCapability[]> {
        return this.repo.find({ where: { unitId } });
    }

    // ─────────────────────────────────────────────
    // API MỚI theo Tenant
    // ─────────────────────────────────────────────

    /** Hàng baseline/global (`tenant_id IS NULL`) — mặc định nền. */
    private async baselineRows(): Promise<MethodCapability[]> {
        return this.repo.find({ where: { tenantId: IsNull() } });
    }

    /** Hàng cấu hình tường minh của tenant. */
    private async explicitRows(tenantId: number): Promise<MethodCapability[]> {
        return this.repo.find({ where: { tenantId } });
    }

    /**
     * Tập Phương_Pháp_Khả_Dụng của tenant (Req 2, 3).
     *  - `tenantId == null` → baseline.
     *  - tenant CÓ hàng tường minh → dùng hàng đó.
     *  - tenant KHÔNG có hàng nào → kế thừa baseline (tương thích ngược — Req 2.2).
     */
    async getEnabledMethodsForTenant(tenantId: number | null): Promise<MethodId[]> {
        if (tenantId == null) {
            return (await this.baselineRows()).filter((r) => r.enabled).map((r) => r.methodId);
        }
        const explicit = await this.explicitRows(tenantId);
        if (explicit.length > 0) {
            return explicit.filter((r) => r.enabled).map((r) => r.methodId);
        }
        // Chưa cấu hình → kế thừa baseline.
        return (await this.baselineRows()).filter((r) => r.enabled).map((r) => r.methodId);
    }

    /** Một phương pháp có khả dụng cho tenant không (Req 4). */
    async isEnabledForTenant(tenantId: number | null, methodId: MethodId): Promise<boolean> {
        return (await this.getEnabledMethodsForTenant(tenantId)).includes(methodId);
    }

    /**
     * Runtime resolver dùng cho enforcement: lấy tenant từ context.
     *
     * QUYẾT ĐỊNH AN TOÀN (design §Capability resolver): khi KHÔNG có tenant context
     * (currentTenantId() == null) → trả baseline (bật cả hai) thay vì chặn cứng, để
     * KHÔNG làm gãy app khi context chưa được nạp (RLS mặc định TẮT). Enforcement chỉ
     * "cắn" khi admin đã cấu hình tường minh cho tenant. Siết fail-closed nghiêm ngặt
     * để dành cho lộ trình bật RLS (khi tenant context được đảm bảo có mặt).
     */
    async resolveEnabledMethods(): Promise<MethodId[]> {
        const tenantId = this.tenantCtx?.currentTenantId() ?? null;
        return this.getEnabledMethodsForTenant(tenantId);
    }

    /** Liệt kê cờ của tenant (hàng tường minh; rỗng nếu đang kế thừa baseline). */
    async listFlagsForTenant(tenantId: number): Promise<MethodCapability[]> {
        return this.explicitRows(tenantId);
    }

    /**
     * Vật chất hoá (materialize) baseline thành hàng tường minh của tenant khi tenant
     * chưa có cấu hình nào — để thao tác bật/tắt kế tiếp là xác định (Req 2.5, 6.3).
     */
    private async materializeBaselineFor(tenantId: number): Promise<void> {
        const explicit = await this.explicitRows(tenantId);
        if (explicit.length > 0) return;
        const baseline = await this.baselineRows();
        const unitId = tenantUnitId(tenantId);
        const rows = baseline.map((b) =>
            this.repo.create({ unitId, tenantId, methodId: b.methodId, enabled: b.enabled }),
        );
        if (rows.length > 0) await this.repo.save(rows);
    }

    /**
     * Bật/tắt Cờ_Năng_Lực cho một cặp (tenant, methodId) (Req 6.2).
     * Materialize baseline nếu cần; giữ ràng buộc method cuối cùng THEO TENANT (Req 6.3).
     */
    async setFlagForTenant(
        tenantId: number,
        methodId: MethodId,
        enabled: boolean,
    ): Promise<MethodCapability> {
        await this.materializeBaselineFor(tenantId);

        if (!enabled) {
            const enabledMethods = await this.getEnabledMethodsForTenant(tenantId);
            const isCurrentlyEnabled = enabledMethods.includes(methodId);
            if (isCurrentlyEnabled && enabledMethods.length === 1) {
                throw new LastEnabledMethodError(tenantUnitId(tenantId), methodId);
            }
        }

        const unitId = tenantUnitId(tenantId);
        let row = await this.repo.findOne({ where: { tenantId, methodId } });
        if (row) {
            row.enabled = enabled;
        } else {
            row = this.repo.create({ unitId, tenantId, methodId, enabled });
        }
        return this.repo.save(row);
    }
}
