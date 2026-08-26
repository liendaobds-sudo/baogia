import { computeAuthoritativeQuoteTotals } from './quote-totals';

describe('computeAuthoritativeQuoteTotals', () => {
  it('tính chiết khấu percent rồi áp VAT đúng một lần trên phần còn lại', () => {
    const result = computeAuthoritativeQuoteTotals({
      subtotal: 1_000_000,
      discountType: 'percent',
      discountValue: 10,
      vatRate: 8,
      shippingFee: 20_000,
    });

    expect(result).toEqual({
      subtotal: 1_000_000,
      discountType: 'percent',
      discountValue: 10,
      discountAmount: 100_000,
      afterDiscount: 900_000,
      vatRate: 8,
      vatAmount: 72_000,
      shippingFee: 20_000,
      grandTotal: 992_000,
    });
  });

  it('tính chiết khấu fixed từ discount_value, không nhận discount_amount từ client', () => {
    const result = computeAuthoritativeQuoteTotals({
      subtotal: 500_000,
      discountType: 'fixed',
      discountValue: 50_000,
      vatRate: 10,
    });

    expect(result.discountAmount).toBe(50_000);
    expect(result.vatAmount).toBe(45_000);
    expect(result.grandTotal).toBe(495_000);
  });

  it('không có discount_type thì chuẩn hóa chiết khấu về 0', () => {
    const result = computeAuthoritativeQuoteTotals({
      subtotal: 100_000,
      discountValue: 99,
      vatRate: 0,
    });

    expect(result.discountType).toBeNull();
    expect(result.discountValue).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.grandTotal).toBe(100_000);
  });

  it.each([
    [{ subtotal: 100, discountType: 'percent', discountValue: 101 }, /0 đến 100/],
    [{ subtotal: 100, discountType: 'fixed', discountValue: 101 }, /không được vượt/],
    [{ subtotal: 100, discountType: 'other', discountValue: 1 }, /percent.*fixed/],
    [{ subtotal: 100, vatRate: 101 }, /Thuế suất VAT/],
    [{ subtotal: 100, shippingFee: -1 }, /Phí giao hàng không được âm/],
    [{ subtotal: Number.NaN }, /Tạm tính phải là một số hữu hạn/],
  ])('từ chối input tiền không hợp lệ: %p', (input, expected) => {
    expect(() => computeAuthoritativeQuoteTotals(input)).toThrow(expected);
  });
});
