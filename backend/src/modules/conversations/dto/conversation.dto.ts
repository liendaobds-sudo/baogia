import { IsString, IsOptional, IsBoolean, IsEnum, IsArray, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationStatus, ConversationPriority } from '../../../entities/conversation.entity';

export class UpdateStatusDto {
    @ApiProperty({ enum: ConversationStatus, description: 'Trạng thái mới của cuộc hội thoại' })
    @IsString()
    @IsEnum(ConversationStatus)
    status: string;
}

export class UpdatePriorityDto {
    @ApiProperty({ enum: ConversationPriority, description: 'Mức độ ưu tiên mới' })
    @IsString()
    @IsEnum(ConversationPriority)
    priority: string;
}

export class AssignConversationDto {
    @ApiProperty({ description: 'ID của nhân viên được giao việc', example: 'user-id-uuid' })
    @IsString()
    assigneeId: string;
}

export class AddTagDto {
    @ApiProperty({ description: 'Tên thẻ cần thêm (VD: VIP, quan_trong)', example: 'VIP' })
    @IsString()
    tag: string;
}

export class AddParticipantDto {
    @ApiProperty({ description: 'ID người tham gia' })
    @IsString()
    userId: string;

    @ApiPropertyOptional({ description: 'Vai trò trong hội thoại', example: 'observer' })
    @IsOptional()
    @IsString()
    role?: string;
}

export class ToggleAccessDto {
    @ApiProperty({ description: 'Quyền xem thông tin khách hàng', example: true })
    @IsBoolean()
    canViewCustomerInfo: boolean;
}

/**
 * Safe update DTO — only allows fields the client should modify.
 * Prevents mass assignment of sensitive fields like id, channelId, contactId, etc.
 */
export class UpdateConversationDto {
    @ApiPropertyOptional({ description: 'Tiêu đề cuộc hội thoại' })
    @IsOptional()
    @IsString()
    subject?: string;

    @ApiPropertyOptional({ description: 'Loại sản phẩm quan tâm' })
    @IsOptional()
    @IsString()
    productType?: string;

    @ApiPropertyOptional({ description: 'Trạng thái ghim hội thoại', example: true })
    @IsOptional()
    @IsBoolean()
    isPinned?: boolean;

    @ApiPropertyOptional({ description: 'Danh sách thẻ (tags)', type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @ApiPropertyOptional({ description: 'Số lượng tin nhắn chưa đọc' })
    @IsOptional()
    @IsNumber()
    unreadCount?: number;
}
