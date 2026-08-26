import { Controller, Post, Get, Param, Query, Body, Req, Headers, HttpCode, HttpStatus, Logger, BadRequestException, ForbiddenException, RawBodyRequest } from '@nestjs/common';
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
        @Req() req?: RawBodyRequest<Request>,
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
        // HMAC tính trên RAW BODY (bytes gốc) khi có — stringify(body đã parse) chỉ là fallback.
        const adapter = getChannelAdapter(channel.type);
        if (channel.webhookSecret) {
            const isValid = adapter.verifyWebhook(req?.rawBody ?? body, signature, channel.webhookSecret);
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

    /**
     * Facebook webhook verify challenge (GET)
     * Facebook gọi khi đăng ký webhook: trả lại hub.challenge nếu verify_token khớp.
     * GET /api/v1/webhook/facebook/:channelId?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
     */
    @Get('facebook/:channelId')
    async verifyFacebookWebhook(
        @Param('channelId') channelId: string,
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') verifyToken: string,
        @Query('hub.challenge') challenge: string,
    ): Promise<string> {
        const channel = await this.channelRepo.findOne({
            where: { id: channelId, isActive: true },
        });

        const expected = channel?.config?.verifyToken;
        if (mode === 'subscribe' && expected && verifyToken === expected) {
            this.logger.log(`✅ Facebook webhook verified for channel ${channelId}`);
            // Facebook yêu cầu echo lại challenge dạng plain text.
            return challenge;
        }

        this.logger.warn(`⚠️ Facebook webhook verify failed for channel ${channelId}`);
        throw new ForbiddenException('verify_token_mismatch');
    }

    /**
     * Facebook Messenger inbound (POST)
     * POST /api/v1/webhook/facebook/:channelId
     */
    @Post('facebook/:channelId')
    @HttpCode(HttpStatus.OK)
    async handleFacebookWebhook(
        @Param('channelId') channelId: string,
        @Body() body: any,
        @Headers('x-hub-signature-256') signature: string,
        @Req() req?: RawBodyRequest<Request>,
    ) {
        this.logger.log(`🪝 Facebook webhook received for channel ${channelId}`);

        const channel = await this.channelRepo.findOne({
            where: { id: channelId, isActive: true },
        });

        if (!channel) {
            this.logger.warn(`Channel not found or inactive: ${channelId}`);
            return { status: 'ignored', reason: 'channel_not_found' };
        }

        // Verify chữ ký giống Zalo: production bắt buộc secret (fail-closed).
        // X-Hub-Signature-256 là HMAC trên RAW BODY — bắt buộc dùng bytes gốc khi có,
        // nếu không webhook HỢP LỆ sẽ bị từ chối hàng loạt trên production.
        const adapter = getChannelAdapter(channel.type);
        if (channel.webhookSecret) {
            const isValid = adapter.verifyWebhook(req?.rawBody ?? body, signature, channel.webhookSecret);
            if (!isValid) {
                this.logger.warn(`⚠️ Invalid Facebook webhook signature for channel ${channelId}`);
                return { status: 'rejected', reason: 'invalid_signature' };
            }
        } else if (process.env.NODE_ENV === 'production') {
            this.logger.warn(`⚠️ Facebook webhook rejected: channel ${channelId} has no webhookSecret (required in production)`);
            return { status: 'rejected', reason: 'missing_secret' };
        }

        // Facebook BATCH nhiều entry/messaging trong một lần gọi — xử lý ĐỦ danh sách
        // (bản cũ chỉ đọc event đầu tiên → rớt tin khi khách nhắn nhanh).
        const parsedMessages = adapter.parseInboundMessages
            ? adapter.parseInboundMessages(body)
            : ([adapter.parseInboundMessage(body)].filter(Boolean) as any[]);
        if (parsedMessages.length === 0) {
            this.logger.log(`Facebook webhook event ignored (not a user message)`);
            return { status: 'ok', reason: 'non_message_event' };
        }

        setImmediate(async () => {
            // Tuần tự theo thứ tự Facebook gửi (message-processor tự serialize theo contact).
            for (const parsedMessage of parsedMessages) {
                try {
                    await this.messageProcessor.processInbound(channelId, parsedMessage);
                } catch (error: any) {
                    this.logger.error(`Failed to process Facebook inbound: ${error.message}`, error.stack);
                }
            }
        });

        return { status: 'ok', received: parsedMessages.length };
    }
}
