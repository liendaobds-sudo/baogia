/**
 * Integration: RELOAD CẤU HÌNH KHÔNG CẦN REDEPLOY (Feature: offset-imposition-gripper-unification).
 *
 * Kiểm chứng đường: `pricing_config` / `paper_sizes` (DB)
 *   → ConfigStore.loadPricingData()
 *   → EngineOffsetService.refreshFromConfigStore()
 *   → resolveSoCon() (NGUỒN So_Con DUY NHẤT cho cả GIÁ và PREVIEW).
 *
 * Mục tiêu (task 5.2): sửa cấu hình, gọi reload, xác nhận GIÁ TRỊ MỚI được dùng cho cả
 * cơ sở tính giá (Sheets_Net = ceil(pieces / So_Con)) và preview meta (So_Con + marginConfig +
 * positions) — KHÔNG cần triển khai lại mã nguồn.
 *
 * Hạ tầng test: DataSource giả lập IN-MEMORY có thể THAY ĐỔI giữa các lần reload (giống style
 * `config-store.spec.ts` — query jest.fn match theo SQL), tránh dựng DB thật.
 *
 * _Requirements: 1.4, 5.4, 6.4_
 */
import { ConfigStore } from '../config-store.service';
import { EngineOffsetService } from '../engine-offset.service';
import { resolveSoCon } from '../imposition-selector';
import { imposeUnified, resolveMarginConfig } from '../imposition';
import { imposeFromKhoIn } from '../lookups';
import { KhoIn, PricingData, numParam } from '../pricing-data';

/** Khổ in dùng xuyên suốt: bài in 52×72cm trên khổ giấy lớn 79×109cm. */
const KHO_IN = '52cm x 72cm';
const KHO_GIAY_LON = '79cm x 109cm';
/** Kích thước con (cm) đủ nhạy để gripper/source làm đổi số con/tờ. */
const ITEM_W = 10;
const ITEM_H = 15;

/**
 * DataSource giả lập có TRẠNG THÁI THAY ĐỔI ĐƯỢC giữa các lần `loadPricingData`.
 * `state.params` mô phỏng bảng `pricing_config` (key 'offset.*'); `state.kho` mô phỏng các cột
 * gripper/gutter trên `paper_sizes`. Thay đổi trạng thái rồi gọi reload = "đổi config không redeploy".
 */
function makeConfigDataSource() {
    const state = {
        params: {
            'offset.ImpositionSource': 'legacy',
            'offset.ShadowMode': '0',
            'offset.Gripper_Cm': '1.2',
            'offset.Gutter_Cm': '0.3',
        } as Record<string, string>,
        // gripper/gutter theo từng khổ (cột mới paper_sizes). null → fallback params.Gripper_Cm/Gutter_Cm.
        kho: { gripper_cm: null as number | null, gutter_cm: null as number | null },
    };

    const query = jest.fn(async (sql: string) => {
        // Query gripper/gutter theo khổ (phải kiểm TRƯỚC query khổ in vì cùng bảng paper_sizes).
        if (/gripper_cm/i.test(sql) && /FROM paper_sizes/i.test(sql)) {
            return [{ code: KHO_IN, gripper_cm: state.kho.gripper_cm, gutter_cm: state.kho.gutter_cm }];
        }
        // Query khổ in chính (kèm lề margin_*).
        if (/FROM paper_sizes WHERE scope_offset/i.test(sql)) {
            return [{
                kho_in: KHO_IN, widthmm: 520, heightmm: 720,
                margin_left: 0, margin_right: 0, margin_top: 0, margin_bottom: 0,
                kho_giay_lon: KHO_GIAY_LON, chia_to: 'Chia 2',
                so_con_bai_in: 6, so_con_to_lon: 12, loai_kem: 'Kẽm nhỏ',
            }];
        }
        // Tham số offset (pricing_config key 'offset.*').
        if (/FROM pricing_config WHERE config_key LIKE 'offset\.%'/i.test(sql)) {
            return Object.entries(state.params).map(([config_key, config_value]) => ({ config_key, config_value }));
        }
        // Mọi nhóm khác rỗng → ConfigStore fallback mặc định JSON (đủ để dựng PricingData).
        return [];
    });

    return { ds: { options: { type: 'postgres' as const }, query }, state };
}

