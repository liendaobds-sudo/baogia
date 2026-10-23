import { EngineOffsetService } from '../engine-offset.service';
import { loadDefaultPricingData } from '../default-data';
import type { OffsetEngineInput } from '../engine-offset.service';

/**
 * GOLDEN TEST — Bảo toàn giá Offset sau khi áp dụng phân loại phạm vi.
 *
 * Feature: resource-scope-config, Property 11
 * **Validates: Requirements 6.5**
 *
 * Tinh thần: spec resource-scope-config CHỈ phân loại / lọc Tài_Nguyên_Dùng_Chung bằng các
 * Cờ_Phạm_Vi `scope_*` — KHÔNG chạm vào số học của engine offset. Cam kết "bảo toàn giá đang đúng"
 * (Req 6.5) yêu cầu: với cùng một tập dữ liệu đầu vào, kết quả giá của luồng báo giá Offset sau khi
 * áp dụng phân loại bằng đúng kết quả trước khi áp dụng, chênh lệch = 0.
 *
 * Cơ chế: đây là golden/regression test trên một TẬP INPUT CỐ ĐỊNH (không chạy nhiều iteration).
 * Giá kỳ vọng (`GOLDEN`) là ảnh chụp đông cứng của output engine ĐANG ĐÚNG (baseline đã khoá).
 * Nếu một thay đổi của resource-scope-config (hoặc bất kỳ refactor nào) vô tình làm lệch số học
 * engine offset, các giá sẽ khác baseline và test gãy → canh không-hồi-quy.
 *
 * Engine offset thuần & tất định khi nạp `loadDefaultPricingData()` (JSON đóng gói), không cần DB.
 *
 * ─── FLIP ImpositionSource='unified' ─── 2026-07-01 ───
 *
 * Nguồn imposition mặc định đã được chuyển từ 'legacy' sang 'unified' trong `ty_le.json`.
 * Trước khi flip, Business_Validation_Gate xác nhận 0% delta cho TẤT CẢ 8 ca kiểm chứng
 * (to_roi ×2, bi_thu_folder, sp_khac ×2, hop_giay ×2, tui_giay) — tức giá unified ≡ giá legacy
 * trên toàn bộ dữ liệu mặc định. Lý do: với bộ Margin_Config mặc định (lề = 0, gripper = 10mm,
 * gutter = 3mm) trên các khổ in hiện tại, mô hình dàn khuôn vật lý cho ra cùng số con/tờ với
 * Legacy_Grid (gap 3mm) cho các kích thước thành phẩm trong fixture.
 *
 * Kết quả: GOLDEN VALUES KHÔNG THAY ĐỔI. Không có giá nào cần re-baseline.
 * PRECISION = 6 (giữ nguyên, không nới tolerance).
 *
 * Rollback: đặt `"ImpositionSource": "legacy"` trong `ty_le.json` params hoặc `pricing_config`
 * key `offset.ImpositionSource` → engine trở về hành vi cũ mà không cần redeploy.
 */
