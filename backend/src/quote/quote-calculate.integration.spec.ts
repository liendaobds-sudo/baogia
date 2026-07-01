/**
 * Integration test cho `POST /quote-tool/calculate` (Task 7.5).
 *
 * Feature: print-method-unification
 *
 * Mục tiêu (Req 4.6, 6.1, 9.3, 9.4): kiểm thử wiring END-TO-END của Cổng_Tạo_Báo_Giá
 * hợp nhất qua tầng HTTP thật (NestJS app + supertest), KHÔNG mock MethodRegistry/plugin:
 *
 *   QuoteController → CapabilityService (chặn phương pháp không khả dụng)
 *                   → MethodRegistry → plugin THẬT → engine THẬT
 *                     · DigitalMethodPlugin → PricingFacadeService (real math)
 *                     · OffsetMethodPlugin  → EngineOffsetService (dữ liệu offset đóng gói)
 *
 * Khẳng định:
 *  - `POST /quote-tool/calculate` (digital): định tuyến tới DigitalMethodPlugin bọc facade thật,
 *    trả về Giá (`ok:true`, `priceBeforeVat > 0`) cho phương pháp ĐƯỢC BẬT + ÁP DỤNG ĐƯỢC.
 *  - `POST /quote-tool/calculate` (offset): định tuyến tới OffsetMethodPlugin bọc engine thật;
 *    `priceBeforeVat` khớp ĐÚNG `tongChuaVAT` engine tính trực tiếp (bảo toàn giá — Req 6.1).
 *  - Phương pháp KHÔNG khả dụng cho Đơn_Vị ⇒ bị chặn (HTTP 403) TRƯỚC khi gọi plugin (Req 4.7).
 *  - Endpoint cũ `POST /pricing/calculate` (digital) vẫn hoạt động (Req 9.3, 9.4).
 *  - Endpoint cũ `POST /pricing/offset/calculate` (offset) vẫn hoạt động (Req 9.3, 9.4).
 *
 * Ghi chú về "DB seed" cho digital: engine digital (PricingFacadeService + PricingService)
 * đọc master-data (giấy/khổ/bậc giá/gia công/cấu hình) qua repository. Theo mẫu đã thiết lập
 * trong `modules/pricing/tests/pricing-flow.spec.ts`, ta nạp một bộ master-data MẪU nhất quán
 * qua repository giả lập rồi để engine THẬT chạy đủ chuỗi layout → hao hụt → bậc giá → gia công
 * → giá vốn → markup. Cách này dùng engine thật (không thay số học) với seed tối thiểu, vì dựng
 * toàn bộ lược đồ DB digital cho một phép tính là không cần thiết. Cờ_Năng_Lực dùng DB SQLite
 * in-memory (better-sqlite3) thật cho `method_capabilities`.
 *
 * Engine offset (`EngineOffsetService`) chạy trên dữ liệu giá đóng gói (`loadDefaultPricingData`),
 * nên một phép tính offset THẬT khả thi trong sandbox mà không cần seed DB riêng.
 *
 * Validates: Requirements 4.6, 6.1, 9.3, 9.4
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
import { DigitalMethodPlugin } from './plugins/digital-method.plugin';
import { OffsetMethodPlugin } from './plugins/offset-method.plugin';
import { QuoteController } from './quote.controller';

import { PricingService } from '../modules/pricing/pricing.service';
import { PricingFacadeService } from '../modules/pricing/services/pricing-facade.service';
import { ProductsService } from '../modules/pricing/services/products.service';
import { PricingController } from '../modules/pricing/pricing.controller';
import { OffsetController } from '../modules/pricing/controllers/offset.controller';
import { OffsetMasterDataService } from '../modules/pricing/services/offset-master-data.service';
import { ConfigStore } from '../modules/pricing/offset-engine/config-store.service';
import { EngineOffsetService } from '../modules/pricing/offset-engine/engine-offset.service';
import { loadDefaultPricingData } from '../modules/pricing/offset-engine/default-data';

// ──────────────────────────────────────────────────────────────────────────
// SAMPLE MASTER DATA (digital) — nhất quán nội bộ, mượn từ pricing-flow.spec.ts.
// Cho phép engine digital THẬT chạy đủ chuỗi tính giá với seed tối thiểu.
// ──────────────────────────────────────────────────────────────────────────
const SAMPLE = {
    // Khổ giấy SRA3: 450×320mm, lề 10mm mỗi cạnh → vùng in 430×300mm.
    paperSize: { id: 1, widthMm: 450, heightMm: 320, marginLeft: 10, marginRight: 10, marginTop: 10, marginBottom: 10 },
    tierPricePerSheet: 1000,
    material: { id: 10, pricePerSqm: 50000, chargeFullWidth: false, rollWidth: null, minChargeArea: 0 },
    processingOption: { id: 5, name: 'Cán màng', price: '100', priceType: 'per_sheet' },
    config: { vat_rate: '8' },
};

/** Dựng PricingFacadeService THẬT với master-data mẫu (theo mẫu pricing-flow.spec.ts). */
function buildDigitalEngine(): { facade: PricingFacadeService; pricing: PricingService } {
    const managerQuery = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('pricing_config')) {
            return Promise.resolve([{ config_key: 'vat_rate', config_value: SAMPLE.config.vat_rate }]);
        }
        if (sql.includes('processing_options')) {
            return Promise.resolve([SAMPLE.processingOption]);
        }
        return Promise.resolve([]);
    });

    const tierRepo: any = {
        findOne: jest.fn().mockResolvedValue({ pricePerSheet: SAMPLE.tierPricePerSheet }),
        manager: { query: managerQuery },
    };
    const materialRepo: any = {
        findOne: jest.fn().mockResolvedValue(SAMPLE.material),
        manager: { query: managerQuery },
    };
    const paperSizeRepo: any = {
        findOne: jest.fn().mockResolvedValue(SAMPLE.paperSize),
        find: jest.fn().mockResolvedValue([SAMPLE.paperSize]),
    };
    const emptyRepo: any = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
    const boundCalc: any = { calculate: jest.fn() };

    const pricing = new PricingService(tierRepo, materialRepo);
    const facade = new PricingFacadeService(
        pricing, materialRepo, paperSizeRepo, emptyRepo, emptyRepo, emptyRepo, emptyRepo, boundCalc,
    );
    return { facade, pricing };
}

