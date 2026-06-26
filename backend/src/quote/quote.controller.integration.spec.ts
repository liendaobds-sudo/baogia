/**
 * Integration test cho endpoint năng lực (Task 3.2).
 *
 * Feature: print-method-unification
 *
 * Kiểm thử end-to-end QuoteController qua tầng HTTP thật (NestJS app + supertest)
 * với DB SQLite in-memory (better-sqlite3) — không mock repository:
 *   - GET  /quote-tool/capabilities            → liệt kê cờ + tập Phương_Pháp_Khả_Dụng (happy path)
 *   - PUT  /quote-tool/capabilities/:methodId  → bật/tắt thành công (happy path)
 *   - PUT  tắt phương pháp khả dụng cuối cùng → HTTP 409 (LastEnabledMethodError → Conflict)
 *
 * AuthGuard('jwt') được override để cô lập kiểm thử với cơ chế xác thực.
 * ValidationPipe toàn cục được áp đúng như `main.ts` (whitelist + forbidNonWhitelisted + transform).
 *
 * Validates: Requirements 1.6, 1.8
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Repository } from 'typeorm';
import { MethodCapability } from '../entities/method-capability.entity';
import { CapabilityService } from './capability.service';
import { ComparatorService } from './comparator.service';
import { MethodRegistry } from './method-registry.service';
import { ProductsService } from '../modules/pricing/services/products.service';
import { QuoteController } from './quote.controller';
import { MethodPlugin } from './types/method-plugin.types';

/** Plugin tối thiểu chỉ để registry có entry; không tham gia tính giá trong test này. */
function fakePlugin(methodId: string): MethodPlugin {
    return {
        methodId,
        appliesTo: () => true,
        calculate: async () => ({
            ok: true,
            methodId,
            costSubtotal: 0,
            sellingSubtotal: 0,
            discountAmount: 0,
            priceBeforeVat: 0,
            pricePerItem: 0,
            breakdown: {},
        }),
    };
}

