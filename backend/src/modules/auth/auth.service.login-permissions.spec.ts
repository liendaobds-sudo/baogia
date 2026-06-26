// Feature: rbac-quote-order-access — Integration test cho login + fail-closed (Task 4.3)
// Validates: Requirements 5.1 (login phơi permissions), 7.4 (tương thích phiên), 4.2 (fail-closed)
//
// Mục tiêu: xác minh AuthService.login() trả về user.permissions theo cùng logic
// fail-closed của JwtStrategy, KHÔNG cần DB/Redis thật. Mọi phụ thuộc được mock.

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { User, UserRole } from '../../entities';
import { RedisService } from '../redis/redis.service';

// Stub bcryptjs để bỏ qua việc băm thật — login chỉ quan tâm so khớp mật khẩu.
jest.mock('bcryptjs');

const mockRedisService = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(async () => false),
};

describe('AuthService.login — permissions + fail-closed', () => {
    let service: AuthService;
    let usersRepo: any;
    let dataSource: any;

    const baseUser = {
        id: 'user-1',
        email: 'agent@zeplao.vn',
        passwordHash: '$2a$10$mockHash',
        fullName: 'Agent User',
        role: UserRole.AGENT,
        avatarUrl: null,
        tenantId: null,
        isActive: true,
        lastLoginAt: undefined as Date | undefined,
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: getRepositoryToken(User),
                    useValue: {
                        findOne: jest.fn(),
                        save: jest.fn(async (u: any) => u),
                        create: jest.fn(),
                    },
                },
                {
                    provide: getDataSourceToken(),
                    useValue: {
                        query: jest.fn(),
                    },
                },
                {
                    provide: JwtService,
                    useValue: {
                        sign: jest.fn().mockReturnValue('mock-token'),
                        verify: jest.fn(),
                        decode: jest.fn(),
                    },
                },
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn((key: string, defaultVal?: any) => {
                            const map: Record<string, string> = {
                                JWT_SECRET: 'test-secret',
                                JWT_REFRESH_SECRET: 'test-refresh-secret',
                                JWT_EXPIRES_IN: '7d',
                                JWT_REFRESH_EXPIRES_IN: '30d',
                            };
                            return map[key] ?? defaultVal;
                        }),
                    },
                },
                {
                    provide: RedisService,
                    useValue: mockRedisService,
                },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
        usersRepo = module.get(getRepositoryToken(User));
        dataSource = module.get<DataSource>(getDataSourceToken());

        // Mặc định: mật khẩu hợp lệ.
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('agent → user.permissions ánh xạ từ role_permissions (Req 5.1)', async () => {
        usersRepo.findOne.mockResolvedValue({ ...baseUser, role: UserRole.AGENT });
        dataSource.query.mockResolvedValue([
            { permission: 'quote.create' },
            { permission: 'order.view' },
        ]);

        const result = await service.login({ email: 'agent@zeplao.vn', password: 'secret123' });

        expect(result.user.permissions).toEqual(['quote.create', 'order.view']);
        expect(dataSource.query).toHaveBeenCalledTimes(1);
        // Token vẫn được phát hành kèm theo (tương thích phiên — Req 7.4)
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
    });

    it('admin → permissions = ["*"], KHÔNG truy vấn role_permissions (Req 5.1)', async () => {
        usersRepo.findOne.mockResolvedValue({ ...baseUser, role: UserRole.ADMIN });

        const result = await service.login({ email: 'admin@zeplao.vn', password: 'secret123' });

        expect(result.user.permissions).toEqual(['*']);
        expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('super_admin → permissions = ["*"], KHÔNG truy vấn role_permissions (Req 5.1)', async () => {
        usersRepo.findOne.mockResolvedValue({ ...baseUser, role: UserRole.SUPER_ADMIN });

        const result = await service.login({ email: 'admin@zeplao.vn', password: 'secret123' });

        expect(result.user.permissions).toEqual(['*']);
        expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('fail-closed: khi nạp quyền ném lỗi → permissions = [] (KHÔNG ["*"]) (Req 4.2)', async () => {
        usersRepo.findOne.mockResolvedValue({ ...baseUser, role: UserRole.AGENT });
        dataSource.query.mockRejectedValue(new Error('DB connection lost'));

        const result = await service.login({ email: 'agent@zeplao.vn', password: 'secret123' });

        expect(result.user.permissions).toEqual([]);
        expect(result.user.permissions).not.toContain('*');
        // Login vẫn thành công với token (chỉ quyền bị từ chối — fail-closed)
        expect(result.accessToken).toBeDefined();
    });
});
