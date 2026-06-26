/**
 * Quote FLOW tests — kiem thu luong QuoteService (chatbot/mini) voi du lieu MAU.
 *
 * Xac minh 2 fix quan trong:
 *   - B1: calculateFromParsed tra GIA BAN (grand_total), KHONG phai gia von (total).
 *   - Cache-key: 2 bao gia chi khac "gia cong" KHONG bi dung cache tra ve gia sai.
 *
 * Engine giá đã được mock (PricingApiService) — tap trung kiem tra logic cua QuoteService.
 *
 * Run: npx jest quote-flow
 */

import { QuoteService } from '../quote.service';

// Ket qua mau tra ve tu engine (shape giong PricingFacade.data):
// gia von (total) 52.800 ; gia ban (grand_total) 85.536
const SAMPLE_PRICING_RESULT = {
    type: 'loose',
    material_cost: 48000,
    processing_cost: 0,
    accessories_cost: 0,
    subtotal: 52800,
    total: 52800,            // GIA VON
    cost_subtotal: 52800,
    selling_subtotal: 79200, // markup 50%
    vat_rate: 8,
    vat_amount: 6336,
    grand_total: 85536,      // GIA BAN (markup + VAT)
    grand_total_per_item: 86,
    breakdown: { items_per_sheet: 23, sheets_needed: 44, total_sheets: 48, price_per_sheet: 1000 },
    processing_details: [],
};

function buildQuoteService() {
    const calculatePrice = jest.fn().mockResolvedValue({ ...SAMPLE_PRICING_RESULT });
    const pricingApi: any = {
        isHealthy: jest.fn().mockResolvedValue(true),
        calculatePrice,
        getMaterials: jest.fn().mockResolvedValue([]),
        getProcessingOptions: jest.fn().mockResolvedValue([]),
        getPaperSizes: jest.fn().mockResolvedValue([]),
        getFormOptions: jest.fn().mockResolvedValue({}),
    };
    const emptyRepo: any = {};
    const dataSource: any = { query: jest.fn().mockResolvedValue([]) };

    const svc = new QuoteService(
        emptyRepo, emptyRepo, emptyRepo, emptyRepo, emptyRepo,
        emptyRepo, emptyRepo, emptyRepo, emptyRepo,
        pricingApi, dataSource,
    );
    return { svc, calculatePrice };
}

function looseParsed(extra: Record<string, any> = {}) {
    return {
        product: 'card visit',
        type: 'loose',
        quantity: 1000,
        material: { id: 10, name: 'Couche 300', paperSizeId: 1 },
        size: { width: 90, height: 54 },
        printSides: 2,
        isComplete: true,
        finishing: [],
        ...extra,
    } as any;
}

describe('Quote FLOW — chatbot/mini, du lieu mau', () => {

    it('B1: calculateFromParsed tra GIA BAN (grand_total 85.536), khong phai gia von (52.800)', async () => {
        const { svc } = buildQuoteService();
        const res = await svc.calculateFromParsed(looseParsed());

        expect(res.requiresManualQuote).toBeFalsy();
        expect(res.source).toBe('pricing');
        expect(res.total).toBe(85536);   // grand_total, KHONG phai 52.800
        expect(res.total).not.toBe(52800);
        expect(res.unitPrice).toBe(86);   // grand_total_per_item
    });

    it('Cache HIT: 2 lan goi input GIONG HET -> engine chi tinh 1 lan', async () => {
        const { svc, calculatePrice } = buildQuoteService();
        await svc.calculateFromParsed(looseParsed());
        await svc.calculateFromParsed(looseParsed());
        expect(calculatePrice).toHaveBeenCalledTimes(1); // lan 2 lay tu cache
    });

    it('Cache-key FIX: chi khac "gia cong" -> KHONG dung cache, engine tinh lai (2 lan)', async () => {
        const { svc, calculatePrice } = buildQuoteService();
        await svc.calculateFromParsed(looseParsed({ finishing: [] }));
        await svc.calculateFromParsed(looseParsed({ finishing: ['can_mo'] }));
        // Truoc khi fix: cache key bo qua finishing -> chi goi 1 lan (tra gia sai cho lan 2).
        // Sau khi fix: 2 key khac nhau -> goi 2 lan.
        expect(calculatePrice).toHaveBeenCalledTimes(2);
    });

    it('Bao gia chua du thong tin -> tra missingFields, khong goi engine', async () => {
        const { svc, calculatePrice } = buildQuoteService();
        const res = await svc.calculateFromParsed(looseParsed({ isComplete: false, missingFields: ['quantity'] }));
        expect(res.total).toBeNull();
        expect(calculatePrice).not.toHaveBeenCalled();
    });
});
