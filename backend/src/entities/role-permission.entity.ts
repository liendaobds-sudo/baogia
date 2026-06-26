import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { Role } from './role.entity';

@Entity('role_permissions')
export class RolePermission {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'role_id', type: 'int' })
    roleId: number;

    /** Permission key: quote.view, material.edit, settings.view, etc. */
    @Column({ type: 'varchar', length: 100 })
    permission: string;

    @ManyToOne(() => Role, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'role_id' })
    role: Role;
}
