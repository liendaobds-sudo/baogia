import { EngineOffsetService } from '../engine-offset.service';
import { loadDefaultPricingData } from '../default-data';
import { TUI_NEST_OPTIONS, buildTuiOptions } from '../products/tui-giay';

/**
 * Smoke test engine DUY NHẤT sau khi gỡ engine cũ (Req 21.3, 21.4):
 * mỗi loại trong 5 loại trả QuoteResult hợp lệ (success=true, donGia1SP > 0);
 * type không hợp lệ trả success=false.
 *
 * _Requirements: 21.3, 21.4_
 */
describe('EngineOffset — engine duy nhất (smoke 5 loại)', () => {
    const svc = new EngineOffsetService();
    const d = loadDefaultPricingData();
    const mat = d.materials[0].code;
    const vtbm = 'Không';

    it('to_roi → QuoteResult hợp lệ', () => {
        const fs = d.fixedSizes.toRoi[0];
        const res = svc.calculate({
            type: 'to_roi', kichThuoc: fs.kichThuoc, materialCode: mat, soMatIn: 2, soLuong: 5000,
            kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: vtbm, khuon: true, be: true,
            thanhPhamGap: 'khong', catXen: true, dongGoi: true, thietKe: 0,
        } as any);
        expect(res.success).toBe(true);
        expect(res.data!.donGia1SP).toBeGreaterThan(0);
        // meta phục vụ preview bình bài
        const m = res.data!.meta!;
        expect(m.soConToLon).toBeGreaterThan(0);
        expect(m.soToLon).toBeGreaterThan(0);
        expect(m.luotIn).toBeGreaterThan(0);
        expect(m.sheetW).toBeGreaterThan(0);
        expect(m.sheetH).toBeGreaterThan(0);
        expect(m.khoGiayLon).toBeTruthy();
    });

    it('bi_thu_folder → QuoteResult hợp lệ', () => {
        const fs = d.fixedSizes.biThuFolder[0];
        const res = svc.calculate({
            type: 'bi_thu_folder', kichThuoc: fs.kichThuoc, materialCode: mat, soMatIn: 1, soLuong: 5000,
            kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: vtbm, khuon: true, be: true,
            thanhPhamDan: 'khong', dongGoi: true, thietKe: 0,
        } as any);
        expect(res.success).toBe(true);
        expect(res.data!.donGia1SP).toBeGreaterThan(0);
    });

    it('sp_khac → QuoteResult hợp lệ', () => {
        const kho = d.khoIn[0].khoIn;
        const res = svc.calculate({
            type: 'sp_khac', khoIn: kho, materialCode: mat, soMatIn: 2, soLuong: 5000,
            soBoKem: 1, soMau: 4, vatTuBeMat: vtbm, khuon: 0, be: false,
            thanhPham: 'khong', catXen: true, dongGoi: true, epKimViTri: 'Không', thietKe: 0,
        } as any);
        expect(res.success).toBe(true);
        expect(res.data!.donGia1SP).toBeGreaterThan(0);
    });

    it('hop_giay → QuoteResult hợp lệ', () => {
        const kho = d.khoIn[0].khoIn;
        const res = svc.calculate({
            type: 'hop_giay', boxType: 'rte', cao: 10, rong: 8, hong: 4,
            khoIn: kho, materialCode: mat, soMatIn: 2, soLuong: 5000,
            soBoKem: 1, soMau: 4, vatTuBeMat: vtbm, be: true, danHop: 'khong',
            boi2Lop: false, dongGoi: true, epKimViTri: 'Không', thietKe: 0,
        } as any);
        expect(res.success).toBe(true);
        expect(res.data!.donGia1SP).toBeGreaterThan(0);
    });

    it('tui_giay → QuoteResult hợp lệ', () => {
        const bai = '42cm x 60cm (dán nối)';
        const res = svc.calculate({
            type: 'tui_giay', soLuong: 5000, cao: 30, rong: 25, hong: 10, mi: 4,
            materialCode: mat, baiIn: bai, soKem: 4, vatTuBeMat: vtbm,
            dayXach: { loai: 'khong', donGia: 0 }, thungCaton: { sl: 0, donGia: 0 },
            dongGoi: true, thietKe: 0,
        } as any);
        expect(res.success).toBe(true);
        expect(res.data!.donGia1SP).toBeGreaterThan(0);
    });

    it('tui_giay không lọt bài in → lỗi rõ, không trả giá với imposition=0', () => {
        const bai = (buildTuiOptions(d)[0] ?? TUI_NEST_OPTIONS[0]).label;
        const res = svc.calculate({
            type: 'tui_giay', soLuong: 5000, cao: 500, rong: 500, hong: 100, mi: 40,
            materialCode: mat, baiIn: bai, soKem: 4, vatTuBeMat: vtbm,
            dayXach: { loai: 'khong', donGia: 0 }, thungCaton: { sl: 0, donGia: 0 },
            dongGoi: true, thietKe: 0,
        } as any);

        expect(res.success).toBe(false);
        expect(res.data).toBeUndefined();
        expect(res.error).toContain('không thể bình');
    });

    it('type không hợp lệ → success=false', () => {
        const res = svc.calculate({ type: 'sai_type' } as any);
        expect(res.success).toBe(false);
    });

    it('whitelist: giấy in ngoài danh sách cho phép → success=false', () => {
        const svc2 = new EngineOffsetService();
        const data = loadDefaultPricingData();
        const matAllow = data.materials[0].code;
        const matDeny = data.materials.find((m) => m.code !== matAllow)!.code;
        data.productConfig = { sp_khac: { allowedMaterials: [matAllow] } };
        svc2.setPricingData(data);
        const kho = data.khoIn[0].khoIn;
        const base = {
            type: 'sp_khac' as const, khoIn: kho, soMatIn: 2 as const, soLuong: 3000,
            soMau: 4, vatTuBeMat: 'Không', be: false, thanhPham: 'khong' as const,
            catXen: false, dongGoi: false, epKimViTri: 'Không', thietKe: 0,
        };
        // Giấy được phép → OK.
        expect(svc2.calculate({ ...base, materialCode: matAllow } as any).success).toBe(true);
        // Giấy bị cấm → lỗi.
        const denied = svc2.calculate({ ...base, materialCode: matDeny } as any);
        expect(denied.success).toBe(false);
        expect(denied.error).toMatch(/Giấy in/);
    });

    it('whitelist: loại khuôn ngoài danh sách cho phép → success=false', () => {
        const svc2 = new EngineOffsetService();
        const data = loadDefaultPricingData();
        data.productConfig = { hop_giay: { allowedBoxTypes: ['rte'] } };
        svc2.setPricingData(data);
        const base = {
            type: 'hop_giay' as const,
            cao: 10, rong: 8, hong: 4, materialCode: data.materials[0].code,
            soMatIn: 1 as const, soLuong: 1000, soMau: 4, vatTuBeMat: 'Không',
            be: true, danHop: 'khong' as const, boi2Lop: false, dongGoi: false,
            epKimViTri: 'Không', thietKe: 0, khoIn: data.khoIn[0].khoIn,
        };
        // Khuôn được phép → OK.
        expect(svc2.calculate({ ...base, boxType: 'rte' } as any).success).toBe(true);
        // Khuôn bị cấm → lỗi rõ.
        const denied = svc2.calculate({ ...base, boxType: 'pizza' } as any);
        expect(denied.success).toBe(false);
        expect(denied.error).toMatch(/Loại khuôn/);
    });

    it('[O-02] to_roi: khi luotIn > MOQ bình bài, cpBinhBai = cpLenBai + cpChayMay (không nhân bình phương)', () => {
        const fs = d.fixedSizes.toRoi[0];
        const res = svc.calculate({
            type: 'to_roi', kichThuoc: fs.kichThuoc, materialCode: mat, soMatIn: 2, soLuong: 5000,
            kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: vtbm, khuon: false, be: false,
            thanhPhamGap: 'khong', catXen: false, dongGoi: false, thietKe: 0,
        } as any);
        expect(res.success).toBe(true);
        const lenBai = res.data!.lines.find((l) => l.label.includes('Lên bài'))!;
        const chayMay = res.data!.lines.find((l) => l.label.includes('chạy máy'))!;
        expect(lenBai.amount).toBeCloseTo(800000, 2);
        expect(chayMay.amount).toBeCloseTo(800000 * (10000 / 6000) - 800000, 2);
    });

    it('[O-04] tui_giay: khi soLuong < MOQ_GiaCong và có màng, XLBM áp đúng GiaMin_XLBM', () => {
        const bai = '42cm x 60cm (dán nối)';
        const res = svc.calculate({
            type: 'tui_giay', soLuong: 200, cao: 30, rong: 25, hong: 10, mi: 4,
            materialCode: mat, baiIn: bai, soKem: 4, vatTuBeMat: 'Màng bóng 1m',
            dayXach: { loai: 'khong', donGia: 0 }, thungCaton: { sl: 0, donGia: 0 },
            dongGoi: false, thietKe: 0,
        } as any);
        expect(res.success).toBe(true);
        const xlbm = res.data!.lines.find((l) => l.label.includes('XLBM'))!;
        expect(xlbm.amount).toBe(d.tyLe.params.GiaMin_XLBM);
    });

    it('[O-05] extraProcessingLines: công đoạn tùy chỉnh basis=sheet nhân theo sheetsGross thay vì sl', () => {
        const svc2 = new EngineOffsetService();
        const data = JSON.parse(JSON.stringify(loadDefaultPricingData()));
        data.giaCong.push({ code: 'UV_DINH_HINH', congDoan: 'UV định hình', billingMode: 'perUnit', tiers: [{ min: 1, max: 999999, price: 500 }] });
        data.wasteStages = {
            ...(data.wasteStages ?? {}),
            UV_DINH_HINH: { stageCode: 'UV_DINH_HINH', stageName: 'UV định hình', basis: 'sheet', billingMode: 'perSheet', wasteRate: 0, stageMakeready: 0, sortOrder: 99, isActive: true },
        };
        svc2.setPricingData(data);
        const res = svc2.calculate({
            type: 'sp_khac', khoIn: data.khoIn[0].khoIn, materialCode: mat, soMatIn: 1, soLuong: 5000,
            soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', khuon: 0, be: false,
            thanhPham: 'khong', catXen: false, dongGoi: false, epKimViTri: 'Không', thietKe: 0,
            extraProcessing: ['UV_DINH_HINH'],
        } as any);
        expect(res.success).toBe(true);
        const uvLine = res.data!.lines.find((l) => l.label === 'UV định hình')!;
        expect(uvLine).toBeDefined();
        expect(uvLine.amount).toBe(res.data!.meta!.soToLon! * 500);
    });
});
