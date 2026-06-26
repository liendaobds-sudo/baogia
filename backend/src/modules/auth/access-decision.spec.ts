/**
 * Property-based tests cho lõi quyết định phân quyền THUẦN.
 *
 * Feature: rbac-quote-order-access
 * Phủ các property: P1 (canAccess OR), P2 (bypass roles), P8 (normalizeCapability),
 * P10 (fail-closed). Mỗi property chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import {
    canAccess,
    normalizeCapability,
    resolvePermissions,
    WILDCARD,
    BYPASS_ROLES,
    agentDefault,
    supervisorDefault,
    viewerDefault,
} from './access-decision';

const NUM_RUNS = 200;

/** Catalog quyền mẫu để sinh permissions/required (delimiter '.'). */
const CAPABILITY_POOL = [
    'inbox.view',
    'inbox.reply',
    'quote.view',
    'quote.create',
    'quote.edit',
    'quote.delete',
    'quote.approve',
    'order.view',
    'order.create',
    'order.edit',
    'order.delete',
    'order.approve',
    'customer.view',
    'customer.create',
    'customer.edit',
    'settings.view',
    'settings.edit',
    'user.view',
    'role.view',
    'report.view',
    'pricing.view',
];

const capability = () => fc.constantFrom(...CAPABILITY_POOL);

