import type { TenantContext } from './tenant-context.service';

/**
 * Mệnh đề SQL ràng buộc tenant cho raw query — lưới an toàn ở tầng ứng dụng khi
 * PostgreSQL RLS chưa được flip (`TENANT_RLS_ENABLED=false`).
 *
 * Ba trạng thái, KHÔNG có trạng thái "không lọc gì" ngoài bypass tường minh:
 *
 * | Context                        | Kết quả                                  |
 * |--------------------------------|------------------------------------------|
 * | `bypass = true`                | không mệnh đề (super-admin/system có chủ đích) |
 * | có `tenantId`                  | `AND (col = $n OR col IS NULL)`          |
 * | KHÔNG có context               | `AND 1 = 0` → **fail-closed**            |
 *
 * Nhánh fail-closed là chủ đích (audit 2026-08-29): trước đây thiếu context ⇒ trả
 * mệnh đề rỗng ⇒ route tenant-plane đọc dữ liệu MỌI tenant. `super_admin` muốn xem
 * dữ liệu một tenant phải impersonate tường minh bằng header `x-tenant-id`
 * (xem `resolveRequestTenantContext`).
 *
 * `OR col IS NULL` giữ dữ liệu di sản trước Pha A còn nhìn thấy được; đây là cùng
 * quy ước với conversations/messages/contacts và sẽ được gỡ đồng loạt sau khi
 * backfill xong (spec `tenant-data-isolation` task 32).
 */
export interface TenantSqlScope {
    /** Mệnh đề nối vào WHERE hiện có (đã có tiền tố ' AND '), hoặc rỗng khi bypass. */
    clause: string;
    /** Tham số tương ứng `$nextIdx` (rỗng nếu clause không dùng tham số). */
    params: unknown[];
    /** true khi fail-closed vì thiếu tenant context. */
    denied: boolean;
}

export interface TenantSqlScopeOptions {
    /**
     * Cho phép hàng `tenant_id IS NULL` (dữ liệu di sản) đi qua. Mặc định true để
     * không đổi hành vi môi trường single-tenant. Đặt false cho dữ liệu tuyệt đối
     * không được chia sẻ (vd nội dung hội thoại realtime).
     */
    allowLegacyNull?: boolean;
}

/** Không có context ⇒ chặn sạch thay vì mở toàn bộ bảng. */
const DENY_ALL: TenantSqlScope = { clause: ' AND 1 = 0', params: [], denied: true };

export function tenantSqlScope(
    ctx: TenantContext | undefined | null,
    nextIdx: number,
    col = 'tenant_id',
    opts: TenantSqlScopeOptions = {},
): TenantSqlScope {
    if (ctx?.bypass) return { clause: '', params: [], denied: false };
    if (!ctx || ctx.tenantId == null) return { ...DENY_ALL };

    const allowLegacyNull = opts.allowLegacyNull !== false;
    const clause = allowLegacyNull
        ? ` AND (${col} = $${nextIdx} OR ${col} IS NULL)`
        : ` AND ${col} = $${nextIdx}`;
    return { clause, params: [ctx.tenantId], denied: false };
}

/**
 * Biến thể cho QueryBuilder của TypeORM (tham số đặt tên thay vì `$n`).
 * Trả `null` khi bypass (caller không thêm điều kiện gì).
 */
export function tenantQbCondition(
    ctx: TenantContext | undefined | null,
    alias: string,
    property = 'tenantId',
    paramName = 'tenantScopeId',
    opts: TenantSqlScopeOptions = {},
): { condition: string; params: Record<string, unknown> } | null {
    if (ctx?.bypass) return null;
    if (!ctx || ctx.tenantId == null) return { condition: '1 = 0', params: {} };

    const allowLegacyNull = opts.allowLegacyNull !== false;
    const condition = allowLegacyNull
        ? `(${alias}.${property} = :${paramName} OR ${alias}.${property} IS NULL)`
        : `${alias}.${property} = :${paramName}`;
    return { condition, params: { [paramName]: ctx.tenantId } };
}
