import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
    HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WebhookService } from './webhook.service';

@Controller('webhook-settings')
@UseGuards(AuthGuard('jwt'))
export class WebhookSettingsController {
    constructor(private readonly service: WebhookService) {}

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Post()
    create(
        @Body()
        dto: {
            name: string;
            webhookUrl: string;
            webhookSecret?: string;
            events?: string[];
        },
    ) {
        return this.service.create(dto);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body()
        dto: Partial<{
            name: string;
            webhookUrl: string;
            webhookSecret: string;
            events: string[];
            isActive: boolean;
        }>,
    ) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }

    /** POST /webhook-settings/:id/test — Send a test event */
    @Post(':id/test')
    test(@Param('id') id: string) {
        return this.service.test(id);
    }

    /** POST /webhook-settings/:id/reset — Reset circuit breaker */
    @Post(':id/reset')
    resetFailures(@Param('id') id: string) {
        return this.service.resetFailures(id);
    }
}
