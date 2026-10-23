import fc from 'fast-check';
import {
    imposeUnified,
    resolveMarginConfig,
    ImpositionInput,
    KhoMarginInput,
} from '../imposition';
import { MarginConfig, OffsetPricingError, Params } from '../pricing-data';

/**
 * Property tests cho Imposition_Service (hàm thuần) — nguồn sự thật duy nhất cho số con/tờ.
 * Mỗi correctness property của design được cài bằng ĐÚNG MỘT property-based test (fast-check, ≥100 vòng).
 */

/** Dựng một `Params` tối thiểu chỉ chứa các khóa imposition mà service đọc (cast an toàn cho test). */
function makeParams(p: Partial<Params> = {}): Params {
    return p as unknown as Params;
}

/**
 * Oracle đếm số ô trên một trục — mirror chính xác `countAxis` trong imposition.ts:
 * số con `n` lớn nhất sao cho `n*item + (n-1)*gutter ≤ usable` ⇔ `n ≤ (usable+gutter)/(item+gutter)`.
 * Dùng cùng SNAP_EPS=1e-6; với input mm nguyên, kết quả là tất định.
 */
const SNAP_EPS = 1e-6;
function refCountAxis(usable: number, item: number, gutter: number): number {
    if (item <= 0 || usable < item) return 0;
    const n = Math.floor((usable + gutter) / (item + gutter) + SNAP_EPS);
    return n > 0 ? n : 0;
}

/**
 * Oracle vùng in — mirror `imposeOnTarget` SAU sửa 2026-08-29:
 *  - tờ chuẩn hoá về landscape (nhíp luôn ở cạnh dài);
 *  - nhíp KHÔNG cộng dồn lề dưới: `max(bottom, gripper)`.
 * Xem chú thích lý do trong `imposition.ts` và bằng chứng parity trong
 * `imposition-nesting-parity.spec.ts`.
 */
function refUsable(c: {
    sheetWmm: number; sheetHmm: number;
    left: number; right: number; top: number; bottom: number; gripper: number;
}): { usableW: number; usableH: number } {
    const long = Math.max(c.sheetWmm, c.sheetHmm);
    const short = Math.min(c.sheetWmm, c.sheetHmm);
    return {
        usableW: long - c.left - c.right,
        usableH: short - c.top - Math.max(c.bottom, c.gripper),
    };
}

/**
 * Generator cấu hình HỢP LỆ theo mm nguyên: khổ đủ lớn và lề/gripper nhỏ nên vùng in luôn > 0
 * (sheet ≥ 200, mỗi lề ≤ 30, gripper ≤ 30 ⇒ usableW ≥ 140, usableH ≥ 110). Snap mm là đồng nhất
 * trên số nguyên nên oracle khớp tuyệt đối với implementation.
 */
const arbValidIntConfig = fc.record({
    sheetWmm: fc.integer({ min: 200, max: 1500 }),
    sheetHmm: fc.integer({ min: 200, max: 1500 }),
    itemWmm: fc.integer({ min: 10, max: 400 }),
    itemHmm: fc.integer({ min: 10, max: 400 }),
    left: fc.integer({ min: 0, max: 30 }),
    right: fc.integer({ min: 0, max: 30 }),
    top: fc.integer({ min: 0, max: 30 }),
    bottom: fc.integer({ min: 0, max: 30 }),
    gripper: fc.integer({ min: 0, max: 30 }),
    gutter: fc.integer({ min: 0, max: 20 }),
});

function toInput(c: {
    sheetWmm: number; sheetHmm: number; itemWmm: number; itemHmm: number;
    left: number; right: number; top: number; bottom: number; gripper: number; gutter: number;
}): ImpositionInput {
    const margins: MarginConfig = {
        left: c.left, right: c.right, top: c.top, bottom: c.bottom,
        gripper: c.gripper, gutter: c.gutter,
    };
    return {
        itemWmm: c.itemWmm, itemHmm: c.itemHmm,
        sheetWmm: c.sheetWmm, sheetHmm: c.sheetHmm,
        margins,
    };
}

