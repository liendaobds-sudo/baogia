import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../../entities';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private usersRepo: Repository<User>,
    ) { }

    async findAll(tenantId: number) {
        // Loại super_admin: họ là control-plane (vận hành nền tảng), KHÔNG phải nhân sự
        // của tenant. Super admin dùng chung tenantId=1 nên nếu không loại sẽ lọt vào
        // danh sách nhân sự khi xem tenant đó (kể cả lúc impersonate).
        const users = await this.usersRepo.find({
            where: { tenantId, role: Not(UserRole.SUPER_ADMIN) },
            order: { createdAt: 'DESC' },
            select: ['id', 'email', 'fullName', 'role', 'avatarUrl', 'isActive', 'lastLoginAt', 'createdAt'],
        });
        return { data: users };
    }

    async findOne(id: string, actorTenantId?: number) {
        const user = await this.usersRepo.findOne({
            where: { id },
            select: ['id', 'email', 'fullName', 'role', 'avatarUrl', 'isActive', 'lastLoginAt', 'createdAt', 'tenantId'],
        });
        if (!user) throw new NotFoundException('User không tồn tại');
        this.assertSameTenant(user, actorTenantId);
        const { tenantId: _t, ...result } = user as any;
        return result;
    }

    async create(dto: CreateUserDto, actorTenantId?: number) {
        const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
        if (existing) throw new ConflictException('Email đã tồn tại');

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const user = this.usersRepo.create({
            email: dto.email,
            passwordHash,
            fullName: dto.fullName,
            role: dto.role,
            // Gán tenant của admin tạo user → staff mới thuộc đúng tenant (trước đây null
            // ⇒ không hiện trong danh sách + không được cô lập).
            tenantId: actorTenantId,
        });

        const saved = await this.usersRepo.save(user);
        const { passwordHash: _, ...result } = saved;
        return result;
    }

    async update(id: string, dto: UpdateUserDto, actorTenantId?: number) {
        const user = await this.usersRepo.findOne({ where: { id } });
        if (!user) throw new NotFoundException('User không tồn tại');
        this.assertSameTenant(user, actorTenantId);

        Object.assign(user, dto);
        const saved = await this.usersRepo.save(user);
        const { passwordHash: _, ...result } = saved;
        return result;
    }

    async remove(id: string, actorTenantId?: number) {
        const user = await this.usersRepo.findOne({ where: { id } });
        if (!user) throw new NotFoundException('User không tồn tại');
        this.assertSameTenant(user, actorTenantId);
        await this.usersRepo.remove(user);
        return { deleted: true };
    }

    /**
     * Chặn quản lý user chéo tenant: chỉ thao tác trên user cùng tenant với actor.
     * Khi `actorTenantId` không xác định (đường nội bộ) thì bỏ qua để không phá tooling.
     */
    private assertSameTenant(user: User, actorTenantId?: number) {
        if (actorTenantId == null) return;
        if (user.tenantId !== actorTenantId) {
            throw new NotFoundException('User không tồn tại');
        }
    }
}
