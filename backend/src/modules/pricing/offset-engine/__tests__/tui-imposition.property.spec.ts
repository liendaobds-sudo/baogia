import fc from 'fast-check';

import { imposeUnified, resolveMarginConfig } from '../imposition';
import { docKichThuocCm } from '../lookups';
import { khoTraiTui, soConBaiUnified, TUI_COEF_DEFAULT } from '../products/tui-giay';
import { KhoIn, MarginConfig, OffsetPricingError, Params } from '../pricing-data';

/**
 * Property test cho Tui_Giay_Path — chứng minh `tui_giay` (ở chế độ `unified`) tính số con/bài
 * qua CÙNG primitive imposition (`imposeUnified`) với Margin_Config (lề/gripper/gutter) áp lên khổ
 * bài in, thay vì khe hở phẳng cũ. Đây là nguồn sự thật DUY NHẤT cho số con của túi.
 *
 * Property 12 (design): tui_giay tôn trọng cùng mô hình lề/gripper/gutter.
 * Mỗi correctness property được cài bằng ĐÚNG MỘT property-based test (fast-check, ≥100 vòng).
 */

const CM_TO_MM = 10;

/** Hệ số đổi đơn vị cm→mm + snap, mirror chính xác cơ chế tất định trong imposition.ts. */
const SNAP_EPS = 1e-6;
function snapMm(v: number): number {
    return Math.round(v + (v >= 0 ? SNAP_EPS : -SNAP_EPS));
}

/**
 * Oracle ĐỘC LẬP cho mô hình dàn khuôn vật lý (không gọi imposeUnified): đếm số con trên một
 * khổ đích sau khi trừ lề/gripper/gutter, thử cả 2 hướng. Trả `null` khi vùng in khả dụng ≤ 0
 * (tương ứng imposeUnified ném OffsetPricingError). Dùng để chứng minh số con của túi đúng MÔ HÌNH.
 *
 * Cập nhật 2026-08-29 (audit) — đồng bộ với `imposeOnTarget` đã sửa:
 *   - tờ chuẩn hoá về landscape (nhíp luôn ở cạnh DÀI, không phụ thuộc thứ tự ghi khổ);
 *   - nhíp KHÔNG cộng dồn lề dưới: `max(bottom, gripper)`;
 *   - vùng in làm tròn XUỐNG, con làm tròn LÊN (không lạc quan hoá số con).
 * Bằng chứng hướng sửa: `imposition-nesting-parity.spec.ts` (giá ≡ preview).
 */
function gridCount(
    itemWmm: number,
    itemHmm: number,
    sheetWmm: number,
    sheetHmm: number,
    m: MarginConfig,
): number | null {
    const long = Math.max(sheetWmm, sheetHmm);
    const short = Math.min(sheetWmm, sheetHmm);
    const usableW = Math.floor(long - m.left - m.right + SNAP_EPS);
    const usableH = Math.floor(short - m.top - Math.max(m.bottom, m.gripper) + SNAP_EPS);
    if (usableW <= 0 || usableH <= 0) return null;
    const w = Math.ceil(itemWmm - SNAP_EPS);
    const h = Math.ceil(itemHmm - SNAP_EPS);
    const g = snapMm(m.gutter);
    const axis = (usable: number, item: number): number => {
        if (item <= 0 || usable < item) return 0;
        const n = Math.floor((usable + g) / (item + g) + SNAP_EPS);
        return n > 0 ? n : 0;
    };
    const c0 = axis(usableW, w) * axis(usableH, h);
    const c90 = axis(usableW, h) * axis(usableH, w);
    return Math.max(c0, c90);
}

/** Cấu hình lề/gripper/gutter (cm) — gripper/gutter đặt ở params; lề (margin*) đặt ở Kho_In. */
interface Cfg {
    marginLeft: number;
    marginRight: number;
    marginTop: number;
    marginBottom: number;
    gripperCm: number;
    gutterCm: number;
}

