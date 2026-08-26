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

    it('large_format có payload → replay facade + ghi đè selling_subtotal (accessories server-side)', async () => {
        const facade = {
            calculatePrice: jest.fn().mockResolvedValue({
                success: true,
                data: { total: 100000, selling_subtotal: 150000, grand_total: 162000 },
            }),
        };
        const svc = build(facade);
        const payload = { type: 'large_format', material_id: 9, accessories: [{ id: 1, quantity: 2 }] };
        const items = [{ item_total: 123000, printing_detail: { digital: true, pricingPayload: payload } }];
        await run(svc, items);
        expect(facade.calculatePrice).toHaveBeenCalledWith(payload);
        expect(items[0].item_total).toBe(150000);
    });

    it('item digital KHÔNG có payload → fail-closed trên write mới', async () => {
        const facade = { calculatePrice: jest.fn() };
        const svc = build(facade);
        const items = [{ item_type: 'loose', item_total: 42, printing_detail: { digital: true } }];
        await expect(run(svc, items)).rejects.toThrow('Thiếu pricingPayload');
        expect(facade.calculatePrice).not.toHaveBeenCalled();
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

    it('không có facade → fail-closed, không tin item_total client', async () => {
        const svc = build(undefined);
        const items = [{ item_total: 7, printing_detail: { digital: true, pricingPayload: { type: 'loose' } } }];
        await expect(run(svc, items)).rejects.toThrow('PricingFacadeService');
    });

    it('payload type không khớp item type → từ chối', async () => {
        const facade = { calculatePrice: jest.fn() };
        const svc = build(facade);
        const items = [{ item_type: 'bound', item_total: 7, printing_detail: { digital: true, pricingPayload: { type: 'loose' } } }];
        await expect(run(svc, items)).rejects.toThrow('không khớp');
        expect(facade.calculatePrice).not.toHaveBeenCalled();
    });

    it('facade success nhưng giá không hữu hạn → từ chối, không giữ giá client', async () => {
        const facade = { calculatePrice: jest.fn().mockResolvedValue({ success: true, data: { selling_subtotal: 'NaN' } }) };
        const svc = build(facade);
        const items = [{ item_type: 'loose', item_total: 999, printing_detail: { digital: true, pricingPayload: { type: 'loose' } } }];
        await expect(run(svc, items)).rejects.toThrow('không hợp lệ');
        expect(items[0].item_total).toBe(999);
    });
});
