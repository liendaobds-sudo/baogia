import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZaloAccount } from '../../entities/zalo-account.entity';
import { Contact } from '../../entities/contact.entity';
import { Conversation } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { Channel } from '../../entities/channel.entity';
import { ZaloPersonalController } from './zalo-personal.controller';
import { ZaloPoolService } from './zalo-pool.service';
import { ZaloRateLimiterService } from './zalo-rate-limiter.service';
import { ZaloHealthCheckService } from './zalo-health-check.service';

@Module({
    imports: [
        TypeOrmModule.forFeature([ZaloAccount, Contact, Conversation, Message, Channel]),
    ],
    controllers: [ZaloPersonalController],
    providers: [ZaloPoolService, ZaloRateLimiterService, ZaloHealthCheckService],
    exports: [ZaloPoolService, ZaloRateLimiterService],
})
export class ZaloPersonalModule {}
