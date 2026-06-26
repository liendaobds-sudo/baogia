import { IsString, IsUrl, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class CreateWebhookDto {
    @IsString()
    name: string;

    @IsUrl()
    webhookUrl: string;

    @IsOptional()
    @IsString()
    webhookSecret?: string;

    @IsOptional()
    @IsArray()
    events?: string[];
}

export class UpdateWebhookDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsUrl()
    webhookUrl?: string;

    @IsOptional()
    @IsString()
    webhookSecret?: string;

    @IsOptional()
    @IsArray()
    events?: string[];

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
