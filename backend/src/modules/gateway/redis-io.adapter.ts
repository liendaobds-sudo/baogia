import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RedisIoAdapter extends IoAdapter {
    private adapterConstructor: ReturnType<typeof createAdapter>;

    constructor(app: INestApplicationContext) {
        super(app);
        // We defer redis connection to connectToRedis method,
        // but we extract config from app context here to use later
    }

    async connectToRedis(configService: ConfigService): Promise<void> {
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);

        // LÚC BOOT: bail sau 3 lần thử để caller còn fallback sang adapter in-memory
        // (connect() bên dưới đang được await). SAU khi đã kết nối được lần đầu:
        // retry vô hạn (trần 30s) — Redis chớp nhoáng không giết pub/sub vĩnh viễn.
        const makeRetryStrategy = () => {
            let everConnected = false;
            return {
                markConnected: () => { everConnected = true; },
                strategy: (times: number) =>
                    !everConnected && times > 3 ? null : Math.min(times * 500, 30_000),
            };
        };

        const pubRetry = makeRetryStrategy();
        const pubClient = new Redis({
            host, port,
            maxRetriesPerRequest: null,
            lazyConnect: true,
            retryStrategy: pubRetry.strategy,
        });
        pubClient.on('connect', pubRetry.markConnected);
        pubClient.on('error', () => {});

        const subRetry = makeRetryStrategy();
        const subClient = pubClient.duplicate({ retryStrategy: subRetry.strategy });
        subClient.on('connect', subRetry.markConnected);
        subClient.on('error', () => {});

        await pubClient.connect();
        await subClient.connect();

        this.adapterConstructor = createAdapter(pubClient, subClient);
    }

    createIOServer(port: number, options?: ServerOptions): any {
        const server = super.createIOServer(port, options);
        if (this.adapterConstructor) {
            server.adapter(this.adapterConstructor);
        }
        return server;
    }
}
