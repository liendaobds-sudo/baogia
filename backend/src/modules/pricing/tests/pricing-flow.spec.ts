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

function buildEngine() {
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
        findOne: jest.fn().mockResolvedValue({ pricePerSheet: SAMPLE.tierPricePerSheet }),
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
            shape: 'rectangle', gap_h: 2, gap_v: 2, processing: [],
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
