import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('audit_logs')
export class AuditLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, (u) => u.auditLogs, { nullable: true })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'user_id', nullable: true })
    userId: string;

    @Column({ length: 50 })
    action: string;

    @Column({ name: 'entity_type', length: 50 })
    entityType: string;

    @Column({ name: 'entity_id' })
    entityId: string;

    @Column({ name: 'old_value', type: 'simple-json', nullable: true })
    oldValue: any;

    @Column({ name: 'new_value', type: 'simple-json', nullable: true })
    newValue: any;

    @Column({ type: 'simple-json', default: '{}' })
    metadata: Record<string, any>;

    @Column({ name: 'ip_address', nullable: true })
    ipAddress: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
