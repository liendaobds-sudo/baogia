import { IsString, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaterialDto {
  @ApiPropertyOptional({ example: 'MAT-001', description: 'Mã vật tư (tự sinh nếu bỏ trống)' })
  @IsOptional() @IsString() code?: string;

  @ApiProperty({ example: 'Giấy Couché 200gsm', description: 'Tên vật tư' })
  @IsString() name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() display_name?: string;

  @ApiPropertyOptional({ enum: ['paper', 'decal', 'lamination', 'film', 'ink', 'accessory', 'finishing', 'other'], default: 'other' })
  @IsOptional() @IsString() @IsIn(['paper', 'decal', 'lamination', 'film', 'ink', 'accessory', 'finishing', 'other']) type?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() category_tab?: string;
  @ApiPropertyOptional({ default: 'printing' }) @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ description: 'ID khổ giấy chuẩn' }) @IsOptional() @Type(() => Number) @IsNumber() paper_size_id?: number;
  @ApiPropertyOptional({ enum: ['parent', 'child'], description: "Vai trò khổ giấy offset: 'parent' = khổ nhập (có giá) | 'child' = khổ xả (giá dẫn xuất)" }) @IsOptional() @IsString() @IsIn(['parent', 'child']) sheet_role?: string;
  @ApiPropertyOptional({ description: 'ID vật tư khổ NHẬP nguồn (chỉ khổ xả) — self-FK để dẫn giá' }) @IsOptional() @Type(() => Number) @IsNumber() parent_material_id?: number;
  @ApiPropertyOptional({ description: 'Khổ xả tick trong màn vật tư cha (chỉ khi tạo/sửa khổ nhập). Mỗi phần tử {width,height} mm → sinh 1 vật tư con (mã tự sinh từ mã cha + khổ).', type: 'array' }) @IsOptional() child_sheets?: { width: number; height: number; name?: string }[];
  @ApiPropertyOptional({ description: 'ID đơn vị tính' }) @IsOptional() @Type(() => Number) @IsNumber() unit_id?: number;
  @ApiPropertyOptional({ default: 'tờ' }) @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional({ example: 210, description: 'Rộng (mm)' }) @IsOptional() @Type(() => Number) @IsNumber() width?: number;
  @ApiPropertyOptional({ example: 297, description: 'Cao (mm)' }) @IsOptional() @Type(() => Number) @IsNumber() height?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() size_spec?: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unit_price?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() pricePerSheet?: number;
  @ApiPropertyOptional({ minimum: 0, description: 'Phí lên máy' }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) setupFee: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stock: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stock_quantity: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) min_stock: number;
  @ApiPropertyOptional({ default: 'normal' }) @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ description: 'Dùng cho SP rời (0/1)' }) @IsOptional() @Type(() => Number) @IsNumber() scope_loose?: number;
  @ApiPropertyOptional({ description: 'Dùng cho SP cuốn (0/1)' }) @IsOptional() @Type(() => Number) @IsNumber() scope_bound?: number;
  @ApiPropertyOptional({ description: 'Dùng cho khổ lớn (0/1)' }) @IsOptional() @Type(() => Number) @IsNumber() scope_large_format?: number;
  @ApiPropertyOptional({ description: 'Khổ cuộn (m)' }) @IsOptional() @Type(() => Number) @IsNumber() roll_width?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() charge_full_width?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() price_per_sqm?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() min_charge_area?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() roll_length?: number;
  @ApiPropertyOptional({ enum: ['sheet', 'roll'] }) @IsOptional() @IsString() stock_unit_type?: string;
  @ApiPropertyOptional({ example: 200 }) @IsOptional() @Type(() => Number) @IsNumber() gsm?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ description: '% hao hụt' }) @IsOptional() @Type(() => Number) @IsNumber() waste_percent?: number;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @Type(() => Number) @IsNumber() @Min(0) cost_price?: number;
  @ApiPropertyOptional({ enum: ['sheet', 'roll'], default: 'sheet' }) @IsOptional() @IsString() @IsIn(['sheet', 'roll']) material_format: string;
  @ApiPropertyOptional() @IsOptional() @IsString() price_unit: string;
}

export class UpdateMaterialDto {
  @ApiPropertyOptional() @IsOptional() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() display_name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category_tab: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() paper_size_id: number;
  @ApiPropertyOptional({ enum: ['parent', 'child'], description: "Vai trò khổ giấy offset: 'parent' (khổ nhập, có giá) | 'child' (khổ xả, dẫn giá từ cha)" }) @IsOptional() @IsString() @IsIn(['parent', 'child']) sheet_role?: string;
  @ApiPropertyOptional({ description: 'ID vật tư khổ NHẬP nguồn (chỉ khổ xả) — self-FK về materials.id' }) @IsOptional() @Type(() => Number) @IsNumber() parent_material_id?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() unit_id: number;
  @ApiPropertyOptional() @IsOptional() @IsString() unit: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() width: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() height: number;
  @ApiPropertyOptional() @IsOptional() @IsString() size_spec: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unit_price: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() pricePerSheet: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) setupFee: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() stock: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() stock_quantity: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) min_stock: number;
  @ApiPropertyOptional() @IsOptional() @IsString() status: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() scope_loose: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() scope_bound: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() scope_large_format: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() roll_width: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() charge_full_width: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() price_per_sqm: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() min_charge_area: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() roll_length: number;
  @ApiPropertyOptional() @IsOptional() @IsString() stock_unit_type: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() gsm: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() waste_percent: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() cost_price: number;
  @ApiPropertyOptional({ description: 'Giá nhập gần nhất' }) @IsOptional() @Type(() => Number) @IsNumber() last_import_price?: number;
  @ApiPropertyOptional({ description: 'Điều chỉnh tồn kho (delta)' }) @IsOptional() @Type(() => Number) @IsNumber() stock_adjustment?: number;
}
