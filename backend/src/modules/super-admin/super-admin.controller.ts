import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Req, ConflictException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminService } from './super-admin.service';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../../entities';
import { CapabilityService, LastEnabledMethodError } from '../../quote/capability.service';
import { MethodId } from '../../quote/types/method-plugin.types';

/**
 * Super Admin Controller — only accessible by SUPER_ADMIN or ADMIN role
 * Prefixed with /api/v1/super-admin
 */
@Controller('super-admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class SuperAdminController {
    constructor(
        private readonly svc: SuperAdminService,
        private readonly capability: CapabilityService,
    ) {}

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
    async createTenant(@Body() body: { name: string; code: string; username?: string; email?: string; phone?: string; planId?: number }) {
        const data = await this.svc.createTenant(body);
        return { success: true, data };
    }

    @Put('tenants/:id')
    async updateTenant(@Param('id') id: string, @Body() body: {
        name?: string; email?: string; phone?: string; address?: string; taxCode?: string; planId?: number; maxUsers?: number;
    }) {
        const data = await this.svc.updateTenant(+id, body);
        return { success: true, data };
    }

    @Put('tenants/:id/status')
    async setTenantStatus(@Param('id') id: string, @Body() body: { status: string }) {
        const data = await this.svc.setTenantStatus(+id, body?.status);
        return { success: true, data };
    }

    @Post('tenants/:id/reset-admin-password')
    async resetTenantAdminPassword(@Param('id') id: string) {
        const data = await this.svc.resetTenantAdminPassword(+id);
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

    // ─── Cờ_Năng_Lực Phương_Pháp_In theo tenant (Req 6.1, 6.2, 6.3) ───

    @Get('tenants/:id/capabilities')
    async getTenantCapabilities(@Param('id') id: string) {
        const tenantId = +id;
        const [flags, enabledMethods] = await Promise.all([
            this.capability.listFlagsForTenant(tenantId),
            this.capability.getEnabledMethodsForTenant(tenantId),
        ]);
        // source: 'explicit' khi tenant có hàng cấu hình riêng; 'inherited' khi kế thừa baseline.
        const source = flags.length > 0 ? 'explicit' : 'inherited';
        return {
            success: true,
            data: {
                tenantId,
                enabledMethods,
                source,
                flags: flags.map((f) => ({
                    methodId: f.methodId,
                    enabled: f.enabled,
                    updatedAt: f.updatedAt,
                })),
            },
        };
    }

    @Put('tenants/:id/capabilities/:methodId')
    async setTenantCapability(
        @Param('id') id: string,
        @Param('methodId') methodId: MethodId,
        @Body() body: { enabled: boolean },
    ) {
        try {
            const saved = await this.capability.setFlagForTenant(+id, methodId, body?.enabled);
            return {
                success: true,
                data: {
                    tenantId: +id,
                    methodId: saved.methodId,
                    enabled: saved.enabled,
                    updatedAt: saved.updatedAt,
                },
            };
        } catch (err) {
            if (err instanceof LastEnabledMethodError) {
                throw new ConflictException(err.message);
            }
            throw err;
        }
    }
}
