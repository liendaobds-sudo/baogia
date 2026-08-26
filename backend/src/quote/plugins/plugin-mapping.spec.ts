/**
 * Unit test ánh xạ Specification → input từng plugin (task 6.6).
 *
 * Mục tiêu: kiểm chứng *lớp ánh xạ* method-agnostic của hai plugin adapter mỏng,
 * KHÔNG kiểm số học engine (engine bị mock). Cách tiếp cận: mock engine được bọc
 * (PricingFacadeService cho digital, EngineOffsetService cho offset), gọi
 * `calculate(...)` và khẳng định *input* mà plugin truyền xuống engine khớp đúng
 * ánh xạ kỳ vọng cho từng Specification.
 *
 * Bao phủ:
 *  - Digital: ánh xạ loose/bound/large_format, dimensions, material/paper/processing/accessories.
 *  - Offset: ánh xạ theo từng quoteType (rong/cao, +hong cho hộp/túi), vatRate=0, chiết khấu từ cfg.
 *  - Edge case dimension/quantity (thiếu kích thước, quantity = 0).
 *  - Giá trị ngoài whitelist offset (engine trả lỗi) → ok:false + lý do (Req 5.5).
 *  - quoteType ngoài phạm vi plugin → ok:false + lý do.
 *
 * _Requirements: 3.2, 5.5_
 */
import { DigitalMethodPlugin } from './digital-method.plugin';
import { OffsetMethodPlugin } from './offset-method.plugin';
import {
    PricingConfigView,
    ProductRef,
    Specification,
} from '../types/method-plugin.types';

/** Stub MethodRegistry — plugin chỉ gọi register() trong onModuleInit (không gọi ở test). */
const registryStub = { register: jest.fn() } as any;

// ----------------------------- DIGITAL ------------------------------------

describe('DigitalMethodPlugin — ánh xạ Specification → CalculatePriceInput (Req 3.2)', () => {
    let facade: { calculatePrice: jest.Mock };
    let pricing: { getPricingConfig: jest.Mock };
    let plugin: DigitalMethodPlugin;

    /** Facade trả kết quả "đủ dùng" để plugin chạy hết nhánh map + tính giá. */
    const okFacadeResult = {
        success: true,
        data: {
            type: 'loose',
            selling_subtotal: 100000,
            cost_subtotal: 60000,
            breakdown: { foo: 'bar' },
            material_cost: 1,
            processing_cost: 2,
            accessories_cost: 3,
        },
    };

    beforeEach(() => {
        facade = { calculatePrice: jest.fn().mockResolvedValue(okFacadeResult) };
        pricing = { getPricingConfig: jest.fn().mockResolvedValue({}) };
        plugin = new DigitalMethodPlugin(
            registryStub,
            facade as any,
            pricing as any,
        );
    });

    /** Lấy input mà plugin đã truyền xuống facade ở lần gọi gần nhất. */
    const capturedInput = (): Record<string, unknown> =>
        facade.calculatePrice.mock.calls[0][0];

    it.each(['loose', 'bound', 'large_format'])(
        'ánh xạ quoteType=%s vào input.type và truyền số lượng',
        async (quoteType) => {
            const product: ProductRef = { code: 'p', quoteType };
            const spec: Specification = { quantity: 250 };

            await plugin.calculate(product, spec, {});

            const input = capturedInput();
            expect(input.type).toBe(quoteType);
            expect(input.quantity).toBe(250);
        },
    );

    it('đổi dimensions chuẩn cm → mm đúng một lần cho facade digital', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'large_format' };
        const spec: Specification = {
            quantity: 10,
            dimensions: { width: 9, height: 5.4 },
        };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input.item_width).toBe(90);
        expect(input.width).toBe(90);
        expect(input.item_height).toBe(54);
        expect(input.height).toBe(54);
    });

    it('ánh xạ materialCode/paperSizeCode dạng số → material_id/paper_size_id', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = {
            quantity: 100,
            materialCode: '42',
            paperSizeCode: '7',
        };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input.material_id).toBe(42);
        expect(input.paper_size_id).toBe(7);
    });

    it('ánh xạ processing và accessories', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = {
            quantity: 100,
            processing: [{ code: '5', side: 'front' }],
            accessories: [{ id: 9, qty: 2 }],
        };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input.processing).toEqual([
            { id: 5, code: '5', side: 'front' },
        ]);
        expect(input.accessories).toEqual([{ id: 9, qty: 2 }]);
    });

    it('trải attributes (tham số riêng method) rồi để trường core ghi đè', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = {
            quantity: 100,
            attributes: { print_side: 2, type: 'SHOULD_BE_OVERRIDDEN' },
        };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input.print_side).toBe(2);
        // Trường core của Specification ghi đè attributes cùng tên.
        expect(input.type).toBe('loose');
    });

    it('edge case: thiếu dimensions → không set width/height keys', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = { quantity: 100 };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input).not.toHaveProperty('item_width');
        expect(input).not.toHaveProperty('item_height');
        expect(input).not.toHaveProperty('width');
        expect(input).not.toHaveProperty('height');
    });

    it('edge case: materialCode không phải số → bỏ qua material_id', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = {
            quantity: 100,
            materialCode: 'không-phải-số',
        };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input).not.toHaveProperty('material_id');
    });

    it('edge case: quantity = 0 → vẫn tính được, pricePerItem không chia cho 0', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = { quantity: 0 };

        const result = await plugin.calculate(product, spec, {});

        expect(result.ok).toBe(true);
        expect(Number.isFinite(result.pricePerItem)).toBe(true);
    });

    it('quoteType ngoài phạm vi digital → ok:false + lý do, không gọi facade', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'hop_giay' };
        const spec: Specification = { quantity: 100 };

        const result = await plugin.calculate(product, spec, {});

        expect(result.ok).toBe(false);
        expect(result.unavailableReason).toContain('hop_giay');
        expect(facade.calculatePrice).not.toHaveBeenCalled();
    });

    it('facade trả success:false → ok:false mang theo lý do lỗi', async () => {
        facade.calculatePrice.mockResolvedValueOnce({
            success: false,
            error: 'Thiếu đơn giá giấy',
        });
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = { quantity: 100 };

        const result = await plugin.calculate(product, spec, {});

        expect(result.ok).toBe(false);
        expect(result.unavailableReason).toBe('Thiếu đơn giá giấy');
    });

    it('chiết khấu lấy từ cfg.discountRate (Req 7.2): priceBeforeVat = selling − discount', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = { quantity: 100 };
        const cfg: PricingConfigView = { discountRate: 10 };

        const result = await plugin.calculate(product, spec, cfg);

        // selling_subtotal = 100000, chiết khấu 10% = 10000
        expect(result.sellingSubtotal).toBe(100000);
        expect(result.discountAmount).toBe(10000);
        expect(result.priceBeforeVat).toBe(90000);
        expect(pricing.getPricingConfig).not.toHaveBeenCalled();
    });
});

