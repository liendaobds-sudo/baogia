/**
 * Quote CONFIG-LINK + cross-surface consistency tests.
 *
 * Lien ket DAY DU cau hinh bao gia:
 *   - loai san pham (quote_type)
 *   - dinh muc (pricing_tiers)
 *   - cau hinh san pham (allowed materials/processing + defaults)
 *
 * Wiring ENGINE THAT: QuoteService -> PricingApiService -> PricingFacadeService -> PricingService.
 * Chi mock tang du lieu (repo/dataSource) bang sample nhat quan.
 *
 * Run: npx jest quote-config-link
 */

import { QuoteService } from '../quote.service';
import { PricingApiService } from '../pricing-api.service';
import { PricingFacadeService } from '../../pricing/services/pricing-facade.service';
import { PricingService } from '../../pricing/pricing.service';

// ── Sample master data (nhat quan noi bo) ──
const PAPER_FULL = { id: 1, widthMm: 450, heightMm: 320, marginLeft: 10, marginRight: 10, marginTop: 10, marginBottom: 10 };
const MAT10 = { id: 10, name: 'Couche 300', category_tab: 'substrate_sheet', scopeLoose: true, gsm: 300 };
const MAT11 = { id: 11, name: 'Bristol 250', category_tab: 'substrate_sheet', scopeLoose: true, gsm: 250 };

// DB query router dung chung cho moi manager + dataSource
function dbQuery(sql: string): Promise<any[]> {
    const s = sql.replace(/\s+/g, ' ');
    if (s.includes('pricing_config')) return Promise.resolve([{ config_key: 'vat_rate', config_value: '8' }]);
    if (s.includes('processing_options') && s.includes('WHERE id')) return Promise.resolve([{ id: 5, name: 'Cán màng', price: '100', priceType: 'per_sheet' }]);
    if (s.includes('processing_options')) return Promise.resolve([{ id: 5, code: 'can_mo', name: 'Cán màng', category: 'lamination', scope_loose: 1 }]);
    if (s.includes('DISTINCT material_id, paper_size_id FROM pricing_tiers')) return Promise.resolve([{ material_id: 10, paper_size_id: 1 }]);
    if (s.includes('FROM accessories')) return Promise.resolve([]);
    if (s.includes('FROM unified_products')) return Promise.resolve([{
        allowed_materials: '[10]', allowed_paper_sizes: '[1]', allowed_processing: '[5]', allowed_accessories: null,
        quote_type: 'loose', default_materials: null, default_finishing: null,
        form_config: '{"default_print_side":"double","lock_print_side":true}',
    }]);
    if (s.includes('FROM product_quote_configs')) return Promise.resolve([]);
    return Promise.resolve([]);
}

function makeQB(rows: any[]) {
    const qb: any = {};
    qb.where = jest.fn(() => qb);
    qb.andWhere = jest.fn(() => qb);
    qb.orderBy = jest.fn(() => qb);
    qb.getMany = jest.fn().mockResolvedValue(rows);
    return qb;
}

function build() {
    const manager = { query: jest.fn(dbQuery) };
    const tierRepo: any = { findOne: jest.fn().mockResolvedValue({ pricePerSheet: 1000 }), manager };
    const materialRepo: any = {
        findOne: jest.fn().mockResolvedValue({ id: 10, pricePerSqm: 0, chargeFullWidth: false, rollWidth: null, minChargeArea: 0 }),
        manager,
        createQueryBuilder: jest.fn(() => makeQB([MAT10, MAT11])),
    };
    const paperSizeRepo: any = {
        findOne: jest.fn().mockResolvedValue(PAPER_FULL),
        find: jest.fn().mockResolvedValue([
            { id: 1, name: 'SRA3', width: 450, height: 320 },
            { id: 2, name: 'A4', width: 210, height: 297 },
        ]),
        // PricingFacadeService.getMasterData lọc khổ offset-only qua createQueryBuilder
        // (.where().orderBy().getMany()); mock phải cung cấp để không ném → success:false.
        createQueryBuilder: jest.fn(() => makeQB([
            { id: 1, name: 'SRA3', width: 450, height: 320 },
            { id: 2, name: 'A4', width: 210, height: 297 },
        ])),
    };
    const emptyRepo: any = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };

    const pricing = new PricingService(tierRepo, materialRepo);
    const facade = new PricingFacadeService(pricing, materialRepo, paperSizeRepo, emptyRepo, emptyRepo, emptyRepo, emptyRepo, { calculate: jest.fn() } as any);
    const pricingApi = new PricingApiService(facade);

    const dataSource: any = { query: jest.fn(dbQuery) };
    const e: any = {};
    const svc = new QuoteService(e, e, e, e, e, e, e, e, e, pricingApi, dataSource);

    // Nap cache de chatbot resolve finishing code -> processing id (mo phong onModuleInit)
    (svc as any).pricingHealthy = true;
    (svc as any).pricingProcessingCache = [{ id: 5, code: 'can_mo', name: 'Cán màng' }];
    (svc as any).pricingPaperSizesCache = [{ id: 1, is_standard: 1, name: 'SRA3' }];

    return { svc };
}

