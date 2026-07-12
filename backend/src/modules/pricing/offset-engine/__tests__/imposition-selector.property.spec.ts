import fc from 'fast-check';

import {
    imposeUnified,
    resolveMarginConfig,
} from '../imposition';
import { docKichThuocCm, imposeFromKhoIn } from '../lookups';
import { resolveSoCon, SoConRequest } from '../imposition-selector';
import { cascadeProduct } from '../waste-cascade';
import { KhoIn, Params, PricingData, numParam } from '../pricing-data';
import { makePricingData } from './fixture';
import { EngineOffsetService, OffsetEngineInput } from '../engine-offset.service';
import { loadDefaultPricingData } from '../default-data';

/**
 * Property tests cho impositionSelector (`resolveSoCon`) — nguồn So_Con DUY NHẤT cho giá + preview.
 * Mỗi correctness property của design được cài bằng ĐÚNG MỘT property-based test (fast-check, ≥100 vòng).
 *
 * Properties trong file này:
 *   - Property 7  (task 4.2):  So_Con = 0 dẫn tới lỗi mô tả, không chia cho 0.
 *   - Property 9  (task 10.2): Shadow_Mode không làm đổi giá xuất ra.
 *   - Property 10 (task 4.3):  Cờ nguồn mặc định quyết định So_Con cho mọi loại sản phẩm.
 *   - Property 11 (task 4.4):  Một nguồn So_Con duy nhất cho cả giá và preview (parity).
 */

const CM_TO_MM = 10;
const DEFAULT_GAP_CM = 0.3;

/** Clone PricingData và đặt cờ imposition (ImpositionSource / ShadowMode) cho test. */
function makeData(opts: { source?: unknown; shadow?: number } = {}): PricingData {
    const d = makePricingData();
    if ('source' in opts) {
        // Gán trực tiếp (kể cả giá trị lạ) để kiểm tra hành vi đọc cờ.
        (d.tyLe.params as unknown as Record<string, unknown>).ImpositionSource = opts.source;
    }
    if (opts.shadow !== undefined) {
        d.tyLe.params.ShadowMode = opts.shadow;
    }
    return d;
}

/** Tìm bản ghi khổ in trong fixture theo nhãn `khoIn`. */
function khoByLabel(d: PricingData, label: string): KhoIn {
    const k = d.khoIn.find((x) => x.khoIn === label);
    if (!k) throw new Error(`fixture thiếu khổ in: ${label}`);
    return k;
}

/** Oracle Legacy_Grid — mirror chính xác `computeLegacy` trong selector (giữ fallback bảng tĩnh). */
function refLegacy(
    kho: KhoIn,
    params: Params,
    itemWcm: number,
    itemHcm: number,
    fallbackToLon = 0,
    fallbackBaiIn = 0,
): { soConToLon: number; soConBaiIn: number } {
    const gap = numParam(params, 'Gap_Cm') || DEFAULT_GAP_CM;
    const imp = imposeFromKhoIn(kho, itemWcm, itemHcm, gap);
    return {
        soConToLon: imp.soConToLon > 0 ? imp.soConToLon : fallbackToLon,
        soConBaiIn: imp.soConBaiIn > 0 ? imp.soConBaiIn : fallbackBaiIn,
    };
}

/** Oracle Imposition_Service — mirror chính xác `computeUnified` trong selector (cm→mm ×10). */
function refUnified(kho: KhoIn, params: Params, itemWcm: number, itemHcm: number) {
    const margins = resolveMarginConfig(kho, params);
    const press = docKichThuocCm(kho.khoIn);
    const sheet = docKichThuocCm(kho.khoGiayLon);
    if (!sheet) throw new Error(`không đọc được khổ giấy lớn: ${kho.khoGiayLon}`);
    return imposeUnified({
        itemWmm: itemWcm * CM_TO_MM,
        itemHmm: itemHcm * CM_TO_MM,
        sheetWmm: sheet.w * CM_TO_MM,
        sheetHmm: sheet.h * CM_TO_MM,
        pressWmm: press ? press.w * CM_TO_MM : undefined,
        pressHmm: press ? press.h * CM_TO_MM : undefined,
        margins,
    });
}

