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

export enum SuggestionStatus {
    GENERATING = 'generating',
    GENERATED = 'generated',
    SENT = 'sent',
    EDITED = 'edited',
    REJECTED = 'rejected',
}

@Entity('ai_suggestions')
export class AiSuggestion {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Conversation, (c) => c.suggestions)
    @JoinColumn({ name: 'conversation_id' })
    conversation: Conversation;

    @Index()
    @Column({ name: 'conversation_id' })
    conversationId: string;

    // Cô lập theo tenant (org-scoped). NULL = hàng cũ trước Pha A. Cột do migration Pha A thêm;
    // ánh xạ để ai-learning lọc few-shot theo tenant ở tầng ứng dụng (lưới an toàn khi RLS chưa flip).
    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId: number | null;

    @Column({ name: 'trigger_message_id', nullable: true })
    triggerMessageId: string;

    @Column({ type: 'simple-json' })
    replies: { text: string; label?: string }[];

    @Column({ name: 'missing_info', type: 'simple-json', default: '[]' })
    missingInfo: { slot: string; question: string }[];

    @Column({ type: 'simple-json', default: '[]' })
    sources: {
        docId: string;
        chunkId: string;
        docName: string;
        heading: string;
        excerpt: string;
        score: number;
    }[];

    @Column({ type: 'real', nullable: true })
    confidence: number;

    @Column({ type: 'simple-json', default: '[]' })
    warnings: string[];

    @Column({ name: 'quote_result', type: 'simple-json', nullable: true })
    quoteResult: any;

    @Column({ nullable: true, length: 50 })
    intent: string;

    @Column({ name: 'prompt_version', length: 20, default: 'v1.0' })
    promptVersion: string;

    @Column({ length: 50, default: 'gpt-4o' })
    model: string;

    @Column({ name: 'latency_ms', nullable: true })
    latencyMs: number;

    @Column({ name: 'token_usage', type: 'simple-json', nullable: true })
    tokenUsage: { prompt_tokens: number; completion_tokens: number };

    @Column({ name: 'auto_reply_eligible', default: false })
    autoReplyEligible: boolean;

    // Agent learning: track edits
    @Column({ name: 'edited_text', type: 'text', nullable: true })
    editedText: string;

    @Column({ name: 'edited_at', nullable: true })
    editedAt: Date;

    @Column({ name: 'used_reply_index', nullable: true })
    usedReplyIndex: number;

    @Index()
    @Column({ type: 'varchar', default: SuggestionStatus.GENERATED })
    status: SuggestionStatus;

    @Column({ name: 'rejection_reason', nullable: true })
    rejectionReason: string;

    @Column({ name: 'agent_feedback', nullable: true })
    agentFeedback: string; // 'up' or 'down'

    @Index()
    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
