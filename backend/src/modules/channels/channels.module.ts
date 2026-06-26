import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, Contact, Conversation, Message } from '../../entities';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { WebhookController } from './webhook.controller';
import { MockZaloController } from './mock-zalo.controller';
import { MessagesModule } from '../messages/messages.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Channel, Contact, Conversation, Message]),
        forwardRef(() => MessagesModule),
    ],
    controllers: [ChannelsController, WebhookController, MockZaloController],
    providers: [ChannelsService],
    exports: [ChannelsService],
})
export class ChannelsModule { }
