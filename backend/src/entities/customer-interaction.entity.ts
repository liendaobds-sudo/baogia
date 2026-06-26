import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * CustomerInteraction — tracks sales interactions, needs, and follow-ups.
 * Used for Sales Pipeline tracking: why a prospect didn't close, what they need, when to follow up.
 */
@Entity('customer_interactions')
export class CustomerInteraction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ type: 'varchar', length: 30, default: 'note' })
  type: string; // 'note' | 'follow_up' | 'lost_reason' | 'quote_created' | 'quote_completed' | 'stage_change'

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ name: 'lost_reason', type: 'varchar', length: 100, nullable: true })
  lostReason: string;

  @Column({ name: 'product_interest', type: 'text', nullable: true })
  productInterest: string;

  @Column({ name: 'follow_up_date', type: 'date', nullable: true })
  followUpDate: Date;

  @Column({ name: 'quote_id', type: 'int', nullable: true })
  quoteId: number;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
