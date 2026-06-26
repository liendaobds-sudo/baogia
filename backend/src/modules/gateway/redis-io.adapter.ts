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

        const pubClient = new Redis({
            host, port,
            maxRetriesPerRequest: null,
            lazyConnect: true,
            retryStrategy: (times: number) => times > 3 ? null : Math.min(times * 500, 2000),
        });
        pubClient.on('error', () => {});
        const subClient = pubClient.duplicate();
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
