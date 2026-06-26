import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';

export class CreateLargeFormatPricingDto {
    @IsOptional() @IsNumber() materialId?: number;
    @IsOptional() @IsString() materialCode?: string;
    @IsOptional() @IsString() materialName?: string;
    @IsOptional() @IsNumber() areaFrom?: number;
    @IsOptional() @IsNumber() areaTo?: number;
    @IsOptional() @IsNumber() pricePerSqm?: number;
    @IsOptional() @IsNumber() minCharge?: number;
    @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLargeFormatPricingDto {
    @IsOptional() @IsNumber() materialId?: number;
    @IsOptional() @IsString() materialCode?: string;
    @IsOptional() @IsString() materialName?: string;
    @IsOptional() @IsNumber() areaFrom?: number;
    @IsOptional() @IsNumber() areaTo?: number;
    @IsOptional() @IsNumber() pricePerSqm?: number;
    @IsOptional() @IsNumber() minCharge?: number;
    @IsOptional() @IsBoolean() isActive?: boolean;
}
