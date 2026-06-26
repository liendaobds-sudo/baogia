import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, Message, AiSuggestion, User } from '../../entities';
import { ReportsController } from './reports.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Conversation, Message, AiSuggestion, User])],
    controllers: [ReportsController],
})
export class ReportsModule { }
