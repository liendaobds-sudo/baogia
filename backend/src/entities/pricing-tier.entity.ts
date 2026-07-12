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
    pricePerSheet: number; // = paperCost + inkCost (giữ để engine đọc giá không đổi)

    // ── Tách chi phí (2026-07-07, tầng 2) — giá vốn giấy dẫn từ materials.cost_price ──
    @Column({ name: 'paper_cost', type: 'float', nullable: true })
    paperCost: number; // chi phí giấy/tờ (dẫn xuất từ cost_price)

    @Column({ name: 'ink_cost', type: 'float', nullable: true })
    inkCost: number; // chi phí mực/tờ (nhập tay)

    @Column({ name: 'cost_synced_at', type: 'timestamp', nullable: true })
    costSyncedAt: Date; // mốc đồng bộ cuối với cost_price (để phát hiện lệch)

    // ── Chi phí per-máy (2026-07-08, tầng 3) — máy/công/overhead suy từ hồ sơ chi phí printer ──
    // price_per_sheet = paper + ink + machine + labor + overhead (giá vốn THUẦN; markup facade lo).
    @Column({ name: 'printer_id', type: 'int', nullable: true })
    printerId: number; // máy in dùng suy chi phí máy/công/overhead (null = tier cũ, chưa gắn máy)

    @Column({ name: 'machine_cost', type: 'float', nullable: true })
    machineCost: number; // chi phí máy/tờ (khấu hao + điện, phân bổ theo sản lượng)

    @Column({ name: 'labor_cost', type: 'float', nullable: true })
    laborCost: number; // chi phí nhân công/tờ (lương phân bổ theo sản lượng)

    @Column({ name: 'overhead_cost', type: 'float', nullable: true })
    overheadCost: number; // chi phí overhead/tờ (thuê + tiện ích + khác, phân bổ)

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
