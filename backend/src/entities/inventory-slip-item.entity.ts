import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { InventorySlip } from './inventory-slip.entity';
import { Material } from './material.entity';

@Entity('inventory_slip_items')
export class InventorySlipItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'slip_id' })
    slip_id: number;

    @Column({ name: 'material_id' })
    material_id: number;

    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    quantity: number;

    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, nullable: true })
    unit_price: number;

    // ── Nhập theo LÔ + quy đổi ra đơn vị cơ sở (2026-07-07) ──
    // Người dùng mua theo ram/kg/cuộn; hệ thống quy về đơn vị cơ sở của vật tư (tờ/m²)
    // để cộng tồn + tính giá vốn bình quân. `quantity` LUÔN là đơn vị cơ sở.
    @Column({ name: 'purchase_unit', length: 20, nullable: true })
    purchase_unit: string; // 'ram' | 'kg' | 'roll' | 'sheet' | 'sqm' | ...

    @Column({ name: 'purchase_qty', type: 'float', nullable: true })
    purchase_qty: number; // số lượng theo ĐV mua (lưu vết); quantity = purchase_qty × conversion_factor

    @Column({ name: 'conversion_factor', type: 'float', default: 1 })
    conversion_factor: number; // số ĐV cơ sở trong 1 ĐV mua

    @Column({ name: 'unit_cost_base', type: 'float', nullable: true })
    unit_cost_base: number; // giá vốn / ĐV cơ sở của lô này (= giá lô ÷ factor)

    @Column({ type: 'text', nullable: true })
    notes: string;

    @ManyToOne(() => InventorySlip, slip => slip.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'slip_id' })
    slip: InventorySlip;

    @ManyToOne(() => Material)
    @JoinColumn({ name: 'material_id' })
    material: Material;
}
