export type HeaderDiscountType = 'percent' | 'fixed';

export interface HeaderDiscountTotals {
  discountType: HeaderDiscountType;
  discountValue: number;
  discountAmount: number;
  afterDiscount: number;
}

/** Preview/payload frontend; backend vẫn là nguồn sự thật và tính lại cùng contract. */
export function calculateHeaderDiscount(
  subtotalInput: unknown,
  discountType: HeaderDiscountType,
  discountValueInput: unknown,
): HeaderDiscountTotals {
  const subtotalRaw = Number(subtotalInput);
  const valueRaw = Number(discountValueInput);
  const subtotal = Number.isFinite(subtotalRaw) ? Math.max(0, subtotalRaw) : 0;
  const value = Number.isFinite(valueRaw) ? Math.max(0, valueRaw) : 0;

  const discountValue = discountType === 'percent'
    ? Math.min(100, value)
    : Math.min(subtotal, value);
  const discountAmount = discountType === 'percent'
    ? Math.round(subtotal * discountValue / 100)
    : discountValue;

  return {
    discountType,
    discountValue,
    discountAmount,
    afterDiscount: subtotal - discountAmount,
  };
}
