/**
 * Dàn khuôn ĐỘNG theo hình học (phương án B) — tờ rơi/bì thư chế độ "nhập kích thước",
 * SP khác có kích thước. Khác chế độ khổ TĨNH (tra bảng) vốn vẫn giữ nguyên.
 */
import { imposeFromKhoIn } from '../lookups';
import { tinhToRoi } from '../products/to-roi';
import { tinhBiThuFolder } from '../products/bi-thu-folder';
import { tinhSpKhac } from '../products/sp-khac';
import { buildTuiOptions, tinhTuiGiay } from '../products/tui-giay';
import { chuanHoaKho } from '../lookups';
import { makePricingData } from './fixture';

const D = makePricingData();

describe('imposeFromKhoIn — hình học', () => {
    it('tính số con/bài & số con/tờ lớn dương cho sản phẩm lọt khổ', () => {
        const kho = { khoIn: '43cm x 65cm', khoGiayLon: '65cm x 86cm' };
        const r = imposeFromKhoIn(kho, 21, 29.7); // ~A4
        expect(r.soConBaiIn).toBeGreaterThan(0);
        expect(r.soConToLon).toBeGreaterThan(0);
        // Khổ giấy lớn chứa nhiều con hơn (hoặc bằng) khổ bài in.
        expect(r.soConToLon).toBeGreaterThanOrEqual(r.soConBaiIn);
    });

    it('sản phẩm lớn hơn khổ → 0 con', () => {
        const kho = { khoIn: '43cm x 65cm', khoGiayLon: '65cm x 86cm' };
        const r = imposeFromKhoIn(kho, 100, 100);
        expect(r.soConBaiIn).toBe(0);
        expect(r.soConToLon).toBe(0);
    });

    it('con nhỏ hơn → nhiều con hơn con lớn (đơn điệu)', () => {
        const kho = { khoIn: '43cm x 65cm', khoGiayLon: '65cm x 86cm' };
        const nho = imposeFromKhoIn(kho, 9, 5.5);
        const lon = imposeFromKhoIn(kho, 21, 29.7);
        expect(nho.soConToLon).toBeGreaterThan(lon.soConToLon);
    });

    it('lề/gripper làm giảm số con (trừ vào vùng in)', () => {
        const base = { khoIn: '43cm x 65cm', khoGiayLon: '65cm x 86cm' };
        const khongLe = imposeFromKhoIn(base, 21, 29.7);
        const coLe = imposeFromKhoIn({ ...base, marginLeft: 2, marginRight: 2, marginTop: 2, marginBottom: 2 }, 21, 29.7);
        expect(coLe.soConToLon).toBeLessThan(khongLe.soConToLon);
        expect(coLe.soConToLon).toBeGreaterThan(0);
    });
});

describe('buildTuiOptions — sinh động từ khổ giấy cấu hình', () => {
    const opts = buildTuiOptions(D);

    it('mỗi khổ tạo 2 phương án (thường + dán nối)', () => {
        expect(opts.length).toBe(D.khoIn.length * 2);
    });

    it('heSo (chia tờ) khớp giá trị hình học của khổ', () => {
        const find = (label: string) => opts.find((o) => o.label === label && !o.danNoi)!;
        expect(find('43cm x 65cm').heSo).toBe(2);
        expect(find('39.5cm x 54cm').heSo).toBe(4);
        expect(find('28cm x 60cm').heSo).toBe(6);
    });

    it('numW/numH = khổ in trừ gripper 1cm; kemLon suy từ loaiKem', () => {
        const o = opts.find((x) => x.label === '43cm x 65cm' && !x.danNoi)!;
        expect(o.numW).toBeCloseTo(42, 6);
        expect(o.numH).toBeCloseTo(64, 6);
        expect(opts.find((x) => x.label === '36cm x 79cm' && !x.danNoi)!.kemLon).toBe(true);
        expect(o.kemLon).toBe(false);
    });
});

describe('túi — engine tôn trọng whitelist khổ in (allowedKhoIn)', () => {
    const tuiBase = {
        type: 'tui_giay' as const, soLuong: 3000, cao: 20, rong: 15, hong: 6, mi: 3,
        materialCode: 'C300', soKem: 4, vatTuBeMat: 'Không',
        dayXach: { loai: 'khong' as const, donGia: 0 }, thungCaton: { sl: 0, donGia: 0 },
        dongGoi: true, thietKe: 0,
    };

    it('chỉ tự chọn trong khổ được cho phép', () => {
        const D2 = makePricingData();
        D2.productConfig = { tui_giay: { allowedKhoIn: ['43cm x 65cm'] } };
        const r = tinhTuiGiay({ ...tuiBase }, D2);
        // khoArea (khổ giấy lớn meta) phải thuộc khổ '43cm x 65cm'
        expect(chuanHoaKho(r.meta!.khoGiayLon!)).toBe('43cm x 65cm');
    });

    it('không whitelist → tự chọn trong toàn bộ khổ (có thể khác)', () => {
        const r = tinhTuiGiay({ ...tuiBase }, D);
        expect(r.meta!.khoBinh).toBeTruthy();
    });
});

