/**
 * Giá trị mặc định cho luồng báo giá digital khi input thiếu field.
 * Gom về một chỗ để bỏ magic number rải rác trong quote.service.ts và
 * large-format-calculator.service.ts. Giữ nguyên các giá trị cũ — thuần refactor.
 */

/** Khổ card visit mặc định (mm) khi khách không nêu kích thước cho sản phẩm loose. */
export const LOOSE_DEFAULT_SIZE = { width: 90, height: 55 } as const;

/** Số trang mặc định cho sản phẩm bound (đóng cuốn) khi không parse được. */
export const BOUND_DEFAULT_PAGE_COUNT = 24;

/** Mã đóng cuốn mặc định (ghim lồng) khi khách không nêu kiểu đóng. */
export const BOUND_DEFAULT_BINDING_CODE = 'ghim_long';

/** Khổ khổ-lớn mặc định (mm) khi khách không nêu kích thước. */
export const LARGE_FORMAT_DEFAULT_SIZE = { width: 600, height: 1600 } as const;

/** Trần kiểm tra đầu vào + % hao mặc định cho engine khổ lớn. */
export const LARGE_FORMAT_LIMITS = {
    maxWidthM: 50,
    maxHeightM: 100,
    maxQty: 10000,
    defaultWastePercent: 10,
} as const;
