import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
    Index,
} from 'typeorm';
import { Channel } from './channel.entity';
import { Contact } from './contact.entity';
import { User } from './user.entity';
import { Message } from './message.entity';
import { AiSuggestion } from './ai-suggestion.entity';

export enum ConversationStatus {
    NEW = 'new',
    IN_PROGRESS = 'in_progress',
    WAITING_CUSTOMER = 'waiting_customer',
    WAITING_FILE = 'waiting_file',
    QUOTED = 'quoted',
    WON = 'won',
    LOST = 'lost',
    CLOSED = 'closed',
}

export enum ConversationPriority {
    URGENT = 'urgent',
    HIGH = 'high',
    NORMAL = 'normal',
    LOW = 'low',
}

@Entity('conversations')
export class Conversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Channel, (ch) => ch.conversations)
    @JoinColumn({ name: 'channel_id' })
    channel: Channel;

    @Index()
    @Column({ name: 'channel_id' })
    channelId: string;

    // Cô lập theo tenant (org-scoped). NULL = dùng chung/hệ thống. Cột do migration Pha A thêm.
    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId: number | null;

    @ManyToOne(() => Contact, (ct) => ct.conversations)
    @JoinColumn({ name: 'contact_id' })
    contact: Contact;

    @Index()
    @Column({ name: 'contact_id' })
    contactId: string;

    @ManyToOne(() => User, (u) => u.assignedConversations, { nullable: true })
    @JoinColumn({ name: 'assignee_id' })
    assignee: User;

    @Index()
    @Column({ name: 'assignee_id', nullable: true })
    assigneeId: string;

    @Index()
    @Column({ type: 'varchar', default: ConversationStatus.NEW })
    status: ConversationStatus;

    @Index()
    @Column({ type: 'varchar', default: ConversationPriority.NORMAL })
    priority: ConversationPriority;

    @Column({ nullable: true })
    subject: string;

    @Column({ name: 'product_type', nullable: true, length: 50 })
    productType: string;

    @Index()
    @Column({ name: 'last_message_at', nullable: true })
    lastMessageAt: Date;

    @Column({ name: 'last_customer_message_at', nullable: true })
    lastCustomerMessageAt: Date;

    @Index()
    @Column({ name: 'sla_deadline', nullable: true })
    slaDeadline: Date;

    @Column({ name: 'sla_breached', default: false })
    slaBreached: boolean;

    @Column({ name: 'unread_count', default: 0 })
    unreadCount: number;

    @Column({ type: 'simple-json', default: '[]' })
    tags: string[]; // e.g. ['báo_giá', 'tư_vấn', 'khiếu_nại']

    @Column({ type: 'simple-json', default: '{}' })
    metadata: Record<string, any>;

    @Column({ name: 'is_pinned', type: 'boolean', default: false })
    isPinned: boolean;

    /** Persistent AI-generated summary of older messages in this conversation */
    @Column({ name: 'ai_summary', type: 'text', nullable: true })
    aiSummary: string;

    /** When the summary was last generated */
    @Column({ name: 'ai_summary_at', nullable: true })
    aiSummaryAt: Date;

    /** How many messages were included in the summary (so we know when to re-summarize) */
    @Column({ name: 'ai_summary_msg_count', type: 'int', default: 0 })
    aiSummaryMsgCount: number;

    /** Outcome tracking — captured when conversation transitions to won/lost/closed */
    @Column({ name: 'outcome_data', type: 'simple-json', default: '{}' })
    outcomeData: {
        totalMessages?: number;
        customerMessages?: number;
        agentMessages?: number;
        aiSuggestionsGenerated?: number;
        aiSuggestionsAccepted?: number;
        aiSuggestionsEdited?: number;
        aiSuggestionsRejected?: number;
        intentChain?: string[];        // sequence of detected intents
        quotedAmount?: number;         // final quoted amount if any
        firstResponseTimeMs?: number;  // time from first customer msg to first agent reply
        resolutionTimeMs?: number;     // total conversation duration
        productType?: string;          // detected product
        usedAutoReply?: boolean;       // whether auto-reply was used
    };

    @Column({ name: 'closed_at', nullable: true })
    closedAt: Date;

    @Column({ name: 'linked_order_id', nullable: true })
    linkedOrderId: string;

    @Index()
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => Message, (m) => m.conversation)
    messages: Message[];

    @OneToMany(() => AiSuggestion, (s) => s.conversation)
    suggestions: AiSuggestion[];
}
