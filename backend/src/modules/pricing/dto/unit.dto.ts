import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateUnitDto {
  @IsNotEmpty() @IsString() code: string;
  @IsNotEmpty() @IsString() name: string;
  @IsNotEmpty() @IsString() symbol: string;
  @IsOptional() @IsString() type?: string;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() symbol?: string;
  @IsOptional() @IsString() type?: string;
}
