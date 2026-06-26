import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('units')
export class Unit {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 20, unique: true })
    code: string; // 'sheet', 'sqm', 'kg', 'roll', 'piece'

    @Column({ length: 50 })
    name: string; // 'Tờ', 'Mét vuông', 'Kilogram'

    @Column({ length: 10 })
    symbol: string; // 'tờ', 'm²', 'kg'

    @Column({ length: 20, default: 'count' })
    type: string; // 'count' | 'area' | 'volume' | 'weight'

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
