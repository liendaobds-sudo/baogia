import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel, Contact, Conversation, Message } from '../../entities';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { WebhookController } from './webhook.controller';
import { MockZaloController } from './mock-zalo.controller';
import { MessagesModule } from '../messages/messages.module';

// Controller mô phỏng tin nhắn Zalo (bơm thẳng vào pipeline AI, tự tạo channel giả) CHỈ dành
// cho dev. KHÔNG có guard → nếu nạp ở production sẽ là endpoint public cho phép người lạ bơm
// hội thoại, đốt quota AI, tạo bản ghi rác. Chỉ đăng ký khi NODE_ENV !== 'production'.
const devOnlyControllers = process.env.NODE_ENV !== 'production' ? [MockZaloController] : [];

@Module({
    imports: [
        TypeOrmModule.forFeature([Channel, Contact, Conversation, Message]),
        forwardRef(() => MessagesModule),
    ],
    controllers: [ChannelsController, WebhookController, ...devOnlyControllers],
    providers: [ChannelsService],
    exports: [ChannelsService],
})
export class ChannelsModule { }
