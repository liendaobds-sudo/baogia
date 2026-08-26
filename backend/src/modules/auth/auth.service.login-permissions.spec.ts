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

    // ── Bộ_Phân_Giải_Quyền theo cặp (tên role, tenant) — tenant-data-isolation Req 9.3/9.4 ──

    describe('loadPermissions theo tenant', () => {
        it('query lọc theo cặp (tên role, tenant_id) — role cùng tên KHÔNG dùng chung mọi tenant (Req 9.3)', async () => {
            dataSource.query.mockResolvedValue([{ permission: 'quote.view', tenant_id: 7 }]);

            await service.loadPermissions('agent', 7);

            const [sql, params] = dataSource.query.mock.calls[0];
            expect(sql).toMatch(/LOWER\(r\.name\) = \$1/);
            expect(sql).toMatch(/r\.tenant_id = \$2 OR r\.tenant_id IS NULL/);
            expect(params).toEqual(['agent', 7]);
        });

        it('role riêng của tenant THẮNG role hệ thống cùng tên (không cộng dồn quyền baseline)', async () => {
            dataSource.query.mockResolvedValue([
                { permission: 'quote.view', tenant_id: null },   // role hệ thống
                { permission: 'quote.create', tenant_id: 7 },    // role riêng tenant 7
                { permission: 'order.view', tenant_id: 7 },
            ]);

            const perms = await service.loadPermissions('agent', 7);
            expect(perms.sort()).toEqual(['order.view', 'quote.create']);
        });

        it('không có role riêng → dùng role hệ thống (tenant_id NULL) làm baseline (Req 9.2)', async () => {
            dataSource.query.mockResolvedValue([
                { permission: 'quote.view', tenant_id: null },
            ]);

            const perms = await service.loadPermissions('agent', 7);
            expect(perms).toEqual(['quote.view']);
        });

        it('không tìm thấy role khớp cả tên lẫn tenant → [] fail-closed (Req 9.4)', async () => {
            dataSource.query.mockResolvedValue([]);

            const perms = await service.loadPermissions('agent', 99);
            expect(perms).toEqual([]);
        });

        it('hai tenant có role cùng tên nhận đúng tập quyền của mình (Req 9.3)', async () => {
            dataSource.query.mockImplementation(async (_sql: string, params: any[]) => {
                if (params[1] === 1) return [{ permission: 'quote.view', tenant_id: 1 }];
                if (params[1] === 2) return [{ permission: 'quote.approve', tenant_id: 2 }];
                return [];
            });

            expect(await service.loadPermissions('agent', 1)).toEqual(['quote.view']);
            expect(await service.loadPermissions('agent', 2)).toEqual(['quote.approve']);
        });
    });
});
