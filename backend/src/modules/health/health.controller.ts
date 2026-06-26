import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health Check Controller — public, no authentication required.
 * Used by Super Admin dashboard to verify system status.
 */
@Controller('health')
export class HealthController {
    constructor(@InjectDataSource() private dataSource: DataSource) {}

    @Get()
    async check() {
        let dbStatus = 'offline';
        try {
            await this.dataSource.query('SELECT 1');
            dbStatus = 'online';
        } catch {
            dbStatus = 'offline';
        }

        return {
            status: dbStatus === 'online' ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            services: {
                api: 'online',
                database: dbStatus,
            },
        };
    }
}
