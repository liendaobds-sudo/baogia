import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Material } from './material.entity';
import { PaperSize } from './paper-size.entity';

@Entity('pricing_tiers')
export class PricingTier {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Material, (m) => m.pricingTiers, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'material_id' })
    material: Material;

    @Index()
    @Column({ name: 'material_id' })
    materialId: number;

    @ManyToOne(() => PaperSize, (ps) => ps.pricingTiers, { nullable: true })
    @JoinColumn({ name: 'paper_size_id' })
    paperSize: PaperSize;

    @Column({ name: 'paper_size_id', nullable: true })
    paperSizeId: number;

    @Column({ length: 50, default: 'digital_toner' })
    technology: string; // 'digital_toner' | 'offset_4c' | 'uv_flatbed' | etc.

    @Column({ name: 'print_side', length: 10, default: 'single' })
    printSide: string; // 'single' | 'double'

    @Column({ name: 'print_type', length: 10, default: '4c' })
    printType: string; // '4c' | 'bw' | '5c' | '6c'

    @Column({ name: 'quantity_from', type: 'int' })
    quantityFrom: number;

    @Column({ name: 'quantity_to', type: 'int', nullable: true })
    quantityTo: number;

    @Column({ name: 'price_per_sheet', type: 'float' })
    pricePerSheet: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
