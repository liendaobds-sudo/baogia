import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('production_cost_configs')
export class ProductionCostConfig {
    @PrimaryGeneratedColumn()
    id: number;

    // Machine costs
    @Column({ name: 'machine_value', type: 'float', default: 0 })
    machineValue: number; // Machine value (VNĐ)

    @Column({ name: 'machine_depreciation_years', type: 'int', default: 5 })
    machineDepreciationYears: number;

    @Column({ name: 'sheets_per_month', type: 'int', default: 100000 })
    sheetsPerMonth: number;

    @Column({ name: 'electricity_per_hour', type: 'float', default: 0 })
    electricityPerHour: number; // VNĐ

    @Column({ name: 'sheets_per_hour', type: 'int', default: 2000 })
    sheetsPerHour: number;

    // Labor costs
    @Column({ name: 'production_staff_count', type: 'int', default: 0 })
    productionStaffCount: number;

    @Column({ name: 'avg_salary_monthly', type: 'float', default: 0 })
    avgSalaryMonthly: number; // VNĐ

    // Overhead costs
    @Column({ name: 'rent_monthly', type: 'float', default: 0 })
    rentMonthly: number; // VNĐ

    @Column({ name: 'utilities_monthly', type: 'float', default: 0 })
    utilitiesMonthly: number; // VNĐ

    @Column({ name: 'other_monthly', type: 'float', default: 0 })
    otherMonthly: number; // VNĐ

    @Column({ name: 'default_markup_percent', type: 'float', default: 30 })
    defaultMarkupPercent: number;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
