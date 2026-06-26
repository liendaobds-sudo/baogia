/**
 * Property tests — Lõi quyết định phân quyền THUẦN (frontend).
 *
 * Kiểm thử bản sao frontend của `access-decision` bằng fast-check (≥100 iteration).
 *
 * Phủ các property của design:
 *  - Property 1: Quyết định OR theo quyền (canAccess).
 *  - Property 8: Chuẩn hoá capability chỉ đổi delimiter và idempotent.
 *  - Property 9: Quyết định frontend trùng backend cho cùng đầu vào — vì backend
 *    module không import được từ package frontend, ta mã hoá *ngữ nghĩa tham chiếu*
 *    (theo design) ngay trong test và khẳng định kết quả của `canAccess`/
 *    `normalizeCapability` frontend KHỚP với reimplementation tham chiếu trên các
 *    đầu vào ngẫu nhiên — chốt chặn chống "drift" giữa hai phía.
 *
 * Feature: rbac-quote-order-access
 *
 * Tài liệu thiết kế: `.kiro/specs/rbac-quote-order-access/design.md`
 * (Correctness Properties 1, 8, 9).
 */

import fc from 'fast-check';

import { canAccess, normalizeCapability, WILDCARD } from './access-decision';

const NUM_RUNS = 200; // ≥100 iteration theo yêu cầu spec

/** Tập quyền mẫu theo catalog backend (delimiter '.') + wildcard. */
const KNOWN_PERMISSIONS = [
  WILDCARD,
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
  'inbox.view',
  'inbox.reply',
  'customer.view',
  'customer.create',
  'report.view',
  'pricing.view',
  'settings.edit',
  'user.view',
  'role.view',
] as const;

/** Một quyền tuỳ ý: lấy mẫu từ catalog đã biết HOẶC chuỗi bất kỳ (bắt token lạ). */
const permissionArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...KNOWN_PERMISSIONS),
  fc.string({ maxLength: 24 }),
);

/** Danh sách quyền của người dùng (có thể rỗng, có thể chứa '*'). */
const permissionsArb: fc.Arbitrary<string[]> = fc.array(permissionArb, { maxLength: 12 });

/** Danh sách quyền yêu cầu KHÔNG rỗng (logic OR). */
const requiredNonEmptyArb: fc.Arbitrary<string[]> = fc.array(permissionArb, {
  minLength: 1,
  maxLength: 6,
});

/** Token capability ngẫu nhiên (không chứa delimiter). */
const tokenArb: fc.Arbitrary<string> = fc
  .string({ maxLength: 10 })
  .map((s) => s.replace(/[:.]/g, ''));

/**
 * Chuỗi capability ngẫu nhiên gồm các token nối bởi ':' hoặc '.' (trộn lẫn),
 * để kiểm tra việc chuẩn hoá delimiter.
 */
const capabilityArb: fc.Arbitrary<string> = fc
  .array(fc.tuple(tokenArb, fc.constantFrom(':', '.')), { minLength: 1, maxLength: 5 })
  .map((parts) => {
    // Nối: token0 [sep0] token1 [sep1] ... ; bỏ separator cuối.
    let out = '';
    parts.forEach(([tok, sep], i) => {
      out += tok;
      if (i < parts.length - 1) out += sep;
    });
    return out;
  });

// ---------------------------------------------------------------------------
// Ngữ nghĩa THAM CHIẾU (reference) — mã hoá lại độc lập theo design, dùng để
// khẳng định frontend không "drift" khỏi hành vi backend đã đặc tả.
// ---------------------------------------------------------------------------

/** Reimplementation tham chiếu của canAccess theo đặc tả Property 1. */
function refCanAccess(permissions: readonly string[], required: readonly string[]): boolean {
  if (required.length === 0) return true;
  if (permissions.indexOf('*') !== -1) return true;
  for (const r of required) {
    if (permissions.indexOf(r) !== -1) return true;
  }
  return false;
}

/** Reimplementation tham chiếu của normalizeCapability theo đặc tả Property 8. */
function refNormalizeCapability(cap: string): string {
  return cap.split(':').join('.');
}

describe('Feature: rbac-quote-order-access, Property 1: Quyết định OR theo quyền (canAccess)', () => {
  it('required rỗng → luôn cho qua (true)', () => {
    fc.assert(
      fc.property(permissionsArb, (permissions) => {
        expect(canAccess(permissions, [])).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('với required không rỗng: true ⇔ có "*" HOẶC giao khác rỗng với required', () => {
    fc.assert(
      fc.property(permissionsArb, requiredNonEmptyArb, (permissions, required) => {
        const expected =
          permissions.includes(WILDCARD) || required.some((r) => permissions.includes(r));
        expect(canAccess(permissions, required)).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('"*" trong permissions → luôn cho qua bất kể required', () => {
    fc.assert(
      fc.property(permissionsArb, requiredNonEmptyArb, (permissions, required) => {
        expect(canAccess([...permissions, WILDCARD], required)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Feature: rbac-quote-order-access, Property 8: Chuẩn hoá capability chỉ đổi delimiter và idempotent', () => {
  it('kết quả KHÔNG còn ký tự ":"', () => {
    fc.assert(
      fc.property(capabilityArb, (cap) => {
        expect(normalizeCapability(cap).includes(':')).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('chỉ đổi delimiter — bằng cap.replace(/:/g, ".")', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 32 }), (cap) => {
        expect(normalizeCapability(cap)).toBe(cap.replace(/:/g, '.'));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('idempotent: normalize(normalize(x)) === normalize(x)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 32 }), (cap) => {
        const once = normalizeCapability(cap);
        expect(normalizeCapability(once)).toBe(once);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Feature: rbac-quote-order-access, Property 9: Quyết định frontend trùng backend cho cùng đầu vào', () => {
  it('canAccess frontend === ngữ nghĩa tham chiếu (backend) trên mọi (permissions, required)', () => {
    fc.assert(
      fc.property(permissionsArb, requiredNonEmptyArb, (permissions, required) => {
        expect(canAccess(permissions, required)).toBe(refCanAccess(permissions, required));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('canAccess đồng nhất cả khi required rỗng', () => {
    fc.assert(
      fc.property(permissionsArb, (permissions) => {
        expect(canAccess(permissions, [])).toBe(refCanAccess(permissions, []));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('normalizeCapability frontend === ngữ nghĩa tham chiếu (backend)', () => {
    fc.assert(
      fc.property(capabilityArb, (cap) => {
        expect(normalizeCapability(cap)).toBe(refNormalizeCapability(cap));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('quyết định guard frontend === canAccess(permissions, [normalizeCapability(cap)])', () => {
    fc.assert(
      fc.property(permissionsArb, capabilityArb, (permissions, cap) => {
        const guardDecision = canAccess(permissions, [normalizeCapability(cap)]);
        const reference = refCanAccess(permissions, [refNormalizeCapability(cap)]);
        expect(guardDecision).toBe(reference);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
