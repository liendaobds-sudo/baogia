import { imposeUnified, resolveMarginConfig } from '../imposition';
import { loadDefaultPricingData } from '../default-data';
import { docKichThuocCm } from '../lookups';
import { nestRectOnSheet, marginsToNestOverrides } from '../../dieline';

/**
 * PARITY GIÁ ≡ PREVIEW — `imposeUnified` (nguồn số con để TÍNH GIÁ) phải khớp
 * `nestRectOnSheet` (nguồn số khuôn được VẼ ở preview / endpoint `/pricing/offset/dieline`).
 *
 * Đây là bất biến trung tâm của spec `offset-imposition-gripper-unification`
 * ("giá ≡ preview ≡ sản lượng máy in thực tế") nhưng TRƯỚC audit 2026-08-29 KHÔNG có test nào
 * so hai engine với nhau — chỉ có `_probe-rte.spec.ts` in log rồi `expect(true).toBe(true)`.
 *
 * Ba nguyên nhân lệch đã sửa trong `imposition.ts`:
 *  1. Trục nhíp phụ thuộc thứ tự chuỗi khổ (`"43cm x 65cm"` vs `"65cm x 43cm"` cho số con khác
 *     nhau) — nay chuẩn hoá tờ về landscape như `nestOnSheet`.
 *  2. Nhíp cộng dồn với lề dưới thay vì `max(bottom, gripper)` như `calcPrintableArea`.
 *  3. `Math.round` cho cả vùng in lẫn kích thước con ⇒ lạc quan hoá số con.
 */
describe('Parity imposeUnified ↔ nestRectOnSheet (giá ≡ preview)', () => {
    const d = loadDefaultPricingData();
    const params = d.tyLe.params;

    const uni = (itemWcm: number, itemHcm: number, sheetWcm: number, sheetHcm: number, kho: any) => {
        const margins = resolveMarginConfig(kho, params);
        return imposeUnified({
            itemWmm: itemWcm * 10,
            itemHmm: itemHcm * 10,
            sheetWmm: sheetWcm * 10,
            sheetHmm: sheetHcm * 10,
            margins,
        }).soConToLon;
    };

    const nest = (itemWcm: number, itemHcm: number, sheetWcm: number, sheetHcm: number, kho: any) => {
        const margins = resolveMarginConfig(kho, params);
        return nestRectOnSheet(
            itemWcm * 10, itemHcm * 10, sheetWcm * 10, sheetHcm * 10,
            marginsToNestOverrides(margins),
        ).countPerSheet;
    };

    /** Khổ in không khai lề riêng → dùng gripper/gutter từ params (đường chạy live). */
    const khoLive = { khoIn: '(test)' } as any;

    it('KHÔNG phụ thuộc thứ tự ghi chuỗi khổ (nhíp luôn ở cạnh dài)', () => {
        const cases: [number, number, number, number][] = [
            [14.8, 21, 43, 65],
            [10, 10, 30, 30],
            [21, 29.7, 79, 109],
            [9, 5.4, 65, 86],
        ];
        for (const [iw, ih, sw, sh] of cases) {
            expect(uni(iw, ih, sw, sh, khoLive)).toBe(uni(iw, ih, sh, sw, khoLive));
        }
    });

    it('khớp nestRectOnSheet trên mọi khổ in của bảng giá (một vài kích thước đại diện)', () => {
        const items: [number, number][] = [
            [14.8, 21],   // A5
            [21, 29.7],   // A4
            [9, 5.4],     // namecard
            [25.5, 21.2], // khổ trải hộp RTE 8×4×10
        ];
        const mismatches: string[] = [];
        for (const k of d.khoIn) {
            const sheet = docKichThuocCm(k.khoGiayLon);
            if (!sheet) continue;
            for (const [iw, ih] of items) {
                const a = uni(iw, ih, sheet.w, sheet.h, k);
                const b = nest(iw, ih, sheet.w, sheet.h, k);
                if (a !== b) {
                    mismatches.push(`${k.khoIn} (${sheet.w}×${sheet.h}) item ${iw}×${ih}: uni=${a} nest=${b}`);
                }
            }
        }
        expect(mismatches).toEqual([]);
    });

    it('snap KHÔNG lạc quan hoá: số con ≤ số con của hình học không snap', () => {
        // Ca đo được trước khi sửa: 100.4×100 trên 300×300 (lề/gripper/gutter = 0) cho 9 thay vì 6.
        const zeroKho = { khoIn: '(zero)', marginLeft: 0, marginRight: 0, marginTop: 0, marginBottom: 0, gripperCm: 0, gutterCm: 0 } as any;
        const exact = (iw: number, ih: number, sw: number, sh: number) => {
            const long = Math.max(sw, sh) * 10;
            const short = Math.min(sw, sh) * 10;
            const fit = (w: number, h: number) => Math.floor(long / w) * Math.floor(short / h);
            return Math.max(fit(iw * 10, ih * 10), fit(ih * 10, iw * 10));
        };
        const cases: [number, number, number, number][] = [
            [10.04, 10, 30, 30],
            [13.2, 10, 39.55, 30],
            [14.85, 21, 43, 65],
        ];
        for (const [iw, ih, sw, sh] of cases) {
            expect(uni(iw, ih, sw, sh, zeroKho)).toBeLessThanOrEqual(exact(iw, ih, sw, sh));
        }
    });

    it('nhíp không bị trừ hai lần: gripper ≤ lề dưới thì không đổi vùng in', () => {
        const withBigBottom = { khoIn: '(a)', marginBottom: 2, gripperCm: 1 } as any;
        const withoutGripper = { khoIn: '(b)', marginBottom: 2, gripperCm: 0 } as any;
        expect(uni(10, 10, 65, 86, withBigBottom)).toBe(uni(10, 10, 65, 86, withoutGripper));
    });
});
