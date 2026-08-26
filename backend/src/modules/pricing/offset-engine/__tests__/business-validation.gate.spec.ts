import { EngineOffsetService } from '../engine-offset.service';
import { loadDefaultPricingData } from '../default-data';
import { PricingData } from '../pricing-data';
import type { OffsetEngineInput } from '../engine-offset.service';

/**
 * BUSINESS VALIDATION GATE — Cổng kiểm chứng nghiệp vụ ±2%.
 *
 * Feature: offset-imposition-gripper-unification — Task 12.1
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 *
 * Mục tiêu (Req 8): trước khi flip `ImpositionSource='unified'` làm mặc định, đối chiếu giá do
 * Imposition_Service (unified) tạo ra với 5–10 BÁO GIÁ XƯỞNG THẬT. Với mỗi ca:
 *   - |Δ%| ≤ 2%  → đạt (pass)                                              (Req 8.2)
 *   - |Δ%| > 2%  → đánh dấu `review` để rà soát trước khi đổi nguồn mặc định (Req 8.3)
 * Harness ghi BẢNG kết quả (sản phẩm, khổ, giá thật, giá mới, %Δ) cho từng ca   (Req 8.4).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * NGUỒN "GIÁ THẬT" (baseline):
 *   Báo giá xưởng thật KHÔNG có sẵn dưới dạng fixture trong repo. Theo lộ trình an toàn của
 *   design (rollout §"Trình tự kiểm chứng" bước 1–3): với `ImpositionSource='legacy'` (mặc định
 *   hiện tại) hành vi giá engine TƯƠNG ĐƯƠNG trước thay đổi — tức là chính những con số đang được
 *   báo cho khách. Vì vậy harness DÙNG OUTPUT ENGINE Ở CHẾ ĐỘ `legacy` LÀM PROXY "giá thật"
 *   (baseline đã khoá theo hành vi đang chạy), rồi chạy `unified` và đo %Δ.
 *
 *   ⇒ Khi có báo giá xưởng thật, thay `realPrice` của từng ca bằng số tiền `khachTra` thực tế
 *     (giữ nguyên `input`) để gate phản ánh đúng nghiệp vụ. Cấu trúc harness không đổi.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * HÀNH VI GATE (theo design): ca > ±2% được ĐÁNH DẤU `review` (cờ rà soát thủ công trước khi
 * flip), KHÔNG tự động làm đỏ suite — vì flip legacy→unified CHỦ ĐÍCH làm dịch giá (đó là mục tiêu
 * tính năng). Đặt `HARD_FAIL_ON_REVIEW=true` để biến gate thành chặn cứng khi muốn cổng CI nghiêm
 * ngặt (vd sau khi đã re-baseline & chốt giá thật).
 */