describe('access-decision (pure decision core)', () => {
    // Feature: rbac-quote-order-access, Property 1: Quyết định OR theo quyền
    it('Property 1: canAccess trả true iff permissions chứa "*" HOẶC giao với required', () => {
        fc.assert(
            fc.property(
                // permissions: mảng con bất kỳ từ pool, có thể kèm '*'
                fc.array(fc.oneof(capability(), fc.constant(WILDCARD))),
                // required: mảng KHÔNG rỗng
                fc.array(capability(), { minLength: 1 }),
                (permissions, required) => {
                    const expected =
                        permissions.includes(WILDCARD) ||
                        required.some((r) => permissions.includes(r));
                    expect(canAccess(permissions, required)).toBe(expected);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: rbac-quote-order-access, Property 1: required rỗng luôn cho qua
    it('Property 1 (biên): required rỗng → luôn cho qua', () => {
        fc.assert(
            fc.property(fc.array(fc.oneof(capability(), fc.constant(WILDCARD))), (permissions) => {
                expect(canAccess(permissions, [])).toBe(true);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: rbac-quote-order-access, Property 2: Vai trò bypass luôn được phép
    it('Property 2: vai trò bypass (admin/super_admin) → resolvePermissions = ["*"], canAccess luôn true', () => {
        fc.assert(
            fc.property(
                // chọn vai trò bypass, có thể đổi hoa/thường để xác nhận case-insensitive
                fc.constantFrom(...BYPASS_ROLES),
                fc.boolean(),
                // loader trả về quyền tùy ý (kể cả rỗng) — KHÔNG được ảnh hưởng quyết định
                fc.array(capability()),
                // required bất kỳ (kể cả rỗng)
                fc.array(capability()),
                (role, upper, loaderPerms, required) => {
                    const roleVariant = upper ? role.toUpperCase() : role;
                    const resolved = resolvePermissions(roleVariant, () => loaderPerms.slice());
                    // Bypass role luôn nhận toàn quyền bất kể loader
                    expect(resolved).toEqual([WILDCARD]);
                    // → mọi quyết định đều allow
                    expect(canAccess(resolved, required)).toBe(true);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: rbac-quote-order-access, Property 8: Chuẩn hoá capability chỉ đổi delimiter và idempotent
    it('Property 8: normalizeCapability không còn ":", chỉ đổi delimiter, idempotent', () => {
        // Sinh chuỗi capability gồm token và delimiter ':' hoặc '.'
        const token = fc.stringMatching(/^[a-zA-Z0-9_-]{1,8}$/);
        const capString = fc
            .array(token, { minLength: 1, maxLength: 5 })
            .chain((tokens) =>
                fc
                    .array(fc.constantFrom(':', '.'), {
                        minLength: tokens.length - 1,
                        maxLength: tokens.length - 1,
                    })
                    .map((delims) =>
                        tokens.reduce(
                            (acc, t, i) => (i === 0 ? t : acc + delims[i - 1] + t),
                            '',
                        ),
                    ),
            );

        fc.assert(
            fc.property(capString, (cap) => {
                const out = normalizeCapability(cap);
                // 1) không còn ':' nào
                expect(out.includes(':')).toBe(false);
                // 2) chỉ đổi delimiter: thay mọi '.' của output về ':' phải tái tạo lại chuỗi gốc khi
                //    coi ':' và '.' tương đương → so sánh sau khi quy chuẩn cả hai về '.'
                expect(out).toBe(cap.replace(/:/g, '.'));
                // 3) độ dài giữ nguyên (chỉ thay 1-1 ký tự delimiter)
                expect(out.length).toBe(cap.length);
                // 4) idempotent
                expect(normalizeCapability(out)).toBe(out);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: rbac-quote-order-access, Property 8: idempotent trên chuỗi tùy ý
    it('Property 8 (tổng quát): normalizeCapability idempotent với chuỗi bất kỳ', () => {
        fc.assert(
            fc.property(fc.string(), (s) => {
                const once = normalizeCapability(s);
                expect(once.includes(':')).toBe(false);
                expect(normalizeCapability(once)).toBe(once);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: rbac-quote-order-access, Property 10: Fail-closed khi không tải được quyền
    it('Property 10: role không bypass + loader ném lỗi → resolvePermissions = [] (không chứa "*")', () => {
        // Vai trò không bypass (loại bỏ admin/super_admin)
        const nonBypassRole = fc
            .string()
            .filter((r) => !(BYPASS_ROLES as readonly string[]).includes((r || '').toLowerCase()));

        fc.assert(
            fc.property(nonBypassRole, fc.string(), (role, errMsg) => {
                const result = resolvePermissions(role, () => {
                    throw new Error(errMsg);
                });
                expect(result).toEqual([]);
                expect(result.includes(WILDCARD)).toBe(false);
            }),
            { numRuns: NUM_RUNS },
        );
    });
});

/**
 * Property-based tests cho BẤT BIẾN vai trò→quyền (task 2.3).
 *
 * Feature: rbac-quote-order-access
 * Phủ các property: P3 (agent bao trùm việc hằng ngày), P4 (agent loại trừ quyền cam kết),
 * P5 (phân quyền theo route cho agent), P6 (supervisor bao trùm agent + duyệt),
 * P7 (viewer chỉ-đọc). Mỗi property chạy >= 100 iteration bằng fast-check.
 */

/**
 * Tập việc hằng ngày của agent (AGENT_DAILY) theo tài liệu thiết kế.
 * agentDefault PHẢI bao trùm toàn bộ tập này (đặc biệt là `order.view`).
 */
const AGENT_DAILY = [
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
] as const;

/**
 * Tập quyền CAM KẾT (COMMITMENT_PERMS): những quyền agent KHÔNG được có.
 * Gồm duyệt/xoá báo giá–đơn hàng, sửa cấu hình, và mọi quyền quản trị `user.*`/`role.*`.
 */
const COMMITMENT_PERMS = [
    'quote.approve',
    'quote.delete',
    'order.approve',
    'order.delete',
    'settings.edit',
    // các quyền quản trị người dùng / vai trò
    'user.view',
    'user.create',
    'user.edit',
    'user.delete',
    'role.view',
    'role.create',
    'role.edit',
    'role.delete',
] as const;

/** Required-perms cho các route CAM KẾT (theo bảng ánh xạ route của thiết kế). */
const COMMITMENT_ROUTE_REQUIRED = [
    ['quote.approve'], // approve / reject
    ['order.approve'], // accept / complete / cancel
    ['quote.delete'], // remove
    ['settings.edit'], // POST /erp/system-settings
] as const;

/** Required-perms cho các route VIỆC HẰNG NGÀY (theo bảng ánh xạ route của thiết kế). */
const DAILY_ROUTE_REQUIRED = [
    ['quote.view', 'order.view'], // findAll / findOne / expireQuotes
    ['quote.create'], // create / clone
    ['quote.edit'], // update / submit / send / sendZalo / sendEmail
    ['order.view'], // các route chỉ-xem đơn
] as const;

/**
 * Catalog quyền đầy đủ dùng cho P7 (viewer chỉ-đọc).
 * Mỗi mục có dạng `domain.action`; helper `actionOf` tách `action` bằng split('.').
 */
const PERMISSION_CATALOG = [
    'inbox.view',
    'inbox.reply',
    'inbox.assign',
    'quote.view',
    'quote.create',
    'quote.edit',
    'quote.delete',
    'quote.approve',
    'order.view',
    'order.create',
    'order.edit',
    'order.delete',
    'order.approve',
    'customer.view',
    'customer.create',
    'customer.edit',
    'material.view',
    'material.create',
    'material.edit',
    'inventory.view',
    'inventory.import',
    'inventory.export',
    'inventory.adjust',
    'settings.view',
    'settings.edit',
    'user.view',
    'user.create',
    'user.edit',
    'user.delete',
    'role.view',
    'role.create',
    'role.edit',
    'role.delete',
    'report.view',
    'report.export',
    'pricing.view',
    'pricing.edit',
] as const;

/** Tách `action` (phần cuối) của một capability `domain.action[...]`. */
const actionOf = (cap: string): string => {
    const parts = cap.split('.');
    return parts[parts.length - 1];
};

/** Các action biến đổi dữ liệu — viewer chỉ-đọc KHÔNG được phép có. */
const MUTATING_ACTIONS = new Set(['create', 'edit', 'delete', 'approve']);

describe('access-decision (role→permission invariants)', () => {
    // Feature: rbac-quote-order-access, Property 3: Tập quyền mặc định của agent bao trùm việc hằng ngày
    it('Property 3: agentDefault bao trùm mọi quyền trong AGENT_DAILY (đặc biệt order.view)', () => {
        fc.assert(
            fc.property(fc.constantFrom(...AGENT_DAILY), (p) => {
                expect(agentDefault.includes(p)).toBe(true);
            }),
            { numRuns: NUM_RUNS },
        );
        // Bất biến cụ thể được nhấn mạnh trong thiết kế.
        expect(agentDefault.includes('order.view')).toBe(true);
    });

    // Feature: rbac-quote-order-access, Property 4: Tập quyền mặc định của agent loại trừ mọi quyền cam kết
    it('Property 4: agentDefault KHÔNG chứa bất kỳ quyền nào trong COMMITMENT_PERMS', () => {
        fc.assert(
            fc.property(fc.constantFrom(...COMMITMENT_PERMS), (p) => {
                expect(agentDefault.includes(p)).toBe(false);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: rbac-quote-order-access, Property 5: Phân quyền theo route cho agent
    it('Property 5: canAccess(agentDefault, required) = false cho route cam kết, true cho route hằng ngày', () => {
        fc.assert(
            fc.property(fc.constantFrom(...COMMITMENT_ROUTE_REQUIRED), (required) => {
                expect(canAccess(agentDefault, required)).toBe(false);
            }),
            { numRuns: NUM_RUNS },
        );
        fc.assert(
            fc.property(fc.constantFrom(...DAILY_ROUTE_REQUIRED), (required) => {
                expect(canAccess(agentDefault, required)).toBe(true);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: rbac-quote-order-access, Property 6: Supervisor bao trùm việc hằng ngày của agent cộng quyền duyệt
    it('Property 6: supervisorDefault bao trùm AGENT_DAILY ∪ {quote.approve, order.approve}', () => {
        const supervisorMust = [...AGENT_DAILY, 'quote.approve', 'order.approve'] as const;
        fc.assert(
            fc.property(fc.constantFrom(...supervisorMust), (p) => {
                expect(supervisorDefault.includes(p)).toBe(true);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: rbac-quote-order-access, Property 7: Viewer chỉ-đọc, loại trừ mọi quyền biến đổi
    it('Property 7: viewerDefault KHÔNG chứa quyền có action create/edit/delete/approve', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...PERMISSION_CATALOG).filter((p) =>
                    MUTATING_ACTIONS.has(actionOf(p)),
                ),
                (mutatingPerm) => {
                    expect(viewerDefault.includes(mutatingPerm)).toBe(false);
                },
            ),
            { numRuns: NUM_RUNS },
        );
        // Bất biến trực tiếp: không phần tử nào của viewerDefault là quyền biến đổi.
        for (const p of viewerDefault) {
            expect(MUTATING_ACTIONS.has(actionOf(p))).toBe(false);
        }
    });
});
