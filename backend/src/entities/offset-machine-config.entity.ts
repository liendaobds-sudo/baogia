import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

/**
 * OffsetMachineConfig — Cấu hình máy in Offset
 * Mỗi dòng đại diện cho 1 máy in (VD: Komori 2 màu khổ 52×72)
 * Admin có thể CRUD tùy ý để khớp với xưởng thực tế.
 */
@Entity('offset_machine_config')
export class OffsetMachineConfig {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', length: 100 })
    name: string; // VD: 'Máy Komori 2M khổ 52×72'

    @Column({ type: 'varchar', length: 30, unique: true })
    code: string; // VD: 'komori_52x72'

    /** Khổ in tối đa — rộng (mm) */
    @Column({ name: 'max_width', type: 'decimal', precision: 10, scale: 2 })
    maxWidth: number;

    /** Khổ in tối đa — cao (mm) */
    @Column({ name: 'max_height', type: 'decimal', precision: 10, scale: 2 })
    maxHeight: number;

    /** Vùng kẹp nhíp (gripper margin) — thường 8–12mm */
    @Column({ name: 'gripper_margin', type: 'decimal', precision: 5, scale: 2, default: 10 })
    gripperMargin: number;

    /** Đơn giá công in mỗi 1.000 lượt (VND) */
    @Column({ name: 'run_price_per_1000', type: 'decimal', precision: 15, scale: 2, default: 0 })
    runPricePer1000: number;

    /** Tiền công in tối thiểu (VND) — không in ít hơn mức này */
    @Column({ name: 'min_run_charge', type: 'decimal', precision: 15, scale: 2, default: 0 })
    minRunCharge: number;

    /** Phí canh máy / setup (VND) — tính 1 lần mỗi lượt setup */
    @Column({ name: 'makeready_fee', type: 'decimal', precision: 15, scale: 2, default: 200000 })
    makereadyFee: number;

    /** Tốc độ in tối đa (tờ/giờ) — dùng cho ước lượng thời gian */
    @Column({ name: 'max_speed_sheets_per_hour', type: 'int', default: 8000 })
    maxSpeedSheetsPerHour: number;

    /** Số đơn vị in (số màu máy hỗ trợ: 1, 2, 4, 5, 6) */
    @Column({ name: 'color_units', type: 'int', default: 4 })
    colorUnits: number;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
