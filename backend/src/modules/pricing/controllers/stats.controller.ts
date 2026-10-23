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

/**
 * Audit 2026-08-29: controller này trước đây khai `@Controller()` + `@Get('health')`
 * ⇒ map ĐÚNG cùng path `/api/v1/health` với `HealthController` (module health). Route
 * trùng: module nào đăng ký trước thì thắng, nên endpoint DB-ping của `HealthController`
 * có thể bị che một cách âm thầm. Đổi sang `/api/v1/erp/health` để hai nguồn tách bạch:
 *   • `/api/v1/health`         → HealthController (có ping DB, dùng bởi super-admin UI)
 *   • `/api/v1/erp/health`     → engine ERP còn sống hay không
 *   • `/api/v1/pricing/health` → engine giá (frontend đang gọi)
 */
@Controller('erp')
export class ErpHealthController {
    @Get('health')
    health() {
        return { success: true, status: 'ok', engine: 'nestjs', timestamp: new Date().toISOString() };
    }
}
