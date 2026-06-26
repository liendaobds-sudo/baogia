import { Controller, Post, Get, Delete, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessagesService } from './messages.service';
import { MessageProcessorService } from './message-processor.service';

@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
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
        @Body() body: { text: string; contentType?: string; attachments?: any[]; idempotencyKey?: string, replyToId?: string },
        @Req() req: any,
    ) {
        const userId = req.user?.sub || req.user?.id;
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
