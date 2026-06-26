import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

/**
 * WasteRule — Bảng bù hao bậc thang (customizable)
 * Thay thế % bù hao cứng trong config.
 * Admin có thể CRUD tùy ý để khớp với thực tế xưởng.
 *
 * Ví dụ bù hao Offset mặc định:
 *   SL < 1.000  → 10%
 *   SL 1.000–5.000 → 7%
 *   SL > 5.000  → 5%
 */
@Entity('waste_rules')
export class WasteRule {
    @PrimaryGeneratedColumn()
    id: number;

    /** Phương pháp in: 'offset' | 'digital' */
    @Column({ name: 'print_method', type: 'varchar', length: 20 })
    printMethod: string;

    /** Số lượng tối thiểu (bao gồm) */
    @Column({ name: 'quantity_from', type: 'int' })
    quantityFrom: number;

    /** Số lượng tối đa (bao gồm). NULL = không giới hạn */
    @Column({ name: 'quantity_to', type: 'int', nullable: true })
    quantityTo: number;

    /** Phần trăm bù hao */
    @Column({ name: 'waste_percent', type: 'decimal', precision: 5, scale: 2 })
    wastePercent: number;

    /** Mô tả (VD: "SL < 1.000: bù 10%") */
    @Column({ type: 'varchar', length: 200, nullable: true })
    description: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
