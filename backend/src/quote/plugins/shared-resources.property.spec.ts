/**
 * Property-based test cho Tài_Nguyên_Dùng_Chung (shared resources) — task 6.5.
 *
 * Feature: print-method-unification, Property 14: Tài nguyên dùng chung phản ánh cho mọi plugin
 *
 * Property 14 (Design — Correctness Properties):
 *   For any Tài_Nguyên_Dùng_Chung (vật tư/khổ/gia công) và bất kỳ thay đổi giá trị
 *   nào của nó, mọi Plugin_Phương_Pháp tham chiếu tài nguyên đó đều đọc giá trị mới
 *   ở lần tính kế tiếp (không có bản sao cục bộ theo engine).
 *
 * Validates: Requirements 3.4, 3.5
 *
 * Cách kiểm: hai plugin adapter (DigitalMethodPlugin, OffsetMethodPlugin) bọc engine
 * khác nhau nhưng cùng tham chiếu MỘT tầng Tài_Nguyên_Dùng_Chung qua `Specification`
 * (materialCode, paperSizeCode). Mock engine bị bọc và bắt lấy *input* mà plugin truyền
 * xuống, rồi khẳng định:
 *   1. Giá trị tài nguyên trong Specification được phản ánh trung thực vào input của
 *      TỪNG plugin (không plugin nào thay bằng bản sao cục bộ).
 *   2. Hai plugin phản ánh CÙNG một giá trị nguồn (không phân kỳ theo engine).
 *   3. Khi đổi giá trị tài nguyên, input ở lần tính kế tiếp phản ánh giá trị mới
 *      (không có cache/hằng số gán cứng ghi đè) — Req 3.5.
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { DigitalMethodPlugin } from './digital-method.plugin';
import { OffsetMethodPlugin } from './offset-method.plugin';
import { ProductRef, Specification } from '../types/method-plugin.types';

const NUM_RUNS = 200;

/** Stub MethodRegistry — chỉ register() trong onModuleInit (không gọi ở test). */
const registryStub = { register: jest.fn() } as any;

/** quoteType phục vụ bởi từng phương pháp (gợi ý định tuyến plugin). */
const DIGITAL_TYPES = ['loose', 'bound', 'large_format'];
const OFFSET_TYPES = ['to_roi', 'bi_thu_folder', 'sp_khac', 'hop_giay', 'tui_giay'];

/** Facade digital trả kết quả "đủ dùng" để plugin chạy hết nhánh ánh xạ + tính giá. */
function makeDigitalPlugin() {
    const facade = {
        calculatePrice: jest.fn().mockResolvedValue({
            success: true,
            data: {
                type: 'loose',
                selling_subtotal: 100000,
                cost_subtotal: 60000,
                breakdown: {},
            },
        }),
    };
    const pricing = { getPricingConfig: jest.fn().mockResolvedValue({}) };
    const plugin = new DigitalMethodPlugin(
        registryStub,
        facade as any,
        pricing as any,
    );
    return { plugin, facade };
}

/** Engine offset trả QuoteResult tối thiểu để plugin dựng PriceResult. */
function makeOffsetPlugin() {
    const engine = {
        calculate: jest.fn().mockReturnValue({
            success: true,
            data: { tongChuaVAT: 500000, vat: 0, chietKhau: 0, khachTra: 500000 },
        }),
    };
    const plugin = new OffsetMethodPlugin(engine as any, registryStub);
    return { plugin, engine };
}

