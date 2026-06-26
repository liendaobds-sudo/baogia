import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany,
} from 'typeorm';

export enum TenantStatus {
    TRIAL = 'trial',
    ACTIVE = 'active',
    SUSPENDED = 'suspended',
    CANCELLED = 'cancelled',
}

@Entity('tenants')
export class Tenant {
    @PrimaryGeneratedColumn()
    id: number;

    /** Unique slug — used for schema name: tenant_{code} */
    @Column({ type: 'varchar', length: 50, unique: true })
    code: string;

    @Column({ type: 'varchar', length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
    slug: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    email: string;

    @Column({ type: 'varchar', length: 20, nullable: true })
    phone: string;

    @Column({ type: 'text', nullable: true })
    address: string;

    @Column({ name: 'tax_code', type: 'varchar', length: 50, nullable: true })
    taxCode: string;

    @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
    logoUrl: string;

    @Column({ name: 'plan_id', type: 'int', nullable: true })
    planId: number;

    @Column({ type: 'varchar', length: 20, default: TenantStatus.TRIAL })
    status: TenantStatus;

    @Column({ name: 'schema_name', type: 'varchar', length: 100, nullable: true })
    schemaName: string;

    @Column({ name: 'subscription_ends_at', type: 'timestamp', nullable: true })
    subscriptionEndsAt: Date;

    @Column({ name: 'max_users', type: 'int', default: 5 })
    maxUsers: number;

    /** Tenant-specific settings (VAT, markup, etc.) */
    @Column({ type: 'jsonb', nullable: true })
    settings: Record<string, unknown>;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
