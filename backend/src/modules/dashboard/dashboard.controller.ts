import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../entities';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
    constructor(private dashboardService: DashboardService) { }

    // Public endpoint — called by PricingPrint dashboard (no JWT needed)
    @Get('kpi')
    getKpi(@Query('from') from?: string, @Query('to') to?: string) {
        return this.dashboardService.getKpi(from, to);
    }

    @Get('ai-analytics')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
    getAiAnalytics() {
        return this.dashboardService.getAiAnalytics();
    }

    @Get('health')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
    getHealth() {
        return this.dashboardService.getHealthCheck();
    }

    @Get('activity-hourly')
    getActivityHourly() {
        return this.dashboardService.getActivityHourly();
    }

    @Get('trends')
    getTrends() {
        return this.dashboardService.getTrends();
    }
}
