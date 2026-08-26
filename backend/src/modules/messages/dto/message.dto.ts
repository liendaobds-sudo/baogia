import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    ValidateNested,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageAttachmentDto {
    @ApiProperty({ description: 'URL/path do endpoint chat-media trả về' })
    @IsString()
    @MinLength(1)
    @MaxLength(2048)
    url: string;

    @ApiPropertyOptional({ enum: ['image', 'file'] })
    @IsOptional()
    @IsIn(['image', 'file'])
    type?: 'image' | 'file';

    @ApiPropertyOptional({ description: 'Tên hiển thị phía client' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;
}

export class SendMessageDto {
    @ApiProperty({ description: 'Nội dung tin nhắn', example: 'Chào bạn, cho mình hỏi giá in name card.' })
    @IsString()
    @MaxLength(10000)
    text: string;

    @ApiPropertyOptional({ description: 'Loại nội dung phụ trợ', enum: ['text', 'image', 'file'] })
    @IsOptional()
    @IsIn(['text', 'image', 'file'])
    contentType?: 'text' | 'image' | 'file';

    @ApiPropertyOptional({ description: 'Tối đa một tệp đã upload nội bộ', type: [SendMessageAttachmentDto] })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(1)
    @ValidateNested({ each: true })
    @Type(() => SendMessageAttachmentDto)
    attachments?: SendMessageAttachmentDto[];

    @ApiPropertyOptional({ description: 'Khóa chống lặp tin nhắn (idempotency key)', example: 'msg_client_req_1234' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    idempotencyKey?: string;

    @ApiPropertyOptional({ description: 'ID tin nhắn được trả lời' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    replyToId?: string;
}
