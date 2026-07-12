/**
 * Pricing FLOW tests — kiem thu LUONG LOGIC voi du lieu MAU (khong dung gia thuc te).
 *
 * Muc tieu: xac minh chuoi tinh toan cua PricingFacadeService chay dung & nhat quan:
 *   layout -> so to -> bu hao (waste) -> bac gia (tier) -> gia cong -> gia von (cost)
 *   -> markup -> VAT -> grand_total.
 *
 * Du lieu mau duoc bom qua mock repository/dataSource (nhat quan noi bo, de tinh tay).
 *
 * Run: npx jest pricing-flow
 */

import { PricingService } from '../pricing.service';
import { PricingFacadeService } from '../services/pricing-facade.service';
import { deriveTierCost } from '../lib/cost-derivation';

// ──────────────────────────────────────────────────────────────
// SAMPLE MASTER DATA (du lieu mau — nhat quan noi bo, khong phai gia thi truong)
// ──────────────────────────────────────────────────────────────
const SAMPLE = {
    // Kho giay SRA3: 450x320mm, le 10mm moi canh -> vung in 430x300mm
    paperSize: { id: 1, widthMm: 450, heightMm: 320, marginLeft: 10, marginRight: 10, marginTop: 10, marginBottom: 10 },
    // Vat tu: gia tier 1.000d/to; large-format 50.000d/m2
    tierPricePerSheet: 1000,
    material: { id: 10, pricePerSqm: 50000, chargeFullWidth: false, rollWidth: null, minChargeArea: 0 },
    // 1 cong gia cong: tinh theo to (per_sheet), 100d/to
    processingOption: { id: 5, name: 'Can mang (mau)', price: '100', priceType: 'per_sheet' },
    // Config: markup 50%, VAT 8%, bu hao digital 1% (min 10 to)
    config: { vat_rate: '8' }, // phan con lai dung DEFAULT trong PricingService (markup 50, rounding 100, waste digital 1...)
};

function buildEngine(tierPrice: number = SAMPLE.tierPricePerSheet) {
    const managerQuery = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('pricing_config')) {
            return Promise.resolve([{ config_key: 'vat_rate', config_value: SAMPLE.config.vat_rate }]);
        }
        if (sql.includes('processing_options')) {
            return Promise.resolve([SAMPLE.processingOption]);
        }
        return Promise.resolve([]); // accessories, large_format_pricing... khong dung trong cac case nay
    });

    const tierRepo: any = {
        findOne: jest.fn().mockResolvedValue({ pricePerSheet: tierPrice }),
        manager: { query: managerQuery },
    };
    const materialRepo: any = {
        findOne: jest.fn().mockResolvedValue(SAMPLE.material),
        manager: { query: managerQuery },
    };
    const paperSizeRepo: any = {
        findOne: jest.fn().mockResolvedValue(SAMPLE.paperSize),
        find: jest.fn().mockResolvedValue([SAMPLE.paperSize]),
    };
    const emptyRepo: any = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
    const boundCalc: any = { calculate: jest.fn() };

    const pricing = new PricingService(tierRepo, materialRepo);
    const facade = new PricingFacadeService(
        pricing, materialRepo, paperSizeRepo, emptyRepo, emptyRepo, emptyRepo, emptyRepo, boundCalc,
    );
    return { facade, tierRepo, paperSizeRepo };
}

