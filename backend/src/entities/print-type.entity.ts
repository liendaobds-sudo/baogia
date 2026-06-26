import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('print_types')
export class PrintType {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 20, unique: true })
    code: string; // '4c', '1c', 'bw', 'uv_spot', ...

    @Column({ length: 100 })
    name: string; // 'In 4 màu', 'In đen trắng'

    @Column({ name: 'short_name', length: 50, nullable: true })
    shortName: string; // '4 màu', 'ĐT'

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
