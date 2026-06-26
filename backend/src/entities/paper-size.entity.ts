import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';
import { PricingTier } from './pricing-tier.entity';

@Entity('paper_sizes')
export class PaperSize {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50, unique: true })
    code: string;

    @Column({ length: 100 })
    name: string;

    // DB column is 'width' (decimal 10,2) — NOT 'width_mm'
    @Column({ name: 'width', type: 'decimal', precision: 10, scale: 2 })
    widthMm: number;

    // DB column is 'height' (decimal 10,2) — NOT 'height_mm'
    @Column({ name: 'height', type: 'decimal', precision: 10, scale: 2 })
    heightMm: number;

    @Column({ name: 'is_standard', default: false })
    isStandard: boolean;

    // Margins (int in DB)
    @Column({ name: 'margin_top', type: 'int', nullable: true, default: 0 })
    marginTop: number;

    @Column({ name: 'margin_bottom', type: 'int', nullable: true, default: 0 })
    marginBottom: number;

    @Column({ name: 'margin_left', type: 'int', nullable: true, default: 0 })
    marginLeft: number;

    @Column({ name: 'margin_right', type: 'int', nullable: true, default: 0 })
    marginRight: number;

    @Column({ name: 'roll_length', type: 'decimal', precision: 10, scale: 2, nullable: true })
    rollLength: number;

    @Column({ name: 'charge_full_width', default: true })
    chargeFullWidth: boolean;

    @Column({ name: 'scope_loose', default: true })
    scopeLoose: boolean;

    @Column({ name: 'scope_bound', default: true })
    scopeBound: boolean;

    @Column({ name: 'scope_large_format', default: false })
    scopeLargeFormat: boolean;

    @Column({ name: 'scope_offset', default: false })
    scopeOffset: boolean;

    // --- Offset Specific Fields ---
    @Column({ name: 'kho_giay_lon', length: 50, nullable: true })
    khoGiayLon: string;

    @Column({ name: 'chia_to', length: 50, nullable: true })
    chiaTo: string;

    @Column({ name: 'so_con_bai_in', type: 'int', nullable: true })
    soConBaiIn: number;

    @Column({ name: 'so_con_to_lon', type: 'int', nullable: true })
    soConToLon: number;

    @Column({ name: 'loai_kem', length: 50, nullable: true })
    loaiKem: string;

    @OneToMany(() => PricingTier, (pt) => pt.paperSize)
    pricingTiers: PricingTier[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
