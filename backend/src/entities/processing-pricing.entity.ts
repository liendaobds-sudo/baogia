import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { ProcessingOption } from '../modules/pricing/entities/processing-options.entity';

@Entity('processing_pricing')
export class ProcessingPricing {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => ProcessingOption, (po) => po.processingPricing, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'processing_option_id' })
    processingOption: ProcessingOption;

    @Column({ name: 'processing_option_id' })
    processingOptionId: number;

    @Column({ name: 'pricing_method', length: 20, default: 'per_sqm' })
    pricingMethod: string; // 'per_sqm' | 'per_run' | 'per_piece' | 'per_meter'

    @Column({ name: 'size_spec', length: 100, nullable: true })
    sizeSpec: string; // e.g., 'A4', 'A3', 'custom'

    @Column({ name: 'quantity_from', type: 'int', default: 1 })
    quantityFrom: number;

    @Column({ name: 'quantity_to', type: 'int', nullable: true })
    quantityTo: number;

    @Column({ name: 'unit_price', type: 'float' })
    unitPrice: number;

    @Column({ name: 'min_charge', type: 'float', default: 0 })
    minCharge: number; // Minimum charge for small orders

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
