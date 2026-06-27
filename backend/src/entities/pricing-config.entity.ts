import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    UpdateDateColumn,
} from 'typeorm';

/**
 * PricingConfig entity — maps to `pricing_config` table in erp_print DB.
 * config_value là `text` để chứa cả giá trị ngắn (vat_rate…) lẫn JSON dài
 * (offset.ProductConfig / offset.WasteStages). Trước đây là varchar(255) → JSON bị tràn.
 */
@Entity('pricing_config')
export class PricingConfig {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'config_key', length: 50, unique: true })
    configKey: string;

    @Column({ name: 'config_value', type: 'text' })
    configValue: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
