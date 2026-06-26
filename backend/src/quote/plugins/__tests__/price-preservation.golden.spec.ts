/**
 * Property 8 — Bảo toàn giá khi bọc engine (zero-tolerance trên golden).
 *
 * Feature: print-method-unification, Property 8: Bảo toàn giá khi bọc engine
 * (zero-tolerance trên golden) — *For any* bộ đầu vào đã được Golden_Test khoá,
 * giá `priceBeforeVat` tính qua Method Plugin bằng ĐÚNG giá engine tương ứng tính
 * trực tiếp trước hợp nhất (dung sai bằng KHÔNG).
 *
 * Validates: Requirements 6.1, 6.2, 9.5
 *
 * Chiến lược:
 *  - Offset: gọi `EngineOffsetService.calculate(input)` trực tiếp → `tongChuaVAT`;
 *    gọi qua `OffsetMethodPlugin.calculate(product, spec, cfg)` → `priceBeforeVat`.
 *    Hai giá phải BẰNG NHAU tuyệt đối (`toBe`) cho mọi golden fixture và mọi biến
 *    thể số lượng/toggle sinh ngẫu nhiên (>=100 vòng). Đồng thời plugin phải bảo toàn
 *    cả KẾT QUẢ (engine fail ⇒ plugin ok=false).
 *  - Digital: stub facade trả `selling_subtotal` golden; với chiết khấu = 0, plugin
 *    phải trả `priceBeforeVat` BẰNG ĐÚNG `selling_subtotal` của facade (không đổi số học).
 */
import fc from 'fast-check';
import { EngineOffsetService } from '../../../modules/pricing/offset-engine/engine-offset.service';
import { loadDefaultPricingData } from '../../../modules/pricing/offset-engine/default-data';
import {
    TUI_NEST_OPTIONS,
    buildTuiOptions,
} from '../../../modules/pricing/offset-engine/products/tui-giay';
import { OffsetMethodPlugin } from '../offset-method.plugin';
import { DigitalMethodPlugin } from '../digital-method.plugin';
import { MethodRegistry } from '../../method-registry.service';
import {
    ProductRef,
    Specification,
} from '../../types/method-plugin.types';

const D = loadDefaultPricingData();
const MAT = D.materials[0].code;
const KHO = D.khoIn[0].khoIn;
const VTBM = 'Không';
const TUI_BAI = (buildTuiOptions(D)[0] ?? TUI_NEST_OPTIONS[0]).label;

/** 5 golden fixture đại diện cho 5 loại offset (giá trị thật, dữ liệu mặc định đóng gói). */
function goldenOffsetInputs(): Record<string, any> {
    return {
        to_roi: {
            type: 'to_roi',
            kichThuoc: D.fixedSizes.toRoi[0].kichThuoc,
            materialCode: MAT,
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
        },
        bi_thu_folder: {
            type: 'bi_thu_folder',
            kichThuoc: D.fixedSizes.biThuFolder[0].kichThuoc,
            materialCode: MAT,
            soMatIn: 1,
            soLuong: 5000,
            kemType: 'Kẽm lớn',
            soKemIn: 4,
            vatTuBeMat: VTBM,
            khuon: true,
            be: true,
            thanhPhamDan: 'khong',
            dongGoi: true,
            thietKe: 0,
        },
        sp_khac: {
            type: 'sp_khac',
            khoIn: KHO,
            materialCode: MAT,
            soMatIn: 2,
            soLuong: 5000,
            soBoKem: 1,
            soMau: 4,
            vatTuBeMat: VTBM,
            khuon: 0,
            be: false,
            thanhPham: 'khong',
            catXen: true,
            dongGoi: true,
            epKimViTri: 'Không',
            thietKe: 0,
        },
        hop_giay: {
            type: 'hop_giay',
            boxType: 'rte',
            cao: 10,
            rong: 8,
            hong: 4,
            khoIn: KHO,
            materialCode: MAT,
            soMatIn: 2,
            soLuong: 5000,
            soBoKem: 1,
            soMau: 4,
            vatTuBeMat: VTBM,
            be: true,
            danHop: 'khong',
            boi2Lop: false,
            dongGoi: true,
            epKimViTri: 'Không',
            thietKe: 0,
        },
        tui_giay: {
            type: 'tui_giay',
            soLuong: 5000,
            cao: 30,
            rong: 25,
            hong: 10,
            mi: 4,
            materialCode: MAT,
            baiIn: TUI_BAI,
            soKem: 4,
            vatTuBeMat: VTBM,
            dayXach: { loai: 'khong', donGia: 0 },
            thungCaton: { sl: 0, donGia: 0 },
            dongGoi: true,
            thietKe: 0,
        },
    };
}

