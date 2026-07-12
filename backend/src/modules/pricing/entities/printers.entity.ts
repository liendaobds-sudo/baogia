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

  // ── Hồ sơ chi phí per-máy (2026-07-08, tầng 3) — thay production_costs singleton ──
  // Dùng để suy machine_cost + labor_cost + overhead_cost / tờ khi gợi ý giá định mức.
  // Máy: khấu hao (machine_value / depreciation_years / sheets_per_month) + điện.
  @Column({ name: 'machine_value', type: 'float', nullable: true })
  machineValue: number; // nguyên giá máy

  @Column({ name: 'depreciation_years', type: 'int', nullable: true })
  depreciationYears: number; // số năm khấu hao

  @Column({ name: 'sheets_per_month', type: 'int', nullable: true })
  sheetsPerMonth: number; // sản lượng tháng (mẫu số phân bổ khấu hao/công/overhead)

  @Column({ name: 'electricity_per_hour', type: 'float', nullable: true })
  electricityPerHour: number; // điện/giờ

  @Column({ name: 'sheets_per_hour', type: 'int', nullable: true })
  sheetsPerHour: number; // tốc độ (mẫu số phân bổ điện)

  @Column({ name: 'staff_count', type: 'int', nullable: true })
  staffCount: number; // số nhân công

  @Column({ name: 'avg_salary_monthly', type: 'float', nullable: true })
  avgSalaryMonthly: number; // lương bình quân/tháng

  @Column({ name: 'rent_monthly', type: 'float', nullable: true })
  rentMonthly: number; // thuê/tháng (overhead)

  @Column({ name: 'utilities_monthly', type: 'float', nullable: true })
  utilitiesMonthly: number; // tiện ích chung/tháng (overhead)

  @Column({ name: 'other_monthly', type: 'float', nullable: true })
  otherMonthly: number; // overhead khác/tháng

  // ── Khổ lớn (2026-07-09, tầng 4) — máy đo theo m² thay vì tờ ──
  // cost_basis phân biệt máy in nhanh ('sheet') vs máy khổ lớn ('sqm'). Với máy 'sqm',
  // khấu hao/công/overhead phân bổ theo sqm_per_month, điện theo sqm_per_hour.
  @Column({ name: 'cost_basis', length: 10, nullable: true })
  costBasis: string; // 'sheet' | 'sqm'

  @Column({ name: 'sqm_per_month', type: 'float', nullable: true })
  sqmPerMonth: number; // sản lượng tháng (m²) — mẫu số phân bổ cho máy khổ lớn

  @Column({ name: 'sqm_per_hour', type: 'float', nullable: true })
  sqmPerHour: number; // tốc độ (m²/giờ) — mẫu số phân bổ điện cho máy khổ lớn

  @CreateDateColumn({  nullable: true })
  created_at: Date;

  @UpdateDateColumn({  nullable: true })
  updated_at: Date;
}
