import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('quote_rules')
export class QuoteRule {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'product_type', length: 50 })
    productType: string;

    @Column({ name: 'rule_name', length: 100 })
    ruleName: string;

    @Column({ name: 'required_slots', type: 'simple-json' })
    requiredSlots: string[];

    @Column({ name: 'pricing_formula', type: 'simple-json' })
    pricingFormula: {
        basePrice: number;
        perUnit?: number;
        tiers?: { minQty: number; price: number }[];
        surcharges?: Record<string, number>;
    };

    @Column({ name: 'leadtime_rules', type: 'simple-json', default: '{}' })
    leadtimeRules: {
        standardDays?: number;
        expressSurcharge?: number;
        expressDays?: number;
    };

    @Column({ name: 'tech_notes', type: 'text', nullable: true })
    techNotes: string;

    @Column({ name: 'min_quantity', default: 1 })
    minQuantity: number;

    @Column({ name: 'max_quantity', nullable: true })
    maxQuantity: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'effective_from' })
    effectiveFrom: string;

    @Column({ name: 'effective_to', nullable: true })
    effectiveTo: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'created_by' })
    createdBy: User;

    @Column({ name: 'created_by_id', nullable: true })
    createdById: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
