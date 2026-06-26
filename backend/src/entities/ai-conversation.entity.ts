import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_conversations')
export class AiConversation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'session_id', type: 'varchar', length: 100, unique: true })
  sessionId: string;

  @Column({ name: 'customer_id', type: 'int', nullable: true })
  customerId: number;

  @Column({ name: 'quote_id', type: 'int', nullable: true })
  quoteId: number;

  @Column({ type: 'varchar', length: 50, default: 'website' })
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
