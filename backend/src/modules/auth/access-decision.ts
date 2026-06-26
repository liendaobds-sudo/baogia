/**
 * Lõi quyết định phân quyền THUẦN (pure decision core).
 *
 * Module này KHÔNG phụ thuộc NestJS, TypeORM, React hay bất kỳ I/O nào.
 * Toàn bộ hàm là thuần (deterministic, không side-effect) để:
 *   - `PermissionsGuard` (backend) và `RouteAccessGuard` (frontend) dùng CHUNG một logic;
 *   - kiểm thử được bằng property-based testing (fast-check).
 *
 * Bản sao giống hệt hành vi sẽ được đặt ở `frontend/src/lib/access-decision.ts`
 * (task 1.3) — tính đồng nhất được ràng buộc bằng property test (P9).
 */

/** Wildcard cấp toàn quyền. */
export const WILDCARD = '*';

/**
 * Các vai trò bỏ qua mọi kiểm tra phân quyền (bypass).
 * Lưu ở dạng chữ thường để so khớp sau khi đã `toLowerCase()` giá trị vai trò.
 */
export const BYPASS_ROLES = ['admin', 'super_admin'] as const;

/**
 * Quyết định truy cập THUẦN, dùng chung cho PermissionsGuard (backend)
 * và RouteAccessGuard (frontend). Logic OR: cần ÍT NHẤT MỘT quyền trong `required`.
 *
 * @param permissions Danh sách quyền hiệu lực của người dùng (có thể chứa '*').
 * @param required    Danh sách quyền yêu cầu của route (OR). Rỗng = không yêu cầu → cho qua.
 * @returns `true` khi `required` rỗng, hoặc `permissions` chứa '*', hoặc chứa ít nhất
 *          một phần tử của `required`; ngược lại `false`.
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
 * Chỉ đổi DẤU PHÂN CÁCH, không đổi token.
 * Idempotent: `normalizeCapability(normalizeCapability(x)) === normalizeCapability(x)`.
 */
export function normalizeCapability(cap: string): string {
    return cap.replace(/:/g, '.');
}

/** Ánh xạ từ vựng vai trò cũ về từ vựng chuẩn. */
const LEGACY_ROLE_MAP: Record<string, string> = {
    manager: 'supervisor',
    staff: 'agent',
};

/**
 * Hoà giải từ vựng vai trò cũ về từ vựng chuẩn:
 *   - `manager` → `supervisor`
 *   - `staff`   → `agent`
 *   - các giá trị khác giữ nguyên (không đổi).
 */
export function normalizeRole(legacy: string): string {
    return LEGACY_ROLE_MAP[legacy] ?? legacy;
}

/**
 * Suy ra tập quyền hiệu lực cho một vai trò theo nguyên tắc fail-closed.
 *
 * - `admin` / `super_admin` → `['*']` (toàn quyền), KHÔNG cần gọi loader.
 * - Vai trò khác → trả về kết quả của `loader()`.
 * - Nếu `loader()` ném lỗi → trả về `[]` (fail-closed, KHÔNG cấp `'*'`).
 *
 * @param role   Vai trò (không phân biệt hoa/thường cho nhánh bypass).
 * @param loader Hàm tải quyền từ nguồn dữ liệu (có thể ném lỗi).
 */
export function resolvePermissions(role: string, loader: () => string[]): string[] {
    const normalized = (role || '').toLowerCase();
    if ((BYPASS_ROLES as readonly string[]).includes(normalized)) {
        return [WILDCARD];
    }
    try {
        return loader();
    } catch {
        return []; // fail-closed
    }
}

/** Loại bỏ phần tử trùng trong khi giữ thứ tự xuất hiện đầu tiên. */
function dedupe(values: readonly string[]): string[] {
    return Array.from(new Set(values));
}

/**
 * Tập quyền mặc định cho `agent` (NV_CSKH) — "mở việc hằng ngày".
 * Suy dẫn từ `DEFAULT_ROLE_PERMISSIONS.agent` theo diff thiết kế:
 * KHÔNG có `order.create` (agent không cam kết tạo đơn cuối), giữ `order.view`.
 *
 * Khớp với AGENT_DAILY trong Correctness Properties (P3/P5).
 */
export const agentDefault: readonly string[] = Object.freeze([
    'inbox.view',
    'inbox.reply',
    'quote.view',
    'quote.create',
    'quote.edit',
    'order.view',
    'customer.view',
    'customer.create',
    'report.view',
    'pricing.view',
]);

/**
 * Tập quyền mặc định cho `supervisor` (Giám_Sát) —
 * bao trùm việc hằng ngày của `agent` + quyền duyệt (`quote.approve`, `order.approve`)
 * cùng các quyền vận hành hiện có (Data Models của design).
 */
export const supervisorDefault: readonly string[] = Object.freeze(
    dedupe([
        ...agentDefault,
        // Quyền cam kết / duyệt
        'quote.approve',
        'order.approve',
        // Quyền vận hành bổ sung
        'order.edit',
        'material.view',
        'material.create',
        'material.edit',
        'inventory.view',
        'inventory.import',
        'inventory.export',
        'inventory.adjust',
        'customer.edit',
        'pricing.edit',
        'settings.view',
        'user.view',
        'report.export',
        'inbox.assign',
    ]),
);

/**
 * Tập quyền mặc định cho `viewer` (Người_Xem) — chỉ-đọc.
 * Không chứa bất kỳ quyền tạo/sửa/xoá/duyệt nào (P7).
 */
export const viewerDefault: readonly string[] = Object.freeze([
    'quote.view',
    'order.view',
    'customer.view',
    'pricing.view',
    'report.view',
]);
