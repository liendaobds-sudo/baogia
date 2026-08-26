import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Quote } from './quote.entity';

/**
 * QuoteVersion entity — maps to `quote_versions` table in erp_print DB.
 * Stores snapshots of quote data for version history.
 */
@Entity('quote_versions')
export class QuoteVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'quote_id', type: 'int' })
  quoteId: number;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @Column({ name: 'quote_data', type: 'text' })
  quoteData: string; // JSON snapshot of the entire quote + items

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @Column({ type: 'text', nullable: true })
  note: string;

  @ManyToOne(() => Quote, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;
}
