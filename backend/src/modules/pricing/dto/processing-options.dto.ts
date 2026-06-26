import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';

export class CreateProcessingOptionDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() keywords?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() priceType?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsNumber() material_id?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() is_active?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsNumber() paper_size_id?: number;
  @IsOptional() @IsNumber() quantity_from?: number;
  @IsOptional() @IsNumber() quantity_to?: number;
  @IsOptional() @IsNumber() sides?: number;
  @IsOptional() @IsNumber() scope_loose?: number;
  @IsOptional() @IsNumber() scope_bound?: number;
  @IsOptional() @IsNumber() scope_large_format?: number;
  // ── Metadata OFFSET (A5): cho phép cấu hình gia công offset từ màn Gia Công ──
  @IsOptional() @IsBoolean() scope_offset?: boolean;
  @IsOptional() @IsString() billing_mode?: string;   // 'perUnit' | 'minCharge' | 'external'
  @IsOptional() @IsString() moq_param?: string;       // vd 'MOQ_GiaCong'
  @IsOptional() @IsString() min_charge_param?: string; // vd 'GiaMin_Be'
}

export class UpdateProcessingOptionDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() keywords?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() priceType?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsNumber() material_id?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() is_active?: number;
  @IsOptional() @IsNumber() width?: number;
  @IsOptional() @IsNumber() height?: number;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsNumber() paper_size_id?: number;
  @IsOptional() @IsNumber() quantity_from?: number;
  @IsOptional() @IsNumber() quantity_to?: number;
  @IsOptional() @IsNumber() sides?: number;
  @IsOptional() @IsNumber() scope_loose?: number;
  @IsOptional() @IsNumber() scope_bound?: number;
  @IsOptional() @IsNumber() scope_large_format?: number;
  // ── Metadata OFFSET (A5) ──
  @IsOptional() @IsBoolean() scope_offset?: boolean;
  @IsOptional() @IsString() billing_mode?: string;
  @IsOptional() @IsString() moq_param?: string;
  @IsOptional() @IsString() min_charge_param?: string;
}
