import { TenantContext } from './tenant-context.service';

type AuthenticatedRequest = {
    user?: {
        id?: unknown;
        role?: unknown;
        tenantId?: unknown;
    };
    headers?: Record<string, unknown>;
};

/**
 * Parse tenant ID ở biên HTTP. Chỉ chấp nhận số nguyên dương viết đầy đủ;
 * không dùng parseInt vì chuỗi như "12-khac" không được phép thành tenant 12.
 */
function parseTenantId(value: unknown): number | null {
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '') return null;

    const parsed = typeof normalized === 'number'
        ? normalized
        : typeof normalized === 'string' && /^\d+$/.test(normalized)
            ? Number(normalized)
            : Number.NaN;

    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Phân giải tenant từ request đã qua AuthGuard.
 *
 * - User tenant dùng tenantId trong JWT; header do user thường gửi bị bỏ qua.
 * - super_admin không thuộc tenant, chỉ vào tenant-plane khi impersonate tường minh
 *   bằng `x-tenant-id`. Header có mặt nhưng sai định dạng trả null để caller fail-closed.
 */
export function resolveRequestTenantContext(request: unknown): TenantContext | null {
    const req = request as AuthenticatedRequest | null | undefined;
    const user = req?.user;
    if (!user) return null;

    const role = String(user.role ?? '').trim().toLowerCase();
    const headers = req?.headers;
    const hasImpersonationHeader = !!headers
        && Object.prototype.hasOwnProperty.call(headers, 'x-tenant-id');

    let tenantId: number | null;
    if (role === 'super_admin' && hasImpersonationHeader) {
        const header = headers?.['x-tenant-id'];
        const raw = Array.isArray(header) ? header[0] : header;
        tenantId = parseTenantId(raw);
    } else {
        tenantId = parseTenantId(user.tenantId);
    }

    if (tenantId == null) return null;

    return {
        tenantId,
        userId: String(user.id ?? 'unknown'),
        role,
    };
}
