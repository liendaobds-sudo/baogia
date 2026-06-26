import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreateMaterialTypeDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() tab_scope?: string;
  @IsOptional() @IsNumber() is_active?: number;
  @IsOptional() @IsNumber() sort_order?: number;
}

export class UpdateMaterialTypeDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() tab_scope?: string;
  @IsOptional() @IsNumber() is_active?: number;
  @IsOptional() @IsNumber() sort_order?: number;
}
