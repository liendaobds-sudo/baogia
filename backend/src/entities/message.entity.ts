import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum SenderType {
    CUSTOMER = 'customer',
    AGENT = 'agent',
    SYSTEM = 'system',
}

export enum ContentType {
    TEXT = 'text',
    IMAGE = 'image',
    FILE = 'file',
    STICKER = 'sticker',
    LOCATION = 'location',
    QUOTE_CARD = 'quote_card',
}

export enum MessageStatus {
    RECEIVED = 'received',
    SENDING = 'sending',
    SENT = 'sent',
    FAILED = 'failed',
    DELIVERED = 'delivered',
    READ = 'read',
    RECALLED = 'recalled',
}

export enum SuggestionAction {
    SENT_AS_IS = 'sent_as_is',
    EDITED = 'edited',
    MANUAL = 'manual',
}

@Entity('messages')
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Conversation, (c) => c.messages)
    @JoinColumn({ name: 'conversation_id' })
    conversation: Conversation;

    @Index()
    @Column({ name: 'conversation_id' })
    conversationId: string;

    @Column({ name: 'sender_type', type: 'varchar' })
    senderType: SenderType;

    @Column({ name: 'sender_id', nullable: true })
    senderId: string;

    @Column({ name: 'sender_name', nullable: true })
    senderName: string;

    @Column({ name: 'sender_avatar_url', nullable: true })
    senderAvatarUrl: string;

    @Column({ type: 'text', nullable: true })
    content: string;

    @Column({ name: 'content_type', type: 'varchar', default: ContentType.TEXT })
    contentType: ContentType;

    @Column({ type: 'simple-json', default: '[]' })
    attachments: any[];

    @Column({ type: 'simple-json', default: '{}' })
    reactions: Record<string, number>;

    @Column({ name: 'external_msg_id', nullable: true, unique: true })
    externalMsgId: string;

    @Column({ name: 'external_cli_msg_id', nullable: true })
    externalCliMsgId: string;

    @Column({ name: 'idempotency_key', nullable: true, unique: true })
    idempotencyKey: string;

    @Column({ type: 'varchar', default: MessageStatus.RECEIVED })
    status: MessageStatus;

    @Column({ name: 'suggestion_id', nullable: true })
    suggestionId: string;

    @Column({ name: 'suggestion_action', type: 'varchar', nullable: true })
    suggestionAction: SuggestionAction;

    @Column({ name: 'error_detail', nullable: true })
    errorDetail: string;

    @Column({ name: 'quote_id', nullable: true })
    quoteId: string;

    @Column({ name: 'quote_data', type: 'simple-json', nullable: true })
    quoteData: any;

    @Column({ name: 'is_pinned', type: 'boolean', default: false })
    isPinned: boolean;

    @Column({ name: 'is_starred', type: 'boolean', default: false })
    isStarred: boolean;

    @Column({ name: 'is_local_deleted', type: 'boolean', default: false })
    isLocalDeleted: boolean;

    @Column({ name: 'is_media_backed_up', type: 'boolean', default: false })
    isMediaBackedUp: boolean;

    @Index()
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
