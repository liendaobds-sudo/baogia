import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * SetupFee entity — maps to `setup_fees` table in erp_print DB.
 * Covers: CTP plates, die molds, machine setup, design fees, etc.
 */
@Entity('setup_fees')
export class SetupFee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // enum → varchar for SQLite cross-connection compatibility
  @Column({ name: 'fee_type', type: 'varchar', length: 20 })
  feeType: string;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'all' })
  category: string;

  @Column({ name: 'price_per_unit', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  pricePerUnit: number;

  @Column({ name: 'price_per_side', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  pricePerSide: number;

  @Column({ name: 'price_fixed', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  priceFixed: number;

  @Column({ name: 'paper_size_id', type: 'int', nullable: true })
  paperSizeId: number;

  @Column({ name: 'min_sheets', type: 'int', nullable: true, default: 0 })
  minSheets: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
