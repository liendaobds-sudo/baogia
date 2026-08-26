import { QuotePdfService } from '../quote-pdf.service';

function makeService() {
  return new QuotePdfService({ query: jest.fn().mockResolvedValue([]) } as never);
}

describe('QuotePdfService — parity tiền đã lưu', () => {
  it('render subtotal → discount → taxable subtotal → VAT → shipping đúng grand_total', async () => {
    const html = await makeService().generateHtml({
      code: 'BG-MONEY-1',
      total: 1_000_000,
      discount_type: 'percent',
      discount_value: 10,
      discount_amount: 100_000,
      vat_rate: 8,
      vat_amount: 72_000,
      shipping_fee: 20_000,
      grand_total: 992_000,
      items: [{ product_name: 'Namecard', quantity: 1_000, item_total: 1_000_000 }],
    });

    expect(html).toContain('Tạm tính:</td><td class="value">1.000.000 ₫');
    expect(html).toContain('Chiết khấu (10%)');
    expect(html).toContain('−100.000 ₫');
    expect(html).toContain('Cộng tiền hàng (chưa VAT):</td><td class="value">900.000 ₫');
    expect(html).toContain('Thuế GTGT (8%):</td><td class="value">72.000 ₫');
    expect(html).toContain('Phí giao hàng:</td><td class="value">20.000 ₫');
    expect(html).toContain('TỔNG THANH TOÁN:</td><td class="value">992.000 ₫');
    expect(html).not.toContain('Tạm tính:</td><td class="value">1.100.000 ₫');
  });

  it('fallback VAT/grand legacy vẫn tính trên subtotal sau chiết khấu', async () => {
    const html = await makeService().generateHtml({
      code: 'BG-MONEY-2',
      total: 500_000,
      discount_type: 'fixed',
      discount_value: 50_000,
      discount_amount: 50_000,
      vat_rate: 10,
      shipping_fee: 5_000,
      items: [],
    });

    expect(html).toContain('Cộng tiền hàng (chưa VAT):</td><td class="value">450.000 ₫');
    expect(html).toContain('Thuế GTGT (10%):</td><td class="value">45.000 ₫');
    expect(html).toContain('TỔNG THANH TOÁN:</td><td class="value">500.000 ₫');
  });
});