describe('QuoteController (integration) — endpoint năng lực', () => {
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
                    entities: [MethodCapability],
                }),
                TypeOrmModule.forFeature([MethodCapability]),
            ],
            controllers: [QuoteController],
            providers: [
                CapabilityService,
                MethodRegistry,
                // ComparatorService là dependency constructor của QuoteController
                // (thêm ở Task 11.1); cần cung cấp để DI phân giải dù endpoint năng lực
                // không dùng tới. Nó chỉ phụ thuộc MethodRegistry (đã có ở trên).
                ComparatorService,
                // Stub: các endpoint năng lực (GET/PUT capabilities) không dùng
                // ProductsService; chỉ cần thoả DI cho QuoteController.
                {
                    provide: ProductsService,
                    useValue: { getTemplateByCode: async () => null },
                },
            ],
        })
            // Cô lập với JWT — guard luôn cho qua (Req 1.8 tập trung vào validate input, không vào auth).
            .overrideGuard(AuthGuard('jwt'))
            .useValue({ canActivate: () => true })
            .compile();

        app = moduleRef.createNestApplication();
        // Mirror ValidationPipe toàn cục của main.ts.
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
            }),
        );
        await app.init();

        repo = moduleRef.get<Repository<MethodCapability>>(
            getRepositoryToken(MethodCapability),
        );

        // Đăng ký plugin để GET phản ánh registeredMethods (Req 2.1).
        const registry = moduleRef.get(MethodRegistry);
        registry.register(fakePlugin('digital'));
        registry.register(fakePlugin('offset'));
    });

    afterAll(async () => {
        await app?.close();
    });

    afterEach(async () => {
        // Dọn DB giữa các test để cô lập state.
        await repo.clear();
    });

    /** Seed: Đơn_Vị có đúng tập phương pháp đang bật được chỉ định. */
    async function seedEnabled(unitId: string, methodIds: string[]) {
        for (const methodId of methodIds) {
            await repo.save(repo.create({ unitId, methodId, enabled: true }));
        }
    }

    describe('GET /quote-tool/capabilities (happy path)', () => {
        it('trả về cờ, tập khả dụng và danh sách phương pháp đã đăng ký', async () => {
            await seedEnabled('unit-solo', ['digital']);

            const res = await request(app.getHttpServer())
                .get('/quote-tool/capabilities')
                .query({ unitId: 'unit-solo' })
                .expect(200);

            expect(res.body.unitId).toBe('unit-solo');
            expect(res.body.enabledMethods).toEqual(['digital']);
            expect(new Set(res.body.registeredMethods)).toEqual(
                new Set(['digital', 'offset']),
            );
            expect(res.body.flags).toEqual([
                expect.objectContaining({ methodId: 'digital', enabled: true }),
            ]);
        });

        it('Đơn_Vị 0-phương-pháp ⇒ enabledMethods rỗng', async () => {
            const res = await request(app.getHttpServer())
                .get('/quote-tool/capabilities')
                .query({ unitId: 'unit-empty' })
                .expect(200);

            expect(res.body.enabledMethods).toEqual([]);
            expect(res.body.flags).toEqual([]);
        });
    });

    describe('PUT /quote-tool/capabilities/:methodId (toggle thành công)', () => {
        it('bật một phương pháp mới ⇒ 200 và xuất hiện trong tập khả dụng', async () => {
            await seedEnabled('unit-grow', ['digital']);

            const putRes = await request(app.getHttpServer())
                .put('/quote-tool/capabilities/offset')
                .send({ enabled: true, unitId: 'unit-grow' })
                .expect(200);

            expect(putRes.body).toEqual(
                expect.objectContaining({
                    unitId: 'unit-grow',
                    methodId: 'offset',
                    enabled: true,
                }),
            );

            const getRes = await request(app.getHttpServer())
                .get('/quote-tool/capabilities')
                .query({ unitId: 'unit-grow' })
                .expect(200);
            expect(new Set(getRes.body.enabledMethods)).toEqual(
                new Set(['digital', 'offset']),
            );
        });

        it('tắt một phương pháp khi còn phương pháp khác ⇒ 200 và bị loại khỏi tập khả dụng', async () => {
            await seedEnabled('unit-both', ['digital', 'offset']);

            await request(app.getHttpServer())
                .put('/quote-tool/capabilities/offset')
                .send({ enabled: false, unitId: 'unit-both' })
                .expect(200);

            const getRes = await request(app.getHttpServer())
                .get('/quote-tool/capabilities')
                .query({ unitId: 'unit-both' })
                .expect(200);
            expect(getRes.body.enabledMethods).toEqual(['digital']);
        });
    });

    describe('PUT /quote-tool/capabilities/:methodId (ràng buộc phương pháp cuối — Req 1.6)', () => {
        it('tắt phương pháp khả dụng CUỐI CÙNG ⇒ HTTP 409 và tập khả dụng không đổi', async () => {
            await seedEnabled('unit-last', ['digital']);

            const res = await request(app.getHttpServer())
                .put('/quote-tool/capabilities/digital')
                .send({ enabled: false, unitId: 'unit-last' })
                .expect(409);

            expect(res.body.statusCode).toBe(409);
            expect(String(res.body.message)).toContain('digital');

            // Trạng thái không đổi: digital vẫn khả dụng.
            const getRes = await request(app.getHttpServer())
                .get('/quote-tool/capabilities')
                .query({ unitId: 'unit-last' })
                .expect(200);
            expect(getRes.body.enabledMethods).toEqual(['digital']);
        });
    });

    describe('PUT /quote-tool/capabilities/:methodId (validate input — Req 1.8)', () => {
        it('thiếu trường bắt buộc `enabled` ⇒ HTTP 400', async () => {
            await request(app.getHttpServer())
                .put('/quote-tool/capabilities/digital')
                .send({ unitId: 'unit-x' })
                .expect(400);
        });
    });
});
