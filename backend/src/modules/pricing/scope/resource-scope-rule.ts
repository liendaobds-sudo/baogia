/**
 * Quy_Tắc_Phạm_Vi (Scope Rule) — module CANONICAL, nguồn sự thật duy nhất phân loại
 * Tài_Nguyên_Dùng_Chung (`processing_options`, `materials`, `paper_sizes`) theo Phạm_Vi.
 *
 * Hàm THUẦN (pure), KHÔNG phụ thuộc TypeORM, KHÔNG I/O. Mọi nơi đọc tài nguyên (master-data,
 * erp endpoints, ProductModal, các form báo giá, màn quản trị) đều đi qua chính module này để
 * bảo đảm "thứ tick được ở Màn_Cài_Đặt phải hiển thị được ở Màn_Báo_Giá tương ứng".
 *
 * Điểm mấu chốt: hấp thụ khác biệt kiểu dữ liệu tại `isOn()` — smallint `1` (processing_options)
 * và boolean `true` (materials/paper_sizes) đều là Bật; `0`, `false`, `NULL`, thiếu đều là Tắt →
 * quy tắc group-agnostic, dùng chung cho cả ba nhóm tài nguyên.
 *
 * _Requirements: 1.1, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.6, 5.4, 6.2, 6.3, 6.6, 6.7_
 */

/** Phạm_Vi áp dụng: offset + ba loại in nhanh. */
export type Scope = 'offset' | 'loose' | 'bound' | 'large_format';

/** Loại_Sản_Phẩm in nhanh (tập con của Scope, không gồm offset). */
export type ProductType = 'loose' | 'bound' | 'large_format';

/**
 * Shape Cờ_Phạm_Vi dùng chung — chấp nhận cả smallint (processing_options)
 * lẫn boolean (materials/paper_sizes), và cả null/undefined/thiếu.
 */
export interface ScopeFlags {
    scope_loose?: number | boolean | null;
    scope_bound?: number | boolean | null;
    scope_large_format?: number | boolean | null;
    scope_offset?: boolean | number | null;
}

/** Read-model tài nguyên dùng chung phía ứng dụng (không phải bảng mới). */
export interface ScopedResource extends ScopeFlags {
    id: number;
    is_active?: number | null;
}

/** Ba Cờ_Phạm_Vi in nhanh, theo thứ tự ổn định dùng cho phân loại/nhãn. */
const PRINT_SCOPES: ProductType[] = ['loose', 'bound', 'large_format'];

/** Toàn bộ Phạm_Vi theo thứ tự ổn định: offset trước, rồi ba loại in nhanh. */
const ALL_SCOPES: Scope[] = ['offset', ...PRINT_SCOPES];

/**
 * Chuẩn hoá Bật/Tắt của một Cờ_Phạm_Vi.
 * Bật KHI VÀ CHỈ KHI value === 1 (smallint) hoặc value === true (boolean);
 * mọi giá trị còn lại (0, false, null, undefined, ngoài {0,1}) đều là Tắt.
 *
 * _Requirements: 2.1, 6.2_
 */
export function isOn(flag: number | boolean | null | undefined): boolean {
    return flag === 1 || flag === true;
}

/**
 * Trạng_Thái_Hoạt_Động: `is_active` smallint so sánh `= 1`.
 * Khác 1 hoặc null/undefined đều coi là không hoạt động.
 *
 * _Requirements: 3.6_
 */
export function isActive(is_active: number | null | undefined): boolean {
    return is_active === 1;
}

/** Lấy Cờ_Phạm_Vi tương ứng với một Phạm_Vi cho trước. */
function flagForScope(flags: ScopeFlags, scope: Scope): number | boolean | null | undefined {
    switch (scope) {
        case 'offset':
            return flags.scope_offset;
        case 'loose':
            return flags.scope_loose;
        case 'bound':
            return flags.scope_bound;
        case 'large_format':
            return flags.scope_large_format;
    }
}

