/**
 * Property test cho việc menu nhỏ lại sau rút gọn.
 *
 * Property 9: Rút gọn làm menu nhỏ lại.
 *
 * Suy dẫn menu (`resolveMenu`) không bao giờ "thêm" mục: số mục trả về luôn ≤ số
 * entry có `navItem` thuộc đúng trục của app (vì `resolveMenu` còn lọc thêm theo
 * `scope === 'core'`). Hơn nữa, rút gọn — đóng băng (chuyển `core → frozen`) một số
 * entry — không bao giờ làm menu lớn hơn. Trên artefact thật, số mục menu mỗi app
 * không vượt quá `baseline.mainMenuCount` của app đó (Req 1.5).
 *
 * **Validates: Requirements 1.5**
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (dùng 200).
 */

import fc from 'fast-check';

import { resolveMenu, axisMatchesApp, type AppKind } from './ia-resolver';
import { scopeRegistry } from './registry';
import type {
  Axis,
  ClassificationRule,
  ScopeClass,
  ScopeEntry,
  ScopeRegistry,
} from './types';

const FEATURE_TAG = 'Feature: product-rescope-cskh-quote, Property 9';

const SCOPES: readonly ScopeClass[] = ['core', 'frozen', 'removed'];
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];
const RULES: readonly ClassificationRule[] = ['2.2', '2.3', '2.4'];
const APPS: readonly AppKind[] = ['cskh', 'baogia'];

/** Một chuỗi "có nghĩa" cho navItem: bỏ khoảng trắng vẫn còn ký tự. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Đếm số entry "ứng viên hiển thị" trên menu của một app: có `navItem` không rỗng
 * VÀ trục khớp app — bất kể `scope`. Đây là cận trên của số mục mà `resolveMenu`
 * có thể trả về (resolve chỉ lọc thêm chứ không bao giờ thêm mục).
 */
function navItemCandidateCount(registry: ScopeRegistry, app: AppKind): number {
  return registry.entries.filter(
    (e) => isNonEmptyString(e.navItem) && axisMatchesApp(e.axis, app),
  ).length;
}

/**
 * Generator cho một `ScopeEntry` đa dạng: scope/axis/rule ngẫu nhiên, `navItem` đôi
 * khi vắng mặt, đôi khi là chuỗi rỗng/khoảng trắng (để kiểm cách lọc navItem).
 */
const entryArb = (id: string): fc.Arbitrary<ScopeEntry> =>
  fc
    .record({
      scope: fc.constantFrom(...SCOPES),
      axis: fc.constantFrom(...AXES),
      rule: fc.constantFrom(...RULES),
      navItem: fc.oneof(
        fc.constant(undefined),
        fc.constant(''),
        fc.constant('   '),
        fc
          .string({ minLength: 1, maxLength: 8 })
          .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
      ),
    })
    .map(({ scope, axis, rule, navItem }) => {
      const entry: ScopeEntry = {
        id,
        title: `Tính năng ${id}`,
        scope,
        axis,
        rule,
        reason: `lý do ${id}`,
        featureRef: `ref/${id}`,
      };
      if (navItem !== undefined) entry.navItem = navItem;
      return entry;
    });

/** Registry ngẫu nhiên với id duy nhất và baseline mặc định. */
const registryArb: fc.Arbitrary<ScopeRegistry> = fc
  .uniqueArray(
    fc.string({ minLength: 1, maxLength: 6 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
    { minLength: 0, maxLength: 12 },
  )
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

/** Đóng băng một tập con các entry `core` (chuyển `core → frozen`) = một bước rút gọn. */
function freezeSubset(
  registry: ScopeRegistry,
  freezeIds: ReadonlySet<string>,
): ScopeRegistry {
  return {
    ...registry,
    entries: registry.entries.map((e) =>
      e.scope === 'core' && freezeIds.has(e.id)
        ? { ...e, scope: 'frozen' as ScopeClass }
        : e,
    ),
  };
}

describe(FEATURE_TAG, () => {
  it('resolveMenu never adds items: length ≤ number of nav-bearing entries on that axis', () => {
    fc.assert(
      fc.property(registryArb, fc.constantFrom(...APPS), (registry, app) => {
        const menu = resolveMenu(registry, app);
        const candidateCount = navItemCandidateCount(registry, app);

        // Suy dẫn không bao giờ thêm mục: menu ⊆ tập ứng viên có navItem đúng trục.
        expect(menu.length).toBeLessThanOrEqual(candidateCount);
        // Và không bao giờ vượt tổng số entry.
        expect(menu.length).toBeLessThanOrEqual(registry.entries.length);
      }),
      { numRuns: 200 },
    );
  });

  it('freezing core entries never increases the resolved menu size (shrink-only)', () => {
    fc.assert(
      fc.property(
        registryArb.chain((registry) => {
          const coreIds = registry.entries
            .filter((e) => e.scope === 'core')
            .map((e) => e.id);
          return fc.tuple(
            fc.constant(registry),
            fc.subarray(coreIds, { minLength: 0, maxLength: coreIds.length }),
            fc.constantFrom(...APPS),
          );
        }),
        ([registry, idsToFreeze, app]) => {
          const before = resolveMenu(registry, app).length;
          const shrunk = freezeSubset(registry, new Set(idsToFreeze));
          const after = resolveMenu(shrunk, app).length;

          // Đóng băng (rút gọn) chỉ có thể làm menu nhỏ lại hoặc giữ nguyên.
          expect(after).toBeLessThanOrEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('real scope-registry.json: resolved menu length ≤ baseline.mainMenuCount per app', () => {
    for (const app of APPS) {
      const baseline = scopeRegistry.baseline.find((b) => b.app === app);
      expect(baseline).toBeDefined();
      const menu = resolveMenu(scopeRegistry, app);
      expect(menu.length).toBeLessThanOrEqual(baseline!.mainMenuCount);
    }
  });
});
