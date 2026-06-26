import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User, UserRole } from '../../entities';
import { RedisService } from '../redis/redis.service';

// In-memory mock RedisService
const redisStore = new Map<string, string>();
const mockRedisService = {
    set: jest.fn(async (key: string, value: string) => { redisStore.set(key, value); }),
    get: jest.fn(async (key: string) => redisStore.get(key) || null),
    del: jest.fn(async (key: string) => { redisStore.delete(key); }),
    exists: jest.fn(async (key: string) => redisStore.has(key)),
    sadd: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(async () => []),
    isConnected: true,
    getClient: jest.fn(),
};

describe('AuthService', () => {
    let service: AuthService;
    let usersRepo: any;
    let jwtService: any;

    const mockUser = {
        id: 'user-1',
        email: 'test@zeplao.vn',
        passwordHash: '$2a$10$mockHash',
        fullName: 'Test User',
        role: UserRole.AGENT,
        isActive: true,
        lastLoginAt: undefined as Date | undefined,
    } as any;

    beforeEach(async () => {
        // Clear the mock Redis store between tests
        redisStore.clear();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                {
                    provide: getRepositoryToken(User),
                    useValue: {
                        findOne: jest.fn(),
                        save: jest.fn(),
                        create: jest.fn(),
                    },
                },
                {
                    provide: getDataSourceToken(),
                    useValue: {
                        query: jest.fn().mockResolvedValue([]),
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
                            return map[key] || defaultVal;
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
        jwtService = module.get(JwtService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('login', () => {
        it('should throw UnauthorizedException for invalid email', async () => {
            usersRepo.findOne.mockResolvedValue(null);

            await expect(
                service.login({ email: 'bad@zeplao.vn', password: 'wrong' }),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException for wrong password', async () => {
            usersRepo.findOne.mockResolvedValue(mockUser);

            await expect(
                service.login({ email: 'test@zeplao.vn', password: 'wrongpass' }),
            ).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('refreshToken', () => {
        it('should throw for invalid refresh token', async () => {
            jwtService.verify.mockImplementation(() => {
                throw new Error('invalid');
            });

            await expect(
                service.refreshToken('invalid-token'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw when refresh token JTI is blacklisted (rotation)', async () => {
            jwtService.verify.mockReturnValue({
                sub: 'user-1',
                jti: 'blacklisted-jti',
                exp: Math.floor(Date.now() / 1000) + 3600,
            });

            // Pre-blacklist the JTI via mock RedisService
            await mockRedisService.set('blacklist:blacklisted-jti', 'true');

            await expect(
                service.refreshToken('some-token'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should rotate refresh token (blacklist old, issue new)', async () => {
            const oldJti = 'old-refresh-jti';
            jwtService.verify.mockReturnValue({
                sub: 'user-1',
                jti: oldJti,
                exp: Math.floor(Date.now() / 1000) + 3600,
            });
            usersRepo.findOne.mockResolvedValue(mockUser);

            const result = await service.refreshToken('valid-refresh');

            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            // Old JTI should be blacklisted after rotation (async check)
            expect(await service.isTokenBlacklisted(oldJti)).toBe(true);
        });
    });

    describe('logout', () => {
        it('should blacklist the access token JTI', async () => {
            jwtService.decode.mockReturnValue({
                sub: 'user-1',
                jti: 'logout-jti',
                exp: Math.floor(Date.now() / 1000) + 3600,
            });

            await service.logout('some-access-token');

            expect(await service.isTokenBlacklisted('logout-jti')).toBe(true);
        });

        it('should not throw when token decode fails', async () => {
            jwtService.decode.mockReturnValue(null);

            await expect(service.logout('bad-token')).resolves.toBeUndefined();
        });
    });

    describe('validateUser', () => {
        it('should return user if found and active', async () => {
            usersRepo.findOne.mockResolvedValue(mockUser);
            const result = await service.validateUser('user-1');
            expect(result).toBe(mockUser);
        });

        it('should throw UnauthorizedException if user not found', async () => {
            usersRepo.findOne.mockResolvedValue(null);
            await expect(service.validateUser('bad-id')).rejects.toThrow(UnauthorizedException);
        });
    });
});
