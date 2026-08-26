import { useQuoteCart } from './useQuoteCart';

describe('useQuoteCart — tách hai tầng chiết khấu', () => {
  beforeEach(() => {
    useQuoteCart.setState(useQuoteCart.getInitialState(), true);
  });

  it('chiết khấu đầu báo giá mặc định bằng 0', () => {
    expect(useQuoteCart.getState().headerDiscountType).toBe('percent');
    expect(useQuoteCart.getState().headerDiscountValue).toBe(0);
  });

  it('đổi chiết khấu đầu báo giá không làm đổi chiết khấu engine Offset', () => {
    useQuoteCart.getState().setHeaderDiscount('percent', 12.5);

    expect(useQuoteCart.getState().headerDiscountValue).toBe(12.5);
    expect(useQuoteCart.getState().offsetEngineDiscountRate).toBe(0);
    expect(useQuoteCart.getState().offsetEngineDiscountTouched).toBe(false);
  });

  it('đổi chiết khấu engine Offset không tự tạo chiết khấu đầu báo giá', () => {
    useQuoteCart.getState().setOffsetEngineDiscountRate(7);

    expect(useQuoteCart.getState().offsetEngineDiscountRate).toBe(7);
    expect(useQuoteCart.getState().headerDiscountValue).toBe(0);
  });

  it('mặc định từ pricebook chỉ seed tầng engine và không ghi đè khi người dùng đã chỉnh', () => {
    useQuoteCart.getState().seedOffsetEngineDiscountRate(5);
    expect(useQuoteCart.getState().offsetEngineDiscountRate).toBe(5);
    expect(useQuoteCart.getState().headerDiscountValue).toBe(0);

    useQuoteCart.getState().setOffsetEngineDiscountRate(8);
    useQuoteCart.getState().seedOffsetEngineDiscountRate(3);
    expect(useQuoteCart.getState().offsetEngineDiscountRate).toBe(8);
  });

  it('clearCart đưa header discount về 0 nhưng giữ cấu hình discount engine', () => {
    useQuoteCart.getState().setHeaderDiscount('fixed', 10_000);
    useQuoteCart.getState().setOffsetEngineDiscountRate(6);

    useQuoteCart.getState().clearCart();

    expect(useQuoteCart.getState().headerDiscountType).toBe('percent');
    expect(useQuoteCart.getState().headerDiscountValue).toBe(0);
    expect(useQuoteCart.getState().offsetEngineDiscountRate).toBe(6);
  });

  it('giữ nguyên fixed type/value để round-trip báo giá cũ', () => {
    useQuoteCart.getState().setHeaderDiscount('fixed', 25_000);
    expect(useQuoteCart.getState().headerDiscountType).toBe('fixed');
    expect(useQuoteCart.getState().headerDiscountValue).toBe(25_000);
  });
});
