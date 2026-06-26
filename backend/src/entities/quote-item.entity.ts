import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Quote } from './quote.entity';

/**
 * QuoteItem entity — maps to `quote_items` table in erp_print DB.
 * 
 * DB does NOT have `unit_price`, `subtotal`, or `specifications` columns.
 * Spec data goes into `processing_details` (TEXT, JSON string).
 */
@Entity('quote_items')
export class QuoteItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'quote_id', type: 'int' })
  quoteId: number;

  @Column({ name: 'product_id', type: 'int', nullable: true })
  productId: number;

  @Column({ name: 'product_name', type: 'varchar', length: 255, nullable: true })
  productName: string;

  @Column({ name: 'product_type', type: 'varchar', length: 50, nullable: true })
  productType: string;

  @Column({ name: 'item_type', type: 'varchar', length: 20, nullable: true, default: 'loose' })
  itemType: string;

  @Column({ type: 'int', nullable: true, default: 0 })
  quantity: number;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'tờ' })
  unit: string;

  @Column({ name: 'item_width', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  itemWidth: number;

  @Column({ name: 'item_height', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  itemHeight: number;

  @Column({ name: 'material_id', type: 'int', nullable: true })
  materialId: number;

  @Column({ name: 'material_name', type: 'varchar', length: 100, nullable: true })
  materialName: string;

  @Column({ name: 'paper_size_id', type: 'int', nullable: true })
  paperSizeId: number;

  @Column({ name: 'paper_size_name', type: 'varchar', length: 100, nullable: true })
  paperSizeName: string;

  @Column({ name: 'print_side', type: 'varchar', length: 20, nullable: true })
  printSide: string;

  @Column({ name: 'print_type', type: 'varchar', length: 50, nullable: true })
  printType: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shape: string;

  @Column({ name: 'items_per_sheet', type: 'int', nullable: true, default: 0 })
  itemsPerSheet: number;

  @Column({ name: 'sheets_needed', type: 'int', nullable: true, default: 0 })
  sheetsNeeded: number;

  @Column({ name: 'processing_details', type: 'text', nullable: true })
  processingDetails: string;

  @Column({ name: 'item_total', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  itemTotal: number;

  // === Bound product fields ===
  @Column({ name: 'bound_size', type: 'varchar', length: 50, nullable: true })
  boundSize: string;

  @Column({ name: 'page_count', type: 'int', nullable: true, default: 0 })
  pageCount: number;

  @Column({ name: 'binding_type', type: 'varchar', length: 50, nullable: true })
  bindingType: string;

  @Column({ name: 'cover_material_id', type: 'int', nullable: true })
  coverMaterialId: number;

  @Column({ name: 'inner_material_id', type: 'int', nullable: true })
  innerMaterialId: number;

  @Column({ name: 'cover_material_name', type: 'varchar', length: 255, nullable: true })
  coverMaterialName: string;

  @Column({ name: 'inner_material_name', type: 'varchar', length: 255, nullable: true })
  innerMaterialName: string;

  @Column({ name: 'cover_print', type: 'varchar', length: 50, nullable: true })
  coverPrint: string;

  @Column({ name: 'inner_print', type: 'varchar', length: 50, nullable: true })
  innerPrint: string;

  @Column({ name: 'cover_finishing', type: 'text', nullable: true })
  coverFinishing: string;

  @Column({ name: 'cover_sheets_needed', type: 'int', nullable: true, default: 0 })
  coverSheetsNeeded: number;

  @Column({ name: 'inner_sheets_needed', type: 'int', nullable: true, default: 0 })
  innerSheetsNeeded: number;

  @Column({ name: 'extra_services', type: 'text', nullable: true })
  extraServices: string;

  @Column({ name: 'printing_detail', type: 'text', nullable: true })
  printingDetail: string;

  @Column({ name: 'parent_id', type: 'int', nullable: true })
  parentId: number;

  @ManyToOne(() => Quote, quote => quote.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;
}
