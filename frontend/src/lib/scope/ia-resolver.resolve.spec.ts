/**
 * Property-based test cho IA soundness của `resolveMenu` (Property 8).
 *
 * Feature: product-rescope-cskh-quote, Property 8: IA soundness — menu chỉ chứa
 * Core đúng trục, ẩn frozen/removed.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4
 *
 * Property 8 nói: *For any* Scope Registry và app ∈ {cskh, baogia}, mọi MenuItem do
 * `resolveMenu(registry, app)` trả về phải tương ứng với một entry trong registry mà
 * entry đó có `scope === 'core'`, có `navItem` không rỗng, và trục khớp app (cùng tên
 * hoặc `shared`). Đồng thời KHÔNG có bất kỳ entry nào thuộc frozen/removed (hoặc sai
 * trục, hoặc thiếu navItem) lọt lên menu — tức tập navItem trả về đúng bằng tập các
 * entry hợp lệ (đủ và không thừa).
 */

import fc from 'fast-check';
import scopeRegistryArtefact from './scope-registry.json';
import { resolveMenu, axisMatchesApp, type AppKind } from './ia-resolver';
import type { Axis, ScopeClass, ScopeEntry, ScopeRegistry } from './types';

const RUNS = 200;

const SCOPES: readonly ScopeClass[] = ['core', 'frozen', 'removed'];
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];
const APPS: readonly AppKind[] = ['cskh', 'baogia'];

/** Một chuỗi "có nghĩa" theo định nghĩa của resolver (không rỗng sau khi trim). */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Một entry có đủ điều kiện hiển thị trên menu của `app` hay không — tiên đề tham
 * chiếu (oracle) độc lập với hiện thực: core + navItem không rỗng + trục khớp.
 */
function shouldAppear(entry: ScopeEntry, app: AppKind): boolean {
  return (
    entry.scope === 'core' &&
    isNonEmptyString(entry.navItem) &&
    axisMatchesApp(entry.axis, app)
  );
}

/** Generator `navItem`: có thể vắng, rỗng, toàn khoảng trắng, hoặc nội dung thật. */
const navItemArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.constant('   '),
  fc.string({ minLength: 1, maxLength: 8 }).map((s) => `nav-${s}`),
);

/**
 * Generator entry trộn đủ loại scope/axis/navItem để phủ frozen/removed, sai trục,
 * và entry thiếu navItem — đúng tinh thần "registries with mixed scopes/axes/navItems".
 */
const entryArb: fc.Arbitrary<ScopeEntry> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }).map((s) => `id-${s}`),
  title: fc.string({ maxLength: 10 }),
  scope: fc.constantFrom(...SCOPES),
  axis: fc.constantFrom(...AXES),
  rule: fc.constantFrom('2.2', '2.3', '2.4'),
  reason: fc.constant('reason'),
  featureRef: fc.constant('frontend/src/app/x'),
  navItem: navItemArb,
}) as unknown as fc.Arbitrary<ScopeEntry>;

const registryArb: fc.Arbitrary<ScopeRegistry> = fc.record({
  baseline: fc.constant([
    { app: 'cskh' as const, mainMenuCount: 7 },
    { app: 'baogia' as const, mainMenuCount: 8 },
  ]),
  entries: fc.array(entryArb, { maxLength: 12 }),
});

describe('Feature: product-rescope-cskh-quote, Property 8: IA soundness — menu chỉ chứa Core đúng trục, ẩn frozen/removed', () => {
  it('mọi MenuItem trả về đều là core, có navItem, trục khớp app; không lọt frozen/removed/sai trục (Req 4.1, 4.2, 4.3, 4.4)', () => {
    fc.assert(
      fc.property(registryArb, fc.constantFrom(...APPS), (registry, app) => {
        const menu = resolveMenu(registry, app);

        // (1) Soundness: mỗi mục trả về ứng với đúng một entry hợp lệ.
        for (const item of menu) {
          const matching = registry.entries.filter(
            (e) => e.navItem === item.navItem && e.axis === item.axis,
          );
          expect(matching.length).toBeGreaterThan(0);
          // Tồn tại ít nhất một entry hợp lệ khớp mục này.
          expect(matching.some((e) => shouldAppear(e, app))).toBe(true);
          // Mục trả về phải core đúng trục + navItem không rỗng.
          expect(isNonEmptyString(item.navItem)).toBe(true);
          expect(axisMatchesApp(item.axis, app)).toBe(true);
        }

        // (2) Không rò rỉ: KHÔNG entry frozen/removed/sai-trục/thiếu-navItem nào xuất hiện.
        const shownNavItems = new Set(menu.map((m) => m.navItem));
        for (const entry of registry.entries) {
          if (!shouldAppear(entry, app) && isNonEmptyString(entry.navItem)) {
            // Một entry không đủ điều kiện chỉ "vắng mặt" nếu navItem của nó không
            // trùng với bất kỳ entry hợp lệ nào (navItem có thể trùng nhau).
            const navAlsoValidElsewhere = registry.entries.some(
              (e) => e.navItem === entry.navItem && shouldAppear(e, app),
            );
            if (!navAlsoValidElsewhere) {
              expect(shownNavItems.has(entry.navItem as string)).toBe(false);
            }
          }
        }

        // (3) Đầy đủ: số mục trả về đúng bằng số entry hợp lệ.
        const expectedCount = registry.entries.filter((e) =>
          shouldAppear(e, app),
        ).length;
        expect(menu.length).toBe(expectedCount);
      }),
      { numRuns: RUNS },
    );
  });

  it('mọi mục trả về có scope=core trong registry nguồn (không bao giờ frozen/removed)', () => {
    fc.assert(
      fc.property(registryArb, fc.constantFrom(...APPS), (registry, app) => {
        const menu = resolveMenu(registry, app);
        for (const item of menu) {
          const sourceScopes = registry.entries
            .filter((e) => e.navItem === item.navItem && e.axis === item.axis)
            .map((e) => e.scope);
          expect(sourceScopes).toContain('core');
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe('Artefact thật scope-registry.json — resolveMenu chỉ trả Tính_Năng_Lõi đúng trục', () => {
  const registry = scopeRegistryArtefact as unknown as ScopeRegistry;

  it.each(APPS)('app=%s: mọi mục menu suy ra đều là core, có navItem, trục khớp', (app) => {
    const menu = resolveMenu(registry, app);
    expect(menu.length).toBeGreaterThan(0);

    for (const item of menu) {
      const source = registry.entries.find(
        (e) => e.navItem === item.navItem && e.axis === item.axis,
      );
      expect(source).toBeDefined();
      expect(source!.scope).toBe('core');
      expect(isNonEmptyString(source!.navItem)).toBe(true);
      expect(axisMatchesApp(source!.axis, app)).toBe(true);
    }

    // Không có entry frozen/removed nào lọt lên menu.
    const shownNavItems = new Set(menu.map((m) => m.navItem));
    for (const entry of registry.entries) {
      if (entry.scope !== 'core' && isNonEmptyString(entry.navItem)) {
        expect(shownNavItems.has(entry.navItem)).toBe(false);
      }
    }
  });
});