describe('Tài_Nguyên_Dùng_Chung phản ánh cho mọi plugin (property)', () => {
    // Feature: print-method-unification, Property 14: Tài nguyên dùng chung phản ánh cho mọi plugin
    it('Property 14: tài nguyên dùng chung được phản ánh nhất quán vào input của mọi plugin và đổi giá trị phản ánh ở lần tính kế tiếp (Req 3.4, 3.5)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...DIGITAL_TYPES),
                fc.constantFrom(...OFFSET_TYPES),
                // Tài nguyên dùng chung dạng mã số (vật tư / khổ giấy). Dùng mã số để cả
                // hai ánh xạ (digital → id số, offset → chuỗi mã) cùng tham chiếu một nguồn.
                fc.integer({ min: 1, max: 99999 }),
                fc.integer({ min: 1, max: 99999 }),
                fc.integer({ min: 1, max: 99999 }),
                fc.integer({ min: 1, max: 99999 }),
                fc.integer({ min: 1, max: 100000 }),
                async (
                    digitalType,
                    offsetType,
                    mat1,
                    mat2,
                    paper1,
                    paper2,
                    quantity,
                ) => {
                    const { plugin: digital, facade } = makeDigitalPlugin();
                    const { plugin: offset, engine } = makeOffsetPlugin();

                    const digitalProduct: ProductRef = {
                        code: 'p-digital',
                        quoteType: digitalType,
                    };
                    const offsetProduct: ProductRef = {
                        code: 'p-offset',
                        quoteType: offsetType,
                    };

                    const specWith = (mat: number, paper: number): Specification => ({
                        quantity,
                        materialCode: String(mat),
                        paperSizeCode: String(paper),
                    });

                    // --- Lần tính 1: tài nguyên (mat1, paper1) ---
                    await digital.calculate(digitalProduct, specWith(mat1, paper1), {});
                    await offset.calculate(offsetProduct, specWith(mat1, paper1), {});

                    // --- Lần tính 2: đổi tài nguyên sang (mat2, paper2) ---
                    await digital.calculate(digitalProduct, specWith(mat2, paper2), {});
                    await offset.calculate(offsetProduct, specWith(mat2, paper2), {});

                    const dIn1 = facade.calculatePrice.mock.calls[0][0];
                    const dIn2 = facade.calculatePrice.mock.calls[1][0];
                    const oIn1 = engine.calculate.mock.calls[0][0];
                    const oIn2 = engine.calculate.mock.calls[1][0];

                    // (1) Mỗi plugin phản ánh TRUNG THỰC giá trị tài nguyên từ Specification.
                    // Digital ánh xạ mã số → id số (material_id / paper_size_id).
                    expect(dIn1.material_id).toBe(mat1);
                    expect(dIn1.paper_size_id).toBe(paper1);
                    expect(dIn2.material_id).toBe(mat2);
                    expect(dIn2.paper_size_id).toBe(paper2);
                    // Offset ánh xạ mã → chuỗi (materialCode / khoIn).
                    expect(oIn1.materialCode).toBe(String(mat1));
                    expect(oIn1.khoIn).toBe(String(paper1));
                    expect(oIn2.materialCode).toBe(String(mat2));
                    expect(oIn2.khoIn).toBe(String(paper2));

                    // (2) Không phân kỳ theo engine: hai plugin đọc CÙNG một giá trị nguồn
                    // cho cùng một tài nguyên dùng chung (Req 3.4 — một nguồn / khái niệm).
                    expect(Number(oIn1.materialCode)).toBe(dIn1.material_id);
                    expect(Number(oIn1.khoIn)).toBe(dIn1.paper_size_id);
                    expect(Number(oIn2.materialCode)).toBe(dIn2.material_id);
                    expect(Number(oIn2.khoIn)).toBe(dIn2.paper_size_id);

                    // (3) Đổi giá trị tài nguyên ⇒ lần tính kế tiếp phản ánh giá trị mới,
                    // không có bản sao cục bộ/hằng số ghi đè (Req 3.5).
                    if (mat1 !== mat2) {
                        expect(dIn2.material_id).not.toBe(dIn1.material_id);
                        expect(oIn2.materialCode).not.toBe(oIn1.materialCode);
                    } else {
                        expect(dIn2.material_id).toBe(dIn1.material_id);
                        expect(oIn2.materialCode).toBe(oIn1.materialCode);
                    }
                    if (paper1 !== paper2) {
                        expect(dIn2.paper_size_id).not.toBe(dIn1.paper_size_id);
                        expect(oIn2.khoIn).not.toBe(oIn1.khoIn);
                    } else {
                        expect(dIn2.paper_size_id).toBe(dIn1.paper_size_id);
                        expect(oIn2.khoIn).toBe(oIn1.khoIn);
                    }
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
