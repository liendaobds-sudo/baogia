import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('subscription_plans')
export class SubscriptionPlan {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 50, unique: true })
    code: string;

    @Column({ type: 'varchar', length: 100 })
    name: string;

    /** Monthly price (VND) */
    @Column({ type: 'decimal', precision: 12, scale: 0, default: 0 })
    price: number;

    /** Yearly price — usually discounted */
    @Column({ name: 'yearly_price', type: 'decimal', precision: 12, scale: 0, nullable: true })
    yearlyPrice: number;

    @Column({ name: 'max_users', type: 'int', default: 5 })
    maxUsers: number;

    @Column({ name: 'max_quotes_per_month', type: 'int', default: 500 })
    maxQuotesPerMonth: number;

    @Column({ name: 'max_storage_mb', type: 'int', default: 500 })
    maxStorageMb: number;

    /** JSON list of included features */
    @Column({ type: 'jsonb', nullable: true })
    features: string[];

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @Column({ name: 'sort_order', type: 'int', default: 0 })
    sortOrder: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