/**
 * Tài nguyên có thuộc một Phạm_Vi cho trước không — KHI VÀ CHỈ KHI Cờ_Phạm_Vi
 * tương ứng đang Bật. Cờ thiếu/null/rỗng → không thuộc phạm vi đó.
 *
 * _Requirements: 1.1, 1.7, 2.2, 2.3, 2.4, 2.5, 6.3, 6.6, 6.7_
 */
export function resourceInScope(flags: ScopeFlags, scope: Scope): boolean {
    return isOn(flagForScope(flags, scope));
}

/**
 * Tài_Nguyên_Chỉ_Offset: `scope_offset` Bật VÀ đồng thời cả ba cờ in nhanh đều Tắt.
 *
 * _Requirements: 2.6_
 */
export function isOffsetOnly(flags: ScopeFlags): boolean {
    return (
        resourceInScope(flags, 'offset') &&
        !PRINT_SCOPES.some((scope) => resourceInScope(flags, scope))
    );
}

/**
 * Trả về ĐÚNG tập các Phạm_Vi mà Cờ_Phạm_Vi tương ứng đang Bật (theo thứ tự ổn định),
 * rỗng nếu mọi cờ đều Tắt (Không_Thuộc_Phạm_Vi_Nào).
 *
 * _Requirements: 2.7, 2.8, 6.7_
 */
export function classifyResource(flags: ScopeFlags): Scope[] {
    return ALL_SCOPES.filter((scope) => resourceInScope(flags, scope));
}

/** Nhãn hiển thị tiếng Việt cho từng Phạm_Vi in nhanh. */
const SCOPE_LABELS: Record<ProductType, string> = {
    loose: 'Tờ rời',
    bound: 'Đóng cuốn',
    large_format: 'Khổ lớn',
};

/**
 * Nhãn phân loại suy ra từ Quy_Tắc_Phạm_Vi, dùng cho Màn_Quản_Trị_Phạm_Vi:
 * - 'Chỉ Offset' khi là Tài_Nguyên_Chỉ_Offset.
 * - 'Không thuộc phạm vi' khi mọi cờ đều Tắt.
 * - Ngược lại: danh sách phạm vi in nhanh đang Bật (kèm hậu tố '+ Offset' nếu cũng thuộc offset).
 *
 * _Requirements: 5.4_
 */
export function deriveScopeLabel(flags: ScopeFlags): string {
    if (isOffsetOnly(flags)) {
        return 'Chỉ Offset';
    }

    const scopes = classifyResource(flags);
    if (scopes.length === 0) {
        return 'Không thuộc phạm vi';
    }

    const printLabels = PRINT_SCOPES.filter((scope) => resourceInScope(flags, scope)).map(
        (scope) => SCOPE_LABELS[scope],
    );

    if (printLabels.length === 0) {
        // Chỉ offset đã xử lý ở trên; nhánh này về lý thuyết không xảy ra nhưng giữ an toàn.
        return 'Chỉ Offset';
    }

    const base = printLabels.join(', ');
    return resourceInScope(flags, 'offset') ? `${base} + Offset` : base;
}

/**
 * Lọc danh sách Tài_Nguyên_Dùng_Chung cho luồng in nhanh theo một Loại_Sản_Phẩm.
 * Giữ lại `r` KHI VÀ CHỈ KHI: `isActive(r) && resourceInScope(r, productType)`.
 *
 * Hệ quả tự nhiên (không cần điều kiện riêng):
 * - Tài_Nguyên_Chỉ_Offset (mọi cờ in nhanh Tắt) bị loại vì `resourceInScope(r, productType)` = false.
 * - Tài nguyên `is_active ≠ 1` (hoặc null) bị loại vì `isActive(r)` = false.
 *
 * Cùng MỘT hàm này được dùng ở cả Màn_Cài_Đặt_Sản_Phẩm và Màn_Báo_Giá để bảo đảm hai màn
 * cho ra tập tài nguyên trùng khớp hoàn toàn cho cùng một Loại_Sản_Phẩm.
 *
 * _Requirements: 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2_
 */
export function filterForProductType<T extends ScopedResource>(
    resources: T[],
    productType: ProductType,
): T[] {
    return resources.filter(
        (resource) => isActive(resource.is_active) && resourceInScope(resource, productType),
    );
}

