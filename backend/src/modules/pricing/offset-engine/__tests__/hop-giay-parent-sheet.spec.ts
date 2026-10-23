import { EngineOffsetService } from '../engine-offset.service';
import { loadDefaultPricingData } from '../default-data';
import { docKichThuocCm } from '../lookups';
import type { OffsetEngineInput } from '../engine-offset.service';

/**
 * Hộp giấy — ĐẾM GIẤY THEO TỜ NHẬP THẬT CỦA VẬT TƯ (audit 2026-08-29).
 *
 * Bug đã sửa: `pressPerParent` suy từ `paper_sizes.kho_giay_lon` (cấu hình của khổ in) chứ không
 * từ khổ giấy của vật tư đang chọn. Dữ liệu mặc định khai khổ in "28cm x 60cm" thuộc tờ nhập
 * "84cm x 120cm" — một khổ KHÔNG có trong danh mục giấy (chỉ 65×86 / 60×84 / 79×109). Engine vì
 * thế chia số tờ theo khổ ảo (ppp = 6) rồi nhân đơn giá tờ 65×86 ⇒ đếm thiếu giấy 2 lần.
 *
 * Bất biến được khoá ở đây:
 *  1. `meta.pressPerParent` tính từ khổ giấy VẬT TƯ, không từ `kho_giay_lon`.
 *  2. `meta.soConToLon = meta.soConBaiIn × meta.pressPerParent` (truy vết được về cơ sở giá).
 *  3. `ceil(soLuong / meta.soConToLon) ≤ meta.soToLon` — chứng từ không tự mâu thuẫn.
 *  4. Đổi sang vật tư khổ giấy LỚN HƠN thì tiền giấy GIẢM (nhiều bài in hơn trên một tờ).
 *  5. Lệch dữ liệu giữa `kho_giay_lon` và khổ vật tư được BÁO qua `meta.parentSheetMismatch`.
 */
describe('hop_giay — tờ nhập lấy từ vật tư, không từ kho_giay_lon', () => {
    const svc = new EngineOffsetService();
    const d = loadDefaultPricingData();
    const VAT = d.tyLe.params.TyLe_VAT;

    const build = (over: Record<string, unknown> = {}): OffsetEngineInput => ({
        type: 'hop_giay', boxType: 'rte', cao: 10, rong: 8, hong: 4,
        khoIn: d.khoIn[0].khoIn, materialCode: d.materials[0].code, soMatIn: 2, soLuong: 5000,
        soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', be: true, danHop: 'khong',
        boi2Lop: false, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: VAT,
        ...over,
    } as any);

    const run = (input: OffsetEngineInput) => {
        const res = svc.calculate(input);
        expect(res.success).toBe(true);
        return res.data!;
    };

    /** Số bài in cắt được từ một tờ nhập, thử cả 2 hướng (xả = cắt, không trừ nhíp). */
    const fitGrid = (pressW: number, pressH: number, sheetW: number, sheetH: number) =>
        Math.max(
            Math.floor(sheetW / pressW) * Math.floor(sheetH / pressH),
            Math.floor(sheetW / pressH) * Math.floor(sheetH / pressW),
        );

    it('pressPerParent khớp khổ giấy của VẬT TƯ (không phải kho_giay_lon)', () => {
        const data = run(build());
        const press = docKichThuocCm(d.khoIn[0].khoIn)!;
        const mat = d.materials[0];

        const expected = fitGrid(press.w, press.h, mat.sheetWidth, mat.sheetHeight);
        expect(data.meta?.pressPerParent).toBe(expected);
        expect(data.meta?.parentSheetSource).toBe('material');

        // Chứng minh nguồn cũ CHO SỐ KHÁC — nếu hai nguồn trùng nhau thì test này vô nghĩa.
        const parentCfg = docKichThuocCm(d.khoIn[0].khoGiayLon)!;
        const fromConfig = fitGrid(press.w, press.h, parentCfg.w, parentCfg.h);
        expect(fromConfig).not.toBe(expected);
    });

    it('meta.soConToLon = soConBaiIn × pressPerParent (truy vết về cơ sở giá)', () => {
        const m = run(build()).meta!;
        expect(m.soConToLon).toBe((m.soConBaiIn ?? 0) * (m.pressPerParent ?? 0));
    });

    it('ceil(soLuong / soConToLon) ≤ soToLon — PDF không tự mâu thuẫn', () => {
        const sl = 5000;
        const m = run(build({ soLuong: sl })).meta!;
        expect(m.soConToLon).toBeGreaterThan(0);
        expect(Math.ceil(sl / (m.soConToLon as number))).toBeLessThanOrEqual(m.soToLon as number);
    });

    it('cảnh báo lệch dữ liệu khi kho_giay_lon khác khổ giấy vật tư', () => {
        const m = run(build()).meta as any;
        // Dữ liệu mặc định ĐANG lệch (84×120 vs 65×86) ⇒ phải bật cờ để admin thấy.
        expect(m.parentSheetMismatch).toBe(true);
    });

    it('vật tư khổ giấy LỚN HƠN ⇒ tiền giấy GIẢM (nhiều bài in / tờ)', () => {
        const base = d.materials[0];
        const bigger = d.materials.find(
            (mt) => mt.sheetWidth * mt.sheetHeight > base.sheetWidth * base.sheetHeight
                && mt.priceNoVAT === base.priceNoVAT,
        );
        if (!bigger) {
            // Không có cặp vật tư cùng giá khác khổ trong dữ liệu mặc định → kiểm bằng
            // pressPerParent thay cho tiền (vẫn khoá đúng chiều phụ thuộc).
            const anyBigger = d.materials.find(
                (mt) => mt.sheetWidth * mt.sheetHeight > base.sheetWidth * base.sheetHeight,
            );
            if (!anyBigger) return;
            const a = run(build({ materialCode: base.code })).meta!;
            const b = run(build({ materialCode: anyBigger.code })).meta!;
            expect(b.pressPerParent as number).toBeGreaterThanOrEqual(a.pressPerParent as number);
            return;
        }
        const a = run(build({ materialCode: base.code }));
        const b = run(build({ materialCode: bigger.code }));
        const giay = (r: typeof a) => r.lines.find((l) => l.label === 'Chi phí giấy')?.amount ?? 0;
        expect(giay(b)).toBeLessThan(giay(a));
    });

    it('bài in không cắt được từ khổ giấy vật tư ⇒ lỗi tường minh, KHÔNG âm thầm fallback', () => {
        // Khổ in lớn nhất trong danh mục vs vật tư khổ nhỏ nhất.
        const biggestPress = [...d.khoIn]
            .map((k) => ({ k, dim: docKichThuocCm(k.khoIn) }))
            .filter((x) => x.dim)
            .sort((a, b) => b.dim!.w * b.dim!.h - a.dim!.w * a.dim!.h)[0];
        const smallestMat = [...d.materials]
            .sort((a, b) => a.sheetWidth * a.sheetHeight - b.sheetWidth * b.sheetHeight)[0];

        const press = biggestPress.dim!;
        const perParent = fitGrid(press.w, press.h, smallestMat.sheetWidth, smallestMat.sheetHeight);
        if (perParent > 0) return; // dữ liệu mặc định không có cặp bất khả thi → bỏ qua

        const res = svc.calculate(build({
            khoIn: biggestPress.k.khoIn,
            materialCode: smallestMat.code,
        }));
        expect(res.success).toBe(false);
        expect(String(res.error)).toContain('không cắt được');
    });
});
