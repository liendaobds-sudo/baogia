import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageStatus, Conversation } from '../../entities';
import { getChannelAdapter } from '../channels/adapters/adapter-factory';

@Processor('outbound_messages')
@Injectable()
export class OutboundMessageProcessor extends WorkerHost {
    private readonly logger = new Logger(OutboundMessageProcessor.name);

    constructor(
        @InjectRepository(Message) private messagesRepo: Repository<Message>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing outbound message job: ${job.id}`);
        const { messageId, conversationId } = job.data;

        const message = await this.messagesRepo.findOne({ where: { id: messageId } });
        if (!message) {
            this.logger.warn(`Message ${messageId} not found`);
            return;
        }

        const conversation = await this.convRepo.findOne({
            where: { id: conversationId },
            relations: ['channel', 'contact'],
        });

        if (conversation && conversation.channel) {
            const adapter = getChannelAdapter(conversation.channel.type);

            try {
                // Using basic text format for now until adapter is fully extended
                const msgContent: any = { text: message.content };
                
                const result = await adapter.sendMessage(
                    conversation.channel.accessTokenEnc,
                    conversation.contact.externalUserId,
                    msgContent
                );

                if (result.success) {
                    message.status = MessageStatus.SENT;
                    message.externalMsgId = result.externalMessageId || '';
                } else {
                    message.status = MessageStatus.FAILED;
                    this.logger.error(`Zalo API send failed: ${result.error}`);
                    // Save failed status but still throw to trigger BullMQ retry
                    await this.messagesRepo.save(message);
                    throw new Error(result.error || 'Zalo API Error');
                }
            } catch (err: any) {
                message.status = MessageStatus.FAILED;
                this.logger.error(`Zalo API send exception: ${err.message}`);
                await this.messagesRepo.save(message);
                throw err;
            }
        } else {
            message.status = MessageStatus.SENT;
        }

        await this.messagesRepo.save(message);
        return { success: true, status: message.status };
    }
}
