/**
 * Integration test cho `POST /quote-tool/compare` (Task 11.3).
 *
 * Feature: print-method-unification
 *
 * Mục tiêu (Req 5.1, 8.4): kiểm thử wiring END-TO-END của Bộ_So_Sánh_Giá đa Phương_Pháp_In
 * qua tầng HTTP thật (NestJS app + supertest), KHÔNG mock MethodRegistry/plugin/engine:
 *
 *   QuoteController.compare → CapabilityService (lọc Phương_Pháp_Khả_Dụng)
 *                           → ComparatorService → MethodRegistry → plugin THẬT → engine THẬT
 *                             · DigitalMethodPlugin → PricingFacadeService (real math)
 *                             · OffsetMethodPlugin  → EngineOffsetService (dữ liệu offset đóng gói)
 *                           → applyQuoteVat (VAT cấp báo giá, áp MỘT LẦN)
 *
 * Khẳng định (end-to-end, CÙNG một bộ Thông_Số cho mọi phương pháp — Req 5.4):
 *  - So sánh digital vs offset trên CÙNG một bộ Thông_Số: phương pháp ÁP DỤNG ĐƯỢC cho
 *    Sản_Phẩm được tính giá và đánh dấu rẻ nhất (`isCheapest`), phương pháp KHÔNG áp dụng
 *    được bị loại khỏi bảng kèm lý do (Req 5.1, 5.5).
 *  - VAT cấp báo giá áp ĐÚNG MỘT LẦN trên dòng được chọn (phương pháp rẻ hơn):
 *    `vat.vatAmount == round(sum(chosen priceBeforeVat) × rate/100)` và
 *    `vat.grandTotal == sum + vatAmount` — KHÔNG cộng VAT chồng VAT, không stack theo
 *    từng phương pháp (Req 8.4).
 *  - Giá được bảo toàn: `priceBeforeVat` của phương pháp được chọn khớp giá engine tính
 *    trực tiếp (offset: `tongChuaVAT`; digital: `selling_subtotal − chiết khấu`) — Req 6.1.
 *  - Khi cung cấp dải số lượng nhưng chỉ một phương pháp áp dụng được, không có cặp để dò
 *    Điểm_Hoà_Vốn ⇒ `breakEven` rỗng (Req 5.3, 5.6).
 *
 * Ghi chú kiến trúc (vì sao so sánh ở chế độ 'single'): hai plugin THẬT chặn `appliesTo`
 * theo tập `quoteType` RỜI NHAU — digital phục vụ {loose, bound, large_format}, offset phục
 * vụ {to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay}. `/quote-tool/compare` phân giải MỘT
 * Sản_Phẩm (một `quoteType`) rồi đưa cho mọi plugin ứng viên, nên trên một Sản_Phẩm chỉ một
 * phương pháp áp dụng được; phương pháp còn lại bị loại kèm lý do (Req 5.5). Test này kiểm
 * thử đúng hành vi end-to-end đó cho cả hai chiều (Sản_Phẩm offset & Sản_Phẩm digital), và
 * tập trung vào bất biến cốt lõi: VAT áp đúng một lần ở tầng báo giá (Req 8.4).
 *
 * Ghi chú "DB seed": Cờ_Năng_Lực dùng DB SQLite in-memory (better-sqlite3) THẬT cho
 * `method_capabilities`. Engine digital chạy trên master-data MẪU qua repository giả lập
 * (theo mẫu `pricing-flow.spec.ts` / `quote-calculate.integration.spec.ts`) để engine THẬT
 * chạy đủ chuỗi tính giá với seed tối thiểu; engine offset chạy trên dữ liệu giá đóng gói.
 *
 * Validates: Requirements 5.1, 8.4
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
import { EngineOffsetService } from '../modules/pricing/offset-engine/engine-offset.service';
import { loadDefaultPricingData } from '../modules/pricing/offset-engine/default-data';

// ──────────────────────────────────────────────────────────────────────────
// SAMPLE MASTER DATA (digital) — nhất quán nội bộ, mượn từ quote-calculate.integration.spec.ts.
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

/** Dựng PricingFacadeService THẬT với master-data mẫu (theo mẫu quote-calculate.integration.spec.ts). */
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

