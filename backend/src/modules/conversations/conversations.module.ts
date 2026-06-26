import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, User, ConversationParticipant, FollowUp, AiSuggestion } from '../../entities';
import { ConversationsService } from './conversations.service';
import { ConversationsController } from './conversations.controller';
import { SlaMonitorService } from './sla-monitor.service';
import { FollowUpService } from './follow-up.service';
import { GatewayModule } from '../gateway/gateway.module';
import { SuggestionsModule } from '../suggestions/suggestions.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Conversation, User, ConversationParticipant, FollowUp, AiSuggestion]),
        GatewayModule,
        SuggestionsModule,
    ],
    controllers: [ConversationsController],
    providers: [ConversationsService, SlaMonitorService, FollowUpService],
    exports: [ConversationsService, FollowUpService],
})
export class ConversationsModule { }
