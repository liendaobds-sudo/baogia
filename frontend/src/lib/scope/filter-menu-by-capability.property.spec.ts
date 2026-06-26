/**
 * Property test cho lọc menu theo Cờ_Năng_Lực (`filterMenuByCapability`).
 *
 * Feature: print-method-unification, Property 4: Menu suy dẫn chỉ chứa phương pháp
 * khả dụng.
 *
 * **Validates: Requirements 2.1, 2.2**
 *
 * Property 4 nói: *For any* Scope Registry và bất kỳ tập Phương_Pháp_Khả_Dụng nào,
 * menu sau khi lọc capability KHÔNG chứa mục nào gắn với một Phương_Pháp_In ngoài
 * tập khả dụng, và GIỮ NGUYÊN mọi mục không gắn phương pháp.
 *
 * Hàm dưới kiểm thử là `filterMenuByCapability`, chạy phía sau `resolveMenu()` và
 * dùng `methodOfNavItem(registry, navItem)` làm nguồn ánh xạ navItem → Phương_Pháp_In
 * (Design — IA capability filtering).
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (dùng 200).
 */

import fc from 'fast-check';

import {
  filterMenuByCapability,
  methodOfNavItem,
  resolveMenu,
  type AppKind,
} from './ia-resolver';
import type { Axis, MethodId, ScopeEntry, ScopeRegistry } from './types';

const FEATURE_TAG = 'Feature: print-method-unification, Property 4';
const RUNS = 200;

/** Trục có thể gán cho entry. */
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];
/** Tập Phương_Pháp_In dùng để sinh dữ liệu — gồm một method (`large-format`)
 *  thường nằm NGOÀI tập khả dụng để kiểm chiều "loại bỏ". */
const METHODS: readonly MethodId[] = ['digital', 'offset', 'large-format'];
const APPS: readonly AppKind[] = ['cskh', 'baogia'];

/**
 * Generator một `ScopeEntry` core mang `navItem` (ứng viên hiển thị trên menu).
 * `method` tuỳ chọn: `undefined` (mục dùng chung) hoặc một Phương_Pháp_In.
 * `idx` bảo đảm `navItem`/`id` duy nhất để `methodOfNavItem` tra cứu xác định.
 */
function coreEntryArb(idx: number): fc.Arbitrary<ScopeEntry> {
  return fc
    .record({
      axis: fc.constantFrom(...AXES),
      method: fc.option(fc.constantFrom(...METHODS), { nil: undefined }),
    })
    .map(
      ({ axis, method }): ScopeEntry => ({
        id: `e-${idx}`,
        title: `Mục ${idx}`,
        scope: 'core',
        axis,
        rule: '2.2',
        reason: `lý do ${idx}`,
        featureRef: `frontend/src/app/feat-${idx}`,
        navItem: `nav-${idx}`,
        ...(method !== undefined ? { method } : {}),
      }),
    );
}

/** Registry với danh sách entry core mang navItem duy nhất. */
const registryArb: fc.Arbitrary<ScopeRegistry> = fc
  .nat({ max: 14 })
  .chain((n) =>
    fc
      .tuple(...Array.from({ length: n }, (_, i) => coreEntryArb(i)))
      .map(
        (entries): ScopeRegistry => ({
          baseline: [
            { app: 'cskh', mainMenuCount: 7 },
            { app: 'baogia', mainMenuCount: 8 },
          ],
          entries,
        }),
      ),
  );

/** Tập Phương_Pháp_Khả_Dụng bất kỳ (kể cả rỗng hoặc đầy). */
const enabledMethodsArb: fc.Arbitrary<MethodId[]> = fc.uniqueArray(
  fc.constantFrom(...METHODS),
  { minLength: 0, maxLength: METHODS.length },
);

describe(FEATURE_TAG, () => {
  it('menu đã lọc không chứa method ngoài tập khả dụng và giữ nguyên mọi mục không gắn method (Req 2.1, 2.2)', () => {
    fc.assert(
      fc.property(
        registryArb,
        fc.constantFrom(...APPS),
        enabledMethodsArb,
        (registry, app, enabledMethods) => {
          const menu = resolveMenu(registry, app);
          const lookup = (navItem: string) => methodOfNavItem(registry, navItem);
          const filtered = filterMenuByCapability(menu, enabledMethods, lookup);

          const filteredNavItems = new Set(filtered.map((i) => i.navItem));

          // (1) Mọi mục còn lại: hoặc không gắn method, hoặc method thuộc tập khả dụng.
          for (const item of filtered) {
            const method = lookup(item.navItem);
            if (method !== null) {
              expect(enabledMethods).toContain(method);
            }
          }

          // (2) Mọi mục không gắn method trong menu gốc đều được GIỮ NGUYÊN.
          // (3) Mọi mục gắn method khả dụng được giữ; mục gắn method ngoài tập bị loại.
          for (const item of menu) {
            const method = lookup(item.navItem);
            const shouldKeep = method === null || enabledMethods.includes(method);
            expect(filteredNavItems.has(item.navItem)).toBe(shouldKeep);
          }

          // Lọc là tập con của menu gốc, giữ nguyên thứ tự tương đối (idempotent-friendly).
          expect(filtered).toEqual(
            menu.filter((item) => {
              const method = lookup(item.navItem);
              return method === null || enabledMethods.includes(method);
            }),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});
