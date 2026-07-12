import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Material } from './material.entity';

@Entity('large_format_pricing')
@Index('idx_large_format_pricing_material_id', ['materialId'])
export class LargeFormatPricing {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Material, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'material_id' })
    material: Material;

    @Column({ name: 'material_id', nullable: true })
    materialId: number | null;

    @Column({ name: 'material_code', length: 50, nullable: true })
    materialCode: string;

    @Column({ name: 'material_name', length: 200, nullable: true })
    materialName: string;

    @Column({ name: 'area_from', type: 'float' })
    areaFrom: number; // m²

    @Column({ name: 'area_to', type: 'float', nullable: true })
    areaTo: number; // m²

    @Column({ name: 'price_per_sqm', type: 'float' })
    pricePerSqm: number;

    @Column({ name: 'min_charge', type: 'float', default: 0 })
    minCharge: number;

    // ── Tách chi phí per-máy (2026-07-09, tầng 3 khổ lớn) — giá vốn THUẦN/m² ──
    // price_per_sqm = material_cost + machine_cost + labor_cost + overhead_cost.
    // KHÔNG chứa markup (facade lo). Khổ lớn tách 4 thành phần (không có "mực" riêng như
    // in nhanh — mực máy phun nằm trong chi phí máy/vật tư). Máy đo theo m² (cost_basis='sqm').
    @Column({ name: 'printer_id', type: 'int', nullable: true })
    printerId: number | null; // máy in khổ lớn (hồ sơ chi phí per-máy, cost_basis='sqm')

    @Column({ name: 'material_cost', type: 'float', nullable: true })
    materialCost: number; // chi phí vật liệu/m² (dẫn từ materials.cost_price)

    @Column({ name: 'machine_cost', type: 'float', nullable: true })
    machineCost: number; // chi phí máy/m² (khấu hao + điện phân bổ theo m²)

    @Column({ name: 'labor_cost', type: 'float', nullable: true })
    laborCost: number; // chi phí công/m²

    @Column({ name: 'overhead_cost', type: 'float', nullable: true })
    overheadCost: number; // overhead/m²

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
