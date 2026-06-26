import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @IsString() name: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() @IsIn(['individual', 'company']) customer_type: string;
  @IsOptional() @IsString() phone: string;
  @IsOptional() @IsString() email: string;
  @IsOptional() @IsString() address: string;
  @IsOptional() @IsString() billing_address: string;
  @IsOptional() @IsString() contact_person: string;
  @IsOptional() @IsString() contact_phone: string;
  @IsOptional() @IsString() company: string;
  @IsOptional() @IsString() organization_name: string;
  @IsOptional() @IsString() representative: string;
  @IsOptional() @IsString() position: string;
  @IsOptional() @IsString() tax_code: string;
  @IsOptional() @IsString() bank_account: string;
  @IsOptional() @IsString() bank_name: string;
  @IsOptional() @IsString() notes: string;
  @IsOptional() @IsString() lifecycle_stage?: string;
  @IsOptional() @IsString() lost_reason?: string;
  @IsOptional() @IsString() follow_up_date?: string;
  @IsOptional() @IsString() product_interest?: string;
  @IsOptional() @IsString() source?: string;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() name: string;
  @IsOptional() @IsString() @IsIn(['individual', 'company']) customer_type?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() billing_address?: string;
  @IsOptional() @IsString() contact_person?: string;
  @IsOptional() @IsString() contact_phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() organization_name?: string;
  @IsOptional() @IsString() representative?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() tax_code?: string;
  @IsOptional() @IsString() bank_account?: string;
  @IsOptional() @IsString() bank_name?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() lifecycle_stage?: string;
  @IsOptional() @IsString() lost_reason?: string;
  @IsOptional() @IsString() follow_up_date?: string;
  @IsOptional() @IsString() product_interest?: string;
  @IsOptional() @IsString() source?: string;
}
