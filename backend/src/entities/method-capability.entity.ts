import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    Unique,
    UpdateDateColumn,
} from 'typeorm';

/**
 * MethodCapability — Cờ Năng lực sản xuất (Capability Flag) cấp Đơn_Vị.
 *
 * Lưu trạng thái bật/tắt từng Phương_Pháp_In (`methodId`) cho mỗi Đơn_Vị (`unitId`).
 * Mỗi cặp (unitId, methodId) có đúng một trạng thái (UNIQUE) — Req 1.1.
 * Chưa có bản ghi ⇒ coi như `enabled=false`; Đơn_Vị mới có thể tồn tại với
 * 0 phương pháp được bật — Req 1.7.
 *
 * `unitId` mặc định 'default' để độc lập với việc multi-tenant bật/tắt.
 * `methodId` mở rộng được (digital | offset | large_format | ...).
 */
@Entity('method_capabilities')
@Unique(['unitId', 'methodId'])
export class MethodCapability {
    @PrimaryGeneratedColumn()
    id: number;

    /** Đơn_Vị (nhà in). Mặc định 'default' khi multi-tenant tắt. */
    @Column({ name: 'unit_id', type: 'varchar', length: 50, default: 'default' })
    unitId: string;

    /**
     * Tenant sở hữu cấu hình này (tenant-method-capability).
     *  - NULL  = hàng baseline/global (unit_id='default') — mặc định nền cho tenant chưa cấu hình.
     *  - <id>  = cấu hình tường minh riêng của tenant đó.
     * Uniqueness theo tenant do partial index `uq_method_cap_tenant_method` ở DB đảm nhiệm.
     */
    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId?: number | null;

    /** Định danh Phương_Pháp_In: 'digital' | 'offset' | ... (mở rộng được) */
    @Column({ name: 'method_id', type: 'varchar', length: 30 })
    methodId: string;

    /** Cờ bật/tắt phương pháp cho Đơn_Vị. Mặc định false. */
    @Column({ type: 'boolean', default: false })
    enabled: boolean;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
