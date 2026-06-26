import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('unified_product_categories')
export class UnifiedProductCategory {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50, unique: true })
    code: string;

    @Column({ name: 'name_vi', length: 100 })
    nameVi: string;

    @Column({ name: 'name_en', length: 100, nullable: true })
    nameEn: string;

    @Column({ length: 50, nullable: true })
    icon: string;

    @Column({ name: 'parent_id', nullable: true })
    parentId: number;

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
