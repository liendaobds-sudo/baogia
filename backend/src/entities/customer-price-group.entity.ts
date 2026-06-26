import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('customer_price_groups')
export class CustomerPriceGroup {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 20, unique: true })
    code: string; // 'WHOLESALE', 'VIP', 'PARTNER', 'RETAIL'

    @Column({ length: 100 })
    name: string; // 'Đại lý', 'VIP', 'Đối tác'

    @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, nullable: true, default: 0 })
    discountPercent: number; // Default discount %

    @Column({ name: 'min_order_value', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
    minOrderValue: number; // Minimum order value (VNĐ)

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'is_default', default: false })
    isDefault: boolean;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
