import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Customer entity — maps to `customers` table in erp_print DB.
 * Verified against live DB schema: 34 columns.
 */
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'supabase_uid', type: 'varchar', length: 255, nullable: true, unique: true })
  supabaseUid: string;

  // Unique THEO TENANT (index composite `uq_customers_tenant_code` ở DB), không còn unique toàn cục.
  @Column({ type: 'varchar', length: 20, nullable: true })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'customer_type', type: 'varchar', length: 20, default: 'individual' })
  customerType: string;

  // Unique THEO TENANT (index composite `uq_customers_tenant_phone` ở DB), không còn unique toàn cục.
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ name: 'billing_address', type: 'text', nullable: true })
  billingAddress: string;

  @Column({ name: 'contact_person', type: 'varchar', length: 255, nullable: true })
  contactPerson: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20, nullable: true })
  contactPhone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company: string;

  @Column({ name: 'organization_name', type: 'varchar', length: 255, nullable: true })
  organizationName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  representative: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  position: string;

  @Column({ name: 'tax_code', type: 'varchar', length: 50, nullable: true })
  taxCode: string;

  @Column({ name: 'bank_account', type: 'varchar', length: 50, nullable: true })
  bankAccount: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  creditLimit: number;

  @Column({ name: 'current_debt', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  currentDebt: number;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'web' })
  source: string;

  @Column({ name: 'lifecycle_stage', type: 'varchar', length: 20, default: 'lead' })
  lifecycleStage: string;

  @Column({ name: 'lost_reason', type: 'varchar', length: 100, nullable: true })
  lostReason: string;

  @Column({ name: 'follow_up_date', type: 'date', nullable: true })
  followUpDate: Date;

  @Column({ name: 'product_interest', type: 'text', nullable: true })
  productInterest: string;

  @Column({ type: 'text', nullable: true })
  preferences: string;

  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ name: 'rfm_r', type: 'int', nullable: true, default: 0 })
  rfmR: number;

  @Column({ name: 'rfm_f', type: 'int', nullable: true, default: 0 })
  rfmF: number;

  @Column({ name: 'rfm_m', type: 'int', nullable: true, default: 0 })
  rfmM: number;

  @Column({ name: 'rfm_score', type: 'int', nullable: true, default: 0 })
  rfmScore: number;

  @Column({ name: 'rfm_segment', type: 'varchar', length: 50, nullable: true })
  rfmSegment: string;

  @Column({ name: 'rfm_calculated_at', type: 'timestamp', nullable: true })
  rfmCalculatedAt: Date;

  @Column({ name: 'last_order_at', type: 'timestamp', nullable: true })
  lastOrderAt: Date;

  @Column({ name: 'price_group_id', type: 'int', nullable: true })
  priceGroupId: number;

  // Cô lập theo tenant (org-scoped). NULL = dùng chung/hệ thống. Cột do migration Pha A thêm.
  @Column({ name: 'tenant_id', type: 'int', nullable: true })
  tenantId: number | null;
}