/**
 * Ánh xạ một engine input → (ProductRef, Specification) sao cho `OffsetMethodPlugin`
 * tái dựng lại ĐÚNG engine input đó: mọi tham số đặt trong `attributes`, chỉ `quantity`
 * tách ra. Plugin chỉ thêm `vatRate = 0` (không ảnh hưởng `tongChuaVAT` — giá trước VAT).
 */
function toProductSpec(input: any): { product: ProductRef; spec: Specification } {
    const { soLuong, ...rest } = input;
    return {
        product: { code: `golden-${input.type}`, quoteType: input.type },
        spec: { quantity: soLuong, attributes: { ...rest } },
    };
}

describe('Property 8 — bảo toàn giá offset khi bọc engine (zero-tolerance)', () => {
    /** Plugin offset gọi trực tiếp (không onModuleInit ⇒ không cần registry thật). */
    const engine = new EngineOffsetService();
    const registry = new MethodRegistry();
    const plugin = new OffsetMethodPlugin(engine, registry);

    // --- Golden fixtures: zero-tolerance trên từng loại ---
    const fixtures = goldenOffsetInputs();
    for (const [type, input] of Object.entries(fixtures)) {
        it(`golden '${type}': priceBeforeVat (plugin) === tongChuaVAT (engine), dung sai = 0`, async () => {
            const direct = engine.calculate(input);
            expect(direct.success).toBe(true);
            const { product, spec } = toProductSpec(input);
            const viaPlugin = await plugin.calculate(product, spec, {});
            expect(viaPlugin.ok).toBe(true);
            // Zero tolerance: bằng nhau tuyệt đối.
            expect(viaPlugin.priceBeforeVat).toBe(direct.data!.tongChuaVAT);
        });
    }

    // --- Property: với MỌI biến thể (số lượng + toggle) trên 5 loại, giá được bảo toàn ---
    it('Feature: print-method-unification, Property 8: Bảo toàn giá khi bọc engine (zero-tolerance trên golden)', async () => {
        const types = Object.keys(fixtures);
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...types),
                fc.integer({ min: 100, max: 100000 }), // soLuong
                fc.boolean(), // dongGoi
                fc.boolean(), // be (chỉ áp dụng nơi có toggle này)
                fc.constantFrom(1, 2), // soMatIn
                async (type, soLuong, dongGoi, be, soMatIn) => {
                    const base = goldenOffsetInputs()[type];
                    const input = { ...base, soLuong, dongGoi };
                    // Chỉ chỉnh các toggle mà loại đó vốn có, tránh thêm field lạ.
                    if ('be' in base) input.be = be;
                    if ('soMatIn' in base) input.soMatIn = soMatIn;

                    const direct = engine.calculate(input);
                    const { product, spec } = toProductSpec(input);
                    const viaPlugin = await plugin.calculate(product, spec, {});

                    if (direct.success) {
                        // Bảo toàn kết quả + giá trước VAT (dung sai bằng 0).
                        expect(viaPlugin.ok).toBe(true);
                        expect(viaPlugin.priceBeforeVat).toBe(direct.data!.tongChuaVAT);
                    } else {
                        // Engine không tính được ⇒ plugin cũng báo không khả dụng (bảo toàn kết quả).
                        expect(viaPlugin.ok).toBe(false);
                    }
                },
            ),
            { numRuns: 200 },
        );
    });
});

describe('Property 8 — bảo toàn giá digital khi bọc facade (zero-tolerance, chiết khấu = 0)', () => {
    /**
     * Stub facade trả `selling_subtotal` golden (trước VAT). Với chiết khấu = 0,
     * adapter digital KHÔNG đổi số học ⇒ `priceBeforeVat` === `selling_subtotal`.
     */
    function makeDigitalPlugin(sellingSubtotal: number, costSubtotal: number) {
        const registry = new MethodRegistry();
        const facade: any = {
            calculatePrice: async () => ({
                success: true,
                data: {
                    type: 'loose',
                    selling_subtotal: sellingSubtotal,
                    cost_subtotal: costSubtotal,
                    breakdown: {},
                },
            }),
        };
        const pricing: any = { getPricingConfig: async () => ({}) };
        return new DigitalMethodPlugin(registry as any, facade, pricing);
    }

    const goldenSellingSubtotals = [123456, 1000000, 250000, 7777777, 1];

    for (const selling of goldenSellingSubtotals) {
        it(`golden selling_subtotal=${selling}: priceBeforeVat === selling_subtotal (chiết khấu 0)`, async () => {
            const plugin = makeDigitalPlugin(selling, Math.floor(selling * 0.6));
            const product: ProductRef = { code: 'golden-loose', quoteType: 'loose' };
            const spec: Specification = { quantity: 100 };
            const res = await plugin.calculate(product, spec, { discountRate: 0 });
            expect(res.ok).toBe(true);
            // Zero tolerance: bằng nhau tuyệt đối.
            expect(res.priceBeforeVat).toBe(selling);
            expect(res.sellingSubtotal).toBe(selling);
        });
    }
});