// ------------------------------ OFFSET ------------------------------------

describe('OffsetMethodPlugin — ánh xạ Specification → OffsetEngineInput (Req 3.2, 5.5)', () => {
    let engine: { calculate: jest.Mock };
    let plugin: OffsetMethodPlugin;

    /** QuoteResult tối thiểu để plugin dựng PriceResult. */
    const okEngineResult = {
        success: true,
        data: { tongChuaVAT: 500000, vat: 0, chietKhau: 0, khachTra: 500000 },
    };

    beforeEach(() => {
        engine = { calculate: jest.fn().mockReturnValue(okEngineResult) };
        plugin = new OffsetMethodPlugin(engine as any, registryStub);
    });

    const capturedInput = (): Record<string, unknown> =>
        engine.calculate.mock.calls[0][0];

    it.each(['to_roi', 'bi_thu_folder', 'sp_khac'])(
        'loại khổ động %s: giữ dimensions cm khi ánh xạ width/height → rong/cao',
        async (quoteType) => {
            const product: ProductRef = { code: 'p', quoteType };
            const spec: Specification = {
                quantity: 1000,
                dimensions: { width: 21, height: 29.7 },
            };

            await plugin.calculate(product, spec, {});

            const input = capturedInput();
            expect(input.type).toBe(quoteType);
            expect(input.soLuong).toBe(1000);
            expect(input.rong).toBe(21);
            expect(input.cao).toBe(29.7);
            expect(input).not.toHaveProperty('hong');
        },
    );

    it.each(['hop_giay', 'tui_giay'])(
        'loại khối %s: giữ dimensions cm khi ánh xạ width/height/depth → rong/cao/hong',
        async (quoteType) => {
            const product: ProductRef = { code: 'p', quoteType };
            const spec: Specification = {
                quantity: 500,
                dimensions: { width: 10, height: 20, depth: 5 },
            };

            await plugin.calculate(product, spec, {});

            const input = capturedInput();
            expect(input.type).toBe(quoteType);
            expect(input.rong).toBe(10);
            expect(input.cao).toBe(20);
            expect(input.hong).toBe(5);
        },
    );

    it('ánh xạ materialCode → materialCode và paperSizeCode → khoIn', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = {
            quantity: 1000,
            materialCode: 'C300',
            paperSizeCode: '79x109',
        };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input.materialCode).toBe('C300');
        expect(input.khoIn).toBe('79x109');
    });

    it('luôn truyền vatRate = 0 (VAT áp một lần ở tầng báo giá — Req 8.4)', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = { quantity: 1000 };

        await plugin.calculate(product, spec, {});

        expect(capturedInput().vatRate).toBe(0);
    });

    it('chietKhauRate đọc từ cfg.discountRate khi có (Req 7.2)', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = { quantity: 1000 };

        await plugin.calculate(product, spec, { discountRate: 7 });

        expect(capturedInput().chietKhauRate).toBe(7);
    });

    it('không cung cấp discountRate → không set chietKhauRate (engine dùng mặc định)', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = { quantity: 1000 };

        await plugin.calculate(product, spec, {});

        expect(capturedInput()).not.toHaveProperty('chietKhauRate');
    });

    it('trải attributes (tham số riêng method) vào input', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = {
            quantity: 1000,
            attributes: { soMau: 4, vatTuBeMat: 'Cán mờ' },
        };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input.soMau).toBe(4);
        expect(input.vatTuBeMat).toBe('Cán mờ');
    });

    it('edge case: thiếu dimensions → không set rong/cao/hong', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = { quantity: 1000 };

        await plugin.calculate(product, spec, {});

        const input = capturedInput();
        expect(input).not.toHaveProperty('rong');
        expect(input).not.toHaveProperty('cao');
        expect(input).not.toHaveProperty('hong');
    });

    it('edge case: quantity = 0 → pricePerItem không chia cho 0', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = { quantity: 0 };

        const result = await plugin.calculate(product, spec, {});

        expect(result.ok).toBe(true);
        expect(Number.isFinite(result.pricePerItem)).toBe(true);
        expect(result.pricePerItem).toBe(500000); // chia cho qty=1
    });

    it('bảo toàn gross/discount/net từ engine, VAT không lẫn vào tầng plugin', async () => {
        engine.calculate.mockReturnValueOnce({
            success: true,
            data: {
                tongChuaVAT: 1_000_000,
                vat: 0,
                chietKhau: 100_000,
                khachTra: 900_000,
            },
        });
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = { quantity: 1000 };

        const result = await plugin.calculate(product, spec, {});

        expect(result.sellingSubtotal).toBe(1_000_000);
        expect(result.discountAmount).toBe(100_000);
        expect(result.priceBeforeVat).toBe(900_000);
        expect(result.pricePerItem).toBe(900);
    });

    it('giá trị ngoài whitelist: engine trả success:false → ok:false + lý do (Req 5.5)', async () => {
        engine.calculate.mockReturnValueOnce({
            success: false,
            error: 'Giấy in "XYZ" không nằm trong danh sách cho phép của loại sản phẩm',
        });
        const product: ProductRef = { code: 'p', quoteType: 'to_roi' };
        const spec: Specification = {
            quantity: 1000,
            materialCode: 'XYZ',
        };

        const result = await plugin.calculate(product, spec, {});

        expect(result.ok).toBe(false);
        expect(result.unavailableReason).toContain('không nằm trong danh sách cho phép');
    });

    it('quoteType ngoài phạm vi offset → ok:false + lý do, không gọi engine', async () => {
        const product: ProductRef = { code: 'p', quoteType: 'loose' };
        const spec: Specification = { quantity: 1000 };

        const result = await plugin.calculate(product, spec, {});

        expect(result.ok).toBe(false);
        expect(result.unavailableReason).toContain('loose');
        expect(engine.calculate).not.toHaveBeenCalled();
    });
});