describe('impositionSelector — imposition-selector.property', () => {
    // Feature: offset-imposition-gripper-unification, Property 7: So_Con = 0 dẫn tới lỗi mô tả, không chia cho 0 (oversize ⇒ So_Con=0 được phơi bày, cascade chặn chia 0).
    it('Property 7: sản phẩm quá khổ ⇒ So_Con = 0 được phơi bày; cascade KHÔNG chia cho 0 (không Infinity/NaN)', () => {
        fc.assert(
            fc.property(
                // Sản phẩm quá khổ cho khổ giấy 65×86 (mọi cạnh ≥ 90cm > 86cm) ⇒ 0 con mọi hướng,
                // nhưng vùng in vẫn > 0 (gripper chỉ 12mm) nên KHÔNG ném ở tầng selector — So_Con=0 bị phơi bày.
                fc.double({ min: 90, max: 300, noNaN: true }),
                fc.double({ min: 90, max: 300, noNaN: true }),
                fc.integer({ min: 1, max: 1_000_000 }), // số lượng tốt cần giao
                (itemWcm, itemHcm, good) => {
                    const data = makeData({ source: 'unified' });
                    const kho = khoByLabel(data, '43cm x 65cm'); // khổ giấy lớn 65×86
                    const req: SoConRequest = { itemWcm, itemHcm, kho, data };

                    const outcome = resolveSoCon(req);

                    // So_Con = 0 được PHƠI BÀY (không âm thầm thành số dương / giá > 0).
                    expect(outcome.soConToLon).toBe(0);
                    expect(outcome.source).toBe('unified');

                    // Cascade tiêu thụ So_Con=0 phải CHẶN chia cho 0: sheets = 0, hữu hạn, không NaN/Infinity.
                    const r = cascadeProduct(good, outcome.soConToLon, [], []);
                    expect(r.sheetsNet).toBe(0);
                    expect(r.sheetsGross).toBe(0);
                    expect(Number.isFinite(r.sheetsNet)).toBe(true);
                    expect(Number.isFinite(r.sheetsGross)).toBe(true);
                    expect(Number.isNaN(r.sheetsNet)).toBe(false);
                },
            ),
            { numRuns: 200 },
        );
    });

    // Feature: offset-imposition-gripper-unification, Property 9: Shadow_Mode không làm đổi giá xuất ra (bật/tắt ShadowMode cho cùng So_Con dùng cho giá ở MỌI nguồn cố định; chỉ khác sự hiện diện của meta.shadow).
    it('Property 9: bật/tắt ShadowMode KHÔNG đổi So_Con xuất ra cho cùng nguồn (chỉ thêm meta.shadow)', () => {
        const labels = ['43cm x 65cm', '52cm x 72cm', '36cm x 79cm', '39.5cm x 54cm', '28cm x 60cm'];
        fc.assert(
            fc.property(
                // Kích thước con phủ cả ca lọt khổ (4..20cm) lẫn ca quá khổ (tới 120cm) để bao trùm
                // mọi So_Con (gồm 0); shadow không được làm đổi giá trị dùng cho giá trong mọi trường hợp.
                fc.double({ min: 4, max: 120, noNaN: true }),
                fc.double({ min: 4, max: 120, noNaN: true }),
                fc.constantFrom(...labels),
                // Nguồn mặc định CỐ ĐỊNH cho từng cặp so sánh: kiểm cả 'legacy' lẫn 'unified'.
                fc.constantFrom<'legacy' | 'unified'>('legacy', 'unified'),
                (itemWcm, itemHcm, khoLabel, source) => {
                    // Cùng input, chỉ khác cờ ShadowMode (0 vs 1) với CÙNG nguồn mặc định.
                    const off = makeData({ source, shadow: 0 });
                    const on = makeData({ source, shadow: 1 });
                    const khoOff = khoByLabel(off, khoLabel);
                    const khoOn = khoByLabel(on, khoLabel);

                    const reqOff: SoConRequest = { itemWcm, itemHcm, kho: khoOff, data: off };
                    const reqOn: SoConRequest = { itemWcm, itemHcm, kho: khoOn, data: on };

                    const outOff = resolveSoCon(reqOff);
                    const outOn = resolveSoCon(reqOn);

                    // (1) So_Con dùng cho GIÁ (soConToLon/soConBaiIn) PHẢI y hệt khi bật/tắt shadow.
                    expect(outOn.soConToLon).toBe(outOff.soConToLon);
                    expect(outOn.soConBaiIn).toBe(outOff.soConBaiIn);
                    // (2) Nguồn không đổi theo shadow.
                    expect(outOn.source).toBe(outOff.source);
                    expect(outOff.source).toBe(source);

                    // (3) Khác biệt DUY NHẤT là sự hiện diện của số liệu đối chiếu meta.shadow.
                    expect(outOff.shadow).toBeUndefined();
                    expect(outOn.shadow).toBeDefined();
                    // meta.shadow chứa So_Con của cả hai phương pháp nhưng KHÔNG tác động giá.
                    expect(outOn.shadow!.deltaToLon).toBe(
                        outOn.shadow!.unifiedToLon - outOn.shadow!.legacyToLon,
                    );
                    // Giá trị dùng cho giá khớp đúng nhánh nguồn trong số liệu shadow.
                    if (source === 'unified') {
                        expect(outOn.soConToLon).toBe(outOn.shadow!.unifiedToLon);
                    } else {
                        expect(outOn.soConToLon).toBe(outOn.shadow!.legacyToLon);
                    }
                },
            ),
            { numRuns: 200 },
        );
    });

    // Feature: offset-imposition-gripper-unification, Property 10: Cờ nguồn mặc định quyết định So_Con cho mọi loại sản phẩm (unified ⇒ imposeUnified, legacy/unknown ⇒ Legacy_Grid; meta.source khớp cờ).
    it('Property 10: So_Con khớp đúng nguồn theo cờ ImpositionSource (unified vs legacy/unknown)', () => {
        const labels = ['43cm x 65cm', '52cm x 72cm', '36cm x 79cm', '39.5cm x 54cm', '28cm x 60cm'];
        fc.assert(
            fc.property(
                // Kích thước con nhỏ (4..20cm) để lọt mọi khổ in trong fixture ⇒ cả hai nguồn cho > 0.
                fc.double({ min: 4, max: 20, noNaN: true }),
                fc.double({ min: 4, max: 20, noNaN: true }),
                fc.constantFrom(...labels),
                // Cờ nguồn: hợp lệ ('unified'/'legacy') + giá trị lạ + thiếu (undefined) → đều phải xử lý đúng.
                fc.constantFrom<unknown>('unified', 'legacy', 'bogus', '', undefined),
                (itemWcm, itemHcm, khoLabel, rawSource) => {
                    const data = makeData({ source: rawSource });
                    const params = data.tyLe.params;
                    const kho = khoByLabel(data, khoLabel);
                    const req: SoConRequest = { itemWcm, itemHcm, kho, data };

                    const outcome = resolveSoCon(req);

                    if (rawSource === 'unified') {
                        // Cờ = unified ⇒ So_Con bằng đúng kết quả imposeUnified; meta.source = 'unified'.
                        const u = refUnified(kho, params, itemWcm, itemHcm);
                        expect(outcome.source).toBe('unified');
                        expect(outcome.soConToLon).toBe(u.soConToLon);
                        expect(outcome.soConBaiIn).toBe(u.soConBaiIn);
                    } else {
                        // Mọi giá trị còn lại (legacy / lạ / thiếu) ⇒ mặc định an toàn Legacy_Grid.
                        const l = refLegacy(kho, params, itemWcm, itemHcm);
                        expect(outcome.source).toBe('legacy');
                        expect(outcome.soConToLon).toBe(l.soConToLon);
                        expect(outcome.soConBaiIn).toBe(l.soConBaiIn);
                    }
                },
            ),
            { numRuns: 200 },
        );
    });

    // Feature: offset-imposition-gripper-unification, Property 11: Một nguồn So_Con duy nhất cho cả giá và preview (soConToLon dùng cho giá ≡ giá trị phản ánh ở positions/meta cho preview).
    it('Property 11: So_Con dùng cho giá BẰNG số con phản ánh ở positions/meta cho preview (một nguồn duy nhất)', () => {
        const labels = ['43cm x 65cm', '52cm x 72cm', '36cm x 79cm', '39.5cm x 54cm', '28cm x 60cm'];
        fc.assert(
            fc.property(
                fc.double({ min: 4, max: 20, noNaN: true }),
                fc.double({ min: 4, max: 20, noNaN: true }),
                fc.constantFrom(...labels),
                (itemWcm, itemHcm, khoLabel) => {
                    const data = makeData({ source: 'unified' });
                    const kho = khoByLabel(data, khoLabel);
                    const req: SoConRequest = { itemWcm, itemHcm, kho, data };

                    const outcome = resolveSoCon(req);

                    // Nhánh unified phải đính positions + marginConfig để preview vẽ — cùng kết quả với giá.
                    expect(outcome.positions).toBeDefined();
                    expect(outcome.marginConfig).toBeDefined();

                    // PARITY: giá trị dùng cho giá (soConToLon = đầu vào Sheets_Net) BẰNG số con preview
                    // (positions.length). Không tồn tại hai con số khác nhau cho cùng input.
                    expect(outcome.positions!.length).toBe(outcome.soConToLon);

                    // Một nguồn duy nhất: soConToLon trùng đúng kết quả imposeUnified (được tính một lần).
                    const u = refUnified(kho, data.tyLe.params, itemWcm, itemHcm);
                    expect(outcome.soConToLon).toBe(u.soConToLon);

                    // Tất định: gọi lại cho cùng một giá trị (single source ổn định cho cả giá lẫn preview).
                    const again = resolveSoCon(req);
                    expect(again.soConToLon).toBe(outcome.soConToLon);
                    expect(again.positions!.length).toBe(outcome.positions!.length);
                },
            ),
            { numRuns: 200 },
        );
    });
});

