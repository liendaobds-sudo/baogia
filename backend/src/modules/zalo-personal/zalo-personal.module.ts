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
import { User } from '../../entities/user.entity';
import { ZaloAccountAccessInterceptor } from './zalo-account-access.interceptor';

@Module({
    imports: [
        TypeOrmModule.forFeature([ZaloAccount, Contact, Conversation, Message, Channel, User]),
    ],
    controllers: [ZaloPersonalController],
    providers: [ZaloPoolService, ZaloRateLimiterService, ZaloHealthCheckService, ZaloAccountAccessInterceptor],
    exports: [ZaloPoolService, ZaloRateLimiterService],
})
export class ZaloPersonalModule {}
