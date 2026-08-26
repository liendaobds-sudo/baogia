import { Controller, Post, Get, Delete, Param, Query, Body, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { MessagesService } from './messages.service';
import { MessageProcessorService } from './message-processor.service';
import { SendMessageDto } from './dto/message.dto';

@Controller('conversations')
@UseGuards(AuthGuard('jwt'), CskhScopeGuard)
export class MessagesController {
    constructor(
        private messagesService: MessagesService,
        private messageProcessor: MessageProcessorService,
    ) { }

    @Get(':conversationId/messages')
    getMessages(
        @Param('conversationId') conversationId: string,
        @Query('before') before?: string,
        @Query('limit') limit?: number,
    ) {
        return this.messagesService.findByConversation(conversationId, before, +(limit || 50));
    }

    @Post(':conversationId/send')
    async sendMessage(
        @Param('conversationId') conversationId: string,
        @Body() body: SendMessageDto,
        @Req() req: any,
    ) {
        const userId = req.user?.sub || req.user?.id;
        const tenantId = this.resolveRequestTenantId(req);
        const message = await this.messageProcessor.processOutbound(
            conversationId,
            {
                text: body.text,
                attachmentUrl: body.attachments?.[0]?.url,
                attachmentType: body.contentType || body.attachments?.[0]?.type,
                replyToId: body.replyToId,
            },
            userId,
            body.idempotencyKey,
            tenantId,
        );

        return {
            id: message.id,
            content: message.content,
            contentType: message.contentType,
            attachments: message.attachments,
            status: message.status,
            createdAt: message.createdAt,
            quoteId: message.quoteId,
        };
    }

    /** Đồng bộ quy tắc impersonation hiện có của TenantContextInterceptor. */
    private resolveRequestTenantId(req: any): number {
        let rawTenantId = req.user?.tenantId;

        if (req.user?.role === 'super_admin' && rawTenantId != null) {
            const header = req.headers?.['x-tenant-id'];
            const rawHeader = Array.isArray(header) ? header[0] : header;
            if (rawHeader != null && String(rawHeader).trim() !== '') rawTenantId = rawHeader;
        }

        const tenantId = Number(rawTenantId);
        if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
            throw new ForbiddenException('Không xác định được đơn vị gửi tin nhắn.');
        }
        return tenantId;
    }

    @Post(':conversationId/messages/:messageId/react')
    async reactToMessage(
        @Param('conversationId') conversationId: string,
        @Param('messageId') messageId: string,
        @Body() body: { icon: string },
    ) {
        if (!body.icon) return { error: 'Vui lòng cung cấp icon' };
        const message = await this.messagesService.reactToMessage(conversationId, messageId, body.icon);
        return { success: true, messageId: message.id, reactions: message.reactions };
    }

    @Post(':conversationId/messages/:messageId/recall')
    async recallMessage(
        @Param('conversationId') conversationId: string,
        @Param('messageId') messageId: string,
    ) {
        const message = await this.messagesService.recallMessage(conversationId, messageId);
        return { success: true, messageId: message.id, status: message.status };
    }

    @Post(':conversationId/messages/:messageId/pin')
    async togglePinMessage(
        @Param('conversationId') conversationId: string,
        @Param('messageId') messageId: string,
    ) {
        const message = await this.messagesService.togglePinMessage(conversationId, messageId);
        return { success: true, messageId: message.id, isPinned: message.isPinned };
    }

    @Post(':conversationId/messages/:messageId/star')
    async toggleStarMessage(
        @Param('conversationId') conversationId: string,
        @Param('messageId') messageId: string,
    ) {
        const message = await this.messagesService.toggleStarMessage(conversationId, messageId);
        return { success: true, messageId: message.id, isStarred: message.isStarred };
    }

    @Delete(':conversationId/messages/:messageId/local')
    async deleteMessageLocal(
        @Param('conversationId') conversationId: string,
        @Param('messageId') messageId: string,
    ) {
        await this.messagesService.deleteMessageLocal(conversationId, messageId);
        return { success: true };
    }

    @Get(':conversationId/messages/search')
    async searchMessages(
        @Param('conversationId') conversationId: string,
        @Query('q') query: string,
        @Query('limit') limit?: number,
    ) {
        return this.messagesService.searchMessages(conversationId, query, +(limit || 30));
    }
}
