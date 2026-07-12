/**
 * Property test cho route guard theo Trục_Ứng_Dụng CSKH (`guardCskhRoute` +
 * `isCskhRoute`).
 *
 * Feature: tenant-app-scope — chặn truy cập route Trục CSKH khi tenant đã TẮT CSKH.
 *
 * Bất biến: *For any* path điều hướng và bất kỳ trạng thái `cskhEnabled` nào, guard
 * cho phép truy cập KHI VÀ CHỈ KHI path KHÔNG thuộc Trục CSKH HOẶC CSKH đang bật;
 * ngược lại (path thuộc Trục CSKH ∧ CSKH tắt) trả quyết định redirect về Trang
 * Báo_Giá (`QUOTE_HOME_ROUTE` mặc định, hoặc `quoteHome` ghi đè).
 *
 * Diễn giải:
 *   `allowed === (!isCskhRoute(path) || cskhEnabled)`,
 * và khi `allowed === false` thì `redirectTo` là Trang Báo_Giá.
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (dùng 200).
 */

import fc from 'fast-check';

import {
  candidateRoutesForEntry,
  guardCskhRoute,
  isCskhRoute,
  QUOTE_HOME_ROUTE,
} from './ia-resolver';
import type { Axis, ScopeEntry, ScopeRegistry } from './types';

const FEATURE_TAG = 'Feature: tenant-app-scope, CskhRouteGuard';
const RUNS = 200;

/** Trục có thể gán cho entry — bao gồm cskh để exercise nhánh chặn. */
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];

/**
 * Generator một `ScopeEntry` mang `navItem` duy nhất, `axis` sinh đa dạng để bảo
 * đảm guard chỉ chặn đúng entry `axis === 'cskh'`, không phụ thuộc trường khác.
 */
function entryArb(idx: number): fc.Arbitrary<ScopeEntry> {
  return fc
    .record({ axis: fc.constantFrom(...AXES) })
    .map(
      ({ axis }): ScopeEntry => ({
        id: `e-${idx}`,
        title: `Mục ${idx}`,
        scope: 'core',
        axis,
        rule: '2.2',
        reason: `lý do ${idx}`,
        featureRef: `frontend/src/app/feat-${idx}`,
        navItem: `nav-${idx}`,
      }),
    );
}

/** Registry với danh sách entry mang navItem duy nhất. */
const registryArb: fc.Arbitrary<ScopeRegistry> = fc.nat({ max: 14 }).chain((n) =>
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

/**
 * Generator một path điều hướng gắn với một `registry`. Trộn:
 * - route ứng viên thật của một entry (trùng khít),
 * - route con (`<route>/sub`),
 * - path dùng chung/ngẫu nhiên (`/pricing`, `/`, rỗng…),
 */
function pathArb(registry: ScopeRegistry): fc.Arbitrary<string> {
  const candidateRoutes = registry.entries.flatMap((e) =>
    candidateRoutesForEntry(e),
  );

  const sharedPaths = fc.constantFrom(
    '/pricing',
    '/inbox',
    '/dashboard',
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
  it('guard cho phép ⇔ (path không thuộc Trục CSKH ∨ CSKH bật); ngược lại chặn + redirect về Trang Báo_Giá', () => {
    fc.assert(
      fc.property(
        registryArb.chain((registry) =>
          fc.record({
            registry: fc.constant(registry),
            path: pathArb(registry),
            cskhEnabled: fc.boolean(),
            // undefined ⇒ dùng mặc định QUOTE_HOME_ROUTE; có giá trị ⇒ kiểm ghi đè.
            quoteHome: fc.option(fc.constantFrom('/pricing', '/bao-gia'), {
              nil: undefined,
            }),
          }),
        ),
        ({ registry, path, cskhEnabled, quoteHome }) => {
          const options = quoteHome !== undefined ? { quoteHome } : {};
          const decision = guardCskhRoute(registry, path, cskhEnabled, options);

          const isCskh = isCskhRoute(registry, path);
          const expectedHome = quoteHome ?? QUOTE_HOME_ROUTE;
          const expectedAllowed = !isCskh || cskhEnabled;

          // Bất biến cốt lõi: allowed ⇔ (không phải route CSKH ∨ CSKH bật).
          expect(decision.allowed).toBe(expectedAllowed);

          if (expectedAllowed) {
            expect(decision.redirectTo).toBeNull();
          } else {
            // Chỉ path thuộc Trục CSKH khi CSKH tắt mới bị chặn.
            expect(isCskh).toBe(true);
            expect(cskhEnabled).toBe(false);
            expect(decision.redirectTo).toBe(expectedHome);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
