import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateMaterialCategoryDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() sort_order?: number;
  @IsOptional() @IsNumber() is_active?: number;
}

export class UpdateMaterialCategoryDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() sort_order?: number;
  @IsOptional() @IsNumber() is_active?: number;
}