/**
 * Engine-level corollary của Property 9: trên TOÀN engine (EngineOffsetService), bật/tắt ShadowMode
 * KHÔNG đổi giá xuất ra (`khachTra`, `tongChuaVAT`, `vat`, `donGia1SP`) cho cùng nguồn mặc định —
 * chỉ đính thêm `meta.shadow`. Đây là xác nhận end-to-end rằng số liệu shadow không rò vào giá.
 */
describe('Property 9 (engine corollary) — Shadow_Mode không đổi giá xuất ra ở EngineOffsetService', () => {
    /** Deep-clone dữ liệu mặc định để không chia sẻ tham chiếu singleton giữa các service. */
    function cloneDefaultData(): PricingData {
        return JSON.parse(JSON.stringify(loadDefaultPricingData())) as PricingData;
    }

    /** Tạo service với nguồn imposition + cờ shadow cố định (đổi qua cấu hình, không redeploy). */
    function makeService(source: 'legacy' | 'unified', shadow: 0 | 1): EngineOffsetService {
        const svc = new EngineOffsetService();
        const data = cloneDefaultData();
        data.tyLe.params.ImpositionSource = source;
        data.tyLe.params.ShadowMode = shadow;
        svc.setPricingData(data);
        return svc;
    }

    const d = loadDefaultPricingData();
    const mat = d.materials[0].code;
    const QUOTE_VAT = d.tyLe.params.TyLe_VAT;

    // Vài ca đại diện (to_roi, sp_khac, hop_giay) đủ để chứng minh shadow trung lập về giá.
    const CASES: Array<{ ten: string; input: OffsetEngineInput }> = [
        {
            ten: 'to_roi',
            input: {
                type: 'to_roi', kichThuoc: d.fixedSizes.toRoi[0].kichThuoc, materialCode: mat, soMatIn: 2, soLuong: 5000,
                kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: 'Màng bóng 2m', khuon: true, be: true,
                thanhPhamGap: 'may', catXen: true, dongGoi: true, thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            ten: 'sp_khac',
            input: {
                type: 'sp_khac', khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2, soLuong: 5000,
                soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', khuon: 0, be: false,
                thanhPham: 'khong', catXen: true, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            ten: 'hop_giay',
            input: {
                type: 'hop_giay', boxType: 'rte', cao: 10, rong: 8, hong: 4,
                khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2, soLuong: 5000,
                soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', be: true, danHop: 'khong',
                boi2Lop: false, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
    ];

    it.each(CASES)('$ten: khachTra/giá giống hệt khi shadow on/off; shadow chỉ thêm meta.shadow', ({ input }) => {
        for (const source of ['legacy', 'unified'] as const) {
            const off = makeService(source, 0).calculate(input);
            const on = makeService(source, 1).calculate(input);

            expect(off.success).toBe(true);
            expect(on.success).toBe(true);

            // Giá xuất ra PHẢI y hệt — shadow không tác động giá (Req 5.2).
            expect(on.data!.khachTra).toBe(off.data!.khachTra);
            expect(on.data!.tongChuaVAT).toBe(off.data!.tongChuaVAT);
            expect(on.data!.vat).toBe(off.data!.vat);
            expect(on.data!.tongGomVAT).toBe(off.data!.tongGomVAT);
            expect(on.data!.donGia1SP).toBe(off.data!.donGia1SP);

            // Khác biệt duy nhất: meta.shadow xuất hiện khi bật shadow.
            expect(off.data!.meta?.shadow).toBeUndefined();
            expect(on.data!.meta?.shadow).toBeDefined();
        }
    });
});
