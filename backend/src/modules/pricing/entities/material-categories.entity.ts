import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('material_categories')
export class MaterialCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  code: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  icon: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  color: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "int", default: 0 })
  sort_order: number;

  @Column({ type: 'smallint', default: 1 })
  is_active: number;

  @CreateDateColumn({  nullable: true })
  created_at: Date;

  @UpdateDateColumn({  nullable: true })
  updated_at: Date;
}
