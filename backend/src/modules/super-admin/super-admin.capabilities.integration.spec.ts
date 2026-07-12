/**
 * Integration test — super-admin capability endpoints (Task 5.2).
 *
 * Feature: tenant-method-capability
 *
 * Phủ (Req 6.1, 6.2, 6.3):
 *  - GET  /super-admin/tenants/:id/capabilities → source 'inherited' khi kế thừa baseline,
 *    'explicit' khi tenant có hàng cấu hình riêng.
 *  - PUT  /super-admin/tenants/:id/capabilities/:methodId → toggle persist (materialize baseline).
 *  - Tắt phương pháp khả dụng CUỐI CÙNG → HTTP 409 (LastEnabledMethodError → Conflict).
 *
 * Dùng DB SQLite in-memory (better-sqlite3) thật cho method_capabilities; JWT/Roles guard
 * override để cô lập (giới hạn role đã có test riêng ở super-admin.controller.spec.ts).
 *
 * Validates: Requirements 6.1, 6.2, 6.3
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Repository } from 'typeorm';

import { MethodCapability } from '../../entities/method-capability.entity';
import { TenantAppScope } from '../../entities/tenant-app-scope.entity';
import { CapabilityService } from '../../quote/capability.service';
import { AppScopeService } from '../../common/app-scope/app-scope.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { AuditService } from '../audit/audit.service';
import { RolesGuard } from '../auth/roles.guard';

describe('SuperAdminController (integration) — capability endpoints', () => {
    let app: INestApplication;
    let repo: Repository<MethodCapability>;

    beforeAll(async () => {
        const moduleRef: TestingModule = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'better-sqlite3',
                    database: ':memory:',
                    dropSchema: true,
                    synchronize: true,
                    entities: [MethodCapability, TenantAppScope],
                }),
                TypeOrmModule.forFeature([MethodCapability, TenantAppScope]),
            ],
            controllers: [SuperAdminController],
            providers: [
                CapabilityService,
                AppScopeService,
                // SuperAdminService không dùng trong các route capability; stub cho DI.
                { provide: SuperAdminService, useValue: {} },
                // AuditService là @Global ở app thật; module test cô lập nên phải stub.
                { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
            ],
        })
            .overrideGuard(AuthGuard('jwt'))
            .useValue({ canActivate: () => true })
            .overrideGuard(RolesGuard)
            .useValue({ canActivate: () => true })
            .compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, transform: true }),
        );
        await app.init();

        repo = moduleRef.get<Repository<MethodCapability>>(
            getRepositoryToken(MethodCapability),
        );
    });

    afterAll(async () => {
        await app?.close();
    });

    beforeEach(async () => {
        await repo.clear();
        // Baseline (tenant_id NULL): bật cả hai — như migration.
        await repo.save([
            repo.create({ unitId: 'default', tenantId: null, methodId: 'digital', enabled: true }),
            repo.create({ unitId: 'default', tenantId: null, methodId: 'offset', enabled: true }),
        ]);
    });

    it('GET → tenant chưa cấu hình: source "inherited", kế thừa baseline (cả hai bật)', async () => {
        const res = await request(app.getHttpServer())
            .get('/super-admin/tenants/101/capabilities')
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.source).toBe('inherited');
        expect(new Set(res.body.data.enabledMethods)).toEqual(new Set(['digital', 'offset']));
        expect(res.body.data.flags).toEqual([]);
    });

    it('PUT → tắt offset cho tenant: persist (materialize) + source thành "explicit"', async () => {
        await request(app.getHttpServer())
            .put('/super-admin/tenants/101/capabilities/offset')
            .send({ enabled: false })
            .expect(200);

        const res = await request(app.getHttpServer())
            .get('/super-admin/tenants/101/capabilities')
            .expect(200);

        expect(res.body.data.source).toBe('explicit');
        expect(res.body.data.enabledMethods).toEqual(['digital']);
        expect(res.body.data.flags).toHaveLength(2);
    });

    it('PUT → tắt phương pháp khả dụng CUỐI CÙNG → HTTP 409', async () => {
        // Tắt offset trước (còn digital).
        await request(app.getHttpServer())
            .put('/super-admin/tenants/101/capabilities/offset')
            .send({ enabled: false })
            .expect(200);

        // Tắt digital (phương pháp cuối) → 409.
        const res = await request(app.getHttpServer())
            .put('/super-admin/tenants/101/capabilities/digital')
            .send({ enabled: false })
            .expect(409);
        expect(String(res.body.message)).toContain('digital');

        // Trạng thái không đổi: digital vẫn bật.
        const getRes = await request(app.getHttpServer())
            .get('/super-admin/tenants/101/capabilities')
            .expect(200);
        expect(getRes.body.data.enabledMethods).toEqual(['digital']);
    });

    it('tenant B KHÔNG bị ảnh hưởng bởi cấu hình tenant A', async () => {
        await request(app.getHttpServer())
            .put('/super-admin/tenants/101/capabilities/offset')
            .send({ enabled: false })
            .expect(200);

        const res = await request(app.getHttpServer())
            .get('/super-admin/tenants/202/capabilities')
            .expect(200);
        expect(res.body.data.source).toBe('inherited');
        expect(new Set(res.body.data.enabledMethods)).toEqual(new Set(['digital', 'offset']));
    });
});
