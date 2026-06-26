import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SmartNotificationsService } from './smart-notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class SmartNotificationsController {
    constructor(private readonly service: SmartNotificationsService) {}

    /** GET /notifications/smart — computed on-the-fly notifications */
    @Get('smart')
    getSmartNotifications() {
        return this.service.getSmartNotifications();
    }
}