/** Kết quả validate Danh_Sách_Được_Phép của một Sản_Phẩm theo Loại_Sản_Phẩm. */
export interface AllowedValidationResult {
    ok: boolean;
    /** Các tài nguyên trong `allowed` nhưng KHÔNG thuộc Phạm_Vi của `productType`. */
    outOfScope: number[];
}

/**
 * Xác định ĐÚNG tập phần tử ngoài phạm vi trong một Danh_Sách_Được_Phép.
 *
 * Một id thuộc `outOfScope` KHI VÀ CHỈ KHI tài nguyên tương ứng KHÔNG thuộc Phạm_Vi của
 * `productType` theo Quy_Tắc_Phạm_Vi. Tài nguyên không có trong `resourcesById` (thiếu Cờ_Phạm_Vi)
 * được coi là không thuộc phạm vi (Req 1.7) nên cũng vào `outOfScope`.
 *
 * `ok === (outOfScope.length === 0)`. Hàm THUẦN — KHÔNG làm thay đổi `allowed` hay `resourcesById`.
 * Thứ tự phần tử trong `outOfScope` giữ đúng thứ tự xuất hiện trong `allowed`.
 *
 * _Requirements: 4.3, 4.4, 4.5_
 */
export function validateAllowedList(
    allowed: number[],
    resourcesById: Map<number, ScopeFlags>,
    productType: ProductType,
): AllowedValidationResult {
    const outOfScope = allowed.filter((id) => {
        const flags = resourcesById.get(id);
        return flags === undefined || !resourceInScope(flags, productType);
    });

    return { ok: outOfScope.length === 0, outOfScope };
}

/** Đầu vào thô khi Admin gửi Cờ_Phạm_Vi từ Màn_Quản_Trị_Phạm_Vi (chưa kiểm chứng kiểu). */
export interface ScopeFlagInput {
    scope_loose?: unknown;
    scope_bound?: unknown;
    scope_large_format?: unknown;
    scope_offset?: unknown;
}

/** Kết quả validate giá trị Cờ_Phạm_Vi đầu vào. */
export interface FlagValidationResult {
    ok: boolean;
    /** Tên cờ vi phạm: smallint khác 0/1, hoặc scope_offset khác true/false. */
    invalidFlags: string[];
}

/** Ba Cờ_Phạm_Vi smallint cần kiểm giá trị ∈ {0,1}, theo thứ tự ổn định. */
const SMALLINT_FLAG_NAMES: (keyof ScopeFlagInput)[] = [
    'scope_loose',
    'scope_bound',
    'scope_large_format',
];

/**
 * Validate giá trị Cờ_Phạm_Vi đầu vào trước khi ghi (Màn_Quản_Trị_Phạm_Vi).
 *
 * Hợp lệ (ok === true) KHI VÀ CHỈ KHI:
 * - mỗi cờ smallint `scope_loose`, `scope_bound`, `scope_large_format` ∈ {0, 1} hoặc vắng mặt (undefined), VÀ
 * - `scope_offset` ∈ {true, false} hoặc vắng mặt (undefined).
 *
 * Mọi giá trị khác (null, ngoài {0,1} với smallint, ngoài {true,false} với offset) là vi phạm.
 * `invalidFlags` liệt kê đúng tên các cờ vi phạm (theo thứ tự: smallint trước, offset sau);
 * `ok === (invalidFlags.length === 0)`. Hàm THUẦN — KHÔNG làm thay đổi `input`.
 *
 * _Requirements: 5.8, 6.2_
 */
export function validateScopeFlags(input: ScopeFlagInput): FlagValidationResult {
    const invalidFlags: string[] = [];

    for (const name of SMALLINT_FLAG_NAMES) {
        const value = input[name];
        if (value !== undefined && value !== 0 && value !== 1) {
            invalidFlags.push(name);
        }
    }

    const offset = input.scope_offset;
    if (offset !== undefined && offset !== true && offset !== false) {
        invalidFlags.push('scope_offset');
    }

    return { ok: invalidFlags.length === 0, invalidFlags };
}
