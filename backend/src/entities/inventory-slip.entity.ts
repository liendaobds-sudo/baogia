import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { InventorySlipItem } from './inventory-slip-item.entity';

@Entity('inventory_slips')
export class InventorySlip {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, nullable: false })
    type: string; // 'import' | 'export' | 'adjust'

    @Column({ type: 'varchar', length: 50, default: 'confirmed' })
    status: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    reason: string; // e.g. 'Sản xuất', 'Điều chỉnh tồn kho'

    @Column({ type: 'text', nullable: true })
    notes: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @OneToMany(() => InventorySlipItem, item => item.slip, { cascade: true })
    items: InventorySlipItem[];
}
