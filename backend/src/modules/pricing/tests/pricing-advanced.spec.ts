/**
 * Pricing ADVANCED flow tests — BOUND (dong cuon) + LARGE FORMAT edge.
 * Dung BoundCalculatorService THAT + PricingFacadeService THAT, mock tang du lieu mau.
 *
 * Run: npx jest pricing-advanced
 */

import { PricingService } from '../pricing.service';
import { PricingFacadeService } from '../services/pricing-facade.service';
import { BoundCalculatorService } from '../services/bound-calculator.service';

const PAPER_FULL = { id: 1, widthMm: 450, heightMm: 320, marginLeft: 10, marginRight: 10, marginTop: 10, marginBottom: 10 };

function dbQuery(sql: string): Promise<any[]> {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('pricing_config')) return Promise.resolve([{ config_key: 'vat_rate', config_value: '8' }]);
    if (s.includes('binding_types')) return Promise.resolve([{ price_per_book: '2000', price_per_page: '0' }]);
    if (s.includes('processing_options') && s.includes('WHERE id')) return Promise.resolve([{ id: 5, name: 'Cán màng', code: 'can_mo', price: '100', priceType: 'per_sheet' }]);
    if (s.includes('FROM paper_sizes')) return Promise.resolve([{ width: '450', height: '320', margin_left: '10', margin_right: '10', margin_top: '10', margin_bottom: '10' }]);
    if (s.includes('FROM accessories')) return Promise.resolve([{ price: '5000', name: 'Dây đeo' }]);
    return Promise.resolve([]);
}

function build() {
    const manager = { query: jest.fn(dbQuery) };
    const tierRepo: any = { findOne: jest.fn().mockResolvedValue({ pricePerSheet: 1000 }), manager };
    const materialRepo: any = { findOne: jest.fn(), manager };
    const paperSizeRepo: any = { findOne: jest.fn().mockResolvedValue(PAPER_FULL), find: jest.fn().mockResolvedValue([]) };
    const e: any = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };

    const pricing = new PricingService(tierRepo, materialRepo);
    const boundCalc = new BoundCalculatorService(pricing, { query: jest.fn(dbQuery) } as any);
    const facade = new PricingFacadeService(pricing, materialRepo, paperSizeRepo, e, e, e, e, boundCalc);
    return { facade, materialRepo };
}

