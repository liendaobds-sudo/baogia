import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
    Unique,
    Index,
} from 'typeorm';
import { Channel } from './channel.entity';
import { Conversation } from './conversation.entity';
import { Appointment } from './appointment.entity';

export enum PipelineStatus {
    NEW = 'new',
    CONTACTED = 'contacted',
    INTERESTED = 'interested',
    CONVERTED = 'converted',
    LOST = 'lost',
}

@Entity('contacts')
@Unique(['channel', 'externalUserId'])
export class Contact {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Channel, (ch) => ch.contacts)
    @JoinColumn({ name: 'channel_id' })
    channel: Channel;

    @Index()
    @Column({ name: 'channel_id' })
    channelId: string;

    // Cô lập theo tenant (org-scoped). NULL = dùng chung/hệ thống. Cột do migration Pha A thêm.
    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId: number | null;

    @Column({ name: 'external_user_id' })
    externalUserId: string;

    @Column({ name: 'display_name', nullable: true })
    displayName: string;

    @Column({ name: 'avatar_url', nullable: true })
    avatarUrl: string;

    @Index()
    @Column({ nullable: true, length: 20 })
    phone: string;

    @Index()
    @Column({ nullable: true })
    email: string;

    @Column({ type: 'simple-json', default: '[]' })
    tags: string[];

    /** AI-extracted facts about this customer (persistent across conversations) */
    @Column({ name: 'memory_facts', type: 'simple-json', default: '[]' })
    memoryFacts: { fact: string; source: string; at: string }[];

    /** Structured customer profile — AI-extracted, persistent across conversations */
    @Column({ name: 'customer_profile', type: 'simple-json', default: '{}' })
    customerProfile: {
        industry?: string;        // e.g. "thực phẩm", "mỹ phẩm", "bất động sản"
        budgetRange?: string;     // e.g. "2-5 triệu/đơn"
        preferredMaterials?: string[]; // e.g. ["couche 300gsm", "PVC chống nước"]
        orderFrequency?: string;  // e.g. "hàng tháng", "theo đợt"
        communicationStyle?: string; // e.g. "ngắn gọn", "hay hỏi kỹ", "quyết nhanh"
        commonProducts?: string[]; // e.g. ["namecard", "decal"]
        specialNeeds?: string[];   // e.g. ["cần VAT", "giao nội thành", "in gấp"]
    };

    @Column({ type: 'simple-json', default: '{}' })
    metadata: Record<string, any>;

    @Column({ name: 'first_contact_at', nullable: true })
    firstContactAt: Date;

    @Column({ name: 'last_contact_at', nullable: true })
    lastContactAt: Date;

    /** CRM Pipeline status — from ZaloCRM design */
    @Index()
    @Column({ name: 'pipeline_status', type: 'varchar', default: PipelineStatus.NEW })
    pipelineStatus: PipelineStatus;

    /** Lead source — FB, TT (TikTok), GT (referral), Web, OA, etc. */
    @Column({ nullable: true, length: 20 })
    source: string;

    @Column({ name: 'source_date', nullable: true })
    sourceDate: Date;

    /** Free-text notes about the contact */
    @Column({ type: 'text', nullable: true })
    notes: string;

    /** Next scheduled appointment date (denormalized for quick queries) */
    @Column({ name: 'next_appointment', nullable: true })
    nextAppointment: Date;

    /** User assigned to manage this contact (CRM owner) */
    @Column({ name: 'assigned_user_id', nullable: true })
    assignedUserId: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => Conversation, (c) => c.contact)
    conversations: Conversation[];

    @OneToMany(() => Appointment, (a) => a.contact)
    appointments: Appointment[];
}
