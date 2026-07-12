import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    UpdateDateColumn,
} from 'typeorm';

/**
 * TenantAppScope — Cờ_Phạm_Vi bật/tắt một Trục_Ứng_Dụng cho một Tenant.
 *
 * Trục Báo_Giá (`baogia`) là lõi bất khả tắt (CSKH phụ thuộc nó) → chỉ lưu cờ cho
 * Trục CSKH (`cskh`).
 *  - `tenant_id IS NULL` = hàng baseline/global (mặc-định-nền cho tenant chưa cấu hình).
 *  - `tenant_id = <id>` = cấu hình tường minh riêng của tenant đó.
 * Uniqueness do partial index ở DB đảm nhiệm (baseline theo `app_key`; theo tenant
 * theo `(tenant_id, app_key)`).
 */
@Entity('tenant_app_scopes')
export class TenantAppScope {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId?: number | null;

    @Column({ name: 'app_key', type: 'varchar', length: 30 })
    appKey: string;

    @Column({ type: 'boolean', default: true })
    enabled: boolean;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
