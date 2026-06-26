import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { MaterialType } from './material-type.entity';
import { PaperSize } from './paper-size.entity';
import { Unit } from './unit.entity';
import { PricingTier } from './pricing-tier.entity';

@Entity('materials')
export class Material {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50, unique: true })
    code: string;

    @Column({ length: 200 })
    name: string;

    @Column({ length: 50 })
    type: string; // paper, decal, ink, film, tarpaulin, canvas, lamination, finishing, accessory

    @Column({ length: 50, default: 'printing' })
    category: string; // 'printing' | 'finishing' | 'other'

    @Column({ name: 'category_tab', length: 50, nullable: true })
    categoryTab: string; // 'substrate_sheet', 'substrate_roll', 'ink', etc.

    // NOTE: DB has NO type_id FK — 'type' is a plain varchar
    // MaterialType relation is NOT in the DB schema

    // ── FK: Khổ giấy (like Kprint paper_size_id) ──
    @ManyToOne(() => PaperSize, { nullable: true })
    @JoinColumn({ name: 'paper_size_id' })
    paperSize: PaperSize;

    @Column({ name: 'paper_size_id', nullable: true })
    paperSizeId: number;

    // ── FK: Đơn vị (like Kprint unit_id) ──
    @ManyToOne(() => Unit, { nullable: true })
    @JoinColumn({ name: 'unit_id' })
    unitEntity: Unit;

    @Column({ name: 'unit_id', nullable: true })
    unitId: number;

    @Column({ length: 20, nullable: true })
    unit: string; // 'tờ', 'm²', 'kg', 'cái', 'cuốn', 'lượt'

    @Column({ type: 'int', nullable: true })
    gsm: number;

    @Column({ name: 'unit_price', type: 'float', default: 0 })
    unitPrice: number;

    @Column({ name: 'cost_price', type: 'float', default: 0 })
    costPrice: number;

    // DB column is literally 'pricePerSheet' (camelCase in DB)
    @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
    pricePerSheet: number;

    // DB column is literally 'setupFee' (camelCase in DB)
    @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
    setupFee: number;

    @Column({ name: 'material_format', length: 20, default: 'sheet' })
    materialFormat: string; // 'sheet' | 'roll'

    @Column({ name: 'price_unit', length: 20, default: 'sheet' })
    priceUnit: string; // 'sheet' | 'sqm'

    @Column({ name: 'scope_loose', default: true })
    scopeLoose: boolean;

    @Column({ name: 'scope_bound', default: false })
    scopeBound: boolean;

    @Column({ name: 'scope_large_format', default: false })
    scopeLargeFormat: boolean;

    // Vật tư dùng cho báo giá IN OFFSET (tách khỏi "in nhanh"/digital).
    @Column({ name: 'scope_offset', default: false })
    scopeOffset: boolean;

    @Column({ type: 'float', default: 100 })
    stock: number;

    @Column({ name: 'min_stock', type: 'float', default: 10 })
    minStock: number;

    @Column({ length: 20, default: 'normal' })
    status: string; // 'normal' | 'low' | 'out_of_stock'

    // ── Kích thước & Cuộn ──
    @Column({ type: 'float', nullable: true })
    width: number; // mm

    @Column({ type: 'float', nullable: true })
    height: number; // mm

    @Column({ name: 'roll_width', type: 'float', nullable: true })
    rollWidth: number; // m (khổ cuộn)

    @Column({ name: 'roll_length', type: 'float', nullable: true })
    rollLength: number; // m (chiều dài cuộn)

    @Column({ name: 'charge_full_width', default: false })
    chargeFullWidth: boolean; // Tính phí nguyên khổ cuộn

    @Column({ name: 'min_charge_area', type: 'float', nullable: true })
    minChargeArea: number; // m² tối thiểu tính phí

    @Column({ name: 'price_per_sqm', type: 'float', nullable: true })
    pricePerSqm: number; // Giá/m² (fallback cho large format khi không có tier)

    @Column({ name: 'waste_percent', type: 'float', nullable: true })
    wastePercent: number; // % hao hụt riêng vật tư

    @Column({ type: 'text', nullable: true })
    notes: string;

    // NOTE: DB has no 'is_active' column in materials table

    @OneToMany(() => PricingTier, (pt) => pt.material)
    pricingTiers: PricingTier[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
