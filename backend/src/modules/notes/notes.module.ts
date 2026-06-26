import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalNote, Conversation } from '../../entities';
import { NotesController } from './notes.controller';

@Module({
    imports: [TypeOrmModule.forFeature([InternalNote, Conversation])],
    controllers: [NotesController],
})
export class NotesModule { }
