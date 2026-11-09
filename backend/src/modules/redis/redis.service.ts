import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface SessionRevocation {
    jti?: string;
    sessionId?: string;
}

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
    private static readonly SESSION_REVOKED_CHANNEL = 'security:session-revoked';
    private readonly logger = new Logger(RedisService.name);
    private readonly client: Redis;
    private readonly subscriber: Redis;
    private readonly sessionRevokedHandlers = new Set<(revocation: SessionRevocation) => void>();
    private _connected = false;
    private destroyed = false;

    constructor(private configService: ConfigService) {
        const host = this.configService.get('REDIS_HOST', 'localhost');
        const port = this.configService.get<number>('REDIS_PORT', 6379);
        const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

        const options = {
            host,
            port,
            maxRetriesPerRequest: null,
            lazyConnect: true,
            // Production: retry VÔ HẠN với backoff trần 30s (bản cũ bỏ cuộc sau 3 lần ~6s:
            // Redis chớp nhoáng >6s là client chết vĩnh viễn, kết hợp JWT blacklist
            // fail-closed ⇒ production tự khóa 401 toàn bộ cho tới khi restart tay).
            // Dev: dừng sau 3 lần nếu máy dev không bật Redis để tránh spam ECONNREFUSED.
            retryStrategy: (times: number) => {
                if (!isProduction && times > 3) return null;
                return Math.min(times * 500, 30_000);
            },
        } as const;
        // enableOfflineQueue: false trên command client để khi Redis chưa sẵn sàng hoặc đang
        // reconnect, các lệnh existsStrict/get/set reject ngay lập tức (0ms) thay vì xếp hàng
        // chờ vô hạn trong offlineQueue làm treo mọi HTTP request qua JwtAuthGuard.
        this.client = new Redis({ ...options, enableOfflineQueue: false });
        // Pub/sub cần connection riêng; connection đã SUBSCRIBE không được dùng cho
        // lệnh blacklist/cache thông thường.
        this.subscriber = new Redis({ ...options, lazyConnect: false });

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

        this.subscriber.on('ready', () => {
            if (this.destroyed) return;
            this.subscriber.subscribe(RedisService.SESSION_REVOKED_CHANNEL).catch((error) => {
                this.logger.error(`Redis subscribe session revoke failed (${error instanceof Error ? error.name : 'unknown'})`);
            });
        });
        this.subscriber.on('message', (channel, message) => {
            if (!this.destroyed && channel === RedisService.SESSION_REVOKED_CHANNEL) {
                try {
                    const revocation = this.parseSessionRevocation(message);
                    if (!revocation) throw new Error('invalid revocation');
                    this.dispatchSessionRevoked(revocation);
                } catch {
                    this.logger.warn('Bỏ qua session revoke payload không hợp lệ');
                }
            }
        });
        this.subscriber.on('error', () => {
            // ioredis tự reconnect; handshake/revoke vẫn dùng strict methods ở client chính.
        });

        // Attempt lazy connection
        this.client.connect().catch(() => {
            this.logger.warn(`⚠️ Redis not available at ${host}:${port} — degraded mode`);
        });
    }

    async onModuleDestroy(): Promise<void> {
        this.destroyed = true;
        this.sessionRevokedHandlers.clear();
        await Promise.allSettled([
            this.client.quit(),
            this.subscriber.quit(),
        ]);
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

    // ─── Security-critical operations ──────────────────────────────────────
    // Các hàm common phía trên cố ý degrade gracefully cho cache/realtime. Auth
    // KHÔNG được dùng chúng vì nuốt lỗi sẽ biến revoke/rotation thành fail-open.

    async setStrict(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
            await this.client.set(key, value);
        }
    }

    async existsStrict(key: string): Promise<boolean> {
        return (await this.client.exists(key)) === 1;
    }

    /**
     * Atomic consume/claim: true chỉ cho caller đầu tiên của key. Dùng cho refresh
     * rotation để loại race check-then-set khi hai request dùng cùng một JTI.
     */
    async claimOnceStrict(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }

    /** Đăng ký listener cục bộ; Redis subscriber fan-out cùng JTI tới mọi replica. */
    onSessionRevoked(handler: (revocation: SessionRevocation) => void): () => void {
        this.sessionRevokedHandlers.add(handler);
        return () => this.sessionRevokedHandlers.delete(handler);
    }

    /** Publish strict: logout không báo thành công nếu fan-out revoke không ghi được. */
    async publishSessionRevokedStrict(jti?: string, sessionId?: string): Promise<void> {
        if (!jti && !sessionId) throw new Error('JTI or session ID is required for revocation');
        const revocation: SessionRevocation = {
            ...(jti ? { jti } : {}),
            ...(sessionId ? { sessionId } : {}),
        };
        // Ngắt socket trong replica hiện tại ngay, không chờ Redis round-trip.
        this.dispatchSessionRevoked(revocation);
        await this.client.publish(
            RedisService.SESSION_REVOKED_CHANNEL,
            JSON.stringify(revocation),
        );
    }

    private dispatchSessionRevoked(revocation: SessionRevocation): void {
        if (!revocation.jti && !revocation.sessionId) return;
        for (const handler of this.sessionRevokedHandlers) {
            try { handler(revocation); } catch (error) {
                this.logger.error(`Session revoke handler failed: ${error instanceof Error ? error.message : error}`);
            }
        }
    }

    private parseSessionRevocation(message: string): SessionRevocation | null {
        const parsed: unknown = JSON.parse(message);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const candidate = parsed as Record<string, unknown>;
        const jti = typeof candidate.jti === 'string' && candidate.jti.trim()
            ? candidate.jti.trim()
            : undefined;
        const sessionId = typeof candidate.sessionId === 'string' && candidate.sessionId.trim()
            ? candidate.sessionId.trim()
            : undefined;
        if (!jti && !sessionId) return null;
        return { ...(jti ? { jti } : {}), ...(sessionId ? { sessionId } : {}) };
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
