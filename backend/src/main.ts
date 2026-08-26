// Trigger backend restart 
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import helmet from 'helmet';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './modules/gateway/redis-io.adapter';
// REMOVED: createProxyMiddleware — PHP proxy no longer needed (Phase 6: decommissioned)
import * as cors from 'cors';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { tenantRlsEnabled } from './common/tenant/tenant-background';
import {
    assertRlsPreflight,
    evaluateRlsPreflight,
    inspectRlsCatalog,
    requirePostgresForRls,
    RlsCatalogRow,
    TENANT_RLS_MANIFEST,
    TENANT_RLS_TABLES,
} from './common/tenant/rls-preflight';

/**
 * Tiền kiểm ba lớp cô lập tenant (Req 7.3/7.4/7.5).
 *
 * Đọc trạng thái THẬT từ Postgres (`pg_roles`, `pg_policies`) rồi giao cho hàm thuần
 * `evaluateRlsPreflight` quyết định. Quy ước:
 *  - `fatal` ⇒ ném lỗi ⇒ bootstrap dừng, KHÔNG mở cổng HTTP (không phục vụ trong trạng thái cô lập ảo).
 *  - `error` ⇒ log mức error mỗi lần boot (cờ bật nhưng Pha B chưa áp).
 *  - Lỗi truy vấn tiền kiểm khi cờ BẬT ⇒ fail-closed (coi như fatal): không biết có cô lập hay không
 *    thì không được chạy. Khi cờ TẮT thì chỉ cảnh báo để không phá môi trường dev.
 */
async function runRlsPreflight(app: NestExpressApplication, configService: ConfigService): Promise<void> {
    const logger = new Logger('RlsPreflight');
    const flagOn = tenantRlsEnabled();

    // DB dev khác PostgreSQL chỉ được bỏ qua khi flag tắt; bật nhầm phải fail-closed.
    if (!requirePostgresForRls(flagOn, configService.get<string>('DB_TYPE'))) return;

    let isSuperuser = false;
    let canBypassRls = false;
    let catalogIssues: string[] = [];

    try {
        const dataSource = app.get<DataSource>(getDataSourceToken());
        const [role] = await dataSource.query(
            'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
        );
        isSuperuser = role?.rolsuper === true;
        canBypassRls = role?.rolbypassrls === true;

        const catalogRows: RlsCatalogRow[] = await dataSource.query(
            `WITH expected AS (
                SELECT table_name, ord
                FROM unnest($1::text[]) WITH ORDINALITY AS e(table_name, ord)
             )
             SELECT
                e.table_name,
                (c.oid IS NOT NULL) AS table_exists,
                COALESCE(c.relrowsecurity, false) AS rls_enabled,
                COALESCE(c.relforcerowsecurity, false) AS rls_forced,
                COALESCE(a.attnotnull, false) AS tenant_not_null,
                EXISTS (
                    SELECT 1 FROM pg_trigger t
                    WHERE t.tgrelid = c.oid
                      AND NOT t.tgisinternal
                      AND t.tgname = 'trg_set_tenant'
                ) AS has_tenant_trigger,
                ARRAY(
                    SELECT p.policyname
                    FROM pg_policies p
                    WHERE p.schemaname = $2 AND p.tablename = e.table_name
                    ORDER BY p.policyname
                ) AS policy_names
             FROM expected e
             LEFT JOIN pg_namespace n ON n.nspname = $2
             LEFT JOIN pg_class c
               ON c.relnamespace = n.oid
              AND c.relname = e.table_name
              AND c.relkind IN ('r', 'p')
             LEFT JOIN pg_attribute a
               ON a.attrelid = c.oid
              AND a.attname = 'tenant_id'
              AND NOT a.attisdropped
             ORDER BY e.ord`,
            [[...TENANT_RLS_TABLES], TENANT_RLS_MANIFEST.schema],
        );
        catalogIssues = inspectRlsCatalog(catalogRows);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (flagOn) {
            // Fail-closed: cờ bật mà không xác minh được tiền đề ⇒ dừng.
            throw new Error(
                `[RLS preflight] Không kiểm được tiền đề cô lập tenant (${message}). ` +
                'TENANT_RLS_ENABLED=true nên TỪ CHỐI khởi động thay vì chạy trong trạng thái không xác định.',
            );
        }
        logger.warn(`[RLS preflight] Bỏ qua tiền kiểm (cờ đang tắt): ${message}`);
        return;
    }

    assertRlsPreflight(
        evaluateRlsPreflight({ flagOn, isSuperuser, canBypassRls, catalogIssues }),
        { log: (m) => logger.log(m), error: (m) => logger.error(m) },
    );
}

