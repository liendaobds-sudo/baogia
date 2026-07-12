import { Controller, Post, Param, Body, Req, Headers, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../../entities/channel.entity';
import { getChannelAdapter } from './adapters/adapter-factory';
import { MessageProcessorService } from '../messages/message-processor.service';

/**
 * Public webhook endpoint — NO JWT required
 * Zalo OA / Facebook sends events here
 */
@Controller('webhook')
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        @InjectRepository(Channel) private channelRepo: Repository<Channel>,
        private messageProcessor: MessageProcessorService,
    ) { }

    /**
     * Zalo OA webhook endpoint
     * POST /api/v1/webhook/zalo/:channelId
     */
    @Post('zalo/:channelId')
    @HttpCode(HttpStatus.OK)
    async handleZaloWebhook(
        @Param('channelId') channelId: string,
        @Body() body: any,
        @Headers('x-zalooa-signature') signature: string,
    ) {
        this.logger.log(`🪝 Webhook received for channel ${channelId}`);

        // 1. Get channel config
        const channel = await this.channelRepo.findOne({
            where: { id: channelId, isActive: true },
        });

        if (!channel) {
            this.logger.warn(`Channel not found or inactive: ${channelId}`);
            return { status: 'ignored', reason: 'channel_not_found' };
        }

        // 2. Verify signature. Production: secret is BẮT BUỘC — thiếu ⇒ từ chối (fail-closed),
        // tránh giả mạo webhook bơm tin nhắn khi ai đó quên cấu hình secret. Dev: cho qua để test.
        const adapter = getChannelAdapter(channel.type);
        if (channel.webhookSecret) {
            const isValid = adapter.verifyWebhook(body, signature, channel.webhookSecret);
            if (!isValid) {
                this.logger.warn(`⚠️ Invalid webhook signature for channel ${channelId}`);
                return { status: 'rejected', reason: 'invalid_signature' };
            }
        } else if (process.env.NODE_ENV === 'production') {
            this.logger.warn(`⚠️ Webhook rejected: channel ${channelId} has no webhookSecret (required in production)`);
            return { status: 'rejected', reason: 'missing_secret' };
        }

        // 3. Parse message
        const parsedMessage = adapter.parseInboundMessage(body);
        if (!parsedMessage) {
            this.logger.log(`Webhook event ignored (not a user message): ${body.event_name}`);
            return { status: 'ok', reason: 'non_message_event' };
        }

        // 4. Process asynchronously (fire and forget, return 200 immediately)
        // Use setImmediate to defer processing after response
        setImmediate(async () => {
            try {
                await this.messageProcessor.processInbound(channelId, parsedMessage);
            } catch (error: any) {
                this.logger.error(`Failed to process inbound: ${error.message}`, error.stack);
            }
        });

        return { status: 'ok' };
    }
}
