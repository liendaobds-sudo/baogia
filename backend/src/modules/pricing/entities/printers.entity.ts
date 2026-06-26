import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('printers')
export class Printer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  code: string;

  @Column({ type: "varchar", length: 100 })
  name: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  resolution: string;

  @Column({ type: "decimal", precision: 4, scale: 2, default: 1 })
  multiplier: number;

  @Column({ type: 'smallint', default: 1 })
  is_active: number;

  @CreateDateColumn({  nullable: true })
  created_at: Date;

  @UpdateDateColumn({  nullable: true })
  updated_at: Date;
}
