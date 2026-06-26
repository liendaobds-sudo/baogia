// Trigger backend restart 
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import helmet from 'helmet';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './modules/gateway/redis-io.adapter';
// REMOVED: createProxyMiddleware — PHP proxy no longer needed (Phase 6: decommissioned)
import * as cors from 'cors';

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        logger: ['error', 'warn', 'log'],
    });

    const configService = app.get(ConfigService);
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    // ─── CORS ────────────────────────────────
    const allowedOrigins = configService.get<string>('FRONTEND_URL', 'http://localhost:3000')
        .split(',')
        .map(s => s.trim());
    if (!isProduction) {
        allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost', 'http://localhost:8080');
    }
    // Use Express cors middleware directly so it runs before ALL other middleware
    app.use(cors({
        origin: allowedOrigins,
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

    // Serve uploaded files (chat images, etc.)
    app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
        prefix: '/uploads/',
    });

    app.useGlobalFilters(new AllExceptionsFilter());

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
