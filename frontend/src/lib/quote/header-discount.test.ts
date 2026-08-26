import { calculateHeaderDiscount } from './header-discount';

describe('calculateHeaderDiscount', () => {
  it('percent: derive amount và subtotal sau discount', () => {
    expect(calculateHeaderDiscount(100_000, 'percent', 10)).toEqual({
      discountType: 'percent',
      discountValue: 10,
      discountAmount: 10_000,
      afterDiscount: 90_000,
    });
  });

  it('fixed: giữ đúng số tiền, không diễn giải thành phần trăm', () => {
    expect(calculateHeaderDiscount(100_000, 'fixed', 12_500)).toEqual({
      discountType: 'fixed',
      discountValue: 12_500,
      discountAmount: 12_500,
      afterDiscount: 87_500,
    });
  });

  it('chặn percent >100 và fixed vượt subtotal để preview không âm', () => {
    expect(calculateHeaderDiscount(100, 'percent', 200).discountAmount).toBe(100);
    expect(calculateHeaderDiscount(100, 'fixed', 200).discountAmount).toBe(100);
  });
});