/** Input offset golden (to_roi) — giá trị thật từ dữ liệu đóng gói (golden fixture). */
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

/** Spec method-agnostic cho offset: mọi tham số (trừ số lượng) vào attributes. */
function toRoiQuoteSpec() {
    const { soLuong, ...rest } = goldenToRoiInput();
    return { quantity: soLuong, attributes: { ...rest } };
}

/** Spec method-agnostic cho digital (loose) — cùng bộ Thông_Số như quote-calculate.integration.spec.ts. */
function digitalLooseSpec() {
    return {
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
    };
}

describe('QuoteController (integration) — POST /quote-tool/compare end-to-end', () => {
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
            controllers: [QuoteController],
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
            ],
        })
            // Cô lập với JWT — guard luôn cho qua (test tập trung vào wiring so sánh giá + VAT).
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

    /** Kiểm bất biến VAT áp MỘT LẦN trên một dòng giá đã cho (Req 8.4). */
    function assertVatAppliedOnce(
        vat: { sumPriceBeforeVat: number; vatRatePercent: number; vatAmount: number; grandTotal: number },
        expectedPriceBeforeVat: number,
        ratePercent: number,
    ) {
        const expectedVat = Math.round((expectedPriceBeforeVat * ratePercent) / 100);
        // VAT tính trên TỔNG giá sau chiết khấu của dòng được chọn (Req 8.2, 8.3).
        expect(vat.sumPriceBeforeVat).toBe(expectedPriceBeforeVat);
        expect(vat.vatRatePercent).toBe(ratePercent);
        // Áp đúng MỘT LẦN: vatAmount = round(sum × rate/100) (Req 8.4).
        expect(vat.vatAmount).toBe(expectedVat);
        expect(vat.grandTotal).toBe(expectedPriceBeforeVat + expectedVat);
        // KHÔNG cộng VAT chồng VAT (không stack hai lần).
        expect(vat.grandTotal).not.toBe(expectedPriceBeforeVat + 2 * expectedVat);
    }

    // ── So sánh digital vs offset trên Sản_Phẩm OFFSET (cùng Thông_Số) ──────
    it('so sánh digital vs offset trên Sản_Phẩm offset: offset được tính & đánh dấu rẻ nhất, digital bị loại; VAT áp một lần', async () => {
        await seedEnabled('unit-both', ['digital', 'offset']);

        // Giá kỳ vọng: engine offset độc lập tính trực tiếp (cùng dữ liệu đóng gói).
        const direct = new EngineOffsetService().calculate(goldenToRoiInput() as any);
        expect(direct.success).toBe(true);
        const expectedOffsetPrice = direct.data!.tongChuaVAT;
        expect(expectedOffsetPrice).toBeGreaterThan(0);

        const RATE = 10;
        const res = await request(app.getHttpServer())
            .post('/quote-tool/compare')
            .send({
                productCode: 'flyer-offset',
                unitId: 'unit-both',
                // CÙNG một bộ Thông_Số cho mọi phương pháp ứng viên (Req 5.4).
                spec: toRoiQuoteSpec(),
                methods: ['digital', 'offset'],
                vat_rate: RATE,
            })
            .expect(201);

        // Trên Sản_Phẩm to_roi: chỉ offset áp dụng được ⇒ mode 'single' (Req 5.6).
        expect(res.body.comparison.mode).toBe('single');
        expect(res.body.comparison.cheapestMethodId).toBe('offset');

        const results = res.body.comparison.results;
        expect(results).toHaveLength(1);
        expect(results[0].methodId).toBe('offset');
        expect(results[0].isCheapest).toBe(true);
        // Bảo toàn giá: priceBeforeVat (qua plugin) === tongChuaVAT (engine trực tiếp) — Req 6.1.
        expect(results[0].priceBeforeVat).toBe(expectedOffsetPrice);

        // Digital bị loại kèm lý do (không áp dụng cho quoteType to_roi) (Req 5.5).
        const excludedIds = res.body.comparison.excluded.map((e: any) => e.methodId);
        expect(excludedIds).toContain('digital');
        const digitalExcluded = res.body.comparison.excluded.find((e: any) => e.methodId === 'digital');
        expect(typeof digitalExcluded.reason).toBe('string');
        expect(digitalExcluded.reason.length).toBeGreaterThan(0);

        // VAT cấp báo giá áp ĐÚNG MỘT LẦN trên dòng được chọn (offset) (Req 8.4).
        assertVatAppliedOnce(res.body.vat, expectedOffsetPrice, RATE);

        // VAT hiển thị theo từng phương pháp khớp VAT cấp báo giá cho dòng được chọn
        // (cùng vat_rate, không stack) — xác nhận không cộng VAT theo từng phương pháp.
        expect(results[0].vat.vatAmount).toBe(res.body.vat.vatAmount);
        expect(results[0].vat.grandTotal).toBe(res.body.vat.grandTotal);
    });

    // ── So sánh digital vs offset trên Sản_Phẩm DIGITAL (cùng Thông_Số) ─────
    it('so sánh digital vs offset trên Sản_Phẩm digital: digital được tính & đánh dấu rẻ nhất, offset bị loại; VAT áp một lần', async () => {
        await seedEnabled('unit-both', ['digital', 'offset']);

        // Giá digital kỳ vọng: selling_subtotal 79.200, chiết khấu 0 ⇒ priceBeforeVat 79.200
        // (cùng master-data mẫu & Thông_Số với quote-calculate.integration.spec.ts).
        const EXPECTED_DIGITAL_PRICE = 79200;
        const RATE = 8;

        const res = await request(app.getHttpServer())
            .post('/quote-tool/compare')
            .send({
                productCode: 'card-digital',
                unitId: 'unit-both',
                spec: digitalLooseSpec(),
                methods: ['digital', 'offset'],
                vat_rate: RATE,
                config: { discountRate: 0 },
            })
            .expect(201);

        expect(res.body.comparison.mode).toBe('single');
        expect(res.body.comparison.cheapestMethodId).toBe('digital');

        const results = res.body.comparison.results;
        expect(results).toHaveLength(1);
        expect(results[0].methodId).toBe('digital');
        expect(results[0].isCheapest).toBe(true);
        // Bảo toàn giá: priceBeforeVat khớp engine digital THẬT (Req 6.1).
        expect(results[0].priceBeforeVat).toBe(EXPECTED_DIGITAL_PRICE);
        expect(results[0].sellingSubtotal).toBe(EXPECTED_DIGITAL_PRICE);

        // Offset bị loại kèm lý do (không áp dụng cho quoteType loose) (Req 5.5).
        const offsetExcluded = res.body.comparison.excluded.find((e: any) => e.methodId === 'offset');
        expect(offsetExcluded).toBeDefined();
        expect(typeof offsetExcluded.reason).toBe('string');
        expect(offsetExcluded.reason.length).toBeGreaterThan(0);

        // VAT cấp báo giá áp ĐÚNG MỘT LẦN trên dòng được chọn (digital) (Req 8.4).
        assertVatAppliedOnce(res.body.vat, EXPECTED_DIGITAL_PRICE, RATE);
    });

    // ── Dải số lượng + chỉ một phương pháp áp dụng được ⇒ không có Điểm_Hoà_Vốn ──
    it('cung cấp dải số lượng nhưng chỉ một phương pháp áp dụng được ⇒ breakEven rỗng', async () => {
        await seedEnabled('unit-both', ['digital', 'offset']);

        const res = await request(app.getHttpServer())
            .post('/quote-tool/compare')
            .send({
                productCode: 'flyer-offset',
                unitId: 'unit-both',
                spec: toRoiQuoteSpec(),
                methods: ['digital', 'offset'],
                vat_rate: 10,
                // Dải số lượng để dò Điểm_Hoà_Vốn — cần ≥2 phương pháp tính được giá (Req 5.3).
                quantityRange: { min: 1000, max: 10000, step: 3000 },
            })
            .expect(201);

        // Chỉ offset áp dụng được ⇒ không có cặp phương pháp để dò điểm hoà vốn.
        expect(res.body.comparison.mode).toBe('single');
        expect(res.body.breakEven).toEqual([]);
    });
});
