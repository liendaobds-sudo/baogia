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
    // Tầng 3 khổ lớn: máy khổ lớn + tách 4 thành phần. price_per_sqm = tổng (giá vốn thuần/m²).
    @IsOptional() @IsNumber() printerId?: number;
    @IsOptional() @IsNumber() materialCost?: number;
    @IsOptional() @IsNumber() machineCost?: number;
    @IsOptional() @IsNumber() laborCost?: number;
    @IsOptional() @IsNumber() overheadCost?: number;
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
    @IsOptional() @IsNumber() printerId?: number;
    @IsOptional() @IsNumber() materialCost?: number;
    @IsOptional() @IsNumber() machineCost?: number;
    @IsOptional() @IsNumber() laborCost?: number;
    @IsOptional() @IsNumber() overheadCost?: number;
}
