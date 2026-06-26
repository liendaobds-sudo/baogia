import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private usersRepo: Repository<User>,
    ) { }

    async findAll(tenantId: number) {
        const users = await this.usersRepo.find({
            where: { tenantId },
            order: { createdAt: 'DESC' },
            select: ['id', 'email', 'fullName', 'role', 'avatarUrl', 'isActive', 'lastLoginAt', 'createdAt'],
        });
        return { data: users };
    }

    async findOne(id: string) {
        const user = await this.usersRepo.findOne({
            where: { id },
            select: ['id', 'email', 'fullName', 'role', 'avatarUrl', 'isActive', 'lastLoginAt', 'createdAt'],
        });
        if (!user) throw new NotFoundException('User không tồn tại');
        return user;
    }

    async create(dto: CreateUserDto) {
        const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
        if (existing) throw new ConflictException('Email đã tồn tại');

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const user = this.usersRepo.create({
            email: dto.email,
            passwordHash,
            fullName: dto.fullName,
            role: dto.role,
        });

        const saved = await this.usersRepo.save(user);
        const { passwordHash: _, ...result } = saved;
        return result;
    }

    async update(id: string, dto: UpdateUserDto) {
        const user = await this.usersRepo.findOne({ where: { id } });
        if (!user) throw new NotFoundException('User không tồn tại');

        Object.assign(user, dto);
        const saved = await this.usersRepo.save(user);
        const { passwordHash: _, ...result } = saved;
        return result;
    }

    async remove(id: string) {
        const user = await this.usersRepo.findOne({ where: { id } });
        if (!user) throw new NotFoundException('User không tồn tại');
        await this.usersRepo.remove(user);
        return { deleted: true };
    }
}
