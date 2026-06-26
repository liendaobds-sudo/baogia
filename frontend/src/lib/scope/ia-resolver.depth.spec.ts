/**
 * Property test cho độ sâu menu ≤ 3 (Property 11).
 *
 * Feature: product-rescope-cskh-quote, Property 11: Chức năng chính tiếp cận trong
 * tối đa 3 nhấp.
 *
 * **Validates: Requirements 7.1**
 *
 * Property 11 nói: *For any* cây menu suy ra từ registry, mọi nhiệm vụ chính (`core`)
 * đạt được trong tối đa 3 thao tác chọn — tức độ sâu đường dẫn ≤ 3.
 *
 * `resolveMenu` trả về một danh sách phẳng các `MenuItem`, mỗi mục có `href` suy từ
 * `navItem`. Ta mô hình hoá "độ sâu" của một mục bằng số segment đường dẫn trong
 * `href` (ví dụ `/settings/ai-quote` = độ sâu 2, `/inbox` = độ sâu 1). Kiến trúc
 * thông tin (IA) tổ chức các mục Lõi ở tối đa 3 cấp, nên với mọi registry hợp lệ,
 * `resolveMenu` không bao giờ sinh ra mục có độ sâu > 3.
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (dùng 200).
 */

import fc from 'fast-check';

import { resolveMenu, type AppKind } from './ia-resolver';
import { scopeRegistry } from './registry';
import type {
  Axis,
  ClassificationRule,
  ScopeClass,
  ScopeEntry,
  ScopeRegistry,
} from './types';

const FEATURE_TAG =
  'Feature: product-rescope-cskh-quote, Property 11: Chức năng chính tiếp cận trong tối đa 3 nhấp';

const RUNS = 200;
const MAX_DEPTH = 3;

const SCOPES: readonly ScopeClass[] = ['core', 'frozen', 'removed'];
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];
const RULES: readonly ClassificationRule[] = ['2.2', '2.3', '2.4'];
const APPS: readonly AppKind[] = ['cskh', 'baogia'];

/**
 * Độ sâu của một href = số segment đường dẫn không rỗng.
 *
 * `/inbox`              → ['inbox']                  → 1
 * `/settings/ai-quote`  → ['settings', 'ai-quote']   → 2
 * `/`                   → []                          → 0
 */
function hrefDepth(href: string): number {
  return href.split('/').filter((seg) => seg.trim().length > 0).length;
}

/** Một segment slug hợp lệ (không chứa dấu '/'). */
const slugArb = fc
  .string({ minLength: 1, maxLength: 8 })
  .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s));

/**
 * `navItem` mô phỏng đúng không gian đầu vào của IA: một mục menu Lõi nằm ở tối đa
 * 3 cấp, nên navItem là đường dẫn slug có 1..3 segment (ví dụ `quotes`,
 * `settings/ai-quote`, `pricing/quotes/new`).
 */
const navItemArb = fc
  .array(slugArb, { minLength: 1, maxLength: MAX_DEPTH })
  .map((segments) => segments.join('/'));

/** Generator cho một `ScopeEntry` đa dạng scope/axis/rule với navItem ≤ 3 segment. */
const entryArb = (id: string): fc.Arbitrary<ScopeEntry> =>
  fc
    .record({
      scope: fc.constantFrom(...SCOPES),
      axis: fc.constantFrom(...AXES),
      rule: fc.constantFrom(...RULES),
      navItem: navItemArb,
    })
    .map(({ scope, axis, rule, navItem }) => ({
      id,
      title: `Tính năng ${id}`,
      scope,
      axis,
      rule,
      reason: `lý do ${id}`,
      featureRef: `ref/${id}`,
      navItem,
    }));

/** Registry ngẫu nhiên với id duy nhất và baseline mặc định. */
const registryArb: fc.Arbitrary<ScopeRegistry> = fc
  .uniqueArray(slugArb, { minLength: 0, maxLength: 12 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) => entryArb(id))).map(
      (entries): ScopeRegistry => ({
        baseline: [
          { app: 'cskh', mainMenuCount: 7 },
          { app: 'baogia', mainMenuCount: 8 },
        ],
        entries,
      }),
    ),
  );

describe(FEATURE_TAG, () => {
  it('mọi MenuItem suy ra từ registry có độ sâu href ≤ 3 (Req 7.1)', () => {
    fc.assert(
      fc.property(registryArb, fc.constantFrom(...APPS), (registry, app) => {
        const menu = resolveMenu(registry, app);
        for (const item of menu) {
          expect(hrefDepth(item.href)).toBeLessThanOrEqual(MAX_DEPTH);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('artefact thật scope-registry.json: mọi href Lõi của cả hai app có độ sâu ≤ 3', () => {
    for (const app of APPS) {
      const menu = resolveMenu(scopeRegistry, app);
      expect(menu.length).toBeGreaterThan(0);
      for (const item of menu) {
        expect(hrefDepth(item.href)).toBeGreaterThanOrEqual(1);
        expect(hrefDepth(item.href)).toBeLessThanOrEqual(MAX_DEPTH);
      }
    }
  });
});
