import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookSetting } from '../../entities/webhook-setting.entity';
import { WebhookService } from './webhook.service';
import { WebhookSettingsController } from './webhook-settings.controller';

@Module({
    imports: [TypeOrmModule.forFeature([WebhookSetting])],
    controllers: [WebhookSettingsController],
    providers: [WebhookService],
    exports: [WebhookService],
})
export class WebhookModule {}
