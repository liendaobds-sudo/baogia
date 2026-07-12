/**
 * Hàm THUẦN dựng payload nhật ký cho một lần từ chối truy cập (403).
 *
 * Module này KHÔNG phụ thuộc NestJS/TypeORM/I/O — chỉ nhận đầu vào và trả về
 * một object, để:
 *   - `PermissionsGuard` truyền thẳng kết quả cho `AuditService.log(...)`;
 *   - kiểm thử được bằng property-based testing (P11) — task 3.4.
 *
 * NGUYÊN TẮC BẢO MẬT (Req 6.1, 6.2):
 *   - CHỈ chọn lọc một số trường an toàn (userId, role, required, route).
 *   - KHÔNG bao giờ sao chép `headers` hay `body` nguyên khối.
 *   - KHÔNG bao giờ chứa các khoá nhạy cảm: `token`, `password`, `authorization`.
 */

/** Hình dạng tối thiểu của request mà helper cần đọc (thuần, không phụ thuộc Express). */
export interface DenialRequestLike {
    method?: string;
    url?: string;
    originalUrl?: string;
    ip?: string;
    route?: { path?: string };
}

/** Hình dạng tối thiểu của user đã xác thực. */
export interface DenialUserLike {
    id?: string;
    role?: string;
    tenantId?: number | null;
}

/** Payload truyền cho `AuditService.log(...)`. Không chứa bí mật. */
export interface DenialLogPayload {
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: {
        role: string;
        required: string[];
        route: string;
    };
    ipAddress?: string;
    tenantId?: number | null;
}

/**
 * Dựng payload nhật ký từ chối từ request/user/required.
 *
 * @param req      Request đã xác thực (chỉ đọc method/url/route/ip).
 * @param user     Người dùng đã xác thực (chỉ đọc id/role).
 * @param required Danh sách quyền yêu cầu của route (OR).
 * @returns        Object an toàn để ghi audit; KHÔNG chứa token/password/authorization.
 */
export function buildDenialLog(
    req: DenialRequestLike,
    user: DenialUserLike | undefined | null,
    required: readonly string[],
): DenialLogPayload {
    const method = req?.method ?? '';
    const path = req?.route?.path ?? req?.originalUrl ?? req?.url ?? '';
    const route = `${method} ${path}`.trim();

    return {
        userId: user?.id,
        action: 'access.denied',
        entityType: 'route',
        entityId: route,
        metadata: {
            role: user?.role ?? '',
            required: [...required],
            route,
        },
        ipAddress: req?.ip,
        // Guard chạy TRƯỚC TenantContextInterceptor nên tenant context chưa được set khi
        // ghi denial. Lấy thẳng tenantId từ user (JWT) để INSERT không vi phạm NOT NULL
        // audit_logs.tenant_id sau khi bật RLS. undefined → AuditService dùng context như cũ.
        tenantId: user?.tenantId ?? undefined,
    };
}
