import { IsString, IsOptional, IsArray } from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
    @ApiProperty({ description: 'Nội dung tin nhắn', example: 'Chào bạn, cho mình hỏi giá in name card.' })
    @IsString()
    text: string;

    @ApiPropertyOptional({ description: 'Loại nội dung phụ trợ', example: 'image/jpeg' })
    @IsOptional()
    @IsString()
    contentType?: string;

    @ApiPropertyOptional({ description: 'Danh sách đính kèm', type: [Object], example: [{ url: 'https://...', type: 'image' }] })
    @IsOptional()
    @IsArray()
    attachments?: any[];

    @ApiPropertyOptional({ description: 'Khóa chống lặp tin nhắn (idempotency key)', example: 'msg_client_req_1234' })
    @IsOptional()
    @IsString()
    idempotencyKey?: string;
}
