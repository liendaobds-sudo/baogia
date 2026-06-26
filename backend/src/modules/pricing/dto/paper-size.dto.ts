import { IsOptional, IsString, IsNumber, IsBoolean, IsNotEmpty } from 'class-validator';

// Field theo TÊN PROPERTY của entity PaperSize (camelCase). Khớp payload frontend +
// TypeORM map đúng cột (widthMm→width, ...). Gồm cả field offset.
export class CreatePaperSizeDto {
  @IsNotEmpty() @IsString() code: string;
  @IsNotEmpty() @IsString() name: string;
  @IsNotEmpty() @IsNumber() widthMm: number;
  @IsNotEmpty() @IsNumber() heightMm: number;
  @IsOptional() @IsBoolean() isStandard?: boolean;
  @IsOptional() @IsNumber() marginTop?: number;
  @IsOptional() @IsNumber() marginBottom?: number;
  @IsOptional() @IsNumber() marginLeft?: number;
  @IsOptional() @IsNumber() marginRight?: number;
  @IsOptional() @IsNumber() rollLength?: number;
  @IsOptional() @IsBoolean() chargeFullWidth?: boolean;
  @IsOptional() @IsBoolean() scopeLoose?: boolean;
  @IsOptional() @IsBoolean() scopeBound?: boolean;
  @IsOptional() @IsBoolean() scopeLargeFormat?: boolean;
  @IsOptional() @IsBoolean() scopeOffset?: boolean;
  @IsOptional() @IsString() khoGiayLon?: string;
  @IsOptional() @IsString() chiaTo?: string;
  @IsOptional() @IsNumber() soConBaiIn?: number;
  @IsOptional() @IsNumber() soConToLon?: number;
  @IsOptional() @IsString() loaiKem?: string;
}

export class UpdatePaperSizeDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() widthMm?: number;
  @IsOptional() @IsNumber() heightMm?: number;
  @IsOptional() @IsBoolean() isStandard?: boolean;
  @IsOptional() @IsNumber() marginTop?: number;
  @IsOptional() @IsNumber() marginBottom?: number;
  @IsOptional() @IsNumber() marginLeft?: number;
  @IsOptional() @IsNumber() marginRight?: number;
  @IsOptional() @IsNumber() rollLength?: number;
  @IsOptional() @IsBoolean() chargeFullWidth?: boolean;
  @IsOptional() @IsBoolean() scopeLoose?: boolean;
  @IsOptional() @IsBoolean() scopeBound?: boolean;
  @IsOptional() @IsBoolean() scopeLargeFormat?: boolean;
  @IsOptional() @IsBoolean() scopeOffset?: boolean;
  @IsOptional() @IsString() khoGiayLon?: string;
  @IsOptional() @IsString() chiaTo?: string;
  @IsOptional() @IsNumber() soConBaiIn?: number;
  @IsOptional() @IsNumber() soConToLon?: number;
  @IsOptional() @IsString() loaiKem?: string;
}
