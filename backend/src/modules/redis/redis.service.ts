import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Shared Redis client service.
 * Provides a single Redis connection reused across AuthService,
 * EventsGateway, and any future consumers.
 *
 * If Redis is unavailable, methods degrade gracefully:
 * - set/get/del return null/false
 * - isConnected returns false
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private readonly client: Redis;
    private _connected = false;

    constructor(private configService: ConfigService) {
        const host = this.configService.get('REDIS_HOST', 'localhost');
        const port = this.configService.get<number>('REDIS_PORT', 6379);

        this.client = new Redis({
            host,
            port,
            maxRetriesPerRequest: null,
            lazyConnect: true,
            retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2000)),
        });

        this.client.on('connect', () => {
            this._connected = true;
            this.logger.log(`✅ Redis connected (${host}:${port})`);
        });
        this.client.on('error', () => {
            this._connected = false;
        });
        this.client.on('close', () => {
            this._connected = false;
        });

        // Attempt lazy connection
        this.client.connect().catch(() => {
            this.logger.warn(`⚠️ Redis not available at ${host}:${port} — degraded mode`);
        });
    }

    onModuleDestroy() {
        this.client.quit().catch(() => {});
    }

    /** Whether Redis is currently connected */
    get isConnected(): boolean {
        return this._connected;
    }

    /** Get the raw ioredis client (for advanced usage like pub/sub) */
    getClient(): Redis {
        return this.client;
    }

    // ─── Common Operations ───

    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        try {
            if (ttlSeconds) {
                await this.client.set(key, value, 'EX', ttlSeconds);
            } else {
                await this.client.set(key, value);
            }
        } catch {
            this.logger.warn(`Redis SET failed for key: ${key}`);
        }
    }

    async get(key: string): Promise<string | null> {
        try {
            return await this.client.get(key);
        } catch {
            return null;
        }
    }

    async del(key: string): Promise<void> {
        try {
            await this.client.del(key);
        } catch {
            this.logger.warn(`Redis DEL failed for key: ${key}`);
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            return (await this.client.exists(key)) === 1;
        } catch {
            return false;
        }
    }

    /** SADD — add member to a set */
    async sadd(key: string, ...members: string[]): Promise<void> {
        try {
            await this.client.sadd(key, ...members);
        } catch {
            this.logger.warn(`Redis SADD failed for key: ${key}`);
        }
    }

    /** SREM — remove member from a set */
    async srem(key: string, ...members: string[]): Promise<void> {
        try {
            await this.client.srem(key, ...members);
        } catch {
            this.logger.warn(`Redis SREM failed for key: ${key}`);
        }
    }

    /** SMEMBERS — get all members of a set */
    async smembers(key: string): Promise<string[]> {
        try {
            return await this.client.smembers(key);
        } catch {
            return [];
        }
    }
}
