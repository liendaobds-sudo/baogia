import { IsString, IsOptional, IsBoolean, MaxLength, MinLength } from 'class-validator';

/**
 * DTO tạo/sửa mẫu trả lời nhanh. Chỉ whitelist các field nghiệp vụ —
 * chặn client set field nhạy cảm (useCount, isGlobal, tenantId, createdById, id)
 * qua spread body. ValidationPipe toàn cục (whitelist + forbidNonWhitelisted)
 * dựa vào class metadata này để lọc.
 */
export class CreateCannedResponseDto {
    @IsString() @MinLength(1) @MaxLength(100)
    title: string;

    @IsString() @MinLength(1)
    content: string;

    @IsOptional() @IsString() @MaxLength(50)
    category?: string;

    @IsOptional() @IsString() @MaxLength(20)
    shortcut?: string;

    @IsOptional() @IsString()
    triggerKeywords?: string;

    @IsOptional() @IsBoolean()
    autoReply?: boolean;
}

export class UpdateCannedResponseDto {
    @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
    title?: string;

    @IsOptional() @IsString() @MinLength(1)
    content?: string;

    @IsOptional() @IsString() @MaxLength(50)
    category?: string;

    @IsOptional() @IsString() @MaxLength(20)
    shortcut?: string;

    @IsOptional() @IsString()
    triggerKeywords?: string;

    @IsOptional() @IsBoolean()
    autoReply?: boolean;
}
