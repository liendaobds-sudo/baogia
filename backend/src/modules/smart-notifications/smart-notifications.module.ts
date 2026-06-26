import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../../entities/conversation.entity';
import { Appointment } from '../../entities/appointment.entity';
import { SmartNotificationsController } from './smart-notifications.controller';
import { SmartNotificationsService } from './smart-notifications.service';

@Module({
    imports: [TypeOrmModule.forFeature([Conversation, Appointment])],
    controllers: [SmartNotificationsController],
    providers: [SmartNotificationsService],
    exports: [SmartNotificationsService],
})
export class SmartNotificationsModule {}
