import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from './user.entity';

@Entity('internal_notes')
export class InternalNote {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Conversation)
    @JoinColumn({ name: 'conversation_id' })
    conversation: Conversation;

    @Column({ name: 'conversation_id' })
    conversationId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'author_id' })
    author: User;

    @Column({ name: 'author_id' })
    authorId: string;

    @Column({ type: 'text' })
    content: string;

    @Column({ default: false, name: 'is_pinned' })
    isPinned: boolean;

    @Column({ type: 'varchar', length: 20, default: 'conversation' })
    scope: 'conversation' | 'customer' | 'global';

    @Column({ name: 'contact_id', type: 'uuid', nullable: true })
    contactId?: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
