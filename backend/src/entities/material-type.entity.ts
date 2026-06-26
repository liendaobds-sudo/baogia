import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    OneToMany,
} from 'typeorm';
import { Material } from './material.entity';

@Entity('material_types')
export class MaterialType {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 50, unique: true })
    code: string; // paper, decal, ink, film, tarpaulin, canvas, lamination, finishing, accessory

    @Column({ length: 100 })
    name: string;

    @Column({ name: 'tab_scope', length: 30, default: 'sheet' })
    tabScope: string; // 'sheet' | 'roll' | 'processing' | 'accessory'

    @Column({ name: 'sort_order', default: 0 })
    sortOrder: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    // NOTE: Removed — Material has no type_id FK in actual DB
    // @OneToMany(() => Material, (m) => m.materialType)
    // materials: Material[];

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
