/**
 * Bản nháp tạo báo giá — đầu vào kiểm tra hợp lệ (pure, không phụ thuộc React/DOM).
 */
export interface QuoteDraft {
  /** Tên khách hàng; coi như trống nếu toàn whitespace. */
  customerName: string;
  /** Số hạng mục trong cart. */
  itemsCount: number;
}

/**
 * Tập lỗi của bản nháp. Object rỗng ⇔ bản nháp hợp lệ.
 */
export interface QuoteDraftErrors {
  customerName?: string;
  items?: string;
}

/**
 * Trả về object lỗi rỗng ⇔ draft hợp lệ.
 * - `customerName` coi như trống nếu sau khi `trim()` là rỗng ⇒ lỗi `customerName`.
 * - `itemsCount <= 0` ⇒ lỗi `items`.
 * Pure: không mutate đầu vào, không I/O.
 * _Requirements: 5.1, 5.3, 5.4_
 */
export function validateQuoteDraft(draft: QuoteDraft): QuoteDraftErrors {
  const errors: QuoteDraftErrors = {};
  if (draft.customerName.trim().length === 0) {
    errors.customerName = 'Vui lòng nhập tên khách hàng';
  }
  if (draft.itemsCount <= 0) {
    errors.items = 'Báo giá cần ít nhất một hạng mục';
  }
  return errors;
}

/**
 * Helper tiện dụng: draft hợp lệ khi không có trường lỗi nào.
 * _Requirements: 5.1, 5.3, 5.4_
 */
export const isQuoteDraftValid = (d: QuoteDraft): boolean =>
  Object.keys(validateQuoteDraft(d)).length === 0;