describe('Imposition_Service — imposition.property', () => {
    // Feature: offset-imposition-gripper-unification, Property 1: Margin_Config được suy từ nguồn cấu hình (mapping cm→mm ×10, mặc định gripper/gutter, thiếu cạnh → 0).
    it('Property 1: resolveMarginConfig map cm→mm ×10, áp mặc định gripper/gutter, cạnh thiếu → 0', () => {
        fc.assert(
            fc.property(
                // Mỗi cạnh: undefined (thiếu → 0) hoặc một giá trị cm không âm.
                fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: undefined }),
                fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: undefined }),
                fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: undefined }),
                fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: undefined }),
                // gripper/gutter ở Kho_In (cm) — có thể thiếu để rơi về Params hoặc mặc định.
                fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: undefined }),
                fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: undefined }),
                // gripper/gutter ở Params (cm) — có thể thiếu để rơi về mặc định 1.2 / 0.3.
                fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: undefined }),
                fc.option(fc.double({ min: 0, max: 50, noNaN: true }), { nil: undefined }),
                (mL, mR, mT, mB, khoGrip, khoGut, paramGrip, paramGut) => {
                    const kho: KhoMarginInput = {
                        khoIn: '43cm x 65cm',
                        marginLeft: mL,
                        marginRight: mR,
                        marginTop: mT,
                        marginBottom: mB,
                        gripperCm: khoGrip,
                        gutterCm: khoGut,
                    };
                    const params = makeParams({ Gripper_Cm: paramGrip, Gutter_Cm: paramGut });
                    const mc = resolveMarginConfig(kho, params);

                    // Lề: cm × 10, cạnh thiếu → 0 (Req 1.2, 1.5).
                    expect(mc.left).toBeCloseTo((mL ?? 0) * 10, 9);
                    expect(mc.right).toBeCloseTo((mR ?? 0) * 10, 9);
                    expect(mc.top).toBeCloseTo((mT ?? 0) * 10, 9);
                    expect(mc.bottom).toBeCloseTo((mB ?? 0) * 10, 9);

                    // gripper/gutter: kho ?? params ?? mặc định, rồi × 10 (Req 1.3, 1.5).
                    const expGripCm = khoGrip ?? paramGrip ?? 1.2;
                    const expGutCm = khoGut ?? paramGut ?? 0.3;
                    expect(mc.gripper).toBeCloseTo(expGripCm * 10, 9);
                    expect(mc.gutter).toBeCloseTo(expGutCm * 10, 9);
                },
            ),
            { numRuns: 200 },
        );
    });

    // Feature: offset-imposition-gripper-unification, Property 2: Lề/gripper/gutter không hợp lệ (âm hoặc nuốt hết vùng in) bị từ chối bằng OffsetPricingError mô tả.
    it('Property 2: cấu hình không hợp lệ bị từ chối bằng OffsetPricingError mô tả, không trả số con', () => {
        // Branch A — một giá trị Margin_Config âm ⇒ resolveMarginConfig ném lỗi mô tả field sai.
        fc.assert(
            fc.property(
                fc.constantFrom<'marginLeft' | 'marginRight' | 'marginTop' | 'marginBottom' | 'gripperCm' | 'gutterCm'>(
                    'marginLeft', 'marginRight', 'marginTop', 'marginBottom', 'gripperCm', 'gutterCm',
                ),
                fc.double({ min: Math.fround(0.001), max: 50, noNaN: true }),
                (field, magnitude) => {
                    const kho: KhoMarginInput = { khoIn: '43cm x 65cm' };
                    (kho as unknown as Record<string, number>)[field] = -magnitude;
                    let thrown: unknown;
                    try {
                        resolveMarginConfig(kho, makeParams());
                    } catch (e) {
                        thrown = e;
                    }
                    expect(thrown).toBeInstanceOf(OffsetPricingError);
                    expect((thrown as Error).message).toContain('43cm x 65cm');
                    expect((thrown as Error).message).toContain('âm');
                },
            ),
            { numRuns: 200 },
        );

        // Branch B — lề nuốt hết vùng in (usableW ≤ 0) ⇒ imposeUnified ném lỗi, không trả số con.
        fc.assert(
            fc.property(
                fc.integer({ min: 50, max: 200 }), // sheetWmm
                fc.integer({ min: 200, max: 800 }), // sheetHmm
                fc.integer({ min: 10, max: 100 }),  // itemWmm
                fc.integer({ min: 10, max: 100 }),  // itemHmm
                (sheetWmm, sheetHmm, itemWmm, itemHmm) => {
                    // usableW được tính trên CẠNH DÀI (tờ chuẩn hoá landscape — sửa 2026-08-29),
                    // nên phải cho lề vượt max(W,H) mới chắc chắn vùng in ≤ 0.
                    const left = Math.max(sheetWmm, sheetHmm);
                    const right = 1;
                    const margins: MarginConfig = {
                        left, right, top: 0, bottom: 0, gripper: 0, gutter: 3,
                    };
                    let thrown: unknown;
                    let result: unknown;
                    try {
                        result = imposeUnified({ itemWmm, itemHmm, sheetWmm, sheetHmm, margins });
                    } catch (e) {
                        thrown = e;
                    }
                    expect(result).toBeUndefined();
                    expect(thrown).toBeInstanceOf(OffsetPricingError);
                    expect((thrown as Error).message).toContain('vùng in');
                },
            ),
            { numRuns: 200 },
        );
    });

    // Feature: offset-imposition-gripper-unification, Property 3: imposeUnified chọn hướng đặt nhiều con hơn (count = max(0°, 90°)).
    it('Property 3: soConToLon = max(count(0°), count(90°)) và ≥ mọi hướng đơn lẻ; số nguyên không âm', () => {
        fc.assert(
            fc.property(arbValidIntConfig, (c) => {
                const input = toInput(c);
                const res = imposeUnified(input);

                const { usableW, usableH } = refUsable(c);
                const count0 =
                    refCountAxis(usableW, c.itemWmm, c.gutter) * refCountAxis(usableH, c.itemHmm, c.gutter);
                const count90 =
                    refCountAxis(usableW, c.itemHmm, c.gutter) * refCountAxis(usableH, c.itemWmm, c.gutter);
                const expected = Math.max(count0, count90);

                expect(res.soConToLon).toBe(expected);
                expect(res.soConToLon).toBeGreaterThanOrEqual(count0);
                expect(res.soConToLon).toBeGreaterThanOrEqual(count90);
                expect(Number.isInteger(res.soConToLon)).toBe(true);
                expect(res.soConToLon).toBeGreaterThanOrEqual(0);
                // Hòa → 0° (tất định).
                expect(res.orientation).toBe(count0 >= count90 ? 0 : 90);
            }),
            { numRuns: 200 },
        );
    });

    // Feature: offset-imposition-gripper-unification, Property 4: imposeUnified tất định, không nhạy thứ tự phép tính float (cùng input → cùng kết quả; nhiễu float-equivalent cho cùng số con).
    it('Property 4: tất định — cùng input cho cùng kết quả; nhiễu float dưới ngưỡng snap không đổi số con', () => {
        fc.assert(
            fc.property(
                arbValidIntConfig,
                // Nhiễu BIỂU DIỄN float |δ| ≤ 1e-9 — đúng loại nhiễu mà Req 2.6 / audit-rules §8.3
                // nói tới ((a−b)·k vs a·k−b·k lệch ~1e-13). SNAP_EPS = 1e-6 hấp thụ hết.
                //
                // Cập nhật 2026-08-29: biên nhiễu cũ là ±0.05, hợp lệ khi snap dùng `Math.round`
                // (làm tròn về gần nhất). Nay vùng in làm tròn XUỐNG và con làm tròn LÊN để không
                // lạc quan hoá số con, nên ±0.05 KHÔNG còn là "float-equivalent" (con 100 + 0.05
                // ⇒ 101mm là một kích thước khác thật sự). Property vẫn khoá đúng bất biến gốc:
                // thứ tự/nhiễu phép tính float không được đổi số con.
                fc.array(fc.double({ min: -1e-9, max: 1e-9, noNaN: true }), { minLength: 10, maxLength: 10 }),
                fc.boolean(), // có kèm khổ bài in hay không
                (c, noise, withPress) => {
                    const press = withPress
                        ? { pressWmm: Math.round(c.sheetWmm / 2), pressHmm: Math.round(c.sheetHmm / 2) }
                        : {};
                    const base: ImpositionInput = { ...toInput(c), ...press };

                    // (a) Cùng input gọi nhiều lần → kết quả y hệt.
                    const r1 = imposeUnified(base);
                    const r2 = imposeUnified(base);
                    expect(r2).toEqual(r1);

                    // (b) Nhiễu float-equivalent (snap về cùng mm nguyên) → cùng số con & hướng.
                    const perturbed: ImpositionInput = {
                        itemWmm: c.itemWmm + noise[0],
                        itemHmm: c.itemHmm + noise[1],
                        sheetWmm: c.sheetWmm + noise[2],
                        sheetHmm: c.sheetHmm + noise[3],
                        ...(withPress
                            ? {
                                  pressWmm: (press.pressWmm as number) + noise[4],
                                  pressHmm: (press.pressHmm as number) + noise[5],
                              }
                            : {}),
                        margins: {
                            left: c.left + noise[6],
                            right: c.right + noise[7],
                            top: c.top + noise[8],
                            bottom: c.bottom + noise[9],
                            gripper: c.gripper,
                            gutter: c.gutter,
                        },
                    };
                    const rp = imposeUnified(perturbed);
                    expect(rp.soConToLon).toBe(r1.soConToLon);
                    expect(rp.soConBaiIn).toBe(r1.soConBaiIn);
                    expect(rp.orientation).toBe(r1.orientation);
                },
            ),
            { numRuns: 200 },
        );
    });

    // Feature: offset-imposition-gripper-unification, Property 5: Tăng lề/gripper/gutter không làm tăng số con (đơn điệu giảm).
    it('Property 5: tăng bất kỳ thành phần Margin_Config nào không làm tăng soConToLon', () => {
        fc.assert(
            fc.property(
                arbValidIntConfig,
                fc.constantFrom<keyof MarginConfig>('left', 'right', 'top', 'bottom', 'gripper', 'gutter'),
                fc.integer({ min: 1, max: 60 }), // mức tăng (mm)
                (c, field, bump) => {
                    const base = imposeUnified(toInput(c));

                    const bumpedInput = toInput(c);
                    bumpedInput.margins = { ...bumpedInput.margins, [field]: bumpedInput.margins[field] + bump };

                    let bumpedCount: number;
                    try {
                        bumpedCount = imposeUnified(bumpedInput).soConToLon;
                    } catch (e) {
                        // Tăng lề đến mức vùng in ≤ 0 ⇒ lỗi: số con hữu hiệu là 0, vẫn KHÔNG tăng.
                        expect(e).toBeInstanceOf(OffsetPricingError);
                        return;
                    }
                    expect(bumpedCount).toBeLessThanOrEqual(base.soConToLon);
                },
            ),
            { numRuns: 200 },
        );
    });
});