describe('Pricing FLOW — du lieu mau, kiem tra logic', () => {

    // ── LOOSE: card 90x54 tren SRA3, 1000 cai, can mang per_sheet ──
    it('LOOSE: chuoi layout -> waste -> tier -> processing -> markup -> VAT dung', async () => {
        const { facade } = buildEngine();

        const res: any = await facade.calculatePrice({
            type: 'loose',
            material_id: 10,
            paper_size_id: 1,
            quantity: 1000,
            item_width: 90,
            item_height: 54,
            print_side: 'double',
            print_type: '4c',
            print_method: 'digital',
            shape: 'rectangle',
            gap_h: 2,
            gap_v: 2,
            processing: [{ id: 5, code: 'foo', side: 'single' }],
            vat_rate: 8, // VAT đi theo % nhập ở thông tin khách hàng (truyền qua request, không lấy từ config)
        });

        expect(res.success).toBe(true);
        const d = res.data;

        // Layout: 90x54 tren vung in 430x300 = 23 con/to (theo contract test)
        expect(d.breakdown.items_per_sheet).toBe(23);
        // So to can: ceil(1000/23) = 44
        expect(d.breakdown.sheets_needed).toBe(44);
        // Bu hao digital 1% nhung min = min(10, 10% x 44 = 4.4) = 4 -> tong 48 to
        expect(d.breakdown.total_sheets).toBe(48);
        expect(d.breakdown.price_per_sheet).toBe(1000);

        // Chi phi
        expect(d.material_cost).toBe(48000);  // 1000d x 48 to
        expect(d.processing_cost).toBe(4800); // 100d/to x 48 to x 1 (single)
        expect(d.total).toBe(52800);          // GIA VON = material + processing

        // Markup 50% -> 79.200 ; VAT 8% -> +6.336 -> grand_total 85.536
        expect(d.selling_subtotal).toBe(79200);
        expect(d.vat_amount).toBe(6336);
        expect(d.grand_total).toBe(85536);

        // INVARIANT B1: gia ban (grand_total) PHAI lon hon gia von (total)
        expect(d.grand_total).toBeGreaterThan(d.total);
    });

    // ── LARGE FORMAT: 1000x2000mm, SL 2 ──
    it('LARGE_FORMAT: dien tich m2 -> gia/m2 -> markup -> VAT dung', async () => {
        const { facade } = buildEngine();

        const res: any = await facade.calculatePrice({
            type: 'large_format',
            material_id: 10,
            width: 1000,
            height: 2000,
            quantity: 2,
            print_type: 'uv',
            vat_rate: 8, // VAT theo thông tin khách hàng (request), không từ config
        });

        expect(res.success).toBe(true);
        const d = res.data;

        expect(d.breakdown.area_m2).toBe(2);        // 1000x2000mm = 2 m2
        expect(d.breakdown.charge_area_m2).toBe(4); // x SL 2
        expect(d.material_cost).toBe(200000);       // 4 m2 x 50.000d
        expect(d.total).toBe(200000);
        expect(d.grand_total).toBe(324000);         // x1.5 markup = 300.000, +8% VAT = 324.000
    });

    // ── Quan he markup/VAT (nen tang cua fix B1) ──
    it('grand_total = round(selling_subtotal x (1 + VAT)) — markup + VAT ap dung dung tang', async () => {
        const { facade } = buildEngine();
        const res: any = await facade.calculatePrice({
            type: 'loose', material_id: 10, paper_size_id: 1, quantity: 1000,
            item_width: 90, item_height: 54, print_side: 'double', print_type: '4c', print_method: 'digital',
            shape: 'rectangle', gap_h: 2, gap_v: 2, processing: [], vat_rate: 8,
        });
        const d = res.data;
        const expectedGrand = d.selling_subtotal + Math.round(d.selling_subtotal * d.vat_rate / 100);
        expect(d.grand_total).toBe(expectedGrand);
        // gia von != gia ban -> ly do tai sao chatbot truoc day bao sai (dung total thay vi grand_total)
        expect(d.total).not.toBe(d.grand_total);
    });

    // ── Kho giay qua nho -> bao loi ro rang (khong tra gia rac) ──
    it('LOOSE: san pham lon hon kho giay -> tra loi, khong tinh gia', async () => {
        const { facade } = buildEngine();
        const res: any = await facade.calculatePrice({
            type: 'loose', material_id: 10, paper_size_id: 1, quantity: 100,
            item_width: 9999, item_height: 9999, print_side: 'single', shape: 'rectangle',
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain('quá lớn');
    });
});

// ══════════════════════════════════════════════════════════════════════════
// END-TO-END: định mức 5 thành phần (deriveTierCost) → tier → facade → markup.
// Đây là ràng buộc KIẾN TRÚC cốt lõi của cả 3 tầng: định mức là GIÁ VỐN THUẦN,
// markup áp ĐÚNG MỘT LẦN ở facade. Trước đây chỉ khẳng định gián tiếp (helper
// assert Σ; facade assert ×1.5 riêng). Ở đây chạy SUỐT chuỗi để bắt markup-chồng.
// ══════════════════════════════════════════════════════════════════════════
describe('END-TO-END: giá vốn thuần (5 thành phần) → facade markup MỘT LẦN', () => {
    // Cùng bố cục LOOSE với các test trên: 90x54 trên SRA3, 1000 cái, 2 mặt → total_sheets = 48.
    const LOOSE_ARGS = {
        type: 'loose' as const, material_id: 10, paper_size_id: 1, quantity: 1000,
        item_width: 90, item_height: 54, print_side: 'double', print_type: '4c', print_method: 'digital',
        shape: 'rectangle', gap_h: 2, gap_v: 2, processing: [], vat_rate: 8,
    };
    const TOTAL_SHEETS = 48; // theo contract layout+waste của các test trên

    it('tier = Σ 5 thành phần (giá vốn thuần) → selling/cost ≈ 1.5, KHÔNG 2.25', async () => {
        // Giá vốn thuần/tờ suy từ 5 thành phần (không markup).
        const breakdown = deriveTierCost({
            paperCost: 300,
            ink: { mlPerSheet: 0.5, pricePerMl: 500 },
            printer: {
                machineValue: 1_200_000_000, depreciationYears: 5, sheetsPerMonth: 100_000,
                electricityPerHour: 50_000, sheetsPerHour: 1_000, staffCount: 3, avgSalaryMonthly: 12_000_000,
                rentMonthly: 20_000_000, utilitiesMonthly: 5_000_000, otherMonthly: 5_000_000,
            },
            sizeFactor: 1, sides: 1,
        });
        const pureCostPerSheet = breakdown.total; // = Σ 5 thành phần, không lời

        const { facade } = buildEngine(pureCostPerSheet);
        const res: any = await facade.calculatePrice(LOOSE_ARGS);
        expect(res.success).toBe(true);
        const d = res.data;

        // Giá vốn (total) = giá vốn thuần/tờ × số tờ, không processing.
        expect(d.breakdown.price_per_sheet).toBe(pureCostPerSheet);
        expect(d.total).toBe(pureCostPerSheet * TOTAL_SHEETS);

        // Markup áp ĐÚNG MỘT LẦN: selling ≈ total × 1.5 (sai số làm tròn ≤ rounding=100).
        expect(Math.abs(d.selling_subtotal - d.total * 1.5)).toBeLessThanOrEqual(100);

        // INVARIANT CHỐNG MARKUP-CHỒNG: nếu markup áp 2 lần thì selling ≈ total × 2.25.
        // Khẳng định selling KHÔNG chạm ngưỡng ×2 → chắc chắn không chồng.
        expect(d.selling_subtotal).toBeLessThan(d.total * 2);
    });

    it('CANARY: nếu tier ĐÃ gồm markup (lỗi) → selling/giá-vốn-thuần chạm 2.25 → invariant ×2 BẮT được', async () => {
        // Giả lập LỖI: ai đó nhét markup ×1.5 vào tier (định mức không còn là giá vốn thuần).
        const breakdown = deriveTierCost({ paperCost: 300, ink: { mlPerSheet: 0.5, pricePerMl: 500 }, sides: 1 });
        const pureCostPerSheet = breakdown.total;           // giá vốn thuần đúng
        const tierWithMarkup = Math.round(pureCostPerSheet * 1.5); // SAI: đã nhét lời

        const { facade } = buildEngine(tierWithMarkup);
        const res: any = await facade.calculatePrice(LOOSE_ARGS);
        const d = res.data;

        // Giá vốn thuần thật (nếu tier đúng) = pureCostPerSheet × số tờ.
        const truePureTotal = pureCostPerSheet * TOTAL_SHEETS;

        // Vì tier đã ×1.5 rồi facade lại ×1.5 → selling ≈ giá-vốn-thuần × 2.25.
        // Test này CHỨNG MINH invariant "selling < pure×2" ở case trên CÓ RĂNG:
        // với lỗi markup-chồng, selling vượt hẳn ngưỡng ×2.
        expect(d.selling_subtotal).toBeGreaterThan(truePureTotal * 2);
    });
});
