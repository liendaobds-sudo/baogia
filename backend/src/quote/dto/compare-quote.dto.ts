import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { PricingConfigViewDto, SpecificationDto } from './calculate-quote.dto';

/**
 * DTO cho `POST /quote/compare` — so sánh giá đa Phương_Pháp_In + Điểm_Hoà_Vốn (Phase 4).
 *
 * Method-agnostic: caller cung cấp `productCode` (Hệ_Thống phân giải `quoteType` từ catalog
 * hợp nhất `unified_products`), **một** bộ Thông_Số dùng chung cho mọi phương pháp (Req 5.4),
 * danh sách phương pháp tuỳ chọn (`methods`; bỏ trống ⇒ xét toàn bộ Phương_Pháp_Khả_Dụng),
 * VAT cấp báo giá tuỳ chọn (`vat_rate`, phần trăm — Req 8), tham số giá ghi đè (`config` —
 * Req 7), và dải số lượng tuỳ chọn để dò Điểm_Hoà_Vốn (`quantities` hoặc `quantityRange`).
 *
 * ValidationPipe toàn cục dùng `whitelist + forbidNonWhitelisted`.
 *
 * _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 8.3_
 */

/** Dải số lượng để dò Điểm_Hoà_Vốn (Req 5.3). `step` mặc định suy ra để lấy ~20 mẫu. */
export class QuantityRangeDto {
    @IsInt()
    @Min(1)
    min: number;

    @IsInt()
    @Min(1)
    max: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    step?: number;
}

export class CompareQuoteDto {
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

    /** Một bộ Thông_Số dùng chung cho MỌI phương pháp khi so sánh (Req 5.4). */
    @ValidateNested()
    @Type(() => SpecificationDto)
    spec: SpecificationDto;

    /**
     * Danh sách Phương_Pháp_In ứng viên cần so sánh. Bỏ trống ⇒ xét toàn bộ
     * Phương_Pháp_Khả_Dụng của Đơn_Vị. Luôn được lọc lại theo Cờ_Năng_Lực (Req 4.7).
     */
    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    methods?: string[];

    /** VAT cấp báo giá (phần trăm; vd 8, 10) — một giá trị chung, áp một lần (Req 8.1, 8.3). */
    @IsOptional()
    @IsNumber()
    @Min(0)
    vat_rate?: number;

    /** Tham số giá đọc/ghi đè từ cấu hình (Req 7). VAT KHÔNG ở đây (Req 8). */
    @IsOptional()
    @ValidateNested()
    @Type(() => PricingConfigViewDto)
    config?: PricingConfigViewDto;

    /** Dải số lượng cụ thể để dò Điểm_Hoà_Vốn (ưu tiên hơn `quantityRange`). */
    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    @Min(1, { each: true })
    quantities?: number[];

    /** Dải số lượng [min, max] để dò Điểm_Hoà_Vốn. */
    @IsOptional()
    @ValidateNested()
    @Type(() => QuantityRangeDto)
    quantityRange?: QuantityRangeDto;
}
