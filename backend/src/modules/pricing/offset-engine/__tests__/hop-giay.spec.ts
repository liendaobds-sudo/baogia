import { makePricingData } from './fixture';
import { tinhHopGiay, HopGiayInput } from '../products/hop-giay';

/**
 * Hộp giấy — bù hao theo công đoạn + số con từ kích thước trải THỰC (dieline).
 *
 * Khuôn bế (`boxType`) nay BẮT BUỘC — engine luôn tính khổ trải chính xác bằng dieline,
 * KHÔNG còn chế độ ước lượng gần đúng theo "loại đáy". Các test dưới khẳng định bất biến
 * (cascade bù hao, không double-count, các dòng độc lập số con) thay vì hardcode số phụ
 * thuộc công thức ước lượng cũ.
 */
describe('Hộp giấy — cascade bù hao theo công đoạn (khuôn bế bắt buộc)', () => {
    const D = makePricingData();
    const input: HopGiayInput = {
        type: 'hop_giay',
        boxType: 'rte',
        cao: 10, rong: 5, hong: 5,
        materialCode: 'I250',
        soMatIn: 1,
        soLuong: 900,
        khoIn: '28cm x 60cm',
        soBoKem: 2,
        soMau: 4,
        vatTuBeMat: 'Không',
        be: true,
        danHop: 'auto',
        boi2Lop: false,
        dongGoi: false,
        epKimViTri: 'Không',
        thietKe: 0,
        // VAT truyền tường minh (mô phỏng % ở thông tin khách hàng) — engine không tự lấy từ config.
        vatRate: 0.08,
    };

    it('khổ trải tính bằng dieline: có mã tiêu chuẩn + số con/tờ + itemW/H dương', () => {
        const r = tinhHopGiay(input, D);
        expect(r.meta?.dielineStdCode).toBeTruthy();
        expect(r.meta?.soConToLon).toBeGreaterThan(0);
        expect(r.meta?.itemW).toBeGreaterThan(0);
        expect(r.meta?.itemH).toBeGreaterThan(0);
    });

    it('giấy tính theo TỜ NHẬP: cpGiay = giá tờ nhập × số tờ nhập (soToLon)', () => {
        // GĐ C — sửa lệch đơn vị: giá giấy = đơn giá 1 TỜ NHẬP × số TỜ NHẬP (parentGross),
        // KHÔNG phải × số tờ xả. `meta.soToLon` nay = số tờ nhập (đúng nghĩa "tờ lớn").
        const r = tinhHopGiay(input, D);
        const soConToLon = r.meta!.soConToLon!;            // con / tờ nhập
        const parentNet = Math.ceil(900 / soConToLon);     // tờ nhập tối thiểu
        // Số tờ nhập gross ≥ net (makeready + hao theo công đoạn).
        expect(r.meta!.soToLon!).toBeGreaterThanOrEqual(parentNet);
        const giay = r.lines.find((l) => l.label === 'Chi phí giấy')!.amount;
        const giaTo = D.materials.find((m) => m.code === 'I250')!.priceNoVAT;
        expect(giay).toBe(giaTo * r.meta!.soToLon!);
    });

    it('các dòng độc lập số con giữ nguyên; các dòng gia công dương', () => {
        const r = tinhHopGiay(input, D);
        const by = (l: string) => r.lines.find((x) => x.label.startsWith(l))!.amount;
        // Độc lập số con/khổ trải:
        expect(by('Làm kẽm')).toBe(400000); // don1Kem × soBoKem × soMau
        expect(by('Khuôn')).toBe(500000);   // phí cố định
        // Phụ thuộc số con/lượt in → chỉ khẳng định dương:
        expect(by('Lên bài')).toBeGreaterThan(0);
        expect(by('Bế')).toBeGreaterThan(0);
        expect(by('Dán hộp')).toBeGreaterThan(0);
    });

    it('KHÔNG double-count: tongGomVAT = tongChuaVAT × (1+VAT)', () => {
        const r = tinhHopGiay(input, D);
        expect(r.tongGomVAT).toBeCloseTo(r.tongChuaVAT * 1.08, 2);
        expect(r.haoHut).toBeGreaterThanOrEqual(0); // thông tin bù hao giấy
        expect(r.chietKhau).toBeGreaterThan(0);
        expect(r.donGia1SP).toBeGreaterThan(0);
    });

    it('bù hao công đoạn cấu hình được: bảng mốc BE ⇒ chi phí bế tăng', () => {
        const D2 = makePricingData();
        D2.wasteStages = { BE: { makeready: 0, tiers: [{ from: 1, rate: 0.06 }] } };
        const big: HopGiayInput = { ...input, soLuong: 5000 };
        const be = (r: any) => r.lines.find((l: any) => l.label === 'Bế').amount;
        expect(be(tinhHopGiay(big, D2))).toBeGreaterThan(be(tinhHopGiay(big, D)));
    });

    it('thiếu khuôn bế (boxType) → ném lỗi, không còn chế độ ước lượng', () => {
        const { boxType, ...noBox } = input;
        expect(() => tinhHopGiay(noBox as unknown as HopGiayInput, D)).toThrow(/kiểu hộp|khuôn bế/i);
    });
});
