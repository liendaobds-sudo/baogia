import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Query, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RbacService, ALL_PERMISSIONS } from './rbac.service';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../../entities';
import { TenantId } from '../tenants/tenant.decorator';

@Controller('rbac')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class RbacController {
    constructor(private readonly rbacService: RbacService) {}

    /** List all permissions available in the system */
    @Get('permissions')
    getAllPermissions() {
        return { success: true, data: this.rbacService.getAllPermissions() };
    }

    /** List all roles (system + tenant-specific) */
    @Get('roles')
    async getRoles(@TenantId() tenantId: number) {
        const data = await this.rbacService.findAllRoles(tenantId);
        return { success: true, data };
    }

    /**
     * Get role with its permissions.
     * Audit 2026-07-25: trước đây route này KHÔNG có `@Roles` (mọi user đăng nhập đọc được
     * bản đồ quyền của mọi role, kể cả role tenant khác) và không truyền tenant xuống service.
     */
    @Get('roles/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getRole(@Param('id') id: string, @TenantId() tenantId: number) {
        const data = await this.rbacService.findRoleWithPermissions(+id, tenantId ?? null);
        return { success: true, data };
    }

    /** Create custom role (admin only) */
    @Post('roles')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async createRole(@Body() body: any, @TenantId() tenantId: number) {
        const data = await this.rbacService.createRole({ ...body, tenantId });
        return { success: true, data };
    }

    /** Update role permissions (admin only) */
    @Put('roles/:id/permissions')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async updatePermissions(
        @Param('id') id: string,
        @Body() body: { permissions: string[] },
        @TenantId() tenantId: number,
        @Req() req: any,
    ) {
        // Truyền tenant xuống service để chặn ghi chéo tenant; role hệ thống chỉ super_admin sửa.
        const isSuperAdmin = String(req?.user?.role || '').toLowerCase() === 'super_admin';
        const data = await this.rbacService.updateRolePermissions(
            +id, body.permissions, tenantId ?? null, { allowSystem: isSuperAdmin },
        );
        return { success: true, data };
    }

    /** Delete custom role (admin only) */
    @Delete('roles/:id')
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async deleteRole(@Param('id') id: string, @TenantId() tenantId: number) {
        const data = await this.rbacService.deleteRole(+id, tenantId ?? null);
        return { success: true, data };
    }
}
