export type QuoteDiscountType = 'percent' | 'fixed' | null;

export interface QuoteTotalsInput {
  subtotal: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  vatRate?: unknown;
  shippingFee?: unknown;
}

export interface AuthoritativeQuoteTotals {
  subtotal: number;
  discountType: QuoteDiscountType;
  discountValue: number;
  discountAmount: number;
  afterDiscount: number;
  vatRate: number;
  vatAmount: number;
  shippingFee: number;
  grandTotal: number;
}

function finiteNumber(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} phải là một số hữu hạn.`);
  }
  return parsed;
}

function nonNegativeNumber(value: unknown, fallback: number, label: string): number {
  const parsed = finiteNumber(value, fallback, label);
  if (parsed < 0) throw new Error(`${label} không được âm.`);
  return parsed;
}

function normalizeDiscountType(value: unknown): QuoteDiscountType {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'percent' || normalized === 'fixed') return normalized;
  throw new Error('Loại chiết khấu chỉ được là "percent" hoặc "fixed".');
}

/**
 * Nguồn sự thật cho header báo giá được lưu:
 *
 *   subtotal       = tổng item đã được server replay (trước VAT)
 *   afterDiscount  = subtotal - chiết khấu cấp báo giá
 *   vatAmount      = afterDiscount * vatRate / 100
 *   grandTotal     = afterDiscount + vatAmount + shippingFee
 *
 * Các field dẫn xuất do browser gửi (`discount_amount`, `vat_amount`, `grand_total`)
 * không tham gia hàm này.
 */
export function computeAuthoritativeQuoteTotals(input: QuoteTotalsInput): AuthoritativeQuoteTotals {
  const subtotal = nonNegativeNumber(input.subtotal, 0, 'Tạm tính');
  const discountType = normalizeDiscountType(input.discountType);
  const requestedDiscountValue = nonNegativeNumber(input.discountValue, 0, 'Giá trị chiết khấu');

  let discountValue = 0;
  let discountAmount = 0;
  if (discountType === 'percent') {
    if (requestedDiscountValue > 100) {
      throw new Error('Chiết khấu phần trăm phải nằm trong khoảng 0 đến 100.');
    }
    discountValue = requestedDiscountValue;
    discountAmount = subtotal * discountValue / 100;
  } else if (discountType === 'fixed') {
    if (requestedDiscountValue > subtotal) {
      throw new Error('Chiết khấu cố định không được vượt quá tạm tính.');
    }
    discountValue = requestedDiscountValue;
    discountAmount = discountValue;
  }

  const afterDiscount = subtotal - discountAmount;
  const vatRate = nonNegativeNumber(input.vatRate, 0, 'Thuế suất VAT');
  if (vatRate > 100) throw new Error('Thuế suất VAT phải nằm trong khoảng 0 đến 100.');
  const shippingFee = nonNegativeNumber(input.shippingFee, 0, 'Phí giao hàng');
  const vatAmount = afterDiscount * vatRate / 100;
  const grandTotal = afterDiscount + vatAmount + shippingFee;

  return {
    subtotal,
    discountType,
    discountValue,
    discountAmount,
    afterDiscount,
    vatRate,
    vatAmount,
    shippingFee,
    grandTotal,
  };
}
