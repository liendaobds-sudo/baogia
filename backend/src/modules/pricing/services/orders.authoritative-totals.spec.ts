import { OrdersService } from './orders.service';

describe('OrdersService — server-authoritative quote totals', () => {
  const existing = {
    status: 'draft',
    total: 1_000,
    discount_type: 'percent',
    discount_value: 10,
    vat_rate: 10,
    shipping_fee: 50,
  };

  function build(existingQuote = existing) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/SELECT\s+status, total, discount_type/i.test(sql)) return [existingQuote];
        if (/currval\(/i.test(sql)) return [{ id: 42 }];
        return [];
      }),
    };
    const dataSource = {
      createQueryRunner: jest.fn(() => qr),
      query: jest.fn().mockResolvedValue([]),
    };
    const customers = { autoResolveFromQuote: jest.fn().mockResolvedValue(null) };
    const facade = {
      calculatePrice: jest.fn().mockResolvedValue({
        success: true,
        data: { total: 700, selling_subtotal: 1_000, grand_total: 1_100 },
      }),
    };
    const service = new OrdersService(
      dataSource as never,
      {} as never,
      customers as never,
      { calculate: jest.fn() } as never,
      undefined,
      facade as never,
    );
    jest.spyOn(service, 'findQuoteById').mockResolvedValue({ id: 42 } as never);
    return { service, calls, qr, facade };
  }

  const digitalItem = () => ({
    product_name: 'Namecard',
    item_type: 'loose',
    product_type: 'loose',
    quantity: 100,
    item_total: 1,
    printing_detail: { digital: true, pricingPayload: { type: 'loose', quantity: 100 } },
  });

  function quoteInsert(calls: Array<{ sql: string; params: unknown[] }>) {
    const call = calls.find(({ sql }) => /INSERT INTO quotes\s*\(/i.test(sql));
    if (!call) throw new Error('Không bắt được INSERT quotes');
    return call;
  }

  function quoteUpdate(calls: Array<{ sql: string; params: unknown[] }>) {
    const call = calls.find(({ sql }) => /UPDATE quotes SET/i.test(sql));
    if (!call) throw new Error('Không bắt được UPDATE quotes');
    return call;
  }

  it('create bỏ qua total/discount_amount/vat_amount/grand_total client và derive từ item replay', async () => {
    const { service, calls } = build();

    await service.createQuote({
      code: 'BG-TEST-1',
      items: [digitalItem()],
      total: 1,
      discount_type: 'percent',
      discount_value: 10,
      discount_amount: 999,
      vat_rate: 10,
      vat_amount: 999,
      shipping_fee: 50,
      grand_total: 999,
    }, 'user-1');

    const { params } = quoteInsert(calls);
    expect(params.slice(11, 19)).toEqual([
      1_000, 'percent', 10, 100, 10, 90, 50, 1_040,
    ]);
  });

  it.each([
    [undefined, /ít nhất một hạng mục/],
    [[], /ít nhất một hạng mục/],
    [[{ product_name: 'Manual ngầm', item_type: 'mystery', item_total: 999 }], /Không xác định được engine giá/],
  ])('create từ chối danh sách item không authoritative: %p', async (items, expected) => {
    const { service, qr } = build();

    await expect(service.createQuote({ code: 'BG-BAD', items }, 'user-1')).rejects.toThrow(expected);
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(qr.commitTransaction).not.toHaveBeenCalled();
  });

  it('update header-only giữ subtotal/discount/VAT hiện có, bỏ qua derived fields client', async () => {
    const { service, calls } = build();

    await service.updateQuote('42', {
      total: 1,
      discount_amount: 1,
      vat_amount: 1,
      shipping_fee: 200,
      grand_total: 1,
    });

    expect(quoteUpdate(calls).params).toEqual([
      1_000, 'percent', 10, 100, 10, 90, 200, 1_190, '42',
    ]);
  });

  it('update items-only replay subtotal mới nhưng giữ discount/VAT/shipping persisted', async () => {
    const { service, calls, facade } = build({
      ...existing,
      vat_rate: 8,
      shipping_fee: 20,
    });
    facade.calculatePrice.mockResolvedValue({
      success: true,
      data: { total: 1_400, selling_subtotal: 2_000, grand_total: 2_160 },
    });

    await service.updateQuote('42', { items: [digitalItem()] });

    expect(quoteUpdate(calls).params).toEqual([
      2_000, 'percent', 10, 200, 8, 144, 20, 1_964, '42',
    ]);
  });

  it('update từ chối items rỗng thay vì fallback về total client', async () => {
    const { service, qr } = build();

    await expect(service.updateQuote('42', { items: [], total: 999 })).rejects.toThrow('ít nhất một hạng mục');
    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
  });
});
