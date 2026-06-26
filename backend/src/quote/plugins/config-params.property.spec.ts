/**
 * Property 13 — Tham số giá đọc từ cấu hình.
 *
 * Feature: print-method-unification, Property 13: Tham số giá đọc từ cấu hình
 *
 * Property 13 (Design — Correctness Properties):
 *   For any tham số giá (VAT, chiết khấu, markup, định mức) và bất kỳ giá trị cấu
 *   hình hợp lệ nào, kết quả tính giá của Plugin khi đặt tham số bằng giá trị đó
 *   phản ánh ĐÚNG giá trị cấu hình; thay đổi giá trị cấu hình làm thay đổi kết quả
 *   một cách NHẤT QUÁN (không có hằng số bị gán cứng ghi đè).
 *
 * Validates: Requirements 7.2, 7.3
 *
 * Chiến lược (engine + nguồn cấu hình đều được MOCK — kiểm chứng *lớp đọc cấu hình*
 * của adapter, không phải số học engine):
 *   - DigitalMethodPlugin đọc % Chiết_Khấu: ưu tiên `cfg.discountRate` (caller cung
 *     cấp), nếu không thì đọc key `discount_rate` từ `PricingService.getPricingConfig()`.
 *     Với `selling_subtotal` cố định do facade (mock) trả, kết quả phải phản ánh ĐÚNG
 *     công thức trên giá trị cấu hình: discountAmount = round(selling × d/100),
 *     priceBeforeVat = selling − discountAmount. Đổi `d` ⇒ kết quả đổi nhất quán
 *     (đơn điệu không tăng theo d) ⇒ không có hằng số gán cứng.
 *   - OffsetMethodPlugin ánh xạ `cfg.discountRate` → `chietKhauRate` truyền xuống
 *     engine (mock). Giá trị cấu hình phải đi thẳng vào input của engine; khi không
 *     cung cấp thì KHÔNG set (engine dùng mặc định cấu hình của chính nó).
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import fc from 'fast-check';
import { DigitalMethodPlugin } from './digital-method.plugin';
import { OffsetMethodPlugin } from './offset-method.plugin';
import { ProductRef, Specification } from '../types/method-plugin.types';

const NUM_RUNS = 200;

/** Stub MethodRegistry — plugin chỉ gọi register() trong onModuleInit (không gọi ở test). */
const registryStub = { register: jest.fn() } as any;

const OFFSET_TYPES = ['to_roi', 'bi_thu_folder', 'sp_khac', 'hop_giay', 'tui_giay'];

/**
 * Dựng DigitalMethodPlugin với facade (mock) trả `selling_subtotal` cố định và
 * `PricingService.getPricingConfig()` (mock) trả `discount_rate` từ cấu hình.
 * Trả về cả plugin lẫn các mock để khẳng định nguồn đọc.
 */
function makeDigital(sellingSubtotal: number, configDiscount: number) {
    const facade = {
        calculatePrice: jest.fn().mockResolvedValue({
            success: true,
            data: {
                type: 'loose',
                selling_subtotal: sellingSubtotal,
                cost_subtotal: Math.floor(sellingSubtotal * 0.6),
                breakdown: {},
            },
        }),
    };
    const pricing = {
        getPricingConfig: jest
            .fn()
            .mockResolvedValue({ discount_rate: String(configDiscount) }),
    };
    const plugin = new DigitalMethodPlugin(
        registryStub,
        facade as any,
        pricing as any,
    );
    return { plugin, facade, pricing };
}

/**
 * Dựng OffsetMethodPlugin với engine (mock) bắt input và trả `tongChuaVAT` cố định.
 */
function makeOffset() {
    const engine = {
        calculate: jest.fn().mockReturnValue({
            success: true,
            data: { tongChuaVAT: 500000, vat: 0, chietKhau: 0, khachTra: 500000 },
        }),
    };
    const plugin = new OffsetMethodPlugin(engine as any, registryStub);
    return { plugin, engine };
}

