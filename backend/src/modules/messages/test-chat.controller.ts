import {
    Controller, Post, Get, Body, UseGuards, Req, Logger, Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../../entities/channel.entity';
import { Conversation } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { MessageProcessorService } from './message-processor.service';
import { ParsedMessage } from '../channels/adapters/channel-adapter.interface';
import { v4 as uuid } from 'uuid';

const TEST_CHANNEL_NAME = 'Test Chat (Internal)';

/**
 * Internal test chat controller
 * Simulates inbound customer messages to test the AI pipeline
 * WITHOUT needing a real Zalo OA account
 */
@Controller('test-chat')
@UseGuards(AuthGuard('jwt'), CskhScopeGuard)
export class TestChatController {
    private readonly logger = new Logger(TestChatController.name);

    constructor(
        @InjectRepository(Channel) private channelRepo: Repository<Channel>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private messageRepo: Repository<Message>,
        private messageProcessor: MessageProcessorService,
    ) { }

    /**
     * Get or create the test channel
     */
    private async getTestChannel(): Promise<Channel> {
        let channel = await this.channelRepo.findOne({
            where: { name: TEST_CHANNEL_NAME },
        });

        if (!channel) {
            channel = this.channelRepo.create({
                name: TEST_CHANNEL_NAME,
                type: 'test' as any, // virtual channel type for testing
                externalId: 'test-internal',
                isActive: true,
                config: { description: 'Internal test channel for AI pipeline testing' } as any,
            });
            channel = await this.channelRepo.save(channel);
            this.logger.log(`🧪 Test channel created: ${channel.id}`);
        }

        return channel;
    }

    /**
     * POST /api/v1/test-chat/send
     * Simulate an inbound customer message
     */
    @Post('send')
    async sendTestMessage(
        @Body() body: { message: string; senderName?: string },
        @Req() req: any,
    ) {
        const { message, senderName } = body;
        if (!message?.trim()) {
            return { success: false, error: 'Message is required' };
        }

        const userId = req.user?.sub || req.user?.id || 'test-user';
        const channel = await this.getTestChannel();

        // Create a ParsedMessage that mimics a real webhook payload
        const parsedMessage: ParsedMessage = {
            externalMessageId: `test_${uuid()}`,
            externalUserId: `test_customer_${userId}`,
            senderName: senderName || 'Khách Test',
            senderAvatar: '',
            text: message,
            attachments: [],
            timestamp: new Date(),
            rawPayload: { source: 'test-chat', userId },
        };

        this.logger.log(`🧪 Test message: "${message}" from ${parsedMessage.senderName}`);

        // Fire processInbound — this triggers the FULL pipeline:
        // contact upsert → conversation → message save → WebSocket → AI suggestion
        await this.messageProcessor.processInbound(channel.id, parsedMessage);

        // Find the conversation to return its ID
        const conv = await this.convRepo.findOne({
            where: {
                channel: { id: channel.id },
                contact: { externalUserId: parsedMessage.externalUserId },
            },
            order: { lastMessageAt: 'DESC' },
        });

        return {
            success: true,
            conversationId: conv?.id,
            channelId: channel.id,
        };
    }

    /**
     * GET /api/v1/test-chat/conversation
     * Get the test conversation for the current user (if exists)
     */
    @Get('conversation')
    async getTestConversation(@Req() req: any) {
        const userId = req.user?.sub || req.user?.id || 'test-user';
        const channel = await this.getTestChannel();

        const conv = await this.convRepo.findOne({
            where: {
                channel: { id: channel.id },
                contact: { externalUserId: `test_customer_${userId}` },
            },
            relations: ['contact'],
            order: { lastMessageAt: 'DESC' },
        });

        if (!conv) {
            return { conversationId: null };
        }

        // Get messages for this conversation
        const messages = await this.messageRepo.find({
            where: { conversation: { id: conv.id } },
            order: { createdAt: 'ASC' },
            take: 100,
        });

        return {
            conversationId: conv.id,
            channelId: channel.id,
            contact: conv.contact,
            messages: messages.map(m => ({
                id: m.id,
                senderType: m.senderType,
                content: m.content,
                contentType: m.contentType,
                status: m.status,
                createdAt: m.createdAt,
            })),
        };
    }

    /**
     * POST /api/v1/test-chat/reset
     * Clear test conversation (start fresh)
     */
    @Post('reset')
    async resetTestConversation(@Req() req: any) {
        const userId = req.user?.sub || req.user?.id || 'test-user';
        const channel = await this.getTestChannel();

        const conv = await this.convRepo.findOne({
            where: {
                channel: { id: channel.id },
                contact: { externalUserId: `test_customer_${userId}` },
            },
        });

        if (conv) {
            // Delete messages first, then conversation
            await this.messageRepo.delete({ conversation: { id: conv.id } });
            await this.convRepo.delete({ id: conv.id });
            this.logger.log(`🗑️ Test conversation reset for user ${userId}`);
        }

        return { success: true, message: 'Test conversation reset' };
    }
}
