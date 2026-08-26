import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TenantSchemaMiddleware } from './modules/tenants/tenant-schema.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { QuoteModule } from './modules/quote/quote.module';
// Tầng method-agnostic (Cờ_Năng_Lực + registry + plugin).
import { QuoteCapabilityModule } from './quote/quote.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AuditModule } from './modules/audit/audit.module';
import { CannedResponseModule } from './modules/canned-responses/canned-response.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { NotesModule } from './modules/notes/notes.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { SearchModule } from './modules/search/search.module';
import { SmartNotificationsModule } from './modules/smart-notifications/smart-notifications.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ZaloPersonalModule } from './modules/zalo-personal/zalo-personal.module';
// PricingModule — calculator engine + ERP CRUD, reads/writes MySQL erp_print DB
import { Notification, Contact } from './entities';
import * as path from 'path';
import { loadAiConfigKeys } from './config/ai-config.loader';
import { PricingModule } from './modules/pricing/pricing.module';
import { TenantModule } from './modules/tenants/tenant.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './modules/redis/redis.module';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TenantContextModule } from './common/tenant/tenant-context.module';
import { AppScopeModule } from './common/app-scope/app-scope.module';
import { DataSource } from 'typeorm';
import { addTransactionalDataSource } from 'typeorm-transactional';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env', path.join(__dirname, '..', '..', '.env'), path.join(__dirname, '..', '..', '..', '.env')],
            load: [loadAiConfigKeys],
        }),
        EventEmitterModule.forRoot(),
        TenantContextModule,
        AppScopeModule,
        BullModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get('REDIS_HOST', 'localhost'),
                    port: config.get<number>('REDIS_PORT', 6379),
                    maxRetriesPerRequest: null, // Don't crash if Redis is down
                    lazyConnect: true,
                    // Retry vô hạn (trần 30s) — worker BullMQ tự hồi khi Redis quay lại,
                    // không chết vĩnh viễn sau 3 lần thử như bản cũ.
                    retryStrategy: (times: number) => Math.min(times * 500, 30_000),
                },
            }),
        }),
        // Rate limiting: cấu hình qua env (THROTTLE_LIMIT/THROTTLE_TTL). Default prod hợp lý
        // 1200 req/phút/IP (≈20 req/s) — đủ cho polling + thao tác, chặn lạm dụng.
        ThrottlerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => [{
                ttl: config.get<number>('THROTTLE_TTL', 60000),
                limit: config.get<number>('THROTTLE_LIMIT', 1200),
            }],
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const dbType = config.get<string>('DB_TYPE', 'sqlite');

                if (dbType === 'postgres') {
                    const host = config.get<string>('DB_HOST', 'localhost');
                    const port = config.get<number>('DB_PORT', 5432);
                    const database = config.get<string>('DB_DATABASE', 'zeplao_erp');
                    const isProduction = config.get<string>('NODE_ENV') === 'production';
                    const username = config.get<string>('DB_USERNAME');
                    const password = config.get<string>('DB_PASSWORD');
                    // Fail-fast ở production: KHÔNG cho phép default 'postgres/postgres' âm thầm.
                    // (Tương tự fail-fast JWT_SECRET trong jwt.strategy.ts.)
                    if (isProduction && (!username || !password)) {
                        throw new Error(
                            'DB_USERNAME và DB_PASSWORD là bắt buộc khi NODE_ENV=production. ' +
                            'Không khởi động với credential mặc định.',
                        );
                    }
                    console.log(`[DB:Default] 🐘 PostgreSQL → ${host}:${port}/${database} (schema: public)`);
                    return {
                        type: 'postgres' as const,
                        host, port,
                        username: username ?? 'postgres',
                        password: password ?? 'postgres',
                        database,
                        schema: 'public',
                        autoLoadEntities: true,
                        synchronize: false,
                        // ─── Pool & timeout (audit 2026-07-25) ───────────────────────────────
                        // Trước đây KHÔNG cấu hình gì ⇒ driver `pg` mặc định 10 connection,
                        // không statement_timeout, không connect timeout. Với polling 15s +
                        // vài query quét bảng, 10 slot rất dễ cạn và một query treo có thể
                        // giữ connection vô hạn (cạn pool → toàn app 500).
                        extra: {
                            max: config.get<number>('DB_POOL_MAX', 20),
                            idleTimeoutMillis: config.get<number>('DB_POOL_IDLE_MS', 30_000),
                            connectionTimeoutMillis: config.get<number>('DB_CONNECT_TIMEOUT_MS', 10_000),
                            // Chặn query chạy vô hạn ở tầng server (ms). Tăng nếu có báo cáo/ETL nặng.
                            statement_timeout: config.get<number>('DB_STATEMENT_TIMEOUT_MS', 30_000),
                        },
                        // Log cảnh báo query chậm để có đầu mối tối ưu (không đổi hành vi).
                        maxQueryExecutionTime: config.get<number>('DB_SLOW_QUERY_MS', 3_000),
                    };
                }

                console.log('[DB:Default] 📦 SQLite → _backup/zeplao-dev.sqlite');
                return {
                    type: 'sqlite' as const,
                    database: '_backup/zeplao-dev.sqlite',
                    autoLoadEntities: true,
                    synchronize: false,
                };
            },
            // Đăng ký DataSource với typeorm-transactional để runInTransaction (RLS)
            // gắn connection theo request cho mọi repository.
            dataSourceFactory: async (options) => {
                const ds = new DataSource(options!);
                await ds.initialize();
                return addTransactionalDataSource(ds);
            },
        }),
        ScheduleModule.forRoot(),
        RedisModule,
        AuthModule,
        UsersModule,
        TypeOrmModule.forFeature([Notification, Contact]),
        AuditModule,
        ChannelsModule,
        ConversationsModule,
        MessagesModule,
        SuggestionsModule,
        KnowledgeBaseModule,
        QuoteModule,
        QuoteCapabilityModule,
        DashboardModule,
        GatewayModule,
        CannedResponseModule,
        ReportsModule,
        ContactsModule,
        NotesModule,
        // ═══ ZaloCRM-Integrated Modules ═══
        AppointmentsModule,
        SearchModule,
        SmartNotificationsModule,
        WebhookModule,
        ZaloPersonalModule,
        PricingModule, // Pricing Phase 0 Migration
        // ═══ Multi-tenant SaaS ═══
        TenantModule,
        SuperAdminModule,
        RbacModule,
        HealthModule,
    ],
    providers: [
        // Global rate limiting guard
        { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
})
export class AppModule implements NestModule {
    configure(_consumer: MiddlewareConsumer) {
        // TenantSchemaMiddleware disabled — single schema 'public' after DB consolidation
        // Re-enable when multi-tenant is needed:
        // consumer.apply(TenantSchemaMiddleware).forRoutes('erp/*');
    }
}
