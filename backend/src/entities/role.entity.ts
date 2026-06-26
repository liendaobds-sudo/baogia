import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('roles')
export class Role {
    @PrimaryGeneratedColumn()
    id: number;

    /** Role name: admin, supervisor, agent, viewer */
    @Column({ type: 'varchar', length: 50, unique: true })
    name: string;

    @Column({ name: 'display_name', type: 'varchar', length: 100 })
    displayName: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    /** Tenant-scoped: NULL = system role, number = tenant-specific role */
    @Column({ name: 'tenant_id', type: 'int', nullable: true })
    tenantId: number;

    @Column({ name: 'is_system', type: 'boolean', default: false })
    isSystem: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
