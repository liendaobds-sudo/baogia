import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { AuditLog } from './audit-log.entity';
import { Notification } from './notification.entity';

export enum UserRole {
    SUPER_ADMIN = 'super_admin',
    ADMIN = 'admin',
    SUPERVISOR = 'supervisor',
    AGENT = 'agent',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    email: string;

    @Column({ name: 'password_hash' })
    passwordHash: string;

    @Index()
    @Column({ name: 'full_name', length: 100 })
    fullName: string;

    @Index()
    @Column({ type: 'varchar', default: UserRole.AGENT })
    role: UserRole;

    /** Which tenant this user belongs to. NULL = super admin (cross-tenant) */
    @Index()
    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId: number;

    @Column({ name: 'avatar_url', nullable: true })
    avatarUrl: string;

    @Index()
    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'last_login_at', nullable: true })
    lastLoginAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @OneToMany(() => Conversation, (c) => c.assignee)
    assignedConversations: Conversation[];

    @OneToMany(() => AuditLog, (a) => a.user)
    auditLogs: AuditLog[];

    @OneToMany(() => Notification, (n) => n.user)
    notifications: Notification[];
}