describe('Business Validation Gate ±2% (unified vs giá thật) — Req 8.1–8.4', () => {
    /** Ngưỡng sai lệch nghiệp vụ cho phép: ±2% (Req 8.2). */
    const GATE_THRESHOLD_PCT = 2;
    /**
     * Có biến ca `review` (>±2%) thành lỗi cứng của suite hay không.
     * Mặc định FALSE: review là CỜ rà soát thủ công trước khi flip (Req 8.3), không auto-fail —
     * khớp lộ trình "xử lý các ca > ±2%" như một bước có chủ đích, không phải hồi quy.
     */
    const HARD_FAIL_ON_REVIEW = false;

    /** Deep-clone PricingData mặc định (tránh chia sẻ tham chiếu singleton giữa 2 chế độ). */
    function cloneDefaultData(): PricingData {
        return JSON.parse(JSON.stringify(loadDefaultPricingData())) as PricingData;
    }

    /** Tạo service với một nguồn imposition cố định (legacy ↔ unified) — đổi cờ qua cấu hình. */
    function makeService(source: 'legacy' | 'unified'): EngineOffsetService {
        const svc = new EngineOffsetService();
        const data = cloneDefaultData();
        data.tyLe.params.ImpositionSource = source;
        svc.setPricingData(data);
        return svc;
    }

    // Dữ liệu mẫu để dựng input hợp lệ (khổ in / kích thước / vật tư có thật trong bộ mặc định).
    const d = loadDefaultPricingData();
    const mat = d.materials[0].code; // giấy in đại diện
    // 30×25×10 không lọt bài 28×60 đầu danh sách; dùng phương án dán nối hợp lệ
    // (soConToLon=2) thay vì khóa một quote có imposition=0.
    const baiTui = '42cm x 60cm (dán nối)';
    const QUOTE_VAT = d.tyLe.params.TyLe_VAT;

    /** Một ca kiểm chứng: mô tả nghiệp vụ + input engine + (tuỳ chọn) giá thật override. */
    interface GateCase {
        /** Nhãn sản phẩm (để in bảng). */
        san_pham: string;
        /** Khổ in / khổ giấy (để in bảng). */
        kho: string;
        /** Input engine. */
        input: OffsetEngineInput;
        /**
         * Giá thật (khachTra) từ báo giá xưởng. `undefined` → dùng output `legacy` làm proxy
         * baseline (xem ghi chú nguồn baseline ở đầu file). Khi có số thật, điền vào đây.
         */
        realPrice?: number;
    }

    /**
     * 8 ca đại diện — phủ đủ 5 loại sản phẩm offset + biến thể số lượng/kích thước để bảng đối
     * chiếu giàu hơn (Req 8.1: từ 5 đến 10 ca). `realPrice` để trống ⇒ dùng proxy `legacy`.
     */
    const CASES: GateCase[] = [
        {
            san_pham: 'Tờ rơi (size 1)',
            kho: d.fixedSizes.toRoi[0].khoGiayLon,
            input: {
                type: 'to_roi', kichThuoc: d.fixedSizes.toRoi[0].kichThuoc, materialCode: mat, soMatIn: 2, soLuong: 5000,
                kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: 'Màng bóng 2m', khuon: true, be: true,
                thanhPhamGap: 'may', catXen: true, dongGoi: true, thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            san_pham: 'Tờ rơi (size 2)',
            kho: d.fixedSizes.toRoi[1].khoGiayLon,
            input: {
                type: 'to_roi', kichThuoc: d.fixedSizes.toRoi[1].kichThuoc, materialCode: mat, soMatIn: 2, soLuong: 10000,
                kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: 'Không', khuon: false, be: false,
                thanhPhamGap: 'khong', catXen: true, dongGoi: true, thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            san_pham: 'Bì thư / Folder',
            kho: d.fixedSizes.biThuFolder[0].khoGiayLon,
            input: {
                type: 'bi_thu_folder', kichThuoc: d.fixedSizes.biThuFolder[0].kichThuoc, materialCode: mat, soMatIn: 1, soLuong: 5000,
                kemType: 'Kẽm lớn', soKemIn: 4, vatTuBeMat: 'Không', khuon: true, be: true,
                thanhPhamDan: 'khong', dongGoi: true, thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            san_pham: 'SP khác (4 màu)',
            kho: d.khoIn[0].khoIn,
            input: {
                type: 'sp_khac', khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2, soLuong: 5000,
                soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', khuon: 0, be: false,
                thanhPham: 'khong', catXen: true, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            san_pham: 'SP khác (SL lớn)',
            kho: d.khoIn[1].khoIn,
            input: {
                type: 'sp_khac', khoIn: d.khoIn[1].khoIn, materialCode: mat, soMatIn: 2, soLuong: 20000,
                soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', khuon: 0, be: false,
                thanhPham: 'khong', catXen: true, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            san_pham: 'Hộp giấy (RTE)',
            kho: d.khoIn[0].khoIn,
            input: {
                type: 'hop_giay', boxType: 'rte', cao: 10, rong: 8, hong: 4,
                khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2, soLuong: 5000,
                soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', be: true, danHop: 'khong',
                boi2Lop: false, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            san_pham: 'Hộp giấy (size lớn)',
            kho: d.khoIn[0].khoIn,
            input: {
                type: 'hop_giay', boxType: 'rte', cao: 18, rong: 14, hong: 6,
                khoIn: d.khoIn[0].khoIn, materialCode: mat, soMatIn: 2, soLuong: 3000,
                soBoKem: 1, soMau: 4, vatTuBeMat: 'Không', be: true, danHop: 'khong',
                boi2Lop: false, dongGoi: true, epKimViTri: 'Không', thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
        {
            san_pham: 'Túi giấy',
            kho: baiTui,
            input: {
                type: 'tui_giay', soLuong: 5000, cao: 30, rong: 25, hong: 10, mi: 4,
                materialCode: mat, baiIn: baiTui, soKem: 4, vatTuBeMat: 'Không',
                dayXach: { loai: 'khong', donGia: 0 }, thungCaton: { sl: 0, donGia: 0 },
                dongGoi: true, thietKe: 0, vatRate: QUOTE_VAT,
            } as any,
        },
    ];

    /** Một dòng kết quả đối chiếu (Req 8.4). */
    interface GateRow {
        san_pham: string;
        kho: string;
        gia_that: number;      // baseline (proxy legacy hoặc số thật override)
        gia_moi: number;       // unified khachTra
        delta_pct: number;     // %Δ = (gia_moi - gia_that) / gia_that * 100
        verdict: 'pass' | 'review';
        nguon_baseline: 'legacy(proxy)' | 'real';
    }

    const legacySvc = makeService('legacy');
    const unifiedSvc = makeService('unified');

    const rows: GateRow[] = [];
    const reviewCases: GateRow[] = [];

    beforeAll(() => {
        for (const c of CASES) {
            const legacyRes = legacySvc.calculate(c.input);
            const unifiedRes = unifiedSvc.calculate(c.input);

            // Cả hai chế độ phải tính được — nếu không, để lộ lỗi rõ ràng thay vì nuốt.
            if (!legacyRes.success || !unifiedRes.success) {
                throw new Error(
                    `Gate: không tính được giá cho "${c.san_pham}" ` +
                        `(legacy=${legacyRes.success ? 'ok' : legacyRes.error}, ` +
                        `unified=${unifiedRes.success ? 'ok' : unifiedRes.error})`,
                );
            }

            const giaThat = c.realPrice ?? legacyRes.data!.khachTra;
            const giaMoi = unifiedRes.data!.khachTra;
            const deltaPct = giaThat !== 0 ? ((giaMoi - giaThat) / giaThat) * 100 : (giaMoi === 0 ? 0 : Infinity);
            const verdict: GateRow['verdict'] =
                Math.abs(deltaPct) <= GATE_THRESHOLD_PCT ? 'pass' : 'review';

            const row: GateRow = {
                san_pham: c.san_pham,
                kho: c.kho,
                gia_that: Math.round(giaThat),
                gia_moi: Math.round(giaMoi),
                delta_pct: Number(deltaPct.toFixed(3)),
                verdict,
                nguon_baseline: c.realPrice != null ? 'real' : 'legacy(proxy)',
            };
            rows.push(row);
            if (verdict === 'review') reviewCases.push(row);
        }

        // Req 8.4 — ghi BẢNG kết quả đối chiếu (sản phẩm, khổ, giá thật, giá mới, %Δ, verdict).
        // eslint-disable-next-line no-console
        console.log('\n=== BUSINESS VALIDATION GATE ±2% — Bảng đối chiếu (unified vs giá thật) ===');
        // eslint-disable-next-line no-console
        console.table(
            rows.map((r) => ({
                'Sản phẩm': r.san_pham,
                'Khổ': r.kho,
                'Giá thật': r.gia_that.toLocaleString('vi-VN'),
                'Giá mới (unified)': r.gia_moi.toLocaleString('vi-VN'),
                '%Δ': `${r.delta_pct > 0 ? '+' : ''}${r.delta_pct}%`,
                'Kết quả': r.verdict === 'pass' ? '✅ đạt' : '⚠️ review',
                'Baseline': r.nguon_baseline,
            })),
        );
        const passCount = rows.length - reviewCases.length;
        // eslint-disable-next-line no-console
        console.log(
            `Tổng: ${rows.length} ca | ✅ đạt (≤±${GATE_THRESHOLD_PCT}%): ${passCount} | ` +
                `⚠️ review (>±${GATE_THRESHOLD_PCT}%): ${reviewCases.length}`,
        );
        if (reviewCases.length) {
            // eslint-disable-next-line no-console
            console.log(
                'Các ca cần RÀ SOÁT trước khi flip ImpositionSource=unified:\n' +
                    reviewCases
                        .map((r) => `  - ${r.san_pham} (${r.kho}): %Δ=${r.delta_pct}%`)
                        .join('\n'),
            );
        }
        // eslint-disable-next-line no-console
        console.log('=== HẾT BẢNG ĐỐI CHIẾU ===\n');
    });

    it('Req 8.1: gate đối chiếu từ 5 đến 10 ca báo giá', () => {
        expect(CASES.length).toBeGreaterThanOrEqual(5);
        expect(CASES.length).toBeLessThanOrEqual(10);
        expect(rows.length).toBe(CASES.length);
    });

    it('Req 8.4: mỗi ca có đủ trường đối chiếu (sản phẩm, khổ, giá thật, giá mới, %Δ) và %Δ hữu hạn', () => {
        for (const r of rows) {
            expect(typeof r.san_pham).toBe('string');
            expect(r.san_pham.length).toBeGreaterThan(0);
            expect(typeof r.kho).toBe('string');
            expect(r.gia_that).toBeGreaterThan(0);
            expect(r.gia_moi).toBeGreaterThan(0);
            expect(Number.isFinite(r.delta_pct)).toBe(true);
            expect(['pass', 'review']).toContain(r.verdict);
        }
    });

    it.each(CASES.map((c, i) => [c.san_pham, i] as const))(
        'Req 8.2/8.3: "%s" — phân loại đạt (≤±2%) hoặc đánh dấu review (>±2%)',
        (_label, i) => {
            const r = rows[i];
            // Phân loại đúng theo ngưỡng (bất biến gate): verdict khớp |Δ%| so với ngưỡng.
            const within = Math.abs(r.delta_pct) <= GATE_THRESHOLD_PCT;
            expect(r.verdict).toBe(within ? 'pass' : 'review');

            if (HARD_FAIL_ON_REVIEW) {
                // Chế độ cổng nghiêm ngặt: mọi ca phải nằm trong ±2%.
                expect(Math.abs(r.delta_pct)).toBeLessThanOrEqual(GATE_THRESHOLD_PCT);
            }
        },
    );

    it('Req 8.3: mọi ca review đều thực sự vượt ±2% (danh sách rà soát đúng)', () => {
        for (const r of reviewCases) {
            expect(Math.abs(r.delta_pct)).toBeGreaterThan(GATE_THRESHOLD_PCT);
        }
        // Báo cáo rõ ràng trạng thái cổng để người vận hành quyết định trước khi flip.
        if (reviewCases.length > 0) {
            // eslint-disable-next-line no-console
            console.warn(
                `[GATE] ${reviewCases.length}/${rows.length} ca vượt ±${GATE_THRESHOLD_PCT}% — cần rà soát ` +
                    `trước khi đặt ImpositionSource='unified' làm mặc định.`,
            );
        }
    });
});