/** Dựng `Params` tối thiểu chỉ chứa Gripper_Cm/Gutter_Cm mà soConBaiUnified đọc qua resolveMarginConfig. */
function makeParams(cfg: Cfg): Params {
    return { Gripper_Cm: cfg.gripperCm, Gutter_Cm: cfg.gutterCm } as unknown as Params;
}

/** Dựng một "bài in" túi (NestOption) gắn Kho_In mang lề từ cfg; gripper/gutter rơi về params. */
function makeOpt(khoArea: string, danNoi: boolean, cfg: Cfg) {
    const kho: KhoIn = {
        khoIn: khoArea,
        chiaTo: '',
        soConBaiIn: 0,
        soConToLon: 0,
        khoGiayLon: khoArea,
        dienTichM2: 0,
        loaiKem: 'Kẽm nhỏ',
        marginLeft: cfg.marginLeft,
        marginRight: cfg.marginRight,
        marginTop: cfg.marginTop,
        marginBottom: cfg.marginBottom,
    };
    return { label: khoArea, numW: 0, numH: 0, heSo: 1, khoArea, danNoi, kemLon: false, kho };
}

/** Oracle số con/bài của túi (unified): mô hình grid trên khổ bài in với khổ trải túi; dán nối ⇒ /2. */
function oracleTuiCount(
    opt: ReturnType<typeof makeOpt>,
    kt: ReturnType<typeof khoTraiTui>,
    cfg: Cfg,
): number {
    const press = docKichThuocCm(opt.khoArea);
    if (!press) return 0;
    const caoCon = opt.danNoi ? kt.danNoiCao : kt.caoTrai; // chiều cao con (cm)
    const rongCon = opt.danNoi ? kt.danNoiRong : kt.rongTrai; // chiều rộng con (cm)
    const margins = resolveMarginConfig(opt.kho, makeParams(cfg));
    const base = gridCount(
        rongCon * CM_TO_MM,
        caoCon * CM_TO_MM,
        press.w * CM_TO_MM,
        press.h * CM_TO_MM,
        margins,
    );
    if (base === null) return 0; // vùng in ≤ 0 ⇒ soConBaiUnified bắt lỗi và trả 0
    return opt.danNoi ? base / 2 : base;
}

/** Khổ bài in túi dùng cho test (đủ rộng để khổ trải túi nhỏ lọt nhiều con). */
const PRESS_LABELS = ['43cm x 65cm', '52cm x 72cm', '65cm x 86cm', '79cm x 109cm'];

/** Túi nhỏ để khổ trải lọt khổ bài in (lề/gripper/gutter ở mức cm thực tế). */
const arbBag = fc.record({
    cao: fc.integer({ min: 5, max: 22 }),
    rong: fc.integer({ min: 4, max: 14 }),
    hong: fc.integer({ min: 2, max: 7 }),
    mi: fc.integer({ min: 2, max: 5 }),
});

/** Cấu hình lề/gripper/gutter không âm (cm). */
const arbCfg: fc.Arbitrary<Cfg> = fc.record({
    marginLeft: fc.integer({ min: 0, max: 3 }),
    marginRight: fc.integer({ min: 0, max: 3 }),
    marginTop: fc.integer({ min: 0, max: 3 }),
    marginBottom: fc.integer({ min: 0, max: 3 }),
    gripperCm: fc.integer({ min: 0, max: 3 }),
    gutterCm: fc.integer({ min: 0, max: 2 }),
});

