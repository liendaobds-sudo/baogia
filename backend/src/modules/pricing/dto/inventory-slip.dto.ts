import { IsString, IsOptional, IsNumber, IsArray, IsIn, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InventorySlipItemDto {
  @Type(() => Number) @IsNumber() material_id: number;
  @Type(() => Number) @IsNumber() @Min(0) quantity: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unit_price?: number;
  @IsOptional() @IsString() notes?: string;
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
