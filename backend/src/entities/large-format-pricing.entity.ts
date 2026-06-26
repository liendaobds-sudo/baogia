import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Material } from './material.entity';

@Entity('large_format_pricing')
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

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
