import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StatsService } from '../services/stats.service';

@UseGuards(AuthGuard('jwt'))
@Controller('erp/stats')
export class ErpStatsController {
    constructor(private readonly service: StatsService) {}

    @Get()
    async getStats(@Query('action') action?: string) {
        return { success: true, data: await this.service.getStats(action) };
    }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/sync-status')
export class ErpSyncStatusController {
    @Get()
    async getStatus() {
        return { success: true, data: { status: 'idle', last_sync: new Date() } };
    }
}

@Controller()
export class ErpHealthController {
    @Get('health')
    health() {
        return { success: true, status: 'ok', engine: 'nestjs', timestamp: new Date().toISOString() };
    }
}