async function bootstrap() {
    // Khởi tạo CLS context cho typeorm-transactional TRƯỚC khi tạo app —
    // để runInTransaction (RLS) gắn connection theo request cho mọi repo.
    initializeTransactionalContext();

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        logger: ['error', 'warn', 'log'],
        // Giữ raw body (req.rawBody) cho verify chữ ký webhook: HMAC phải tính trên
        // BYTES GỐC Facebook/Zalo gửi — JSON.stringify(body đã parse) có thể lệch byte
        // (thứ tự key/unicode escape) làm chữ ký hợp lệ bị từ chối ở production.
        rawBody: true,
    });

    const configService = app.get(ConfigService);
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    // ─── CORS ────────────────────────────────
    const allowedOrigins = configService.get<string>('FRONTEND_URL', 'http://localhost:3000')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    if (!isProduction) {
        allowedOrigins.push(
            'http://localhost:3000', 'http://127.0.0.1:3000',
            'http://localhost:3001', 'http://localhost:3002',
            'http://127.0.0.1:3002', 'http://localhost', 'http://localhost:8080',
        );
    }
    // Dev: allow LAN origins (Next prints Network: http://192.168.x.x:3002). Without this,
    // browser fetch to :4000 fails with TypeError: Failed to fetch (CORS), not a JSON 4xx.
    const isPrivateLanOrigin = (origin: string) =>
        /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(origin);

    app.use(cors({
        origin: (origin, callback) => {
            // Same-origin / curl / server-to-server (no Origin header)
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            if (!isProduction && isPrivateLanOrigin(origin)) return callback(null, true);
            return callback(new Error(`CORS blocked origin: ${origin}`), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Tenant-ID'],
    }));

    // ─── PHP Proxy REMOVED ──────────────────────────────────────
    // All pricing routes are now handled natively by NestJS PricingModule.
    // No separate service needed. XAMPP/Apache fully decommissioned.

    app.setGlobalPrefix('api/v1');

    const redisIoAdapter = new RedisIoAdapter(app);
    try {
        await redisIoAdapter.connectToRedis(configService);
        app.useWebSocketAdapter(redisIoAdapter);
    } catch (e) {
        Logger.warn('Redis not available — WebSocket will use in-memory adapter. Chat features may be limited.', 'Bootstrap');
    }

    // Zalo Personal module enabled
    Logger.log('ZeplaoPrint backend starting with Zalo Personal enabled...', 'Bootstrap');

    // Security headers
    app.use(helmet({
        contentSecurityPolicy: isProduction ? undefined : false, // disable CSP in dev for Swagger
        crossOriginResourcePolicy: { policy: "cross-origin" },
    }));

    // Uploads: only under authenticated API media routes in production.
    // Dev keeps static /uploads for local image previews; prod must not expose the tree anonymously.
    if (!isProduction) {
        app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
            prefix: '/uploads/',
        });
    }

    app.useGlobalFilters(new AllExceptionsFilter());

    // Graceful shutdown: BẮT BUỘC để Nest gọi onModuleDestroy/beforeApplicationShutdown khi
    // nhận SIGTERM/SIGINT (deploy, pm2 restart, docker stop). Không bật thì:
    //   • RedisService.onModuleDestroy không chạy → connection treo
    //   • BullMQ worker không close → job đang chạy bị cắt giữa, không retry sạch
    //   • các setInterval (zalo unread polling, cache cleanup) không được clear
    app.enableShutdownHooks();

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // Swagger API Documentation — only in development
    if (!isProduction) {
        const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
        const swaggerConfig = new DocumentBuilder()
            .setTitle('ZeplaoPrint API')
            .setDescription('ZeplaoPrint AI Agent Assist — REST API Documentation')
            .setVersion('1.0')
            .addBearerAuth()
            .addTag('auth', 'Authentication')
            .addTag('conversations', 'Conversation management')
            .addTag('messages', 'Message handling')
            .addTag('contacts', 'Customer contacts')
            .addTag('quote', 'Quote integration with Pricing')
            .addTag('dashboard', 'Analytics & statistics')
            .build();
        const document = SwaggerModule.createDocument(app, swaggerConfig);
        SwaggerModule.setup('api/v1/docs', app, document);
    }

    // Health check endpoint (for Nginx, PM2, monitoring)
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.get('/health', (_req: any, res: any) => {
        res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
    });

    // ─── Cổng tiền kiểm cô lập tenant (spec tenant-data-isolation, Req 7) ───────────────
    // Phải chạy TRƯỚC app.listen(): nếu ba lớp bật RLS đang LỆCH (bật cờ nhưng nối DB bằng
    // superuser) thì cô lập là ẢO, và ta không được phục vụ bất kỳ request nào trong trạng thái đó.
    await runRlsPreflight(app, configService);

    const port = configService.get<number>('PORT', 4000);
    await app.listen(port);
    const logger = new Logger('Bootstrap');
    logger.log(`🚀 ZeplaoPrint API running on http://localhost:${port}/api/v1`);
    logger.log(`🔒 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    if (!isProduction) {
        logger.log(`📚 Swagger docs at http://localhost:${port}/api/v1/docs`);
    }
}
bootstrap();