describe('Offset price preservation (golden) — Property 11, Req 6.5', () => {
    const svc = new EngineOffsetService();
    const d = loadDefaultPricingData();
    const mat = d.materials[0].code; // 'C150'
    const baiTui = '42cm x 60cm (dán nối)';
    // VAT BẮT BUỘC truyền tường minh vào engine (mô phỏng % nhập ở mục thông tin khách hàng).
    // Engine KHÔNG còn tự lấy VAT từ cấu hình pricebook; dùng đúng giá trị config cũ (TyLe_VAT)
    // để bảo toàn các con số golden đã khoá — chỉ ĐỔI NGUỒN VAT (config → input), KHÔNG đổi số.
    const QUOTE_VAT = d.tyLe.params.TyLe_VAT;

    /** Tập input Offset đại diện, CỐ ĐỊNH — phủ cả 5 loại sản phẩm offset. */
    const FIXED_INPUTS: Record<string, OffsetEngineInput> = {
        to_roi: {
            type: 'to_roi', kichThuoc: d.fixedSizes.toRoi[0].kichThuoc, materialCode: mat, soMatIn: 2, soLuong: 5000,
            kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: 'Màng bóng 2m', khuon: true, be: true,
            thanhPhamGap: 'may', catXen: true, dongGoi: true, thietKe: 0, vatRate: QUOTE_VAT,
        } as any,
        bi_thu_folder: {
            type: 'bi_thu_folder', kichThuoc: d.fixedSizes.biThuFolder[0].kichThuoc, materialCode: mat, soMatIn: 1, soLuong: 5000,
            kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: 'Không', khuon: true, be: true,
            thanhPhamDan: 'khong', dongGoi: true, thietKe: 0, vatRate: QUOTE_VAT,
        } as any,
        sp_khac: {
            type: 'sp_khac', khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2, soLuong: 5000,
            soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', khuon: 0, be: false,
            thanhPham: 'khong', catXen: true, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: QUOTE_VAT,
        } as any,
        hop_giay: {
            type: 'hop_giay', boxType: 'rte', cao: 10, rong: 8, hong: 4,
            khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2, soLuong: 5000,
            soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', be: true, danHop: 'khong',
            boi2Lop: false, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: QUOTE_VAT,
        } as any,
        tui_giay: {
            type: 'tui_giay', soLuong: 5000, cao: 30, rong: 25, hong: 10, mi: 4,
            materialCode: mat, baiIn: baiTui, soKem: 4, vatTuBeMat: 'Không',
            dayXach: { loai: 'khong', donGia: 0 }, thungCaton: { sl: 0, donGia: 0 },
            dongGoi: true, thietKe: 0, vatRate: QUOTE_VAT,
        } as any,
    };

    /**
     * Baseline đã khoá: ảnh chụp giá ĐANG ĐÚNG của engine offset cho từng input cố định ở trên.
     * Mọi trường giá phải khớp tuyệt đối (chênh lệch = 0) trong dung sai số dấu phẩy động.
     */
    interface GoldenPrice {
        tongChuaVAT: number;
        haoHut: number;
        vat: number;
        tongGomVAT: number;
        chietKhau: number;
        khachTra: number;
        donGia1SP: number;
    }

    const GOLDEN: Record<string, GoldenPrice> = {
        to_roi: {
            tongChuaVAT: 10835129.629629627,
            haoHut: 223666.66666666622,
            vat: 866810.3703703702,
            tongGomVAT: 11701939.999999996,
            chietKhau: 311111.1111111111,
            khachTra: 11390828.888888884,
            donGia1SP: 2278.165777777777,
        },
        bi_thu_folder: {
            tongChuaVAT: 3076357.4074074067,
            haoHut: 141655.55555555527,
            vat: 246108.59259259255,
            tongGomVAT: 3322465.999999999,
            chietKhau: 103750,
            khachTra: 3218715.999999999,
            donGia1SP: 643.7431999999998,
        },
        sp_khac: {
            tongChuaVAT: 2759303.7037037024,
            haoHut: 157809.25925925895,
            vat: 220744.2962962962,
            tongGomVAT: 2980047.9999999986,
            chietKhau: 94166.66666666669,
            khachTra: 2885881.333333332,
            donGia1SP: 577.1762666666664,
        },
        // RE-BASELINE 2026-07-05 — GĐ C sửa lệch đơn vị giá giấy hop_giay: chi phí giấy
        // (cpGiay/cpGiayBoi/wasteInfo) nay đếm theo TỜ NHẬP (parentGross = ceil(sheetsGross /
        // pressPerParent)), không phải tờ XẢ. Trước đây nhân đơn giá tờ nhập với số tờ xả →
        // thổi phồng ~pressPerParent lần. Giá giảm ĐÚNG-HƠN (6.74M → 3.88M). IN/CAN/lượt in giữ
        // nguyên (đúng đơn vị press). 4 SP kia KHÔNG đổi (đã đếm theo tờ nhập từ trước).
        //
        // ─── RE-BASELINE 2026-08-29 (audit): NGUỒN khổ tờ nhập ───
        // 3.879.925,93 → 4.451.518,52 trước VAT (+14,73%). Nguyên nhân là một BUG SAI TIỀN,
        // không phải thay đổi quy tắc nghiệp vụ:
        //   • `pressPerParent` trước đây suy từ `paper_sizes.kho_giay_lon` của khổ in
        //     ("28cm x 60cm" khai "84cm x 120cm") ⇒ ppp = 6.
        //   • Nhưng đơn giá giấy `giaTo` là giá MỘT TỜ của vật tư đã chọn — C150 khổ 65×86.
        //     Không có vật tư nào khổ 84×120 trong danh mục (chỉ 65×86 / 60×84 / 79×109).
        //   • Vậy engine chia số tờ theo một khổ KHÔNG TỒN TẠI rồi nhân đơn giá tờ 65×86
        //     ⇒ đếm THIẾU giấy đúng 2 lần (ppp 6 thay vì 3) ⇒ báo giá dưới chi phí.
        // Sau sửa: số tờ và đơn giá tờ cùng đến từ bản ghi vật tư ⇒ ppp = 3 (65×86 cắt được 3
        // bài 28×60), parentGross 460 → 920 tờ. Chỉ tiền GIẤY đổi; kẽm/gia công/lượt in giữ nguyên,
        // `chietKhau` giữ nguyên (giấy không nằm trong base chiết khấu).
        // Meta cũng nhất quán lần đầu: soConToLon = soConBaiIn × ppp = 2 × 3 = 6, và
        // ceil(5000/6) = 834 ≤ soToLon 920 (trước đây meta ghi 15 con/tờ · 110 tờ = 1.650 con
        // cho đơn 5.000 — chứng từ tự mâu thuẫn).
        // 4 sản phẩm còn lại KHÔNG đổi (chúng đếm giấy theo `soCon` trên tờ lớn ngay từ đầu).
        hop_giay: {
            tongChuaVAT: 4451518.518518516,
            haoHut: 106862.96296296275,
            vat: 356121.4814814813,
            tongGomVAT: 4807639.999999997,
            chietKhau: 130416.66666666666,
            khachTra: 4677223.33333333,
            donGia1SP: 935.4446666666661,
        },
        // RE-BASELINE 2026-08-23 — fixture cũ ép túi 30×25×10 vào bài 28×60 dù
        // soCon=0, tạo giá rác thiếu toàn bộ giấy/hao hụt (12.675.000 trước VAT).
        // Phương án hợp lệ 42×60 dán nối: soConToLon=2, 2.760 tờ; tổng trước VAT
        // 17.971.222,22 (+41,79%). Bốn sản phẩm golden khác giữ nguyên tuyệt đối.
        tui_giay: {
            tongChuaVAT: 17971222.222222216,
            haoHut: 323074.0740740734,
            vat: 1437697.7777777773,
            tongGomVAT: 19408919.999999993,
            chietKhau: 697083.3333333334,
            khachTra: 18711836.66666666,
            donGia1SP: 3742.367333333332,
        },
    };

    // Dung sai số dấu phẩy động: 6 chữ số thập phân vẫn đủ chặt để bắt mọi thay đổi giá thực sự.
    const PRECISION = 6;
    const FIELDS: (keyof GoldenPrice)[] = [
        'tongChuaVAT', 'haoHut', 'vat', 'tongGomVAT', 'chietKhau', 'khachTra', 'donGia1SP',
    ];

    it.each(Object.keys(FIXED_INPUTS))(
        '%s: giá engine offset khớp baseline đã khoá (chênh lệch = 0)',
        (productType) => {
            const res = svc.calculate(FIXED_INPUTS[productType]);
            expect(res.success).toBe(true);
            const data = res.data!;
            const golden = GOLDEN[productType];
            for (const f of FIELDS) {
                expect(data[f]).toBeCloseTo(golden[f], PRECISION);
            }
        },
    );

    it('tổng số input golden phủ đủ 5 loại sản phẩm offset', () => {
        expect(Object.keys(FIXED_INPUTS).sort()).toEqual(
            ['bi_thu_folder', 'hop_giay', 'sp_khac', 'to_roi', 'tui_giay'],
        );
    });
});
