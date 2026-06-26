import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../../entities/contact.entity';
import { Message } from '../../entities/message.entity';
import { Appointment } from '../../entities/appointment.entity';
import { Conversation } from '../../entities/conversation.entity';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
    imports: [TypeOrmModule.forFeature([Contact, Message, Appointment, Conversation])],
    controllers: [SearchController],
    providers: [SearchService],
})
export class SearchModule {}