describe('to_roi — 2 chế độ', () => {
    const base = {
        type: 'to_roi' as const, materialCode: 'C150', soMatIn: 2 as const, soLuong: 3000,
        soKemIn: 4, vatTuBeMat: 'Không', khuon: false, be: false, thanhPhamGap: 'khong' as const,
        catXen: false, dongGoi: false, thietKe: 0,
    };

    it('chế độ KHỔ TĨNH dùng số con tra bảng (không đổi)', () => {
        const r = tinhToRoi({ ...base, kichThuoc: '41cm x 29.7cm (tờ rơi, gấp giấy Coucher)' }, D);
        expect(r.meta!.soConToLon).toBe(4);   // từ fixture
        expect(r.meta!.soConBaiIn).toBe(2);
    });

    it('chế độ NHẬP KÍCH THƯỚC tính số con động từ khổ in', () => {
        const r = tinhToRoi({ ...base, khoIn: '43cm x 65cm', rong: 21, cao: 29.7 }, D);
        const ref = imposeFromKhoIn({ khoIn: '43cm x 65cm', khoGiayLon: '65cm x 86cm' }, 21, 29.7);
        expect(r.meta!.soConToLon).toBe(ref.soConToLon);
        expect(r.meta!.soConBaiIn).toBe(ref.soConBaiIn);
        expect(r.meta!.itemW).toBe(21);
        expect(r.meta!.itemH).toBe(29.7);
        expect(r.donGia1SP).toBeGreaterThan(0);
    });

    it('nhập kích thước nhưng sản phẩm quá lớn → lỗi', () => {
        expect(() => tinhToRoi({ ...base, khoIn: '43cm x 65cm', rong: 200, cao: 200 }, D))
            .toThrow(/quá lớn/);
    });

    it('không kichThuoc và không khoIn → lỗi', () => {
        expect(() => tinhToRoi({ ...base }, D)).toThrow(/khổ in/i);
    });

    it('KHỔ TĨNH + ImpositionAuto → tự tính số con theo hình học (bỏ qua số bảng)', () => {
        const Dauto = makePricingData();
        Dauto.tyLe.params.ImpositionAuto = 1;
        // Cố tình đặt số con bảng SAI để chứng minh chế độ auto ghi đè bằng hình học.
        const fs = Dauto.fixedSizes.toRoi.find(x => x.kichThuoc.startsWith('14.8cm x 20.5cm'))!;
        fs.soConBaiIn = 999; fs.soConToLon = 999;
        const r = tinhToRoi({ ...base, kichThuoc: '14.8cm x 20.5cm (tờ rơi, gấp giấy Coucher)' }, Dauto);
        const ref = imposeFromKhoIn({ khoIn: '43 x 65cm', khoGiayLon: '65 x 86cm' }, 14.8, 20.5);
        expect(r.meta!.soConToLon).toBe(ref.soConToLon);
        expect(r.meta!.soConBaiIn).toBe(ref.soConBaiIn);
        expect(r.meta!.soConToLon).not.toBe(999); // không dùng số bảng cứng
    });
});

describe('bi_thu_folder — chế độ NHẬP KÍCH THƯỚC', () => {
    it('tính động + cờ folder ×2 kẽm', () => {
        const r = tinhBiThuFolder({
            type: 'bi_thu_folder', khoIn: '39.5cm x 54cm', rong: 22, cao: 12, loai: 'bithu',
            materialCode: 'C150', soMatIn: 1, soLuong: 3000, soKemIn: 4, vatTuBeMat: 'Không',
            khuon: false, be: false, thanhPhamDan: 'khong', dongGoi: false, thietKe: 0,
        }, D);
        expect(r.meta!.soConToLon).toBeGreaterThan(0);
        expect(r.donGia1SP).toBeGreaterThan(0);
    });
});

describe('sp_khac — kích thước ghi đè số con tĩnh', () => {
    const base = {
        type: 'sp_khac' as const, khoIn: '43cm x 65cm', materialCode: 'C150', soMatIn: 2 as const,
        soLuong: 3000, soMau: 4, vatTuBeMat: 'Không', be: false, thanhPham: 'khong' as const,
        catXen: false, dongGoi: false, epKimViTri: 'Không', thietKe: 0,
    };

    it('không kích thước → dùng số con tĩnh của khổ in', () => {
        const r = tinhSpKhac({ ...base }, D);
        expect(r.meta!.soConToLon).toBe(4);    // kho.soConToLon từ fixture
        expect(r.meta!.soConBaiIn).toBe(2);
    });

    it('có kích thước → tính động (ghi đè)', () => {
        const r = tinhSpKhac({ ...base, rong: 9, cao: 5.5 }, D);
        const ref = imposeFromKhoIn({ khoIn: '43cm x 65cm', khoGiayLon: '65cm x 86cm' }, 9, 5.5);
        expect(r.meta!.soConToLon).toBe(ref.soConToLon);
        expect(r.meta!.soConToLon).toBeGreaterThan(4); // con nhỏ → nhiều hơn số tĩnh
    });

    it('(A3) khổ thiếu số con + không nhập kích thước → lỗi rõ (không Infinity)', () => {
        const D2 = makePricingData();
        D2.khoIn = [{ khoIn: '99cm x 99cm', chiaTo: '', soConBaiIn: 0, soConToLon: 0, khoGiayLon: '99cm x 99cm', dienTichM2: 0.98, loaiKem: 'Kẽm lớn' }, ...D2.khoIn];
        expect(() => tinhSpKhac({ ...base, khoIn: '99cm x 99cm' }, D2)).toThrow(/chưa cấu hình số con/);
    });
});
