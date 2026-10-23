import { mapCartItemToQuoteItem, type CartItemLike } from './map-cart-item';

/**
 * Audit 2026-08-29 — P1: trang Cổng `/pricing/quotes/start` có bản `mapItem` RIÊNG, nhánh digital
 * `return { ...cfg, ... }` spread `configParams` dạng **camelCase** và KHÔNG có `printing_detail`.
 * `QuoteItemDto` chỉ khai snake_case và backend bật `whitelist + forbidNonWhitelisted` ⇒ HTTP 400;
 * nếu lọt DTO thì `OrdersService.recomputeDigitalItems` ném "Thiếu pricingPayload…".
 * ⇒ Lưu báo giá digital từ Cổng hỏng hoàn toàn.
 *
 * Test này khoá hai bất biến của helper hợp nhất:
 *  1. KHÔNG có khoá camelCase nào rò ra payload gốc (nguyên nhân HTTP 400).
 *  2. `printing_detail` luôn có cơ sở để server TÍNH LẠI giá (`pricingPayload` cho digital,
 *     `config` cho offset) — bỏ nó đi thì báo giá bị TỪ CHỐI, không phải "lưu giá client".
 */
describe('mapCartItemToQuoteItem', () => {
    const looseCfg = {
        materialId: 12,
        materialName: 'Couche 300',
        paperSizeId: 3,
        paperSizeName: '65x86',
        itemWidth: 9,
        itemHeight: 5.4,
        printType: 'offset',
        printSide: 'double',
        unit: 'cái',
    };

    const looseItem: CartItemLike = {
        name: 'Namecard',
        type: 'loose',
        quantity: 1000,
        total: 250000,
        unitPrice: 250,
        details: { subtotal: 250000 },
        configParams: looseCfg,
        pricingPayload: { type: 'loose', material_id: 12, quantity: 1000 },
    };

    /** Mọi khoá được phép trong QuoteItemDto (snake_case). */
    const CAMEL_CASE = /[a-z][A-Z]/;

    it('digital: KHÔNG rò khoá camelCase ra payload gốc (nguyên nhân HTTP 400)', () => {
        const out = mapCartItemToQuoteItem(looseItem);
        const leaked = Object.keys(out).filter((k) => CAMEL_CASE.test(k));
        expect(leaked).toEqual([]);
        // Các khoá camelCase cụ thể từng bị spread:
        for (const k of ['materialId', 'paperSizeId', 'itemWidth', 'itemHeight', 'materialName']) {
            expect(out).not.toHaveProperty(k);
        }
    });

    it('digital: map đúng sang khoá snake_case của QuoteItemDto', () => {
        const out = mapCartItemToQuoteItem(looseItem);
        expect(out).toMatchObject({
            product_name: 'Namecard',
            item_type: 'loose',
            product_type: 'loose',
            quantity: 1000,
            item_total: 250000,
            material_id: 12,
            paper_size_id: 3,
            paper_size_name: '65x86',
            item_width: 9,
            item_height: 5.4,
            print_type: 'offset',
            print_side: 'double',
            material_name: 'Couche 300',
        });
    });

    it('digital: printing_detail mang pricingPayload để server replay xác thực giá', () => {
        const pd = mapCartItemToQuoteItem(looseItem).printing_detail as any;
        expect(pd.digital).toBe(true);
        expect(pd.pricingPayload).toEqual({ type: 'loose', material_id: 12, quantity: 1000 });
        expect(pd.configParams).toEqual(looseCfg);
    });

    it('large_format: đọc đúng tiền tố lf* của configurator', () => {
        const out = mapCartItemToQuoteItem({
            ...looseItem,
            type: 'large_format',
            configParams: { lfMaterialId: 7, lfWidth: 120, lfHeight: 240, lfPrintType: 'uv' },
        });
        expect(out).toMatchObject({
            item_type: 'large_format',
            material_id: 7,
            item_width: 120,
            item_height: 240,
            print_type: 'uv',
        });
        expect(Object.keys(out).filter((k) => CAMEL_CASE.test(k))).toEqual([]);
    });

    it('bound: map page_count + binding_type', () => {
        const out = mapCartItemToQuoteItem({
            ...looseItem,
            type: 'bound',
            configParams: { bPageCount: 120, bBindingType: 'keo_nhiet' },
        });
        expect(out).toMatchObject({ item_type: 'bound', page_count: 120, binding_type: 'keo_nhiet' });
    });

    it('offset: gói cấu hình camelCase vào printing_detail.config, không spread', () => {
        const cfg = { type: 'hop_giay', materialCode: 'C300', khoIn: '28cm x 60cm', rong: 8, soKemIn: 4 };
        const out = mapCartItemToQuoteItem({
            name: 'Hộp giấy',
            type: 'offset',
            quantity: 500,
            total: 4_000_000,
            unitPrice: 8000,
            details: { meta: { soConToLon: 6 } },
            configParams: cfg,
        });
        expect(out).toMatchObject({
            item_type: 'offset',
            product_type: 'hop_giay',
            quantity: 500,
            item_total: 4_000_000,
        });
        expect(Object.keys(out).filter((k) => CAMEL_CASE.test(k))).toEqual([]);
        const pd = out.printing_detail as any;
        expect(pd.offset).toBe(true);
        expect(pd.config).toEqual(cfg);
        expect(pd.unitPrice).toBe(8000);
    });

    it('không có unit ⇒ suy nhãn theo loại sản phẩm (offset to_roi = tờ, còn lại = cái)', () => {
        const toRoi = mapCartItemToQuoteItem({
            name: 'Tờ rơi', type: 'offset', quantity: 1, total: 1, unitPrice: 1,
            details: {}, configParams: { type: 'to_roi' },
        });
        expect(toRoi.unit).toBe('tờ');

        const bound = mapCartItemToQuoteItem({ ...looseItem, type: 'bound', configParams: {} });
        expect(bound.unit).toBe('cuốn');
    });

    it('configParams thiếu/null ⇒ không crash, vẫn ra payload hợp lệ', () => {
        const out = mapCartItemToQuoteItem({
            name: 'X', type: 'loose', quantity: 1, total: 0, unitPrice: 0,
            details: null, configParams: null as unknown as Record<string, unknown>,
        });
        expect(out.product_name).toBe('X');
        expect(out.printing_detail).toBeDefined();
    });

    it('giá trị số không hợp lệ ⇒ undefined (để @IsOptional bỏ qua, không gửi NaN)', () => {
        const out = mapCartItemToQuoteItem({
            ...looseItem,
            configParams: { ...looseCfg, materialId: '', itemWidth: 'abc' },
        });
        expect(out.material_id).toBeUndefined();
        expect(out.item_width).toBeUndefined();
    });
});
