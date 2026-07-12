import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
} from 'typeorm';
import { Contact } from './contact.entity';
import { Conversation } from './conversation.entity';

export enum ChannelType {
    ZALO_OA = 'zalo_oa',
    FACEBOOK_PAGE = 'facebook_page',
    ZALO_PERSONAL = 'zalo_personal',
}

@Entity('channels')
export class Channel {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    type: ChannelType;

    @Column({ length: 100 })
    name: string;

    @Column({ name: 'external_id' })
    externalId: string;

    @Column({ name: 'access_token_enc', type: 'text', nullable: true })
    accessTokenEnc: string;

    @Column({ name: 'refresh_token_enc', type: 'text', nullable: true })
    refreshTokenEnc: string;

    @Column({ name: 'token_expires_at', nullable: true })
    tokenExpiresAt: Date;

    @Column({ name: 'webhook_secret', nullable: true })
    webhookSecret: string;

    // Cô lập theo tenant (org-scoped). NULL = dùng chung/hệ thống. Cột do migration Pha A thêm.
    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId: number | null;

    @Column({ type: 'simple-json', default: '{}' })
    config: Record<string, any>;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => Contact, (c) => c.channel)
    contacts: Contact[];

    @OneToMany(() => Conversation, (c) => c.channel)
    conversations: Conversation[];
}
