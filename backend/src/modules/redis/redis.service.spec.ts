const mockRedisInstances: any[] = [];

jest.mock('ioredis', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation((options: any) => {
        const handlers = new Map<string, Array<(...args: any[]) => void>>();
        const client: any = {
            options,
            on: jest.fn((event: string, handler: (...args: any[]) => void) => {
                handlers.set(event, [...(handlers.get(event) ?? []), handler]);
                return client;
            }),
            emitEvent: (event: string, ...args: any[]) => {
                for (const handler of handlers.get(event) ?? []) handler(...args);
            },
            connect: jest.fn().mockResolvedValue(undefined),
            quit: jest.fn().mockResolvedValue('OK'),
            subscribe: jest.fn().mockResolvedValue(1),
            publish: jest.fn().mockResolvedValue(1),
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn().mockResolvedValue(null),
            del: jest.fn().mockResolvedValue(1),
            exists: jest.fn().mockResolvedValue(0),
            sadd: jest.fn().mockResolvedValue(1),
            srem: jest.fn().mockResolvedValue(1),
            smembers: jest.fn().mockResolvedValue([]),
        };
        mockRedisInstances.push(client);
        return client;
    }),
}));

import { RedisService } from './redis.service';

describe('RedisService — session revocation pub/sub lifecycle', () => {
    const configService = {
        get: jest.fn((key: string, fallback?: unknown) => {
            if (key === 'REDIS_HOST') return 'redis.test';
            if (key === 'REDIS_PORT') return 6379;
            return fallback;
        }),
    };

    beforeEach(() => {
        mockRedisInstances.length = 0;
        jest.clearAllMocks();
    });

    it('dùng connection subscriber riêng và subscribe khi ready', async () => {
        new RedisService(configService as any);

        expect(mockRedisInstances).toHaveLength(2);
        const [commandClient, subscriber] = mockRedisInstances;
        expect(commandClient).not.toBe(subscriber);
        expect(commandClient.connect).toHaveBeenCalledTimes(1);
        expect(subscriber.options.lazyConnect).toBe(false);

        subscriber.emitEvent('ready');
        await Promise.resolve();

        expect(subscriber.subscribe).toHaveBeenCalledWith('security:session-revoked');
    });

    it('fan-out payload Redis tới listener cục bộ và unsubscribe đúng lifecycle', () => {
        const service = new RedisService(configService as any);
        const subscriber = mockRedisInstances[1];
        const handler = jest.fn();
        const remove = service.onSessionRevoked(handler);

        subscriber.emitEvent(
            'message',
            'security:session-revoked',
            JSON.stringify({ jti: 'jti-remote', sessionId: 'family-remote' }),
        );
        expect(handler).toHaveBeenCalledWith({
            jti: 'jti-remote',
            sessionId: 'family-remote',
        });

        remove();
        subscriber.emitEvent(
            'message',
            'security:session-revoked',
            JSON.stringify({ jti: 'jti-after-remove' }),
        );
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('bỏ qua payload revoke sai runtime type', () => {
        const service = new RedisService(configService as any);
        const subscriber = mockRedisInstances[1];
        const handler = jest.fn();
        service.onSessionRevoked(handler);

        subscriber.emitEvent('message', 'security:session-revoked', JSON.stringify({ jti: 123 }));
        subscriber.emitEvent('message', 'security:session-revoked', JSON.stringify({ sessionId: '' }));
        subscriber.emitEvent('message', 'security:session-revoked', 'not-json');

        expect(handler).not.toHaveBeenCalled();
    });

    it('publish strict ngắt local ngay và publish cho replica khác', async () => {
        const service = new RedisService(configService as any);
        const commandClient = mockRedisInstances[0];
        const handler = jest.fn();
        service.onSessionRevoked(handler);

        await service.publishSessionRevokedStrict('jti-local', 'family-local');

        expect(handler).toHaveBeenCalledWith({
            jti: 'jti-local',
            sessionId: 'family-local',
        });
        expect(commandClient.publish).toHaveBeenCalledWith(
            'security:session-revoked',
            JSON.stringify({ jti: 'jti-local', sessionId: 'family-local' }),
        );
    });

    it('await đóng cả hai Redis connection và bỏ callback muộn khi module destroy', async () => {
        const service = new RedisService(configService as any);
        const [commandClient, subscriber] = mockRedisInstances;
        const handler = jest.fn();
        service.onSessionRevoked(handler);

        await service.onModuleDestroy();

        expect(commandClient.quit).toHaveBeenCalledTimes(1);
        expect(subscriber.quit).toHaveBeenCalledTimes(1);
        subscriber.emitEvent('message', 'security:session-revoked', JSON.stringify({ jti: 'late' }));
        subscriber.emitEvent('ready');
        await Promise.resolve();
        expect(handler).not.toHaveBeenCalled();
        expect(subscriber.subscribe).not.toHaveBeenCalled();
    });
});
