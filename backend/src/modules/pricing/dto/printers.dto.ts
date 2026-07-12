import { IsOptional, IsString, IsNumber } from 'class-validator';

// Hồ sơ chi phí per-máy (tầng 3) — máy + công + overhead để suy giá vốn định mức.
// Tên field khớp cột printers (camelCase entity ↔ snake_case DB qua @Column name).
export class CreatePrinterDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsNumber() multiplier?: number;
  @IsOptional() @IsNumber() is_active?: number;

  @IsOptional() @IsNumber() machineValue?: number;
  @IsOptional() @IsNumber() depreciationYears?: number;
  @IsOptional() @IsNumber() sheetsPerMonth?: number;
  @IsOptional() @IsNumber() electricityPerHour?: number;
  @IsOptional() @IsNumber() sheetsPerHour?: number;
  @IsOptional() @IsNumber() staffCount?: number;
  @IsOptional() @IsNumber() avgSalaryMonthly?: number;
  @IsOptional() @IsNumber() rentMonthly?: number;
  @IsOptional() @IsNumber() utilitiesMonthly?: number;
  @IsOptional() @IsNumber() otherMonthly?: number;
  // Khổ lớn (2026-07-09): đơn vị phân bổ 'sheet'|'sqm' + mẫu số m².
  @IsOptional() @IsString() costBasis?: string;
  @IsOptional() @IsNumber() sqmPerMonth?: number;
  @IsOptional() @IsNumber() sqmPerHour?: number;
}

export class UpdatePrinterDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsNumber() multiplier?: number;
  @IsOptional() @IsNumber() is_active?: number;

  @IsOptional() @IsNumber() machineValue?: number;
  @IsOptional() @IsNumber() depreciationYears?: number;
  @IsOptional() @IsNumber() sheetsPerMonth?: number;
  @IsOptional() @IsNumber() electricityPerHour?: number;
  @IsOptional() @IsNumber() sheetsPerHour?: number;
  @IsOptional() @IsNumber() staffCount?: number;
  @IsOptional() @IsNumber() avgSalaryMonthly?: number;
  @IsOptional() @IsNumber() rentMonthly?: number;
  @IsOptional() @IsNumber() utilitiesMonthly?: number;
  @IsOptional() @IsNumber() otherMonthly?: number;
  @IsOptional() @IsString() costBasis?: string;
  @IsOptional() @IsNumber() sqmPerMonth?: number;
  @IsOptional() @IsNumber() sqmPerHour?: number;
}