// ──────────────────────────────────────────────────────────────────────────
// Catalog sản phẩm (method-agnostic) — stub ProductsService.getTemplateByCode.
// Mỗi mã trỏ tới một quoteType: digital (loose) và offset (to_roi).
// ──────────────────────────────────────────────────────────────────────────
const PRODUCT_CATALOG: Record<string, { code: string; quoteType: string }> = {
    'card-digital': { code: 'card-digital', quoteType: 'loose' },
    'flyer-offset': { code: 'flyer-offset', quoteType: 'to_roi' },
};

/** Engine offset độc lập để tính giá kỳ vọng (cùng dữ liệu đóng gói với engine trong app). */
const D = loadDefaultPricingData();

/** Input offset golden (to_roi) — giá trị thật từ dữ liệu đóng gói. */
function goldenToRoiInput() {
    return {
        type: 'to_roi',
        kichThuoc: D.fixedSizes.toRoi[0].kichThuoc,
        materialCode: D.materials[0].code,
        soMatIn: 2,
        soLuong: 5000,
        kemType: 'Kẽm lớn',
        soKemIn: 4,
        vatTuBeMat: 'Màng bóng 2m',
        khuon: true,
        be: true,
        thanhPhamGap: 'may',
        catXen: true,
        dongGoi: true,
        thietKe: 0,
    };
}

/** Spec method-agnostic cho /quote-tool/calculate offset: mọi tham số (trừ số lượng) vào attributes. */
function toRoiQuoteSpec() {
    const { soLuong, ...rest } = goldenToRoiInput();
    return { quantity: soLuong, attributes: { ...rest } };
}

