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

    @Column({ type: 'text', nullable: true })
    notes: string;

    @ManyToOne(() => InventorySlip, slip => slip.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'slip_id' })
    slip: InventorySlip;

    @ManyToOne(() => Material)
    @JoinColumn({ name: 'material_id' })
    material: Material;
}
