import { Controller, Get, Post, Put, Param, Body, HttpCode, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantService } from './tenant.service';
import { Tenant } from '../../entities/tenant.entity';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../entities';

@Controller('tenants')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class TenantController {
    constructor(private readonly tenantService: TenantService) {}

    @Get()
    async findAll() {
        const data = await this.tenantService.findAll();
        return { success: true, data };
    }

    @Get(':id')
    async findById(@Param('id') id: string) {
        const data = await this.tenantService.findById(+id);
        return { success: true, data };
    }

    @Post()
    @HttpCode(201)
    async create(@Body() body: Partial<Tenant>) {
        const data = await this.tenantService.create(body);
        return { success: true, data };
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: Partial<Tenant>) {
        const data = await this.tenantService.update(+id, body);
        return { success: true, data };
    }

    @Put(':id/suspend')
    async suspend(@Param('id') id: string) {
        const data = await this.tenantService.suspend(+id);
        return { success: true, data, message: 'Tenant suspended' };
    }

    @Put(':id/activate')
    async activate(@Param('id') id: string) {
        const data = await this.tenantService.activate(+id);
        return { success: true, data, message: 'Tenant activated' };
    }
}
