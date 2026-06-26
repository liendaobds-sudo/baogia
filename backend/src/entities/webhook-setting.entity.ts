import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('webhook_settings')
export class WebhookSetting {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /** Descriptive label like "Inventory system" or "CRM sync" */
    @Column({ length: 100 })
    name: string;

    /** Target URL to POST events to */
    @Column({ name: 'webhook_url' })
    webhookUrl: string;

    /** HMAC-SHA256 secret for signing payloads */
    @Column({ name: 'webhook_secret', nullable: true })
    webhookSecret: string;

    /** JSON array of event types to subscribe to, e.g. ["message.received", "contact.created"] */
    @Column({ type: 'simple-json', default: '["*"]' })
    events: string[];

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    /** Track delivery failures for circuit breaking */
    @Column({ name: 'consecutive_failures', default: 0 })
    consecutiveFailures: number;

    @Column({ name: 'last_failure_at', nullable: true })
    lastFailureAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