describe('Biên đơn vị dimensions — Specification cm → engine-native', () => {
    it('cùng kích thước 9×5,4 cm: Digital nhận 90×54 mm, Offset giữ 9×5,4 cm', async () => {
        const digitalFacade = {
            calculatePrice: jest.fn().mockResolvedValue({
                success: true,
                data: {
                    type: 'loose',
                    selling_subtotal: 100_000,
                    cost_subtotal: 60_000,
                    breakdown: {},
                },
            }),
        };
        const digital = new DigitalMethodPlugin(
            registryStub,
            digitalFacade as any,
            { getPricingConfig: jest.fn().mockResolvedValue({}) } as any,
        );
        const offsetEngine = {
            calculate: jest.fn().mockReturnValue({
                success: true,
                data: {
                    tongChuaVAT: 100_000,
                    vat: 0,
                    chietKhau: 0,
                    khachTra: 100_000,
                },
            }),
        };
        const offset = new OffsetMethodPlugin(offsetEngine as any, registryStub);
        const spec: Specification = {
            quantity: 1000,
            dimensions: { width: 9, height: 5.4 },
        };

        await digital.calculate({ code: 'card', quoteType: 'loose' }, spec, {});
        await offset.calculate({ code: 'flyer', quoteType: 'to_roi' }, spec, {});

        expect(digitalFacade.calculatePrice).toHaveBeenCalledWith(
            expect.objectContaining({ item_width: 90, item_height: 54 }),
        );
        expect(offsetEngine.calculate).toHaveBeenCalledWith(
            expect.objectContaining({ rong: 9, cao: 5.4 }),
        );
    });
});
