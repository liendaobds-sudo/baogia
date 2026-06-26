import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../entities/role.entity';
import { RolePermission } from '../../entities/role-permission.entity';

/** All available permission keys — matching the legacy PHP system */
export const ALL_PERMISSIONS = [
    // Quotes
    'quote.view', 'quote.create', 'quote.edit', 'quote.delete', 'quote.approve',
    // Materials
    'material.view', 'material.create', 'material.edit', 'material.delete',
    // Inventory
    'inventory.view', 'inventory.import', 'inventory.export', 'inventory.adjust',
    // Customers
    'customer.view', 'customer.create', 'customer.edit', 'customer.delete',
    // Pricing
    'pricing.view', 'pricing.create', 'pricing.edit', 'pricing.delete',
    // Orders
    'order.view', 'order.create', 'order.edit', 'order.delete', 'order.approve',
    // Settings
    'settings.view', 'settings.edit',
    // Users
    'user.view', 'user.create', 'user.edit', 'user.delete',
    // Roles
    'role.view', 'role.edit',
    // Reports
    'report.view', 'report.export',
    // Inbox / CRM
    'inbox.view', 'inbox.reply', 'inbox.assign', 'inbox.delete',
    // Admin
    'admin.view', 'admin.tenant',
] as const;

export type PermissionKey = typeof ALL_PERMISSIONS[number];

/** Default permission sets per role */
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
    admin: ['*'],
    supervisor: [
        'quote.view', 'quote.create', 'quote.edit', 'quote.approve',
        'material.view', 'material.create', 'material.edit',
        'inventory.view', 'inventory.import', 'inventory.export', 'inventory.adjust',
        'customer.view', 'customer.create', 'customer.edit',
        'pricing.view', 'pricing.edit',
        'order.view', 'order.create', 'order.edit', 'order.approve',
        'settings.view',
        'user.view',
        'report.view', 'report.export',
        'inbox.view', 'inbox.reply', 'inbox.assign',
    ],
    agent: [
        'quote.view', 'quote.create', 'quote.edit',
        'material.view',
        'inventory.view',
        'customer.view', 'customer.create',
        'pricing.view',
        'order.view',
        'report.view',
        'inbox.view', 'inbox.reply',
    ],
    viewer: [
        'quote.view',
        'material.view',
        'customer.view',
        'pricing.view',
        'order.view',
        'report.view',
    ],
};

@Injectable()
export class RbacService implements OnModuleInit {
    private readonly logger = new Logger(RbacService.name);

    constructor(
        @InjectRepository(Role) private roleRepo: Repository<Role>,
        @InjectRepository(RolePermission) private rpRepo: Repository<RolePermission>,
    ) {}

    async onModuleInit() {
        await this.seedDefaultRoles();
        await this.reconcileSystemRolePermissions();
    }

    // ─── Seed ───

    private async seedDefaultRoles() {
        const existingCount = await this.roleRepo.count({ where: { isSystem: true } });
        if (existingCount >= 4) return; // Already seeded

        const roles = [
            { name: 'admin', displayName: 'Quản trị viên', description: 'Toàn quyền trong xưởng in', isSystem: true },
            { name: 'supervisor', displayName: 'Giám sát', description: 'Quản lý đơn hàng, vật tư, nhân viên', isSystem: true },
            { name: 'agent', displayName: 'Nhân viên', description: 'Tạo báo giá, quản lý khách hàng', isSystem: true },
            { name: 'viewer', displayName: 'Xem', description: 'Chỉ xem, không chỉnh sửa', isSystem: true },
        ];

        for (const roleData of roles) {
            let role = await this.roleRepo.findOne({ where: { name: roleData.name, isSystem: true } });
            if (!role) {
                role = await this.roleRepo.save(roleData);
            }

            // Seed permissions for this role
            const permissions = DEFAULT_ROLE_PERMISSIONS[roleData.name] || [];
            const existingPerms = await this.rpRepo.count({ where: { roleId: role.id } });
            if (existingPerms === 0 && permissions.length > 0) {
                const permEntities = permissions.map(p => ({ roleId: role!.id, permission: p }));
                await this.rpRepo.save(permEntities);
            }
        }

        this.logger.log('🔐 Seeded 4 system roles with permissions (admin, supervisor, agent, viewer)');
    }

