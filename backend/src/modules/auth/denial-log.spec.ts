/**
 * Property-based test cho hàm THUẦN `buildDenialLog`.
 *
 * Feature: rbac-quote-order-access, Property 11: Bản ghi từ chối không chứa bí mật
 *
 * Mục tiêu (Req 6.1, 6.2): với mọi request bị từ chối — kể cả khi headers/body
 * chứa các khoá/giá trị nhạy cảm (`authorization`, `token`, `password`) ở nhiều
 * cấp lồng nhau — payload trả về cho `AuditService.log(...)`:
 *   (a) KHÔNG chứa khoá nhạy cảm nào ở bất kỳ cấp nào, và KHÔNG chứa bất kỳ
 *       giá trị bí mật nào đã được tiêm vào request;
 *   (b) vẫn chứa đủ `userId` (khi user.id có), `metadata.role`, `metadata.required`
 *       (bằng đúng đầu vào), và `metadata.route` là chuỗi 'METHOD path' không rỗng.
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { buildDenialLog } from './denial-log';

const NUM_RUNS = 200;

/** Khoá bị coi là nhạy cảm (so khớp không phân biệt hoa/thường). */
const SENSITIVE_KEYS = new Set(['token', 'password', 'authorization']);

/** Marker để nhận diện giá trị bí mật đã tiêm — không xuất hiện ở field hợp lệ. */
const SECRET_MARKER = 'SECRET::';

/** Catalog quyền mẫu để sinh `required` (delimiter '.'). */
const CAPABILITY_POOL = [
    'quote.view',
    'quote.create',
    'quote.edit',
    'quote.delete',
    'quote.approve',
    'order.view',
    'order.approve',
    'settings.edit',
    'user.view',
    'role.view',
];

/**
 * Quét đệ quy toàn bộ object: thu thập (1) mọi khoá gặp được và
 * (2) mọi giá trị chuỗi gặp được, ở mọi cấp lồng nhau.
 */
function collectKeysAndStringValues(node: unknown, keys: string[], strings: string[]): void {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
        for (const item of node) collectKeysAndStringValues(item, keys, strings);
        return;
    }
    if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            keys.push(k);
            collectKeysAndStringValues(v, keys, strings);
        }
        return;
    }
    if (typeof node === 'string') strings.push(node);
}

describe('buildDenialLog (pure denial-log payload builder)', () => {
    // Token an toàn cho method/path/id/role: chữ-số/'-'/'_'/'.'/'/'/':', KHÔNG chứa marker.
    const safeToken = fc.stringMatching(/^[a-zA-Z0-9/_:.-]{1,12}$/);
    const method = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH');
    // Giá trị bí mật: luôn mang marker để phân biệt với field hợp lệ.
    const secretValue = fc.string({ minLength: 1, maxLength: 10 }).map((s) => SECRET_MARKER + s);

    // Feature: rbac-quote-order-access, Property 11: Bản ghi từ chối không chứa bí mật
    it('Property 11: payload không chứa khoá/giá trị nhạy cảm và đủ trường bắt buộc', () => {
        fc.assert(
            fc.property(
                method,
                // path không rỗng để bảo đảm route = 'METHOD path' không rỗng
                safeToken.filter((s) => s.trim().length > 0),
                // có dùng route.path hay rơi về originalUrl/url
                fc.constantFrom('route', 'originalUrl', 'url'),
                // user.id có thể vắng
                fc.option(safeToken, { nil: undefined }),
                // user.role có thể vắng
                fc.option(safeToken, { nil: undefined }),
                // user có thể là null hẳn
                fc.boolean(),
                fc.array(fc.constantFrom(...CAPABILITY_POOL), { maxLength: 5 }),
                // tập giá trị bí mật để tiêm vào headers/body
                fc.array(secretValue, { minLength: 1, maxLength: 6 }),
                safeToken, // ip
                (m, pathVal, pathSlot, userId, role, userIsNull, required, secrets, ip) => {
                    const [s1, s2, s3, s4, s5, s6] = [
                        secrets[0],
                        secrets[1] ?? secrets[0],
                        secrets[2] ?? secrets[0],
                        secrets[3] ?? secrets[0],
                        secrets[4] ?? secrets[0],
                        secrets[5] ?? secrets[0],
                    ];

                    // Dựng request với headers/body lồng nhau chứa khoá & giá trị nhạy cảm,
                    // gồm cả biến thể hoa/thường để chứng minh không rò rỉ.
                    const req: any = {
                        method: m,
                        ip,
                        headers: {
                            authorization: 'Bearer ' + s1,
                            Authorization: s2,
                            cookie: 'session=' + s3,
                            'x-harmless': 'ok',
                        },
                        body: {
                            password: s4,
                            Password: s5,
                            token: s1,
                            Token: s2,
                            nested: {
                                authorization: s3,
                                deeper: { PASSWORD: s6, tOkEn: s4 },
                            },
                        },
                    };
                    if (pathSlot === 'route') req.route = { path: pathVal };
                    else if (pathSlot === 'originalUrl') req.originalUrl = pathVal;
                    else req.url = pathVal;

                    const user = userIsNull ? null : { id: userId, role };

                    const payload = buildDenialLog(req, user, required);

                    // --- (a) Không có khoá/giá trị nhạy cảm ở bất kỳ cấp nào ---
                    const keys: string[] = [];
                    const strings: string[] = [];
                    collectKeysAndStringValues(payload, keys, strings);

                    for (const k of keys) {
                        expect(SENSITIVE_KEYS.has(k.toLowerCase())).toBe(false);
                    }
                    for (const v of strings) {
                        // Không giá trị nào mang marker bí mật (chứng minh không sao chép từ headers/body)
                        expect(v.includes(SECRET_MARKER)).toBe(false);
                    }
                    const secretSet = new Set(secrets);
                    for (const v of strings) {
                        expect(secretSet.has(v)).toBe(false);
                    }

                    // --- (b) Đủ trường bắt buộc ---
                    if (!userIsNull && userId !== undefined) {
                        expect(payload.userId).toBe(userId);
                    }
                    expect(payload.metadata.role).toBe(userIsNull ? '' : role ?? '');
                    expect(payload.metadata.required).toEqual(required);

                    const route = payload.metadata.route;
                    expect(typeof route).toBe('string');
                    expect(route.length).toBeGreaterThan(0);
                    // route đúng dạng 'METHOD path'
                    expect(route).toBe(`${m} ${pathVal}`.trim());
                    expect(route.startsWith(m)).toBe(true);
                    expect(route).toContain(pathVal);
                    // entityId trùng route
                    expect(payload.entityId).toBe(route);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
