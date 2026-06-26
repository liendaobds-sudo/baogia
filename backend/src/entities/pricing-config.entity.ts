import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    UpdateDateColumn,
} from 'typeorm';

/**
 * PricingConfig entity — maps to `pricing_config` table in erp_print DB.
 * Verified against live DB: config_value is varchar(255), NOT 500.
 */
@Entity('pricing_config')
export class PricingConfig {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'config_key', length: 50, unique: true })
    configKey: string;

    @Column({ name: 'config_value', length: 255 })
    configValue: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
