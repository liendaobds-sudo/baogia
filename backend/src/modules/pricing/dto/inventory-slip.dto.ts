import { IsString, IsOptional, IsNumber, IsArray, IsIn, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InventorySlipItemDto {
  @Type(() => Number) @IsNumber() material_id: number;
  @Type(() => Number) @IsNumber() @Min(0) quantity: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unit_price?: number;
  @IsOptional() @IsString() notes?: string;

  // ── Nhập theo LÔ (2026-07-07) — optional, tương thích luồng cũ ──
  // purchase_unit + purchase_qty + purchase_price mô tả LÔ MUA; backend tự tính
  // conversion_factor (từ material) + unit_cost_base (giá lô ÷ factor). conversion_factor
  // từ FE chỉ để override khi mua theo ram (hệ số cố định người dùng gõ) — backend vẫn
  // tự tính lại cho kg/cuộn, không tin FE.
  @IsOptional() @IsString() purchase_unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) purchase_qty?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) purchase_price?: number; // giá / 1 ĐV mua
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) conversion_factor?: number; // override cho ram
}

export class CreateInventorySlipDto {
  @IsString() @IsIn(['import', 'export', 'adjust']) type: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventorySlipItemDto)
  items: InventorySlipItemDto[];
}
