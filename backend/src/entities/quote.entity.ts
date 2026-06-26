import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { QuoteItem } from './quote-item.entity';

/**
 * Quote entity — maps to `quotes` table in erp_print DB.
 * 
 * DB column `code` (varchar 50, NOT NULL) is the quote number (e.g. Q-2026-00001).
 * DB does NOT have `quote_number`, `notes`, or `updated_at`.
 */
@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customer_id', type: 'int', nullable: true })
  customerId: number;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'quote_hash', type: 'varchar', length: 64, nullable: true })
  quoteHash: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'In nhanh' })
  type: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 100, nullable: true, default: 'Khách lẻ' })
  customerName: string;

  @Column({ name: 'customer_phone', type: 'varchar', length: 20, nullable: true })
  customerPhone: string;

  @Column({ name: 'customer_unit', type: 'varchar', length: 100, nullable: true })
  customerUnit: string;

  @Column({ name: 'tax_code', type: 'varchar', length: 20, nullable: true })
  taxCode: string;

  @Column({ name: 'customer_address', type: 'varchar', length: 255, nullable: true })
  customerAddress: string;

  @Column({ name: 'customer_note', type: 'text', nullable: true })
  customerNote: string;

  @Column({ name: 'material_id', type: 'int', nullable: true })
  materialId: number;

  @Column({ name: 'material_name', type: 'varchar', length: 100, nullable: true })
  materialName: string;

  @Column({ name: 'paper_size_id', type: 'int', nullable: true })
  paperSizeId: number;

  @Column({ name: 'paper_size_name', type: 'varchar', length: 100, nullable: true })
  paperSizeName: string;

  @Column({ type: 'int', nullable: true, default: 0 })
  quantity: number;

  @Column({ name: 'print_side', type: 'varchar', length: 20, nullable: true })
  printSide: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  total: number;

  @Column({ name: 'items_per_sheet', type: 'int', nullable: true, default: 0 })
  itemsPerSheet: number;

  @Column({ name: 'sheets_needed', type: 'int', nullable: true, default: 0 })
  sheetsNeeded: number;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'new' })
  status: string;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'manual' })
  source: string;

  @Column({ name: 'validity_days', type: 'int', nullable: true, default: 7 })
  validityDays: number;

  @Column({ name: 'discount_type', type: 'varchar', length: 10, nullable: true })
  discountType: string;

  @Column({ name: 'discount_value', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  discountValue: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  discountAmount: number;

  @Column({ name: 'vat_rate', type: 'decimal', precision: 5, scale: 2, nullable: true, default: 0 })
  vatRate: number;

  @Column({ name: 'vat_amount', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  vatAmount: number;

  @Column({ name: 'shipping_fee', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  shippingFee: number;

  @Column({ name: 'grand_total', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  grandTotal: number;

  @OneToMany(() => QuoteItem, item => item.quote, { cascade: true })
  items: QuoteItem[];
}
