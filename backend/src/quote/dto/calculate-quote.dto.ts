import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * DTO cho `POST /quote/calculate` — định tuyến tính giá 1 Phương_Pháp_In qua MethodRegistry.
 *
 * Method-agnostic: caller cung cấp `productCode` (Hệ_Thống tự phân giải `quoteType` từ
 * catalog hợp nhất `unified_products` — một nguồn sự thật), `methodId`, và `spec` (Thông_Số
 * dùng chung). Tham số giá tuỳ chọn (`config`) cho phép ghi đè chiết khấu/markup (Req 7.2).
 *
 * ValidationPipe toàn cục dùng `whitelist + forbidNonWhitelisted`; các trường tự do
 * (`spec.attributes`) khai báo `@IsObject` không lồng nên giữ nguyên key tuỳ phương pháp.
 *
 * _Requirements: 4.6, 6.1, 7.2_
 */

/** Kích thước method-agnostic (cm) — rộng×cao×hông (hông cho hộp/túi). */
export class DimensionsDto {
    @IsOptional()
    @IsNumber()
    width?: number;

    @IsOptional()
    @IsNumber()
    height?: number;

    @IsOptional()
    @IsNumber()
    depth?: number;
}

/** Một lựa chọn gia công dùng chung. */
export class ProcessingItemDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsOptional()
    @IsString()
    side?: string;
}

/** Một phụ kiện dùng chung. */
export class AccessoryItemDto {
    @IsInt()
    id: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    qty?: number;
}

/** Thông_Số dùng chung — không phụ thuộc phương pháp (Req 3.2). */
export class SpecificationDto {
    @IsNumber()
    @Min(1)
    quantity: number;

    @IsOptional()
    @ValidateNested()
    @Type(() => DimensionsDto)
    dimensions?: DimensionsDto;

    @IsOptional()
    @IsString()
    materialCode?: string;

    @IsOptional()
    @IsString()
    paperSizeCode?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProcessingItemDto)
    processing?: ProcessingItemDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AccessoryItemDto)
    accessories?: AccessoryItemDto[];

    /** Tham số riêng theo phương pháp (vd soKemIn, boxType) — giữ nguyên key tuỳ ý. */
    @IsOptional()
    @IsObject()
    attributes?: Record<string, unknown>;
}

/** Tham số giá đọc/ghi đè từ cấu hình (Req 7). VAT KHÔNG ở đây (Req 8). */
export class PricingConfigViewDto {
    @IsOptional()
    @IsNumber()
    discountRate?: number;

    @IsOptional()
    @IsNumber()
    markupPercent?: number;
}

export class CalculateQuoteDto {
    /** Phương_Pháp_In cần định tuyến (digital | offset | ...). */
    @IsString()
    @IsNotEmpty()
    methodId: string;

    /** Mã sản phẩm trong catalog hợp nhất (UnifiedProduct.code). */
    @IsString()
    @IsNotEmpty()
    productCode: string;

    /** Đơn_Vị áp dụng; bỏ trống ⇒ 'default'. */
    @IsOptional()
    @IsString()
    unitId?: string;

    /** Ghi đè `quoteType` (hiếm dùng); mặc định lấy từ catalog. */
    @IsOptional()
    @IsString()
    quoteType?: string;

    @ValidateNested()
    @Type(() => SpecificationDto)
    spec: SpecificationDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => PricingConfigViewDto)
    config?: PricingConfigViewDto;
}
