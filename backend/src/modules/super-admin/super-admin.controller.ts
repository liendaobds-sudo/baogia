import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminService } from './super-admin.service';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../../entities';

/**
 * Super Admin Controller — only accessible by SUPER_ADMIN or ADMIN role
 * Prefixed with /api/v1/super-admin
 */
@Controller('super-admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class SuperAdminController {
    constructor(private readonly svc: SuperAdminService) {}

    // ─── Dashboard ───

    @Get('dashboard')
    async getDashboard() {
        const data = await this.svc.getRevenueSummary();
        return { success: true, data };
    }

    @Get('revenue/monthly')
    async getMonthlyRevenue(@Query('months') months?: string) {
        const data = await this.svc.getMonthlyRevenue(months ? parseInt(months) : 12);
        return { success: true, data };
    }

    // ─── Plans ───

    @Get('plans')
    async getPlans() {
        const data = await this.svc.getPlans();
        return { success: true, data };
    }

    // Issue #1/#3 fix: Add tenants list endpoint
    @Get('tenants')
    async getTenants() {
        const data = await this.svc.getAllTenants();
        return { success: true, data };
    }

    @Post('tenants')
    async createTenant(@Body() body: { name: string; code: string; email?: string; phone?: string; planId?: number }) {
        const data = await this.svc.createTenant(body);
        return { success: true, data };
    }

    @Put('plans/:id')
    async updatePlan(@Param('id') id: string, @Body() body: any) {
        const data = await this.svc.updatePlan(+id, body);
        return { success: true, data };
    }

    // ─── Payments ───

    @Get('payments')
    async getPayments(
        @Query('tenant_id') tenantId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const data = await this.svc.getPayments(
            tenantId ? +tenantId : undefined,
            page ? +page : 1,
            limit ? +limit : 50,
        );
        return { success: true, ...data };
    }

    @Post('payments')
    async createPayment(@Body() body: any) {
        const data = await this.svc.createPayment(body);
        return { success: true, data };
    }

    @Put('payments/:id/confirm')
    async confirmPayment(@Param('id') id: string) {
        const data = await this.svc.confirmPayment(+id);
        return { success: true, data };
    }

    // ─── Impersonation ───

    @Post('impersonate/:tenantId')
    async impersonate(@Param('tenantId') tenantId: string, @Req() req: any) {
        const data = await this.svc.impersonate(+tenantId, req.user?.id);
        return { success: true, data };
    }

    // ─── Tenant Stats ───

    @Get('tenants/:id/stats')
    async getTenantStats(@Param('id') id: string) {
        const data = await this.svc.getTenantStats(+id);
        return { success: true, data };
    }
}
