import { EngineOffsetService } from '../engine-offset.service';
import { loadDefaultPricingData } from '../default-data';

/**
 * Integration nhẹ: engine chạy với DỮ LIỆU THẬT đóng gói (data/*.json), không phải fixture test.
 * Xác nhận import JSON hoạt động và định tuyến theo type đúng.
 */
describe('EngineOffsetService (dữ liệu thật đóng gói)', () => {
    const svc = new EngineOffsetService();

    it('nạp được PricingData mặc định đầy đủ 8 nhóm', () => {
        const d = loadDefaultPricingData();
        expect(d.materials.length).toBeGreaterThan(20);
        expect(d.khoIn.length).toBeGreaterThan(5);
        expect(d.giaCong.length).toBeGreaterThanOrEqual(14);
        expect(d.tyLe.mocSoLuong.length).toBe(17);
        expect(d.tyLe.params.TyLe_VAT).toBe(0.08);
    });

    // Giá tính theo mô hình bù hao theo công đoạn (cascade) trên dữ liệu cấu hình.
    // Vì vậy chỉ kiểm BẤT BIẾN (tính được, đơn giá > 0), không khoá con số tuyệt đối.
    it('tính Tờ rơi (input mặc định) ra kết quả hợp lệ với dữ liệu thật', () => {
        const res = svc.calculate({
            type: 'to_roi',
            kichThuoc: '14.8cm x 20.5cm (tờ rơi, gấp giấy Coucher)',
            materialCode: 'C150',
            soMatIn: 2,
            soLuong: 5000,
            kemType: 'Kẽm lớn',
            soKemIn: 4,
            vatTuBeMat: 'Màng bóng 2m',
            khuon: true,
            be: true,
            thanhPhamGap: 'may',
            catXen: true,
            dongGoi: true,
            thietKe: 0,
        });
        expect(res.success).toBe(true);
        expect(res.data!.donGia1SP).toBeGreaterThan(0);
        expect(res.data!.tongChuaVAT).toBeGreaterThan(0);
    });

    it('type không hợp lệ → success=false', () => {
        const res = svc.calculate({ type: 'khong_co' } as any);
        expect(res.success).toBe(false);
        expect(res.error).toContain('không được hỗ trợ');
    });

    it('hỗ trợ chọn Kiểu trở bản: Bắt đôi (soBoKem=2) nhân đôi chi phí làm kẽm và tổng số bản kẽm so với Tự trở (soBoKem=1)', () => {
        const baseInput = {
            type: 'to_roi' as const,
            kichThuoc: '14.8cm x 20.5cm (tờ rơi, gấp giấy Coucher)',
            materialCode: 'C150',
            soMatIn: 2 as const,
            soLuong: 5000,
            soKemIn: 4,
            vatTuBeMat: 'Không',
            khuon: false,
            be: false,
            thanhPhamGap: 'khong' as const,
            catXen: true,
            dongGoi: true,
            thietKe: 0,
        };
        const tuTro = svc.calculate({ ...baseInput, soBoKem: 1 });
        const batDoi = svc.calculate({ ...baseInput, soBoKem: 2 });
        expect(tuTro.success).toBe(true);
        expect(batDoi.success).toBe(true);
        const kemTuTro = tuTro.data!.lines.find((l) => l.label === 'Làm kẽm')!.amount;
        const kemBatDoi = batDoi.data!.lines.find((l) => l.label === 'Làm kẽm')!.amount;
        expect(kemBatDoi).toBe(kemTuTro * 2);
        expect(tuTro.data!.meta?.soKem).toBe(4);
        expect(batDoi.data!.meta?.soKem).toBe(8);
        expect(batDoi.data!.meta?.soBoKem).toBe(2);
    });
});