describe('Property 13 — tham số giá đọc từ cấu hình (Req 7.2, 7.3)', () => {
    // Feature: print-method-unification, Property 13: Tham số giá đọc từ cấu hình
    it('Property 13: kết quả Plugin phản ánh đúng tham số chiết khấu từ cấu hình và thay đổi nhất quán', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Giá trị cấu hình (key `discount_rate`) — %.
                fc.double({ min: 0, max: 100, noNaN: true }),
                // Giá trị caller ghi đè (cfg.discountRate) — %.
                fc.double({ min: 0, max: 100, noNaN: true }),
                // selling_subtotal cố định do facade trả (trước chiết khấu/VAT).
                fc.integer({ min: 0, max: 10_000_000 }),
                // Có dùng đường ghi đè cfg hay không.
                fc.boolean(),
                // Loại offset để kiểm dòng chảy cfg.discountRate → chietKhauRate.
                fc.constantFrom(...OFFSET_TYPES),
                async (configDiscount, overrideDiscount, selling, useOverride, offsetType) => {
                    // ---------------- DIGITAL: đọc chiết khấu từ cấu hình ----------------
                    const { plugin, facade, pricing } = makeDigital(
                        selling,
                        configDiscount,
                    );
                    const effective = useOverride ? overrideDiscount : configDiscount;
                    const cfg = useOverride ? { discountRate: overrideDiscount } : {};

                    const product: ProductRef = { code: 'p', quoteType: 'loose' };
                    const spec: Specification = { quantity: 100 };

                    const res = await plugin.calculate(product, spec, cfg);

                    // Kết quả phản ánh ĐÚNG giá trị tham số (đọc từ cấu hình / ghi đè),
                    // không phải một hằng số gán cứng.
                    const expectedDiscount = Math.round((selling * effective) / 100);
                    expect(res.ok).toBe(true);
                    expect(res.sellingSubtotal).toBe(selling);
                    expect(res.discountAmount).toBe(expectedDiscount);
                    expect(res.priceBeforeVat).toBe(selling - expectedDiscount);

                    // Nguồn đọc đúng: ghi đè ⇒ KHÔNG chạm cấu hình; ngược lại ⇒ đọc cấu hình.
                    if (useOverride) {
                        expect(pricing.getPricingConfig).not.toHaveBeenCalled();
                    } else {
                        expect(pricing.getPricingConfig).toHaveBeenCalled();
                    }
                    expect(facade.calculatePrice).toHaveBeenCalledTimes(1);

                    // ---- Tính nhất quán: tham số 0 vs tham số sinh ra phải đổi kết quả ----
                    // (chứng minh không có hằng số ghi đè; chiết khấu cao ⇒ giá thấp hơn).
                    const zeroBuild = makeDigital(selling, 0);
                    const resZero = await zeroBuild.plugin.calculate(product, spec, {});
                    // priceBeforeVat đơn điệu không tăng theo % chiết khấu.
                    expect(res.priceBeforeVat).toBeLessThanOrEqual(resZero.priceBeforeVat);
                    if (expectedDiscount > 0) {
                        // Chiết khấu làm tròn > 0 ⇒ giá phải thay đổi (giảm) so với mức 0%,
                        // chứng minh tham số đến từ cấu hình chứ không phải hằng số gán cứng.
                        expect(res.priceBeforeVat).toBeLessThan(resZero.priceBeforeVat);
                    }

                    // ---------------- OFFSET: cfg.discountRate → chietKhauRate ----------------
                    const offsetProduct: ProductRef = { code: 'o', quoteType: offsetType };
                    const offsetSpec: Specification = { quantity: 1000 };

                    // Khi cung cấp discountRate: giá trị cấu hình đi thẳng vào input engine.
                    const withCfg = makeOffset();
                    await withCfg.plugin.calculate(offsetProduct, offsetSpec, {
                        discountRate: configDiscount,
                    });
                    const inputWithCfg = withCfg.engine.calculate.mock.calls[0][0];
                    expect(inputWithCfg.chietKhauRate).toBe(configDiscount);
                    // VAT luôn tách ra tầng báo giá (không gán cứng VAT trong adapter).
                    expect(inputWithCfg.vatRate).toBe(0);

                    // Khi KHÔNG cung cấp: adapter không gán cứng ⇒ để engine đọc mặc định cấu hình.
                    const noCfg = makeOffset();
                    await noCfg.plugin.calculate(offsetProduct, offsetSpec, {});
                    const inputNoCfg = noCfg.engine.calculate.mock.calls[0][0];
                    expect(inputNoCfg).not.toHaveProperty('chietKhauRate');
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
