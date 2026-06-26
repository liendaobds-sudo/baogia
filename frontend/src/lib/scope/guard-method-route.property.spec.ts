/**
 * Property test cho route guard theo Phương_Pháp_In (`guardMethodRoute` +
 * `isMethodRoute`).
 *
 * Feature: print-method-unification, Property 5: Chặn truy cập route phương pháp
 * không khả dụng.
 *
 * **Validates: Requirements 2.4, 2.5**
 *
 * Property 5 nói: *For any* path điều hướng trỏ tới một Phương_Pháp_In và bất kỳ
 * tập Phương_Pháp_Khả_Dụng nào, guard cho phép truy cập KHI VÀ CHỈ KHI phương pháp
 * đó thuộc tập khả dụng; ngược lại trả quyết định redirect về Cổng_Tạo_Báo_Giá.
 *
 * Diễn giải bất biến cho mọi path (kể cả route dùng chung không gắn method):
 *   `allowed === (method === null || enabledMethods.includes(method))`,
 * và khi `allowed === false` thì `redirectTo` là Cổng_Tạo_Báo_Giá
 * (`QUOTE_ENTRY_POINT_ROUTE` mặc định, hoặc giá trị `quoteEntryPoint` ghi đè).
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (dùng 200).
 */

import fc from 'fast-check';

import {
  candidateRoutesForEntry,
  guardMethodRoute,
  isMethodRoute,
  QUOTE_ENTRY_POINT_ROUTE,
} from './ia-resolver';
import type { Axis, MethodId, ScopeEntry, ScopeRegistry } from './types';

const FEATURE_TAG = 'Feature: print-method-unification, Property 5';
const RUNS = 200;

/** Trục có thể gán cho entry. */
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];
/** Tập Phương_Pháp_In dùng để sinh dữ liệu — `large-format` thường nằm NGOÀI tập
 *  khả dụng để kiểm chiều "chặn + redirect". */
const METHODS: readonly MethodId[] = ['digital', 'offset', 'large-format'];

/**
 * Generator một `ScopeEntry` mang `navItem` duy nhất. `method` tuỳ chọn:
 * `undefined` (route dùng chung) hoặc một Phương_Pháp_In. `scope` cũng được sinh
 * đa dạng để bảo đảm guard chỉ phụ thuộc trường `method`, không phụ thuộc `scope`.
 */
function entryArb(idx: number): fc.Arbitrary<ScopeEntry> {
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

/** Registry với danh sách entry mang navItem duy nhất. */
const registryArb: fc.Arbitrary<ScopeRegistry> = fc
  .nat({ max: 14 })
  .chain((n) =>
    fc
      .tuple(...Array.from({ length: n }, (_, i) => entryArb(i)))
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

/**
 * Generator một path điều hướng gắn với một `registry` cụ thể. Trộn:
 * - route ứng viên thật của một entry (trùng khít) → exercise nhánh "method route",
 * - route con của một entry (`<route>/sub`) → exercise so khớp route con,
 * - path ngẫu nhiên/dùng chung (vd. `/dashboard`, `/foo`) → exercise nhánh `method === null`,
 * - path rỗng/khoảng trắng → biên an toàn.
 */
function pathArb(registry: ScopeRegistry): fc.Arbitrary<string> {
  const candidateRoutes = registry.entries.flatMap((e) =>
    candidateRoutesForEntry(e),
  );

  const sharedPaths = fc.constantFrom(
    '/dashboard',
    '/inbox',
    '/quote',
    '/',
    '',
    '   ',
  );
  const randomPaths = fc
    .string({ minLength: 1, maxLength: 12 })
    .map((s) => `/${s.replace(/\s/g, '')}`);

  if (candidateRoutes.length === 0) {
    return fc.oneof(sharedPaths, randomPaths);
  }

  const exactRoute = fc.constantFrom(...candidateRoutes);
  const subRoute = fc
    .tuple(
      fc.constantFrom(...candidateRoutes),
      fc.string({ minLength: 1, maxLength: 6 }).map((s) => s.replace(/\s/g, '')),
    )
    .map(([route, suffix]) => (suffix.length > 0 ? `${route}/${suffix}` : route));

  return fc.oneof(exactRoute, subRoute, sharedPaths, randomPaths);
}

describe(FEATURE_TAG, () => {
  it('guard cho phép khi và chỉ khi method=null hoặc method khả dụng; ngược lại chặn + redirect về Cổng_Tạo_Báo_Giá (Req 2.4, 2.5)', () => {
    fc.assert(
      fc.property(
        registryArb.chain((registry) =>
          fc.record({
            registry: fc.constant(registry),
            path: pathArb(registry),
            enabledMethods: enabledMethodsArb,
            // undefined ⇒ dùng mặc định QUOTE_ENTRY_POINT_ROUTE; có giá trị ⇒ kiểm ghi đè.
            quoteEntryPoint: fc.option(
              fc.constantFrom('/quote', '/bao-gia/tao', '/cong-bao-gia'),
              { nil: undefined },
            ),
          }),
        ),
        ({ registry, path, enabledMethods, quoteEntryPoint }) => {
          const options =
            quoteEntryPoint !== undefined ? { quoteEntryPoint } : {};
          const decision = guardMethodRoute(
            registry,
            path,
            enabledMethods,
            options,
          );

          const expectedMethod = isMethodRoute(registry, path);
          const expectedEntryPoint = quoteEntryPoint ?? QUOTE_ENTRY_POINT_ROUTE;
          const expectedAllowed =
            expectedMethod === null || enabledMethods.includes(expectedMethod);

          // (1) method của quyết định khớp method suy ra từ path.
          expect(decision.method).toBe(expectedMethod);

          // (2) Bất biến cốt lõi: allowed ⇔ (method=null ∨ method khả dụng).
          expect(decision.allowed).toBe(expectedAllowed);

          // (3) Khi cho phép: không redirect. Khi chặn: redirect về Cổng_Tạo_Báo_Giá.
          if (expectedAllowed) {
            expect(decision.redirectTo).toBeNull();
          } else {
            // Chỉ path gắn method KHÔNG khả dụng mới bị chặn.
            expect(expectedMethod).not.toBeNull();
            expect(enabledMethods).not.toContain(expectedMethod);
            expect(decision.redirectTo).toBe(expectedEntryPoint);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
