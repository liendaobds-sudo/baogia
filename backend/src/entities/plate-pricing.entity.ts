import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { OffsetMachineConfig } from './offset-machine-config.entity';

/**
 * PlatePricing — Bảng giá kẽm CTP theo máy in / khổ giấy
 * Mỗi dòng = 1 mức giá cho 1 loại kẽm trên 1 máy cụ thể.
 */
@Entity('plate_pricing')
export class PlatePricing {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => OffsetMachineConfig, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'machine_id' })
    machine: OffsetMachineConfig;

    @Column({ name: 'machine_id', type: 'int', nullable: true })
    machineId: number;

    /** Loại kẽm: ctp (phổ biến nhất), film, polyester */
    @Column({ name: 'plate_type', type: 'varchar', length: 30, default: 'ctp' })
    plateType: string;

    /** Tên hiển thị — VD: 'Kẽm CTP 65×86' */
    @Column({ type: 'varchar', length: 100, nullable: true })
    name: string;

    /** Đơn giá 1 bản kẽm (VND) */
    @Column({ name: 'price_per_plate', type: 'decimal', precision: 15, scale: 2 })
    pricePerPlate: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
