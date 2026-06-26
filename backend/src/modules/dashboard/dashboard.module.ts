import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, AiSuggestion, Message, KbDocument, KbChunk } from '../../entities';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SuggestionsModule } from '../suggestions/suggestions.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Conversation, AiSuggestion, Message, KbDocument, KbChunk]),
        SuggestionsModule,
    ],
    controllers: [DashboardController],
    providers: [DashboardService],
})
export class DashboardModule { }
