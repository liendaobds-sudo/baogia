import { IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

// Field theo TÊN PROPERTY của entity PrintType (camelCase) — TypeORM repo.create map đúng cột,
// và khớp payload camelCase từ frontend (ValidationPipe forbidNonWhitelisted).
export class CreatePrintTypeDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() shortName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class UpdatePrintTypeDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() shortName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsNumber() sortOrder?: number;
}
