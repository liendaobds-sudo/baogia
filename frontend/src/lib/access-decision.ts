/**
 * Lõi quyết định phân quyền THUẦN cho frontend.
 *
 * Đây là bản sao *giống hệt về hành vi* của `backend/src/modules/auth/access-decision.ts`.
 * Hai package tách rời (không có thư mục dùng chung), nên ta giữ bản sao tối giản và
 * ràng buộc tính đồng nhất bằng property test (xem design Property 9).
 *
 * Module này KHÔNG phụ thuộc React/Next — chỉ là hàm thuần, là nguồn dùng chung cho
 * `usePermissions` và `RouteAccessGuard`.
 *
 * Feature: rbac-quote-order-access
 */

/** Wildcard cấp toàn quyền. */
export const WILDCARD = '*';

/**
 * Quyết định truy cập THUẦN, dùng chung cho `RouteAccessGuard`/`usePermissions` (frontend)
 * và phản chiếu logic của `PermissionsGuard` (backend). Logic OR: cần ÍT NHẤT MỘT quyền
 * trong `required`.
 *
 * @param permissions Danh sách quyền hiệu lực của người dùng (có thể chứa '*').
 * @param required    Danh sách quyền yêu cầu của route (OR). Rỗng = không yêu cầu → cho qua.
 * @returns `true` nếu được phép truy cập, ngược lại `false`.
 */
export function canAccess(
    permissions: readonly string[],
    required: readonly string[],
): boolean {
    if (!required || required.length === 0) return true; // không khai báo quyền → cho qua
    if (permissions.includes(WILDCARD)) return true; // toàn quyền
    return required.some((r) => permissions.includes(r)); // OR
}

/**
 * Chuẩn hoá capability frontend từ delimiter placeholder ':' về '.' chuẩn backend.
 * Chỉ đổi DẤU PHÂN CÁCH, không đổi token. Idempotent: normalize(normalize(x)) === normalize(x).
 *
 * @param cap Chuỗi capability có thể dùng ':' hoặc '.' làm dấu phân cách.
 * @returns Chuỗi capability đã chuẩn hoá về delimiter '.'.
 */
export function normalizeCapability(cap: string): string {
    return cap.replace(/:/g, '.');
}
