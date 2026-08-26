import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy — revocation identity', () => {
    const build = () => {
        const configService = {
            get: jest.fn((key: string) => {
                if (key === 'JWT_SECRET') return 'test-jwt-secret';
                if (key === 'NODE_ENV') return 'test';
                return undefined;
            }),
        };
        const authService = {
            isTokenBlacklisted: jest.fn().mockResolvedValue(false),
            validateUser: jest.fn().mockResolvedValue({
                id: 'user-1',
                email: 'agent@example.test',
                role: 'agent',
                fullName: 'Agent',
                tenantId: 7,
            }),
            loadPermissions: jest.fn().mockResolvedValue(['conversation:read']),
        };
        return {
            strategy: new JwtStrategy(configService as any, authService as any),
            authService,
        };
    };

    it('từ chối access token thiếu JTI trước DB và blacklist lookup', async () => {
        const { strategy, authService } = build();

        await expect(strategy.validate({
            sub: 'user-1',
            email: 'agent@example.test',
            role: 'agent',
        } as any)).rejects.toThrow(UnauthorizedException);

        expect(authService.isTokenBlacklisted).not.toHaveBeenCalled();
        expect(authService.validateUser).not.toHaveBeenCalled();
    });

    it('kiểm cả JTI và session family trước khi tải user', async () => {
        const { strategy, authService } = build();

        await strategy.validate({
            sub: 'user-1',
            email: 'agent@example.test',
            role: 'agent',
            jti: 'access-jti',
            sid: 'session-family',
        });

        expect(authService.isTokenBlacklisted).toHaveBeenCalledWith(
            'access-jti',
            'session-family',
        );
        expect(authService.validateUser).toHaveBeenCalledWith('user-1');
    });
});
