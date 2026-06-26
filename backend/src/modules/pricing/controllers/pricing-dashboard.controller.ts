import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PricingDashboardService } from '../services/pricing-dashboard.service';

@UseGuards(AuthGuard('jwt'))
@Controller('erp/dashboard')
export class PricingDashboardController {
    constructor(private readonly svc: PricingDashboardService) {}

    @Get()
    async getOverview() {
        return { success: true, data: await this.svc.getOverview() };
    }

    @Get('revenue-chart')
    async getRevenueChart(@Query('months') months?: string) {
        return { success: true, data: await this.svc.getRevenueChart(months ? parseInt(months) : 12) };
    }

    @Get('top-products')
    async getTopProducts(@Query('limit') limit?: string) {
        return { success: true, data: await this.svc.getTopProducts(limit ? parseInt(limit) : 10) };
    }

    @Get('top-customers')
    async getTopCustomers(@Query('limit') limit?: string) {
        return { success: true, data: await this.svc.getTopCustomers(limit ? parseInt(limit) : 10) };
    }

    @Get('alerts')
    async getAlerts() {
        return { success: true, data: await this.svc.getAlerts() };
    }
}
