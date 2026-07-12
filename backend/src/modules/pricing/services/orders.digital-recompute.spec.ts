import { OrdersService } from './orders.service';

/**
 * Audit /pricing/quotes/new (finding → fix): chống client sửa giá item DIGITAL.
 * Backend replay ĐÚNG payload đã lưu qua PricingFacadeService và ghi đè item_total
 * bằng `data.selling_subtotal` = GIÁ BÁN TRƯỚC VAT (markup áp 1 lần ở facade).
 * KHÔNG dùng `data.total` (giá vốn — mất markup) và KHÔNG dùng `data.grand_total`
 * (đã gồm VAT — header createQuote lại áp VAT lần nữa ⇒ VAT chồng).
 */
describe('OrdersService.recomputeDigitalItems', () => {
    const build = (facade?: any) =>
        new OrdersService({} as never, {} as never, {} as never, {} as never, undefined, facade);

    const run = (svc: OrdersService, items: any[]) => (svc as any).recomputeDigitalItems(items);

    it('loose có payload → ghi đè item_total bằng facade.data.selling_subtotal (chặn tamper)', async () => {
        const facade = { calculatePrice: jest.fn().mockResolvedValue({ success: true, data: { total: 52800, selling_subtotal: 79200, grand_total: 85536 } }) };
        const svc = build(facade);
        const items = [{ product_name: 'Namecard', item_total: 5, printing_detail: { digital: true, pricingPayload: { type: 'loose', material_id: 1 } } }];
        await run(svc, items);
        expect(facade.calculatePrice).toHaveBeenCalledWith({ type: 'loose', material_id: 1 });
        expect(items[0].item_total).toBe(79200);
    });

    // CANARY chống hồi quy "bán ở giá vốn": khi facade trả đủ 3 field, item_total PHẢI là
    // selling_subtotal (giá bán trước VAT), KHÔNG phải total (giá vốn) hay grand_total (gồm VAT).
    it('CANARY: item_total = selling_subtotal, KHÔNG = total (vốn) hay grand_total (gồm VAT)', async () => {
        const facade = { calculatePrice: jest.fn().mockResolvedValue({ success: true, data: { total: 52800, selling_subtotal: 79200, grand_total: 85536 } }) };
        const svc = build(facade);
        const items = [{ product_name: 'Namecard', item_total: 0, printing_detail: { digital: true, pricingPayload: { type: 'loose' } } }];
        await run(svc, items);
        expect(items[0].item_total).toBe(79200);
        expect(items[0].item_total).not.toBe(52800); // không bán ở giá vốn
        expect(items[0].item_total).not.toBe(85536); // không gồm VAT (tránh VAT chồng)
    });

    // Engine cũ/edge chỉ trả `total` (không có selling_subtotal) → fallback về total để không crash.
    it('facade chỉ trả total (không selling_subtotal) → fallback về total', async () => {
        const facade = { calculatePrice: jest.fn().mockResolvedValue({ success: true, data: { total: 80000 } }) };
        const svc = build(facade);
        const items = [{ product_name: 'X', item_total: 5, printing_detail: { digital: true, pricingPayload: { type: 'loose' } } }];
        await run(svc, items);
        expect(items[0].item_total).toBe(80000);
    });

    it('large_format có payload → KHÔNG gọi facade, KHÔNG ghi đè (phụ kiện tính client)', async () => {
        const facade = { calculatePrice: jest.fn() };
        const svc = build(facade);
        const items = [{ item_total: 123000, printing_detail: { digital: true, pricingPayload: { type: 'large_format', material_id: 9 } } }];
        await run(svc, items);
        expect(facade.calculatePrice).not.toHaveBeenCalled();
        expect(items[0].item_total).toBe(123000);
    });

    it('item KHÔNG có payload → giữ nguyên (tương thích báo giá cũ)', async () => {
        const facade = { calculatePrice: jest.fn() };
        const svc = build(facade);
        const items = [{ item_total: 42, printing_detail: { digital: true } }];
        await run(svc, items);
        expect(facade.calculatePrice).not.toHaveBeenCalled();
        expect(items[0].item_total).toBe(42);
    });

    it('offset item → bỏ qua (đã do recomputeOffsetItems xử lý)', async () => {
        const facade = { calculatePrice: jest.fn() };
        const svc = build(facade);
        const items = [{ item_total: 10, printing_detail: { offset: true, pricingPayload: { type: 'loose' } } }];
        await run(svc, items);
        expect(facade.calculatePrice).not.toHaveBeenCalled();
    });

    it('facade trả success:false → ném lỗi (không tin giá client)', async () => {
        const facade = { calculatePrice: jest.fn().mockResolvedValue({ success: false, error: 'Thiếu đơn giá' }) };
        const svc = build(facade);
        const items = [{ product_name: 'X', item_total: 1, printing_detail: { digital: true, pricingPayload: { type: 'loose' } } }];
        await expect(run(svc, items)).rejects.toThrow('Không xác thực được giá');
    });

    it('không có facade (unit test) → no-op, giữ nguyên', async () => {
        const svc = build(undefined);
        const items = [{ item_total: 7, printing_detail: { digital: true, pricingPayload: { type: 'loose' } } }];
        await run(svc, items);
        expect(items[0].item_total).toBe(7);
    });
});