    /**
     * Đồng bộ quyền cho các vai trò HỆ THỐNG (is_system=true) về đúng
     * DEFAULT_ROLE_PERMISSIONS: thêm quyền còn thiếu, gỡ quyền thừa.
     *
     * - CHỈ thao tác trên vai trò hệ thống (is_system=true); KHÔNG đụng vai trò
     *   tuỳ biến (is_system=false).
     * - KHÔNG xoá bất kỳ vai trò nào — chỉ điều chỉnh role_permissions.
     * - Idempotent: chạy lại nhiều lần cho cùng kết quả.
     */
    private async reconcileSystemRolePermissions() {
        for (const [name, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
            const role = await this.roleRepo.findOne({ where: { name, isSystem: true } });
            if (!role) continue; // chỉ đồng bộ vai trò hệ thống đang tồn tại

            const existing = await this.rpRepo.find({ where: { roleId: role.id } });
            const existingSet = new Set(existing.map((e) => e.permission));
            const desiredSet = new Set(perms);

            // Thêm quyền còn thiếu
            const toAdd = perms
                .filter((p) => !existingSet.has(p))
                .map((p) => ({ roleId: role.id, permission: p }));
            if (toAdd.length) await this.rpRepo.save(toAdd);

            // Gỡ quyền thừa (chỉ với vai trò hệ thống, đưa về đúng default)
            const toRemove = existing.filter((e) => !desiredSet.has(e.permission));
            if (toRemove.length) await this.rpRepo.remove(toRemove);
        }
    }

    // ─── CRUD Roles ───

    async findAllRoles(tenantId?: number) {
        const qb = this.roleRepo.createQueryBuilder('r')
            .orderBy('r.is_system', 'DESC')
            .addOrderBy('r.name', 'ASC');

        if (tenantId) {
            qb.where('r.tenant_id IS NULL OR r.tenant_id = :tenantId', { tenantId });
        }
        const roles = await qb.getMany();

        // Attach permissions to each role
        const rolesWithPerms = await Promise.all(
            roles.map(async (role) => {
                const permissions = await this.rpRepo.find({ where: { roleId: role.id } });
                return { ...role, permissions: permissions.map(p => ({ key: p.permission })) };
            }),
        );
        return rolesWithPerms;
    }

    async findRoleWithPermissions(roleId: number) {
        const role = await this.roleRepo.findOne({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        const permissions = await this.rpRepo.find({ where: { roleId } });
        return { ...role, permissions: permissions.map(p => p.permission) };
    }

    async createRole(data: { name: string; displayName: string; description?: string; tenantId?: number; permissions?: string[] }) {
        const role = await this.roleRepo.save({
            name: data.name,
            displayName: data.displayName,
            description: data.description,
            tenantId: data.tenantId,
            isSystem: false,
        });

        if (data.permissions?.length) {
            const permEntities = data.permissions.map(p => ({ roleId: role.id, permission: p }));
            await this.rpRepo.save(permEntities);
        }

        return this.findRoleWithPermissions(role.id);
    }

    async updateRolePermissions(roleId: number, permissions: string[]) {
        const role = await this.roleRepo.findOne({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');

        // Clear old permissions
        await this.rpRepo.delete({ roleId });

        // Insert new
        if (permissions.length > 0) {
            const permEntities = permissions.map(p => ({ roleId, permission: p }));
            await this.rpRepo.save(permEntities);
        }

        return this.findRoleWithPermissions(roleId);
    }

    async deleteRole(roleId: number) {
        const role = await this.roleRepo.findOne({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');
        if (role.isSystem) throw new Error('Không thể xóa role hệ thống');
        await this.rpRepo.delete({ roleId });
        await this.roleRepo.delete(roleId);
        return { deleted: true };
    }

    // ─── Permission Catalog ───

    getAllPermissions() {
        return ALL_PERMISSIONS.map(p => {
            const [module, action] = p.split('.');
            return { key: p, module, action };
        });
    }
}
