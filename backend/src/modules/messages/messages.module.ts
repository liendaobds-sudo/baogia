import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message, Conversation, Contact, Channel, SystemSetting } from '../../entities';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { TestChatController } from './test-chat.controller';
import { ChatMediaController } from './chat-media.controller';
import { MediaController } from './media.controller';
import { MessageProcessorService } from './message-processor.service';
import { ZaloMediaArchiverService } from './zalo-media-archiver.service';
import { ChannelsModule } from '../channels/channels.module';
import { SuggestionsModule } from '../suggestions/suggestions.module';
import { AiSuggestService } from '../suggestions/ai-suggest.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { ZaloPersonalModule } from '../zalo-personal/zalo-personal.module';
import { BullModule } from '@nestjs/bullmq';
import { OutboundMessageProcessor } from './outbound-message.processor';

@Module({
    imports: [
        TypeOrmModule.forFeature([Message, Conversation, Contact, Channel, SystemSetting]),
        forwardRef(() => ChannelsModule),
        forwardRef(() => SuggestionsModule),
        forwardRef(() => ConversationsModule),
        forwardRef(() => ZaloPersonalModule),
        BullModule.registerQueue({
            name: 'outbound_messages',
        }),
    ],
    controllers: [MessagesController, TestChatController, ChatMediaController, MediaController],
    providers: [
        MessagesService,
        MessageProcessorService,
        ZaloMediaArchiverService,
        // Provide AiSuggestService under the string token so @Inject('AiSuggestService') resolves
        {
            provide: 'AiSuggestService',
            useExisting: AiSuggestService,
        },
        OutboundMessageProcessor,
    ],
    exports: [MessagesService, MessageProcessorService],
})
export class MessagesModule { }
