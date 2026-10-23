import { EngineOffsetService } from '../engine-offset.service';
import { loadDefaultPricingData } from '../default-data';
import type { OffsetEngineInput } from '../engine-offset.service';

/**
 * HỢP ĐỒNG BASE CHIẾT KHẤU OFFSET (audit 2026-08-29).
 *
 * `totals.ts` quy định: `chietKhau = baseSXTK × rate`, trong đó `baseSXTK` CHỈ gồm chi phí
 * SẢN XUẤT + THIẾT KẾ, KHÔNG gồm giấy / kẽm / vật tư bề mặt.
 *
 * Hai sai lệch đã phát hiện và sửa:
 *  1. `hop_giay` cộng `cpGiayBoi` (dòng 'Giấy bồi' = giá tờ × số tờ nhập, tức VẬT TƯ) vào base.
 *  2. `bi_thu_folder` là sản phẩm duy nhất THIẾU `cpThietKe` trong base.
 *
 * Golden không đổi vì fixture golden dùng `thietKe: 0` và `boi2Lop: false` — chính vì vậy hai
 * lỗi trên tồn tại được mà không test nào thấy. Test này bịt đúng khoảng trống đó bằng cách
 * dùng giá trị KHÁC 0.
 *
 * Cách kiểm không phụ thuộc số tuyệt đối: so sánh DELTA chiết khấu giữa hai lần chạy chỉ khác
 * nhau một biến, nên test không phải re-baseline khi bảng giá đổi.
 */
describe('Offset — base chiết khấu chỉ gồm sản xuất + thiết kế', () => {
    const svc = new EngineOffsetService();
    const d = loadDefaultPricingData();
    const mat = d.materials[0].code;
    const VAT = d.tyLe.params.TyLe_VAT;
    const rate = Math.min(d.tyLe.params.TyLe_ChietKhau, d.tyLe.params.TyLe_ChietKhau_Max);

    const run = (input: OffsetEngineInput) => {
        const res = svc.calculate(input);
        expect(res.success).toBe(true);
        return res.data!;
    };

    const hopGiay = (over: Record<string, unknown> = {}): OffsetEngineInput => ({
        type: 'hop_giay', boxType: 'rte', cao: 10, rong: 8, hong: 4,
        khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2, soLuong: 5000,
        soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', be: true, danHop: 'khong',
        boi2Lop: false, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: VAT,
        ...over,
    } as any);

    const biThu = (over: Record<string, unknown> = {}): OffsetEngineInput => ({
        type: 'bi_thu_folder', kichThuoc: d.fixedSizes.biThuFolder[0].kichThuoc,
        materialCode: mat, soMatIn: 1, soLuong: 5000, kemType: 'Kẽm lớn', soKemIn: 4,
        vatTuBeMat: 'Không', khuon: true, be: true, thanhPhamDan: 'khong',
        dongGoi: true, thietKe: 0, vatRate: VAT,
        ...over,
    } as any);

    it('hop_giay: bật bồi 2 lớp KHÔNG làm chiết khấu tăng theo tiền GIẤY bồi', () => {
        const off = run(hopGiay({ boi2Lop: false }));
        const on = run(hopGiay({ boi2Lop: true }));

        const giayBoi = (on.lines.find((l) => l.label === 'Giấy bồi')?.amount ?? 0);
        const gcBoi = (on.lines.find((l) => l.label === 'GC bồi 2 lớp')?.amount ?? 0);
        expect(giayBoi).toBeGreaterThan(0); // ca thử phải thực sự phát sinh giấy bồi
        expect(gcBoi).toBeGreaterThan(0);

        // Chiết khấu chỉ được tăng theo CÔNG bồi, không theo tiền giấy bồi.
        expect(on.chietKhau - off.chietKhau).toBeCloseTo(gcBoi * rate, 6);
    });

    it('hop_giay: phí thiết kế VẪN nằm trong base chiết khấu', () => {
        const zero = run(hopGiay({ thietKe: 0 }));
        const paid = run(hopGiay({ thietKe: 1_000_000 }));
        expect(paid.chietKhau - zero.chietKhau).toBeCloseTo(1_000_000 * rate, 6);
    });

    it('bi_thu_folder: phí thiết kế nằm trong base chiết khấu (trước đây bị bỏ)', () => {
        const zero = run(biThu({ thietKe: 0 }));
        const paid = run(biThu({ thietKe: 1_000_000 }));
        expect(paid.chietKhau - zero.chietKhau).toBeCloseTo(1_000_000 * rate, 6);
    });

    it('cả 5 sản phẩm: phí thiết kế luôn vào base chiết khấu (quy ước thống nhất)', () => {
        const inputs: Record<string, (thietKe: number) => OffsetEngineInput> = {
            hop_giay: (t) => hopGiay({ thietKe: t }),
            bi_thu_folder: (t) => biThu({ thietKe: t }),
            to_roi: (t) => ({
                type: 'to_roi', kichThuoc: d.fixedSizes.toRoi[0].kichThuoc, materialCode: mat,
                soMatIn: 2, soLuong: 5000, kemType: 'Kẽm lớn', soKemIn: 4,
                vatTuBeMat: 'Màng bóng 2m', khuon: true, be: true, thanhPhamGap: 'may',
                catXen: true, dongGoi: true, thietKe: t, vatRate: VAT,
            } as any),
            sp_khac: (t) => ({
                type: 'sp_khac', khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2,
                soLuong: 5000, soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', khuon: 0, be: false,
                thanhPham: 'khong', catXen: true, dongGoi: true, epKimViTri: 'Không',
                thietKe: t, vatRate: VAT,
            } as any),
            tui_giay: (t) => ({
                type: 'tui_giay', soLuong: 5000, cao: 30, rong: 25, hong: 10, mi: 4,
                materialCode: mat, baiIn: '42cm x 60cm (dán nối)', soKem: 4, vatTuBeMat: 'Không',
                dayXach: { loai: 'khong', donGia: 0 }, thungCaton: { sl: 0, donGia: 0 },
                dongGoi: true, thietKe: t, vatRate: VAT,
            } as any),
        };

        for (const [name, build] of Object.entries(inputs)) {
            const zero = run(build(0));
            const paid = run(build(500_000));
            expect(paid.chietKhau - zero.chietKhau).toBeCloseTo(500_000 * rate, 6);
            expect(name).toBeTruthy();
        }
    });

    it('tăng giá GIẤY không làm tăng chiết khấu (bất biến chung của hợp đồng)', () => {
        // Đổi vật tư sang loại đắt hơn: tổng chưa VAT tăng, nhưng chiết khấu phải giữ nguyên
        // vì giấy không thuộc base.
        const cheap = d.materials[0].code;
        const other = d.materials.find((m) => m.priceNoVAT > d.materials[0].priceNoVAT);
        if (!other) return; // dữ liệu mặc định không có vật tư đắt hơn → bỏ qua

        const a = run(hopGiay({ materialCode: cheap }));
        const b = run(hopGiay({ materialCode: other.code }));
        expect(b.tongChuaVAT).toBeGreaterThan(a.tongChuaVAT);
        expect(b.chietKhau).toBeCloseTo(a.chietKhau, 6);
    });
});
