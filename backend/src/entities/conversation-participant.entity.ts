import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
    Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from './user.entity';

export enum ParticipantRole {
    OWNER = 'owner',           // Nhân viên nội bộ quản lý đơn
    COLLABORATOR = 'collaborator', // Freelancer / cộng tác viên
}

@Entity('conversation_participants')
@Unique(['conversationId', 'userId'])
export class ConversationParticipant {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'conversation_id' })
    conversation: Conversation;

    @Index()
    @Column({ name: 'conversation_id' })
    conversationId: string;

    @ManyToOne(() => User, { eager: true })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Index()
    @Column({ name: 'user_id' })
    userId: string;

    @Column({ type: 'varchar', default: ParticipantRole.COLLABORATOR })
    role: ParticipantRole;

    @Column({ name: 'can_view_customer_info', default: false })
    canViewCustomerInfo: boolean;

    @Column({ name: 'added_by', nullable: true })
    addedBy: string;

    @CreateDateColumn({ name: 'added_at' })
    addedAt: Date;
}