describe('Quote CONFIG-LINK + nhat quan 2 cua (engine that)', () => {

    it('NHAT QUAN: cùng cấu hình -> mini (grand_total) == chatbot (total) == 79.200 (CHƯA VAT)', async () => {
        const { svc } = build();

        // Cua MINI: tham so day du, gap aligned = 2
        const mini: any = await svc.calculateMiniQuote({
            type: 'loose', material_id: 10, paper_size_id: 1, quantity: 1000,
            item_width: 90, item_height: 54, print_side: 'double', print_type: '4c',
            shape: 'rectangle', gap_h: 2, gap_v: 2, processing: [{ id: 5 }],
        });

        // Cua CHATBOT: cùng san pham, finishing 'can_mo' -> resolve ve processing id 5
        const chatbot: any = await svc.calculateFromParsed({
            product: 'card', type: 'loose', quantity: 1000,
            material: { id: 10, paperSizeId: 1 }, size: { width: 90, height: 54 },
            printSides: 2, finishing: ['can_mo'], isComplete: true,
        } as any);

        // VAT KHÔNG còn nhúng từ config: mini/chatbot báo GIÁ BÁN CHƯA VAT (markup, chưa VAT).
        // VAT chỉ áp ở luồng báo giá chính thức theo % nhập ở mục thông tin khách hàng.
        expect(mini.grand_total).toBe(79200);
        expect(chatbot.total).toBe(79200);     // B1: chatbot tra gia ban (chưa VAT)
        expect(chatbot.total).toBe(mini.grand_total); // NHAT QUAN giua 2 cua
    });

    it('LIEN KET DINH MUC + GIA CONG: chatbot co finishing > khong finishing', async () => {
        const { svc } = build();
        const withLam: any = await svc.calculateFromParsed({
            product: 'card', type: 'loose', quantity: 1000, material: { id: 10, paperSizeId: 1 },
            size: { width: 90, height: 54 }, printSides: 2, finishing: ['can_mo'], isComplete: true,
        } as any);
        const noLam: any = await svc.calculateFromParsed({
            product: 'card', type: 'loose', quantity: 1000, material: { id: 10, paperSizeId: 1 },
            size: { width: 90, height: 54 }, printSides: 2, finishing: [], isComplete: true,
        } as any);

        expect(withLam.total).toBe(79200); // co can mang (markup, chưa VAT)
        expect(noLam.total).toBe(72000);   // khong can mang (48.000 x1.5, chưa VAT)
        expect(withLam.total).toBeGreaterThan(noLam.total);
    });

    it('CAU HINH SAN PHAM: getMasterDataForProduct loc dung theo allowed list + defaults', async () => {
        const { svc } = build();
        const md: any = await svc.getMasterDataForProduct(100);

        // allowed_materials = [10] -> chi con MAT10 (loai MAT11)
        expect(md.materials.map((m: any) => m.id)).toEqual([10]);
        // allowed_paper_sizes = [1] -> chi con SRA3
        expect(md.paperSizes.map((p: any) => p.id)).toEqual([1]);
        // allowed_processing = [5] -> chi con id 5
        expect(md.processingOptions.map((p: any) => p.id)).toEqual([5]);
        // form_config defaults duoc lien ket
        expect(md.config.lock_print_side).toBe(true);
        expect(md.config.default_print_side).toBe('double');
    });
});
