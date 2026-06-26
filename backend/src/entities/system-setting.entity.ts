import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({ name: 'setting_key', type: 'varchar', length: 50 })
  key: string;

  @Column({ name: 'setting_value', type: 'text', nullable: true })
  value: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
