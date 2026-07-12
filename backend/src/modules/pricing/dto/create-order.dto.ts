import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QuoteItemDto {
  @IsOptional() @IsString() item_type?: string;
  @IsOptional() @IsString() product_name?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() material_id?: number;
  @IsOptional() @IsString() material_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() paper_size_id?: number;
  @IsOptional() @IsString() paper_size_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsString() print_side?: string;
  @IsOptional() @IsString() print_type?: string;
  @IsOptional() @IsString() shape?: string;
  @IsOptional() @Type(() => Number) @IsNumber() items_per_sheet?: number;
  @IsOptional() @Type(() => Number) @IsNumber() sheets_needed?: number;
  @IsOptional() processing_details?: Record<string, unknown>[];
  @IsOptional() printing_detail?: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsNumber() item_total?: number;
  @IsOptional() @IsString() product_type?: string;
  @IsOptional() @IsString() bound_size?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page_count?: number;
  @IsOptional() @IsString() binding_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() cover_material_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() inner_material_id?: number;
  @IsOptional() @IsString() cover_print?: string;
  @IsOptional() @IsString() inner_print?: string;
  @IsOptional() cover_finishing?: Record<string, unknown>[];
  @IsOptional() extra_services?: Record<string, unknown>[];
  @IsOptional() @Type(() => Number) @IsNumber() parent_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() parent_temp_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() item_width?: number;
  @IsOptional() @Type(() => Number) @IsNumber() item_height?: number;
  @IsOptional() @Type(() => Number) @IsNumber() cover_sheets_needed?: number;
  @IsOptional() @Type(() => Number) @IsNumber() inner_sheets_needed?: number;
  @IsOptional() cover_processing?: Record<string, unknown>[];
  @IsOptional() inner_processing?: Record<string, unknown>[];
  @IsOptional() @IsString() cover_print_side?: string;
  @IsOptional() @IsString() cover_print_type?: string;
  @IsOptional() @IsString() cover_paper_size_name?: string;
  @IsOptional() @IsString() cover_material_name?: string;
  @IsOptional() @IsString() inner_print_side?: string;
  @IsOptional() @IsString() inner_print_type?: string;
  @IsOptional() @IsString() inner_paper_size_name?: string;
  @IsOptional() @IsString() inner_material_name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() cover_print_cost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() cover_print_unit_price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() inner_print_cost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() inner_print_unit_price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() product_id?: number;
  @IsOptional() @Type(() => Number) @IsNumber() charge_area?: number;
  @IsOptional() @Type(() => Number) @IsNumber() inventory_area?: number;
  @IsOptional() @Type(() => Number) @IsNumber() waste_percent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() roll_width?: number;
  @IsOptional() @Type(() => Number) @IsNumber() charge_full_width?: number;
  @IsOptional() @Type(() => Number) @IsNumber() price_per_sqm?: number;
}

export class CreateQuoteDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() customer_id?: number;
  @IsOptional() @IsString() customer_code?: string;
  @IsOptional() @IsString() customer_type?: string;
  @IsOptional() @IsString() customer_name?: string;
  @IsOptional() @IsString() customer_phone?: string;
  @IsOptional() @IsString() customer_unit?: string;
  @IsOptional() @IsString() tax_code?: string;
  @IsOptional() @IsString() customer_address?: string;
  @IsOptional() @IsString() customer_note?: string;
  @IsOptional() @IsString() customer_email?: string;
  @IsOptional() @IsString() customer_contact?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) total?: number;
  @IsOptional() @IsString() discount_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() discount_value?: number;
  @IsOptional() @Type(() => Number) @IsNumber() discount_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() vat_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() vat_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() shipping_fee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() grand_total?: number;
  @IsOptional() @IsString() delivery_time?: string;
  @IsOptional() @Type(() => Number) @IsNumber() validity_days?: number;
  @IsOptional() @IsString() valid_until?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];
}

export class UpdateQuoteDto {
  @IsOptional() @IsString() customer_name?: string;
  @IsOptional() @IsString() customer_phone?: string;
  @IsOptional() @IsString() customer_unit?: string;
  @IsOptional() @IsString() tax_code?: string;
  @IsOptional() @IsString() customer_address?: string;
  @IsOptional() @IsString() customer_note?: string;
  @IsOptional() @IsString() customer_email?: string;
  @IsOptional() @IsString() customer_contact?: string;
  @IsOptional() @Type(() => Number) @IsNumber() total?: number;
  @IsOptional() @IsString() delivery_time?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() discount_type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() discount_value?: number;
  @IsOptional() @Type(() => Number) @IsNumber() discount_amount?: number;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @Type(() => Number) @IsNumber() vat_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() vat_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() shipping_fee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() grand_total?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  items?: QuoteItemDto[];
}