/** Dựng engine + reload lần đầu từ DataSource giả lập. */
async function bootEngine() {
    const { ds, state } = makeConfigDataSource();
    const store = new ConfigStore(ds as any);
    const engine = new EngineOffsetService(store);
    await engine.refreshFromConfigStore();
    return { engine, state };
}

/** Lấy bản ghi khổ in đã nạp từ PricingData hiện hành. */
function getKho(data: PricingData): KhoIn {
    const kho = data.khoIn.find((k) => k.khoIn === KHO_IN);
    if (!kho) throw new Error(`Fixture lỗi: không tìm thấy khổ ${KHO_IN} sau reload`);
    return kho;
}

/** Gọi nguồn So_Con duy nhất với dữ liệu hiện hành (đại diện cho cả đường giá lẫn preview). */
function soConFor(data: PricingData) {
    return resolveSoCon({ itemWcm: ITEM_W, itemHcm: ITEM_H, kho: getKho(data), data });
}

/** Cơ sở GIÁ: số tờ ròng = ceil(pieces / So_Con) — đường mà waste-cascade tiêu thụ. */
function priceSheets(soCon: number, pieces = 30000): number {
    return Math.ceil(pieces / soCon);
}

describe('Config reload không cần redeploy (Feature: offset-imposition-gripper-unification)', () => {
    it('refreshFromConfigStore nạp cờ imposition + gripper/gutter mới từ pricing_config (Req 1.4, 5.4, 6.4)', async () => {
        const { engine, state } = await bootEngine();

        // Lần nạp đầu: phản ánh trạng thái config khởi tạo.
        let data = engine.getPricingData();
        expect(data.tyLe.params.ImpositionSource).toBe('legacy');
        expect(numParam(data.tyLe.params, 'ShadowMode')).toBe(0);
        expect(numParam(data.tyLe.params, 'Gripper_Cm')).toBe(1.2);
        expect(numParam(data.tyLe.params, 'Gutter_Cm')).toBe(0.3);

        // Sửa config (không đụng code) rồi reload.
        state.params['offset.ImpositionSource'] = 'unified';
        state.params['offset.ShadowMode'] = '1';
        state.params['offset.Gripper_Cm'] = '2.0';
        state.params['offset.Gutter_Cm'] = '0.5';
        await engine.refreshFromConfigStore();

        data = engine.getPricingData();
        expect(data.tyLe.params.ImpositionSource).toBe('unified');
        expect(numParam(data.tyLe.params, 'ShadowMode')).toBe(1);
        expect(numParam(data.tyLe.params, 'Gripper_Cm')).toBe(2.0);
        expect(numParam(data.tyLe.params, 'Gutter_Cm')).toBe(0.5);
    });

    it('flip offset.ImpositionSource legacy→unified qua config đổi nguồn So_Con cho cả giá và preview (Req 6.4)', async () => {
        const { engine, state } = await bootEngine();

        // legacy: So_Con khớp Legacy_Grid; chưa có hình học preview (marginConfig/positions).
        let data = engine.getPricingData();
        let kho = getKho(data);
        const gap = numParam(data.tyLe.params, 'Gap_Cm') || 0.3;
        const legacyRef = imposeFromKhoIn(kho, ITEM_W, ITEM_H, gap);
        let outcome = soConFor(data);
        expect(outcome.source).toBe('legacy');
        expect(outcome.soConToLon).toBe(legacyRef.soConToLon);

        // Flip sang unified qua config + reload (KHÔNG redeploy).
        state.params['offset.ImpositionSource'] = 'unified';
        await engine.refreshFromConfigStore();

        data = engine.getPricingData();
        kho = getKho(data);
        const margins = resolveMarginConfig(kho, data.tyLe.params);
        const unifiedRef = imposeUnified({
            itemWmm: ITEM_W * 10, itemHmm: ITEM_H * 10,
            sheetWmm: 790, sheetHmm: 1090,
            pressWmm: 520, pressHmm: 720,
            margins,
        });
        outcome = soConFor(data);

        // Nguồn đổi theo cờ; So_Con khớp Imposition_Service mới.
        expect(outcome.source).toBe('unified');
        expect(outcome.soConToLon).toBe(unifiedRef.soConToLon);
        // Preview meta đi kèm nguồn unified: marginConfig + positions.
        expect(outcome.marginConfig).toEqual(margins);
        expect(outcome.positions).toHaveLength(unifiedRef.soConToLon);

        // PARITY: cùng MỘT So_Con dùng cho cả cơ sở giá (Sheets_Net) lẫn preview meta.
        expect(priceSheets(outcome.soConToLon)).toBe(priceSheets(unifiedRef.soConToLon));
    });

    it('đổi offset.Gripper_Cm qua config được dùng cho giá + preview sau reload, không redeploy (Req 1.4)', async () => {
        const { engine, state } = await bootEngine();
        // Dùng nguồn unified để gripper tác động trực tiếp lên số con.
        state.params['offset.ImpositionSource'] = 'unified';
        await engine.refreshFromConfigStore();

        const before = soConFor(engine.getPricingData());
        expect(before.marginConfig!.gripper).toBe(1.2 * 10); // 12mm từ config ban đầu

        // Tăng gripper qua pricing_config (không redeploy) rồi reload.
        state.params['offset.Gripper_Cm'] = '8'; // 8cm = 80mm — nuốt nhiều vùng in hơn
        await engine.refreshFromConfigStore();

        const after = soConFor(engine.getPricingData());

        // Giá trị gripper MỚI thực sự được dùng cho hình học (preview).
        expect(after.marginConfig!.gripper).toBe(8 * 10); // 80mm
        // Gripper lớn hơn ⇒ vùng in nhỏ hơn ⇒ số con KHÔNG tăng (đơn điệu) ⇒ giá (số tờ) KHÔNG giảm.
        expect(after.soConToLon).toBeLessThanOrEqual(before.soConToLon);
        expect(priceSheets(after.soConToLon)).toBeGreaterThanOrEqual(priceSheets(before.soConToLon));
        // Phải có thay đổi thực sự để chứng minh config mới được áp (không phải no-op).
        expect(after.soConToLon).toBeLessThan(before.soConToLon);
    });

    it('đổi paper_sizes.gripper_cm theo từng khổ được dùng sau reload, ghi đè mặc định param (Req 1.4)', async () => {
        const { engine, state } = await bootEngine();
        state.params['offset.ImpositionSource'] = 'unified';
        state.params['offset.Gripper_Cm'] = '1.2'; // mặc định param
        await engine.refreshFromConfigStore();

        // Ban đầu khổ KHÔNG có gripper riêng → dùng mặc định param (12mm).
        let data = engine.getPricingData();
        expect(getKho(data).gripperCm).toBeUndefined();
        expect(soConFor(data).marginConfig!.gripper).toBe(12);

        // Cấu hình gripper RIÊNG cho khổ qua paper_sizes (cột gripper_cm) rồi reload.
        state.kho.gripper_cm = 5; // 5cm = 50mm, ghi đè mặc định param
        await engine.refreshFromConfigStore();

        data = engine.getPricingData();
        expect(getKho(data).gripperCm).toBe(5);
        // Giá trị theo-khổ MỚI được dùng cho cả preview meta lẫn cơ sở số con (giá).
        expect(soConFor(data).marginConfig!.gripper).toBe(50);
    });

    it('bật offset.ShadowMode qua config sau reload đính số liệu đối chiếu mà giữ nguyên giá (Req 5.4)', async () => {
        const { engine, state } = await bootEngine();

        // Shadow tắt: không có số liệu đối chiếu.
        const off = soConFor(engine.getPricingData());
        expect(off.shadow).toBeUndefined();
        const priceWhenOff = priceSheets(off.soConToLon);

        // Bật shadow qua config (không redeploy) + reload.
        state.params['offset.ShadowMode'] = '1';
        await engine.refreshFromConfigStore();

        const on = soConFor(engine.getPricingData());
        // Đính số liệu đối chiếu cả hai nguồn...
        expect(on.shadow).toBeDefined();
        expect(on.shadow!.legacyToLon).toBeGreaterThan(0);
        expect(on.shadow!.unifiedToLon).toBeGreaterThan(0);
        // ...nhưng GIÁ (số con dùng tính giá, nguồn mặc định 'legacy') KHÔNG đổi.
        expect(on.source).toBe('legacy');
        expect(on.soConToLon).toBe(off.soConToLon);
        expect(priceSheets(on.soConToLon)).toBe(priceWhenOff);
    });
});
