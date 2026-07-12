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
    // Tách chi phí (tầng 2): giá bán/tờ = paperCost + inkCost. Gửi 2 field này → backend tự tính pricePerSheet.
    @IsOptional() @IsNumber() paperCost?: number;
    @IsOptional() @IsNumber() inkCost?: number;
    // Tầng 3: máy + công + overhead per-máy. price_per_sheet = tổng 5 thành phần (giá vốn thuần).
    @IsOptional() @IsNumber() printerId?: number;
    @IsOptional() @IsNumber() machineCost?: number;
    @IsOptional() @IsNumber() laborCost?: number;
    @IsOptional() @IsNumber() overheadCost?: number;
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
    @IsOptional() @IsNumber() paperCost?: number;
    @IsOptional() @IsNumber() inkCost?: number;
    @IsOptional() @IsNumber() printerId?: number;
    @IsOptional() @IsNumber() machineCost?: number;
    @IsOptional() @IsNumber() laborCost?: number;
    @IsOptional() @IsNumber() overheadCost?: number;
}
