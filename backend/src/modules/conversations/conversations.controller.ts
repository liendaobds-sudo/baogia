import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConversationsService } from './conversations.service';
import { FollowUpService } from './follow-up.service';
import {
    UpdateStatusDto, UpdatePriorityDto, AssignConversationDto,
    AddTagDto, AddParticipantDto, ToggleAccessDto, UpdateConversationDto,
} from './dto/conversation.dto';
import { FollowUpStatus } from '../../entities/follow-up.entity';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('Conversations (Hội thoại)')
@ApiBearerAuth()
@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
export class ConversationsController {
    constructor(
        private convService: ConversationsService,
        private followUpService: FollowUpService,
    ) { }

    @ApiOperation({ summary: 'Lấy danh sách các cuộc hội thoại' })
    @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái (NEW, OPEN, SNOOZED, CLOSED)' })
    @ApiQuery({ name: 'assigneeId', required: false, description: 'Lọc theo nhân viên được giao' })
    @ApiQuery({ name: 'priority', required: false, description: 'Lọc theo độ ưu tiên (LOW, MEDIUM, HIGH, URGENT)' })
    @ApiQuery({ name: 'tag', required: false, description: 'Lọc theo thẻ (tag)' })
    @ApiQuery({ name: 'page', required: false, type: Number, description: 'Trang hiện tại (mặc định 1)' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số lượng trả về (mặc định 20)' })
    @ApiResponse({ status: 200, description: 'Lấy thành công' })
    @Get()
    findAll(
        @Query('status') status?: string,
        @Query('assigneeId') assigneeId?: string,
        @Query('priority') priority?: string,
        @Query('tag') tag?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.convService.findAll({ status, assigneeId, priority, tag, page: +(page || 1), limit: +(limit || 20) });
    }

    @ApiOperation({ summary: 'Lấy danh sách tất cả các tag đang có' })
    @ApiResponse({ status: 200, description: 'Thành công' })
    @Get('tags')
    getAllTags() {
        return this.convService.getAllTags();
    }

    @ApiOperation({ summary: 'Đánh dấu tất cả hội thoại là đã đọc' })
    @ApiResponse({ status: 200, description: 'Thành công' })
    @Post('mark-all-read')
    markAllRead() {
        return this.convService.markAllRead();
    }

    @ApiOperation({ summary: 'Lấy chi tiết một cuộc hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiResponse({ status: 200, description: 'Thông tin chi tiết hội thoại' })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.convService.findOne(id);
    }

    @ApiOperation({ summary: 'Giao việc xử lý cuộc hội thoại cho nhân viên' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiBody({ type: AssignConversationDto })
    @Patch(':id/assign')
    assign(@Param('id') id: string, @Body() dto: AssignConversationDto) {
        return this.convService.assign(id, dto.assigneeId);
    }

    @ApiOperation({ summary: 'Cập nhật trạng thái cuộc hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiBody({ type: UpdateStatusDto })
    @Patch(':id/status')
    updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
        return this.convService.updateStatus(id, dto.status);
    }

    @ApiOperation({ summary: 'Cập nhật mức độ ưu tiên' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiBody({ type: UpdatePriorityDto })
    @Patch(':id/priority')
    updatePriority(@Param('id') id: string, @Body() dto: UpdatePriorityDto) {
        return this.convService.updatePriority(id, dto.priority);
    }

    // ═══ Tag Management ═══

    @ApiOperation({ summary: 'Thêm thẻ (tag) vào cuộc hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiBody({ type: AddTagDto })
    @Post(':id/tags')
    addTag(@Param('id') id: string, @Body() dto: AddTagDto) {
        return this.convService.addTag(id, dto.tag);
    }

    @ApiOperation({ summary: 'Xóa thẻ (tag) khỏi cuộc hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiParam({ name: 'tag', description: 'Tên thẻ cần xóa' })
    @Delete(':id/tags/:tag')
    removeTag(@Param('id') id: string, @Param('tag') tag: string) {
        return this.convService.removeTag(id, tag);
    }

    // ═══ Participant Management ═══

    @ApiOperation({ summary: 'Lấy danh sách người tham gia (participants) của cuộc hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @Get(':id/participants')
    getParticipants(@Param('id') id: string) {
        return this.convService.getParticipants(id);
    }

    @ApiOperation({ summary: 'Thêm người tham gia vào cuộc hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiBody({ type: AddParticipantDto })
    @Post(':id/participants')
    addParticipant(
        @Param('id') id: string,
        @Body() dto: AddParticipantDto,
        @Req() req: any,
    ) {
        const role = (dto.role as any) || 'collaborator';
        return this.convService.addParticipant(id, dto.userId, role, req.user.id);
    }

    @ApiOperation({ summary: 'Xóa người tham gia khỏi cuộc hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiParam({ name: 'userId', description: 'ID người tham gia' })
    @Delete(':id/participants/:userId')
    removeParticipant(@Param('id') id: string, @Param('userId') userId: string) {
        return this.convService.removeParticipant(id, userId);
    }

    @ApiOperation({ summary: 'Cấp/thu hồi quyền xem thông tin khách hàng' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiParam({ name: 'userId', description: 'ID người tham gia' })
    @ApiBody({ type: ToggleAccessDto })
    @Patch(':id/participants/:userId/access')
    toggleAccess(
        @Param('id') id: string,
        @Param('userId') userId: string,
        @Body() dto: ToggleAccessDto,
    ) {
        return this.convService.toggleCustomerInfoAccess(id, userId, dto.canViewCustomerInfo);
    }

    @ApiOperation({ summary: 'Cập nhật thông tin cuộc hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @ApiBody({ type: UpdateConversationDto })
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
        return this.convService.update(id, dto);
    }

    // ═══ Follow-up Management ═══

    @ApiOperation({ summary: 'Lấy trạng thái tin nhắn tự động hỏi thăm (follow-up) của hội thoại' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @Get(':id/follow-ups')
    getFollowUps(@Param('id') id: string) {
        return this.followUpService.getStatus(id);
    }

    @ApiOperation({ summary: 'Cập nhật trạng thái Task (COMPLETED / REJECTED) do AI giao' })
    @ApiParam({ name: 'followUpId', description: 'ID của AI task' })
    @ApiBody({ schema: { properties: { status: { type: 'string' }, rejectionReason: { type: 'string' } } } })
    @Patch('follow-ups/:followUpId/status')
    updateFollowUpStatus(@Param('followUpId') followUpId: string, @Body() body: { status: FollowUpStatus, rejectionReason?: string }) {
        return this.followUpService.updateStatus(followUpId, body.status, body.rejectionReason);
    }

    @ApiOperation({ summary: 'Hủy kế hoạch tự động hỏi thăm (follow-up) của hội thoại' })
    @ApiParam({ name: 'followUpId', description: 'ID của follow-up plan' })
    @Patch('follow-ups/:followUpId/cancel')
    cancelFollowUp(@Param('followUpId') followUpId: string) {
        return this.followUpService.cancelById(followUpId);
    }

    @ApiOperation({ summary: 'Xóa hội thoại (vĩnh viễn)' })
    @ApiParam({ name: 'id', description: 'ID hội thoại' })
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.convService.remove(id);
    }
}
