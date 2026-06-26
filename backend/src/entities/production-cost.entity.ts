import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * ProductionCost entity — maps to `production_costs` table in erp_print DB.
 * Factory cost parameters: machine depreciation, staff, rent, utilities.
 */
@Entity('production_costs')
export class ProductionCost {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'machine_name', type: 'varchar', length: 100, nullable: true, default: 'Máy in chính' })
  machineName: string;

  @Column({ name: 'machine_value', type: 'decimal', precision: 15, scale: 2, nullable: true, default: 0 })
  machineValue: number;

  @Column({ name: 'machine_depreciation_years', type: 'int', nullable: true, default: 5 })
  machineDepreciationYears: number;

  @Column({ name: 'sheets_per_month', type: 'int', nullable: true, default: 50000 })
  sheetsPerMonth: number;

  @Column({ name: 'electricity_per_hour', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 50000 })
  electricityPerHour: number;

  @Column({ name: 'sheets_per_hour', type: 'int', nullable: true, default: 1000 })
  sheetsPerHour: number;

  @Column({ name: 'production_staff_count', type: 'int', nullable: true, default: 3 })
  productionStaffCount: number;

  @Column({ name: 'avg_salary_monthly', type: 'decimal', precision: 12, scale: 2, nullable: true, default: 12000000 })
  avgSalaryMonthly: number;

  @Column({ name: 'rent_monthly', type: 'decimal', precision: 12, scale: 2, nullable: true, default: 20000000 })
  rentMonthly: number;

  @Column({ name: 'utilities_monthly', type: 'decimal', precision: 12, scale: 2, nullable: true, default: 5000000 })
  utilitiesMonthly: number;

  @Column({ name: 'other_monthly', type: 'decimal', precision: 12, scale: 2, nullable: true, default: 5000000 })
  otherMonthly: number;

  @Column({ name: 'default_markup_percent', type: 'decimal', precision: 5, scale: 2, nullable: true, default: 30 })
  defaultMarkupPercent: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
