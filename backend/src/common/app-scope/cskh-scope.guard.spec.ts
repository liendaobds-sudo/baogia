import {
    CanActivate,
    Controller,
    ExecutionContext,
    Get,
    INestApplication,
    Injectable,
    UseGuards,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppScopeService } from './app-scope.service';
import { CskhScopeGuard } from './cskh-scope.guard';
import { TenantContextInterceptor } from '../tenant/tenant-context.interceptor';
import { TenantContextService } from '../tenant/tenant-context.service';

type TestUser = { id: string; role: string; tenantId: number | null };

let authenticatedUser: TestUser;

/** Auth guard giả gắn user trước khi CskhScopeGuard chạy, đúng thứ tự production. */
@Injectable()
class TestAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        context.switchToHttp().getRequest().user = authenticatedUser;
        return true;
    }
}

@Controller('test-cskh-scope')
@UseGuards(TestAuthGuard, CskhScopeGuard)
class TestCskhController {
    constructor(private readonly tenant: TenantContextService) {}

    @Get()
    getTenant() {
        return { tenantId: this.tenant.currentTenantId() };
    }
}

describe('CskhScopeGuard — Nest lifecycle fail-closed', () => {
    let app: INestApplication;
    let cskhEnabled: boolean;
    const appScope = {
        isCskhEnabledForTenant: jest.fn(async () => cskhEnabled),
    };

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [TestCskhController],
            providers: [
                TestAuthGuard,
                CskhScopeGuard,
                TenantContextService,
                { provide: AppScopeService, useValue: appScope },
                { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    beforeEach(() => {
        authenticatedUser = { id: 'u-7', role: 'admin', tenantId: 7 };
        cskhEnabled = true;
        appScope.isCskhEnabledForTenant.mockClear();
    });

    afterAll(async () => {
        await app?.close();
    });

    it('tenant bật CSKH → guard cho qua và interceptor nạp cùng tenant', async () => {
        await request(app.getHttpServer())
            .get('/test-cskh-scope')
            .expect(200)
            .expect({ tenantId: 7 });

        expect(appScope.isCskhEnabledForTenant).toHaveBeenCalledWith(7);
    });

    it('tenant tắt CSKH → HTTP 403', async () => {
        cskhEnabled = false;

        const response = await request(app.getHttpServer())
            .get('/test-cskh-scope')
            .expect(403);

        expect(response.body.message).toMatch(/CSKH không khả dụng/);
        expect(appScope.isCskhEnabledForTenant).toHaveBeenCalledWith(7);
    });

    it('user đã xác thực nhưng thiếu tenant → HTTP 403, không tra baseline', async () => {
        authenticatedUser = { id: 'u-missing', role: 'admin', tenantId: null };

        const response = await request(app.getHttpServer())
            .get('/test-cskh-scope')
            .expect(403);

        expect(response.body.message).toMatch(/Không xác định được đơn vị/);
        expect(appScope.isCskhEnabledForTenant).not.toHaveBeenCalled();
    });

    it('super_admin impersonate bằng x-tenant-id → guard và interceptor cùng dùng tenant đó', async () => {
        authenticatedUser = { id: 'sa-1', role: 'super_admin', tenantId: null };

        await request(app.getHttpServer())
            .get('/test-cskh-scope')
            .set('x-tenant-id', '23')
            .expect(200)
            .expect({ tenantId: 23 });

        expect(appScope.isCskhEnabledForTenant).toHaveBeenCalledWith(23);
    });

    it('header impersonation sai định dạng → fail-closed, không parse một phần', async () => {
        authenticatedUser = { id: 'sa-1', role: 'super_admin', tenantId: null };

        await request(app.getHttpServer())
            .get('/test-cskh-scope')
            .set('x-tenant-id', '23-khac')
            .expect(403);

        expect(appScope.isCskhEnabledForTenant).not.toHaveBeenCalled();
    });

    it('user thường không thể ghi đè tenant bằng x-tenant-id', async () => {
        await request(app.getHttpServer())
            .get('/test-cskh-scope')
            .set('x-tenant-id', '99')
            .expect(200)
            .expect({ tenantId: 7 });

        expect(appScope.isCskhEnabledForTenant).toHaveBeenCalledWith(7);
    });
});