describe('Pricing ADVANCED — bound & large format edge', () => {

    // ── BOUND: 100 cuon, 16 trang, ghim giua ──
    it('BOUND: bia + ruot + dong cuon -> markup + VAT dung', async () => {
        const { facade } = build();
        const res: any = await facade.calculatePrice({
            type: 'bound',
            quantity: 100,
            page_count: 16,
            binding_type: 'saddle_stitch',
            cover: { material_id: 10, paper_size_id: 1, print_side: 'double', print_type: '4c' },
            inner: [{ material_id: 10, paper_size_id: 1, print_side: 'double', print_type: '4c' }],
            vat_rate: 8, // VAT theo thông tin khách hàng (request), không từ config
        } as any);

        expect(res.success).toBe(true);
        const d = res.data;
        // Bia: 1 to/cuon x100 = 100, bu hao -> 110 to x 1.000d = 110.000
        expect(d.cover_cost).toBe(110000);
        // Ruot: 16 trang / 4 (ghim giua) = 4 to/cuon x100 = 400, +bu hao(digital1%+binding2%) -> 412 x1.000 = 412.000
        expect(d.inner_cost).toBe(412000);
        expect(d.inner_details[0].total_sheets).toBe(412);
        // Dong cuon: (2.000 + 0 x16) x100 = 200.000
        expect(d.binding_cost).toBe(200000);
        // Tong gia von
        expect(d.total).toBe(722000);
        // Markup 50% = 1.083.000 ; VAT 8% -> grand 1.169.640
        expect(d.selling_subtotal).toBe(1083000);
        expect(d.grand_total).toBe(1169640);
        expect(d.breakdown.binding_type).toBe('saddle_stitch');
    });

    // ── LARGE FORMAT: tinh nguyen kho cuon (chargeFullWidth) ──
    it('LARGE_FORMAT chargeFullWidth: tinh theo be rong cuon, KHONG theo be rong san pham', async () => {
        const { facade, materialRepo } = build();
        // LUU Y (bug C4): cong thuc (rollWidth * height)/1e6 coi rollWidth la mm.
        // Entity ghi rollWidth don vi "m" -> neu luu 1.6 se sai 1000 lan. Phai luu 1600 (mm).
        materialRepo.findOne.mockResolvedValue({ id: 10, pricePerSqm: 50000, chargeFullWidth: true, rollWidth: 1600, minChargeArea: 0 });

        const res: any = await facade.calculatePrice({
            type: 'large_format', material_id: 10, width: 1000, height: 2000, quantity: 1, print_type: 'uv',
        });

        expect(res.success).toBe(true);
        const d = res.data;
        // Nguyen kho cuon: 1.6m (rong cuon) x 2m (cao) = 3.2 m2 (KHONG phai 1x2=2 m2)
        expect(d.breakdown.charge_area_m2).toBe(3.2);
        expect(d.material_cost).toBe(160000); // 3.2 x 50.000
    });

    // ── LARGE FORMAT: dien tich toi thieu tinh phi (minChargeArea) ──
    it('LARGE_FORMAT minChargeArea: dien tich nho hon muc toi thieu -> tinh theo muc toi thieu', async () => {
        const { facade, materialRepo } = build();
        materialRepo.findOne.mockResolvedValue({ id: 10, pricePerSqm: 50000, chargeFullWidth: false, rollWidth: null, minChargeArea: 5 });

        const res: any = await facade.calculatePrice({
            type: 'large_format', material_id: 10, width: 1000, height: 1000, quantity: 1, print_type: 'uv',
        });

        const d = res.data;
        // Thuc te 1x1 = 1 m2 < 5 m2 toi thieu -> tinh 5 m2 x 50.000 = 250.000
        expect(d.breakdown.charge_area_m2).toBe(1);
        expect(d.material_cost).toBe(250000);
    });

    // ── BOUND A5 (148x210) trên SRA3 (450x320, vùng in 430x300): bìa 2-up, ruột 8 trang/tờ ──
    it('BOUND A5 trên SRA3: tự động bình bìa 2 cuốn/tờ & ruột 8 trang/tờ + cộng phụ kiện', async () => {
        const { facade } = build();
        const res: any = await facade.calculatePrice({
            type: 'bound',
            quantity: 100,
            page_count: 20,
            binding_type: 'saddle_stitch',
            item_width: 148,
            item_height: 210,
            cover: { material_id: 10, paper_size_id: 1, print_side: 'double', print_type: '4c' },
            inner: [{ material_id: 10, paper_size_id: 1, page_count: 16, print_side: 'double', print_type: '4c' }],
            accessories: [{ id: 1, qty: 10 }],
            vat_rate: 8,
        } as any);

        expect(res.success).toBe(true);
        const d = res.data;
        expect(d.breakdown.cover_sheets_per_book).toBe(0.5);
        expect(d.breakdown.total_cover_sheets).toBe(55);
        expect(d.cover_cost).toBe(55000);
        expect(d.inner_details[0].pages_per_sheet).toBe(8);
        expect(d.inner_details[0].sheets_per_book).toBe(2);
        expect(d.inner_details[0].total_sheets).toBe(210);
        expect(d.inner_cost).toBe(210000);
        expect(d.accessories_cost).toBe(50000);
        expect(d.total).toBe(55000 + 210000 + 200000 + 50000);
    });

    // ── LARGE FORMAT: không thu hẹp diện tích tính tiền khi width > rollWidth ──
    it('LARGE_FORMAT chargeFullWidth: khi width > rollWidth không được thu hẹp diện tích nhỏ hơn thực tế', async () => {
        const { facade, materialRepo } = build();
        materialRepo.findOne.mockResolvedValue({ id: 10, pricePerSqm: 50000, chargeFullWidth: true, rollWidth: 1200, minChargeArea: 0 });

        const res: any = await facade.calculatePrice({
            type: 'large_format', material_id: 10, width: 2000, height: 1000, quantity: 1, print_type: 'uv',
        });

        expect(res.success).toBe(true);
        expect(res.data.breakdown.charge_area_m2).toBe(2);
        expect(res.data.material_cost).toBe(100000);
    });

    it('BOUND spine_width & cảnh báo ghim giữa lẻ bội số 4: cộng độ dày gáy vào khổ bìa trải và cảnh báo khi trang ruột không chia hết cho 4', async () => {
        const { facade } = build();
        // A5 (148x210) đóng keo nhiệt có gáy 8mm -> bìa trải 304x210mm vượt chiều 300mm của SRA3 (430x300) -> chỉ bình được 1 bìa/tờ thay vì 2 bìa/tờ
        const resSpine: any = await facade.calculatePrice({
            type: 'bound',
            quantity: 100,
            page_count: 164,
            binding_type: 'perfect_bind',
            item_width: 148,
            item_height: 210,
            spine_width: 8,
            cover: { material_id: 10, paper_size_id: 1, print_side: 'single', print_type: '4c' },
            inner: [{ material_id: 10, paper_size_id: 1, page_count: 160, print_side: 'double', print_type: '4c' }],
            vat_rate: 8,
        } as any);
        expect(resSpine.success).toBe(true);
        expect(resSpine.data.breakdown.spine_width_mm).toBe(8);
        expect(resSpine.data.breakdown.cover_spread_width_mm).toBe(304);
        expect(resSpine.data.breakdown.cover_sheets_per_book).toBe(1);
        expect(resSpine.data.breakdown.total_cover_sheets).toBe(110);

        // Ghim giữa có trang ruột = 14 (không chia hết cho 4) -> cảnh báo trong breakdown.warnings
        const resWarn: any = await facade.calculatePrice({
            type: 'bound',
            quantity: 50,
            page_count: 18,
            binding_type: 'saddle_stitch',
            item_width: 148,
            item_height: 210,
            cover: { material_id: 10, paper_size_id: 1, print_side: 'double', print_type: '4c' },
            inner: [{ material_id: 10, paper_size_id: 1, page_count: 14, print_side: 'double', print_type: '4c' }],
            vat_rate: 8,
        } as any);
        expect(resWarn.success).toBe(true);
        expect(resWarn.data.breakdown.warnings?.[0]).toContain('chia hết cho 4');
    });
});
