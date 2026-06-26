import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum FollowUpStatus {
    PENDING = 'pending',
    SENT = 'sent',
    CANCELLED = 'cancelled',
    COMPLETED = 'completed',
    REJECTED = 'rejected',
}

@Entity('follow_ups')
export class FollowUp {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Conversation)
    @JoinColumn({ name: 'conversation_id' })
    conversation: Conversation;

    @Column({ name: 'conversation_id' })
    conversationId: string;

    @Column({ type: 'text' })
    message: string;

    @Column({ type: 'varchar', default: FollowUpStatus.PENDING })
    status: FollowUpStatus;

    @Column({ default: 1 })
    attempt: number; // 1st, 2nd, 3rd follow-up

    @Column({ name: 'scheduled_at' })
    scheduledAt: Date;

    @Column({ name: 'sent_at', nullable: true })
    sentAt: Date;

    @Column({ nullable: true, length: 50 })
    context: string; // 'waiting_info' | 'quote_sent' | 'general'

    @Column({ name: 'rejection_reason', type: 'text', nullable: true })
    rejectionReason: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
