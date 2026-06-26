import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelType } from '../../entities/channel.entity';
import { MessageProcessorService } from '../messages/message-processor.service';
import { getChannelAdapter } from './adapters/adapter-factory';

/**
 * DEV-ONLY controller for simulating Zalo OA messages
 */
@Controller('dev')
export class MockZaloController {
    private readonly logger = new Logger(MockZaloController.name);

    constructor(
        @InjectRepository(Channel) private channelRepo: Repository<Channel>,
        private messageProcessor: MessageProcessorService,
    ) { }

    @Post('simulate-message')
    @HttpCode(HttpStatus.OK)
    async simulateMessage(
        @Body() body: {
            senderName?: string;
            senderExternalId?: string;
            text: string;
            channelId?: string;
        },
    ) {
        this.logger.log('🧪 Simulating Zalo OA inbound message...');

        // Find or create a test channel
        let channel = body.channelId
            ? await this.channelRepo.findOne({ where: { id: body.channelId } })
            : await this.channelRepo.findOne({ where: { type: ChannelType.ZALO_OA } });

        if (!channel) {
            channel = this.channelRepo.create({
                type: ChannelType.ZALO_OA,
                name: 'Test Zalo OA',
                externalId: 'test-oa-001',
                accessTokenEnc: 'mock-token',
                refreshTokenEnc: 'mock-refresh-token',
                tokenExpiresAt: new Date(Date.now() + 86400000),
                isActive: true,
            });
            channel = await this.channelRepo.save(channel);
            this.logger.log(`🔧 Auto-created test channel: ${channel.id}`);
        }

        const externalUserId = body.senderExternalId || `user_${Date.now().toString(36)}`;
        const msgId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const zaloPayload = {
            event_name: 'user_send_text',
            app_id: 'test-app',
            sender: {
                id: externalUserId,
                name: body.senderName || 'Khách Demo',
                avatar: null,
            },
            message: { text: body.text, msg_id: msgId },
            msg_id: msgId,
            timestamp: Date.now(),
        };

        const adapter = getChannelAdapter(channel.type);
        const parsedMessage = adapter.parseInboundMessage(zaloPayload);

        if (!parsedMessage) {
            return { success: false, error: 'Failed to parse simulated message' };
        }

        await this.messageProcessor.processInbound(channel.id, parsedMessage);

        return {
            success: true,
            channelId: channel.id,
            messageId: msgId,
            senderName: body.senderName || 'Khách Demo',
            text: body.text,
        };
    }

    @Post('simulate-conversation')
    @HttpCode(HttpStatus.OK)
    async simulateConversation(
        @Body() body: {
            senderName?: string;
            messages: string[];
            delayMs?: number;
        },
    ) {
        const results: any[] = [];
        const senderId = `user_${Date.now().toString(36)}`;

        for (const text of body.messages) {
            const result = await this.simulateMessage({
                senderName: body.senderName || 'Khách Demo',
                senderExternalId: senderId,
                text,
            });
            results.push(result);
            if (body.delayMs) {
                await new Promise(r => setTimeout(r, body.delayMs));
            }
        }

        return { success: true, count: results.length, results };
    }
}
