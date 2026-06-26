import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact, Conversation, Message } from '../../entities';
import { ContactsController } from './contacts.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([Contact, Conversation, Message]),
    ],
    controllers: [ContactsController],
    providers: [],
    exports: [],
})
export class ContactsModule { }