describe('Tui_Giay_Path — tui-imposition.property', () => {
    // Feature: offset-imposition-gripper-unification, Property 12: tui_giay tôn trọng cùng mô hình lề/gripper/gutter (số con/bài tính qua primitive imposeUnified trên khổ trải túi + khổ bài in; tăng lề/gripper/gutter không làm tăng số con).
    it('Property 12: số con/bài của túi khớp mô hình imposeUnified và đơn điệu giảm theo lề/gripper/gutter', () => {
        // Branch A — PARITY MÔ HÌNH: soConBaiUnified khớp oracle grid (khổ trải túi xếp trên khổ
        // bài in sau khi trừ lề/gripper/gutter; dán nối ⇒ /2). Chứng minh túi dùng đúng primitive
        // imposition thay khe hở phẳng — KHÔNG còn số con lạc quan bỏ qua ràng buộc máy in.
        fc.assert(
            fc.property(
                arbBag,
                arbCfg,
                fc.constantFrom(...PRESS_LABELS),
                fc.boolean(), // danNoi
                (bag, cfg, khoArea, danNoi) => {
                    const kt = khoTraiTui(bag, TUI_COEF_DEFAULT);
                    const opt = makeOpt(khoArea, danNoi, cfg);
                    const params = makeParams(cfg);

                    const got = soConBaiUnified(opt, kt, params);
                    const expected = oracleTuiCount(opt, kt, cfg);

                    expect(got.count).toBe(expected);
                    expect(got.count).toBeGreaterThanOrEqual(0);

                    // Khi tính được hình học (vùng in > 0) phải đính marginConfig (mm) cho parity preview;
                    // và marginConfig khớp resolveMarginConfig (cùng nguồn lề/gripper/gutter).
                    if (got.count > 0) {
                        expect(got.positions).toBeDefined();
                        expect(got.marginConfig).toEqual(resolveMarginConfig(opt.kho, params));
                        // positions phản ánh chính số con/bài trên khổ (trước khi chia dán nối).
                        const base = danNoi ? got.count * 2 : got.count;
                        expect(got.positions!.length).toBe(base);
                    }
                },
            ),
            { numRuns: 200 },
        );

        // Branch B — ĐƠN ĐIỆU: tăng bất kỳ thành phần Margin_Config nào (lề/gripper/gutter) trong
        // khi giữ nguyên túi + khổ bài in thì số con/bài KHÔNG tăng. Bằng chứng lề/gripper thực sự
        // bị trừ khỏi vùng in (giá tôn trọng ràng buộc máy in vật lý — Req 9.3).
        fc.assert(
            fc.property(
                arbBag,
                arbCfg,
                fc.constantFrom(...PRESS_LABELS),
                fc.boolean(),
                fc.constantFrom<keyof Cfg>(
                    'marginLeft',
                    'marginRight',
                    'marginTop',
                    'marginBottom',
                    'gripperCm',
                    'gutterCm',
                ),
                fc.integer({ min: 1, max: 8 }), // mức tăng (cm)
                (bag, cfg, khoArea, danNoi, field, bumpCm) => {
                    const kt = khoTraiTui(bag, TUI_COEF_DEFAULT);

                    const baseOpt = makeOpt(khoArea, danNoi, cfg);
                    const baseCount = soConBaiUnified(baseOpt, kt, makeParams(cfg)).count;

                    const bumpedCfg: Cfg = { ...cfg, [field]: cfg[field] + bumpCm };
                    const bumpedOpt = makeOpt(khoArea, danNoi, bumpedCfg);
                    const bumpedCount = soConBaiUnified(bumpedOpt, kt, makeParams(bumpedCfg)).count;

                    // Tăng lề/gripper/gutter ⇒ số con không tăng (kể cả khi vùng in bị nuốt → count 0).
                    expect(bumpedCount).toBeLessThanOrEqual(baseCount);

                    // soConBaiUnified KHÔNG ném khi vùng in ≤ 0 (bắt OffsetPricingError, trả 0) —
                    // đảm bảo vòng tự chọn bài in của tui_giay không vỡ.
                    expect(() => soConBaiUnified(bumpedOpt, kt, makeParams(bumpedCfg))).not.toThrow(
                        OffsetPricingError,
                    );
                },
            ),
            { numRuns: 200 },
        );
    });
});
