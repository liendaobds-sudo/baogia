import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';

export class CreatePricingTierDto {
    @IsOptional() @IsNumber() materialId?: number;
    @IsOptional() @IsNumber() paperSizeId?: number;
    @IsOptional() @IsString() technology?: string;
    @IsOptional() @IsString() printSide?: string;
    @IsOptional() @IsString() printType?: string;
    @IsOptional() @IsNumber() quantityFrom?: number;
    @IsOptional() @IsNumber() quantityTo?: number;
    @IsOptional() @IsNumber() pricePerSheet?: number;
}

export class UpdatePricingTierDto {
    @IsOptional() @IsNumber() materialId?: number;
    @IsOptional() @IsNumber() paperSizeId?: number;
    @IsOptional() @IsString() technology?: string;
    @IsOptional() @IsString() printSide?: string;
    @IsOptional() @IsString() printType?: string;
    @IsOptional() @IsNumber() quantityFrom?: number;
    @IsOptional() @IsNumber() quantityTo?: number;
    @IsOptional() @IsNumber() pricePerSheet?: number;
}
