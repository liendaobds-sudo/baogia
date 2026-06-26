import { OrdersService } from '../orders.service';
import { EngineOffsetService } from '../../offset-engine/engine-offset.service';
import { loadDefaultPricingData } from '../../offset-engine/default-data';

/**
 * OrdersService.recomputeOffsetItems — server TÍNH LẠI giá offset từ cấu hình đã lưu,
 * KHÔNG tin `item_total` client gửi (chống sửa giá). Item không phải offset giữ nguyên.
 */
describe('OrdersService — recompute offset (chống sửa giá)', () => {
    const eng = new EngineOffsetService(); // không ConfigStore → dùng default JSON
    const d = loadDefaultPricingData();
    // OrdersService chỉ dùng engineOffset trong helper này → các dep khác để trống.
    const svc = new OrdersService({} as any, {} as any, {} as any, eng);

    const baseConfig = {
        type: 'sp_khac' as const,
        khoIn: d.khoIn[0].khoIn,
        materialCode: d.materials[0].code,
        soMatIn: 2 as const, soLuong: 3000, soMau: 4, vatTuBeMat: 'Không',
        be: false, thanhPham: 'khong' as const, catXen: false, dongGoi: false,
        epKimViTri: 'Không', thietKe: 0,
    };

    it('ghi đè item_total bằng giá engine (TRƯỚC VAT, sau chiết khấu), bỏ qua giá client gian lận', () => {
        const expected = eng.calculate(baseConfig).data!;
        const net = expected.tongChuaVAT - expected.chietKhau;
        const items: any[] = [
            { product_name: 'SP', quantity: baseConfig.soLuong, item_total: 1, printing_detail: { offset: true, config: baseConfig } },
        ];
        const agg = (svc as any).recomputeOffsetItems(items);
        expect(agg.count).toBe(1);
        expect(items[0].item_total).toBeCloseTo(net, 2);                    // trước VAT, sau chiết khấu (KHÔNG còn là 1)
        expect(items[0].printing_detail.result.khachTra).toBeCloseTo(expected.khachTra, 2);
        expect(agg.sumPreVatNet).toBeCloseTo(net, 2);
        expect(agg.sumChietKhau).toBeCloseTo(expected.chietKhau, 2);
    });

    it('item không phải offset → giữ nguyên', () => {
        const items: any[] = [{ item_total: 500, printing_detail: { offset: false } }];
        const agg = (svc as any).recomputeOffsetItems(items);
        expect(agg.count).toBe(0);
        expect(items[0].item_total).toBe(500);
    });

    it('cấu hình lỗi → ném lỗi (không âm thầm tin giá client)', () => {
        const items: any[] = [
            { product_name: 'Lỗi', printing_detail: { offset: true, config: { type: 'sp_khac', khoIn: 'KHONG_TON_TAI', materialCode: 'X', soMatIn: 2, soLuong: 1000, soMau: 4, vatTuBeMat: 'Không', be: false, thanhPham: 'khong', catXen: false, dongGoi: false, epKimViTri: 'Không' } } },
        ];
        expect(() => (svc as any).recomputeOffsetItems(items)).toThrow(/Không tính lại được giá offset/);
    });
});
