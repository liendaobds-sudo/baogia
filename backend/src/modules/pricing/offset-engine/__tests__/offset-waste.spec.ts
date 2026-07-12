import { makePricingData } from './fixture';
import { tinhToRoi } from '../products/to-roi';
import { tinhBiThuFolder } from '../products/bi-thu-folder';
import { tinhSpKhac } from '../products/sp-khac';
import { tinhTuiGiay } from '../products/tui-giay';
import { QuoteResult } from '../pricing-data';
import { wasteRate, buildWaste, effectiveBasis } from '../products/_waste-stages';

/**
 * Bù hao theo công đoạn cho 4 sản phẩm còn lại + bảng mốc riêng + basis đổi được.
 */
const D = makePricingData();
// VAT BẮT BUỘC truyền tường minh vào engine (mô phỏng % nhập ở thông tin khách hàng).
// Engine KHÔNG còn tự lấy VAT từ cấu hình; ở đây dùng đúng giá trị config cũ để giữ bất biến.
const VAT = D.tyLe.params.TyLe_VAT;

const noDoubleCount = (r: QuoteResult) => {
    expect(r.tongGomVAT).toBeCloseTo(r.tongChuaVAT * (1 + VAT), 2);
    expect(r.donGia1SP).toBeGreaterThan(0);
    expect(r.tongChuaVAT).toBeGreaterThan(0);
};

describe('Offset — bù hao theo công đoạn (4 sản phẩm)', () => {
    it('tờ rơi', () => {
        noDoubleCount(tinhToRoi({
            type: 'to_roi', kichThuoc: '14.8cm x 20.5cm (tờ rơi, gấp giấy Coucher)',
            materialCode: 'C150', soMatIn: 2, soLuong: 5000, kemType: 'Kẽm lớn', soKemIn: 4,
            vatTuBeMat: 'Màng bóng 2m', khuon: true, be: true, thanhPhamGap: 'may', catXen: true, dongGoi: true, thietKe: 0,
            vatRate: VAT,
        }, D));
    });
    it('bì thư', () => {
        noDoubleCount(tinhBiThuFolder({
            type: 'bi_thu_folder', kichThuoc: 'Bì thư 22 x 12 x nắp 3cm', materialCode: 'C150', soMatIn: 1,
            soLuong: 2000, kemType: 'Kẽm nhỏ', soKemIn: 4, vatTuBeMat: 'Không', khuon: true, be: true,
            thanhPhamDan: 'tc', dongGoi: true, thietKe: 0, vatRate: VAT,
        }, D));
    });
    it('sp khác', () => {
        noDoubleCount(tinhSpKhac({
            type: 'sp_khac', khoIn: '36cm x 79cm', materialCode: 'C150', soMatIn: 1, soLuong: 5000,
            soBoKem: 2, soMau: 4, vatTuBeMat: 'Màng bóng 1m', khuon: 0, be: true, thanhPham: 'khong',
            catXen: true, dongGoi: true, epKimViTri: '1 vị trí', thietKe: 0, vatRate: VAT,
        }, D));
    });
    it('túi giấy', () => {
        noDoubleCount(tinhTuiGiay({
            type: 'tui_giay', soLuong: 3000, cao: 20, rong: 15, hong: 6, mi: 3, materialCode: 'C300',
            baiIn: '43 x 65cm', soKem: 4, vatTuBeMat: 'Không', dayXach: { loai: '2', donGia: 500 },
            thungCaton: { sl: 10, donGia: 20000 }, dongGoi: true, thietKe: 0, vatRate: VAT,
        }, D));
    });
});

describe('Tự suy định mức (bỏ trường thừa khỏi form)', () => {
    it('tờ rơi: loại kẽm SUY từ khổ in (không cần truyền kemType)', () => {
        const r = tinhToRoi({
            type: 'to_roi', kichThuoc: '14.8cm x 20.5cm (tờ rơi, gấp giấy Coucher)',
            materialCode: 'C150', soMatIn: 1, soLuong: 5000, soKemIn: 4,
            vatTuBeMat: 'Không', khuon: false, be: true, thanhPhamGap: 'khong', catXen: true, dongGoi: true, thietKe: 0,
        }, D);
        // khổ '43 x 65cm' → kho_in '43cm x 65cm' loaiKem 'Kẽm nhỏ'
        expect(r.meta?.loaiKem).toBe('Kẽm nhỏ');
        expect(r.donGia1SP).toBeGreaterThan(0);
    });

    it('túi: tự chọn bài in khi không truyền baiIn', () => {
        const r = tinhTuiGiay({
            type: 'tui_giay', soLuong: 3000, cao: 20, rong: 15, hong: 6, mi: 3, materialCode: 'C300',
            soKem: 4, vatTuBeMat: 'Không', dayXach: { loai: 'khong', donGia: 0 },
            thungCaton: { sl: 0, donGia: 0 }, dongGoi: true, thietKe: 0,
        }, D);
        expect(r.meta?.khoBinh).toBeTruthy();   // đã chọn được bài in
        expect(r.donGia1SP).toBeGreaterThan(0);
    });
});

describe('Bảng mốc số lượng RIÊNG mỗi công đoạn + basis đổi được', () => {
    it('mỗi công đoạn tra bảng mốc riêng (bế ≠ dán); chưa cấu hình = 0; IN mặc định theo đường cong', () => {
        const D2 = makePricingData();
        D2.wasteStages = {
            BE: { makeready: 0, tiers: [{ from: 1, rate: 0.1 }, { from: 5000, rate: 0.06 }, { from: 50000, rate: 0.03 }] },
            DAN: { makeready: 0, tiers: [{ from: 1, rate: 0.04 }, { from: 10000, rate: 0.02 }] },
        };
        expect(wasteRate(D2, 'BE', 1000)).toBeCloseTo(0.1, 6);
        expect(wasteRate(D2, 'BE', 50000)).toBeCloseTo(0.03, 6);
        expect(wasteRate(D2, 'DAN', 1000)).toBeCloseTo(0.04, 6);
        expect(wasteRate(D2, 'CATXEN', 1000)).toBe(0);
        expect(wasteRate(D2, 'IN', 1000)).toBeGreaterThan(0);
    });

    it('basis công đoạn đổi được: bế theo TỜ thì tính ở thang số tờ', () => {
        const defs = [{ code: 'IN', defaultBasis: 'sheet' as const }, { code: 'BE', defaultBasis: 'piece' as const }];
        const Dpiece = makePricingData();
        Dpiece.wasteStages = { BE: { makeready: 0, tiers: [{ from: 1, rate: 0.1 }] } };
        expect(effectiveBasis(Dpiece, 'BE', 'piece')).toBe('piece');
        expect(buildWaste(Dpiece, 1000, 4, defs).q('BE')).toBeGreaterThan(1000);

        const Dsheet = makePricingData();
        Dsheet.wasteStages = { BE: { basis: 'sheet', makeready: 0, tiers: [{ from: 1, rate: 0.1 }] } };
        expect(effectiveBasis(Dsheet, 'BE', 'piece')).toBe('sheet');
        expect(buildWaste(Dsheet, 1000, 4, defs).q('BE')).toBeLessThan(500);
    });
});