describe('QuoteController (integration) — POST /quote-tool/calculate end-to-end', () => {
    let app: INestApplication;
    let repo: Repository<MethodCapability>;

    beforeAll(async () => {
        const { facade, pricing } = buildDigitalEngine();

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
            controllers: [QuoteController, PricingController, OffsetController],
            providers: [
                CapabilityService,
                MethodRegistry,
                ComparatorService,
                // Plugin THẬT — tự đăng ký vào MethodRegistry qua OnModuleInit.
                DigitalMethodPlugin,
                OffsetMethodPlugin,
                // Engine offset THẬT (dữ liệu đóng gói; không ConfigStore ⇒ dùng default JSON).
                { provide: EngineOffsetService, useValue: new EngineOffsetService() },
                // Engine digital THẬT (master-data mẫu qua repo giả lập).
                { provide: PricingFacadeService, useValue: facade },
                { provide: PricingService, useValue: pricing },
                // Phân giải productCode → ProductRef từ catalog hợp nhất.
                {
                    provide: ProductsService,
                    useValue: {
                        getTemplateByCode: async (code: string) => PRODUCT_CATALOG[code] ?? null,
                    },
                },
                // Phụ thuộc constructor của OffsetController (không dùng ở route calculate).
                { provide: OffsetMasterDataService, useValue: {} },
                { provide: ConfigStore, useValue: {} },
            ],
        })
            // Cô lập với JWT — guard luôn cho qua (test tập trung vào wiring tính giá).
            .overrideGuard(AuthGuard('jwt'))
            .useValue({ canActivate: () => true })
            .compile();

        // Kích hoạt OnModuleInit để plugin tự đăng ký vào registry.
        app = moduleRef.createNestApplication();
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
    });

    afterAll(async () => {
        await app?.close();
    });

    afterEach(async () => {
        await repo.clear();
    });

    /** Seed: Đơn_Vị có đúng tập phương pháp đang bật được chỉ định. */
    async function seedEnabled(unitId: string, methodIds: string[]) {
        for (const methodId of methodIds) {
            await repo.save(repo.create({ unitId, methodId, enabled: true }));
        }
    }

    // ── Wiring digital end-to-end ──────────────────────────────────────────
    it('định tuyến digital qua MethodRegistry → DigitalMethodPlugin → facade THẬT, trả Giá', async () => {
        await seedEnabled('unit-both', ['digital', 'offset']);

        const res = await request(app.getHttpServer())
            .post('/quote-tool/calculate')
            .send({
                methodId: 'digital',
                productCode: 'card-digital',
                unitId: 'unit-both',
                config: { discountRate: 0 },
                spec: {
                    quantity: 1000,
                    dimensions: { width: 90, height: 54 },
                    materialCode: '10',
                    paperSizeCode: '1',
                    processing: [{ code: '5', side: 'single' }],
                    attributes: {
                        print_side: 'double',
                        print_type: '4c',
                        print_method: 'digital',
                        shape: 'rectangle',
                        gap_h: 2,
                        gap_v: 2,
                    },
                },
            })
            .expect(201);

        expect(res.body.ok).toBe(true);
        expect(res.body.methodId).toBe('digital');
        // Giá được trả về (engine thật: selling_subtotal 79.200, chiết khấu 0 ⇒ priceBeforeVat 79.200).
        expect(res.body.priceBeforeVat).toBe(79200);
        expect(res.body.sellingSubtotal).toBe(79200);
        expect(res.body.costSubtotal).toBe(52800);
        expect(res.body.priceBeforeVat).toBeGreaterThan(0);
    });

    // ── Wiring offset end-to-end + bảo toàn giá ────────────────────────────
    it('định tuyến offset qua MethodRegistry → OffsetMethodPlugin → engine THẬT, bảo toàn giá', async () => {
        await seedEnabled('unit-both', ['digital', 'offset']);

        // Giá kỳ vọng: engine offset độc lập tính trực tiếp (cùng dữ liệu đóng gói).
        const direct = new EngineOffsetService().calculate(goldenToRoiInput() as any);
        expect(direct.success).toBe(true);

        const res = await request(app.getHttpServer())
            .post('/quote-tool/calculate')
            .send({
                methodId: 'offset',
                productCode: 'flyer-offset',
                unitId: 'unit-both',
                spec: toRoiQuoteSpec(),
            })
            .expect(201);

        expect(res.body.ok).toBe(true);
        expect(res.body.methodId).toBe('offset');
        // Bảo toàn giá: priceBeforeVat (qua plugin) === tongChuaVAT (engine trực tiếp) — Req 6.1.
        expect(res.body.priceBeforeVat).toBe(direct.data!.tongChuaVAT);
        expect(res.body.priceBeforeVat).toBeGreaterThan(0);
    });

    // ── Chặn phương pháp không khả dụng (Req 4.7) ──────────────────────────
    it('phương pháp KHÔNG khả dụng cho Đơn_Vị ⇒ HTTP 403 (chặn trước khi gọi plugin)', async () => {
        // Đơn_Vị chỉ bật digital; gọi offset phải bị chặn.
        await seedEnabled('unit-digital-only', ['digital']);

        await request(app.getHttpServer())
            .post('/quote-tool/calculate')
            .send({
                methodId: 'offset',
                productCode: 'flyer-offset',
                unitId: 'unit-digital-only',
                spec: toRoiQuoteSpec(),
            })
            .expect(403);
    });

    // ── Endpoint cũ vẫn hoạt động (Req 9.3, 9.4) ───────────────────────────
    describe('luồng báo giá cũ vẫn hoạt động (Req 9.3, 9.4)', () => {
        // Enforcement /pricing/* dùng resolveEnabledMethods() (theo tenant); không có
        // tenant context → phân giải BASELINE (tenant_id NULL). Seed baseline bật cả hai
        // như migration Pha B để các luồng cũ không bị chặn 403.
        beforeEach(async () => {
            await repo.save([
                repo.create({ unitId: 'default', tenantId: null, methodId: 'digital', enabled: true }),
                repo.create({ unitId: 'default', tenantId: null, methodId: 'offset', enabled: true }),
            ]);
        });

        it('POST /pricing/calculate (digital) trả grand_total qua facade THẬT', async () => {
            const res = await request(app.getHttpServer())
                .post('/pricing/calculate')
                .send({
                    type: 'loose',
                    material_id: 10,
                    paper_size_id: 1,
                    quantity: 1000,
                    item_width: 90,
                    item_height: 54,
                    print_side: 'double',
                    print_type: '4c',
                    print_method: 'digital',
                    shape: 'rectangle',
                    gap_h: 2,
                    gap_v: 2,
                    processing: [{ id: 5, code: 'foo', side: 'single' }],
                })
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.selling_subtotal).toBe(79200);
            expect(res.body.data.grand_total).toBeGreaterThan(res.body.data.total);
        });

        it('POST /pricing/offset/calculate (offset) trả tongChuaVAT qua engine THẬT', async () => {
            const expected = new EngineOffsetService().calculate(goldenToRoiInput() as any);

            const res = await request(app.getHttpServer())
                .post('/pricing/offset/calculate')
                .send(goldenToRoiInput())
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.tongChuaVAT).toBe(expected.data!.tongChuaVAT);
            expect(res.body.data.tongChuaVAT).toBeGreaterThan(0);
        });
    });
});
