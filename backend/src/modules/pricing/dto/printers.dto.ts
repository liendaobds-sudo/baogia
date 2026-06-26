import { IsOptional, IsString, IsNumber } from 'class-validator';

export class CreatePrinterDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsNumber() multiplier?: number;
  @IsOptional() @IsNumber() is_active?: number;
}

export class UpdatePrinterDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsNumber() multiplier?: number;
  @IsOptional() @IsNumber() is_active?: number;
}
