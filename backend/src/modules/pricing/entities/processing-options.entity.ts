import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ProcessingPricing } from '../../../entities/processing-pricing.entity';
@Entity('processing_options')
export class ProcessingOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  code: string;

  @Column({ type: "varchar", length: 200 })
  name: string;

  @Column({ type: "text", nullable: true })
  keywords: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  category: string;

  @Column({ type: 'varchar', enum: ["finishing","printing","binding","other"], nullable: true })
  type: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  priceType: string;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  price: number;

  @Column({ type: "int", nullable: true })
  material_id: number;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: 'smallint', default: 1 })
  is_active: number;

  @CreateDateColumn({  nullable: true })
  created_at: Date;

  @UpdateDateColumn({  nullable: true })
  updated_at: Date;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  width: number;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  height: number;

  @Column({ type: "int", nullable: true })
  quantity: number;

  @Column({ type: "int", nullable: true })
  paper_size_id: number;

  @Column({ type: "int", nullable: true })
  quantity_from: number;

  @Column({ type: "int", nullable: true })
  quantity_to: number;

  @Column({ type: "int", nullable: true })
  sides: number;

  @Column({ type: 'smallint', nullable: true })
  scope_loose: number;

  @Column({ type: 'smallint', nullable: true })
  scope_bound: number;

  @Column({ type: 'smallint', nullable: true })
  scope_large_format: number;

  // ── Offset: dùng chung bảng gia công với digital, tách bằng scope_offset + metadata tính giá offset ──
  @Column({ name: 'scope_offset', type: 'boolean', nullable: true, default: false })
  scope_offset: boolean;

  @Column({ type: 'varchar', length: 30, nullable: true })
  billing_mode: string; // 'minCharge' | 'perUnit' | 'external' (chỉ dùng cho gia công offset)

  @Column({ type: 'varchar', length: 60, nullable: true })
  moq_param: string;

  @Column({ type: 'varchar', length: 60, nullable: true })
  min_charge_param: string;

  @OneToMany(() => ProcessingPricing, (pp) => pp.processingOption)
  processingPricing: ProcessingPricing[];
}
