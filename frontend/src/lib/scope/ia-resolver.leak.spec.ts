/**
 * Property test cho phát hiện rò rỉ Tính_Năng_Phụ trên menu chính.
 *
 * Feature: product-rescope-cskh-quote, Property 10: Đánh giá rút gọn phát hiện rò
 * rỉ Tính_Năng_Phụ.
 *
 * **Validates: Requirements 1.7**
 *
 * Property 10 nói: *For any* danh sách mục menu (các `ScopeEntry` đang hiển thị),
 * `evaluateMenuLeaks` trả `pass === true` / `verdict === 'ĐẠT'` KHI VÀ CHỈ KHI mọi
 * mục có `scope === 'core'`. Ngược lại `verdict === 'KHÔNG ĐẠT'` và `leaks` bằng
 * ĐÚNG tập các mục không thuộc `core`, giữ nguyên thứ tự xuất hiện. Bất biến này
 * cũng đúng khi đánh giá trực tiếp một registry "rò rỉ" qua `evaluateRegistryMenuLeaks`.
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (dùng 200).
 */

import fc from 'fast-check';

import {
  evaluateMenuLeaks,
  evaluateRegistryMenuLeaks,
  menuCandidateEntries,
  axisMatchesApp,
  type AppKind,
} from './ia-resolver';
import type {
  Axis,
  ClassificationRule,
  ScopeClass,
  ScopeEntry,
  ScopeRegistry,
} from './types';

const FEATURE_TAG = 'Feature: product-rescope-cskh-quote, Property 10';
const RUNS = 200;

const SCOPES: readonly ScopeClass[] = ['core', 'frozen', 'removed'];
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];
const RULES: readonly ClassificationRule[] = ['2.2', '2.3', '2.4'];
const APPS: readonly AppKind[] = ['cskh', 'baogia'];

/** Một chuỗi "có nghĩa": bỏ khoảng trắng vẫn còn ký tự. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Generator một `ScopeEntry` đang hiển thị trên menu. `scope` ngẫu nhiên trong cả
 * ba nhóm để cố tình tạo các menu "rò rỉ" (gồm entry frozen/removed kèm `navItem`).
 */
function menuEntryArb(idx: number): fc.Arbitrary<ScopeEntry> {
  return fc
    .record({
      scope: fc.constantFrom(...SCOPES),
      axis: fc.constantFrom(...AXES),
      rule: fc.constantFrom(...RULES),
      navItem: fc
        .string({ minLength: 1, maxLength: 8 })
        .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
    })
    .map(
      ({ scope, axis, rule, navItem }): ScopeEntry => ({
        id: `leak-${idx}`,
        title: `Mục ${idx}`,
        scope,
        axis,
        rule,
        reason: `lý do ${idx}`,
        featureRef: `ref/${idx}`,
        navItem,
      }),
    );
}

/** Danh sách mục menu trộn lẫn core và non-core (frozen/removed). */
const menuEntriesArb: fc.Arbitrary<ScopeEntry[]> = fc
  .nat({ max: 12 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => menuEntryArb(i))));

/** Generator entry chỉ-core: dùng để xác nhận chiều "ĐẠT" của IFF. */
function coreEntryArb(idx: number): fc.Arbitrary<ScopeEntry> {
  return menuEntryArb(idx).map((e) => ({ ...e, scope: 'core' as ScopeClass }));
}

const allCoreMenuArb: fc.Arbitrary<ScopeEntry[]> = fc
  .nat({ max: 12 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => coreEntryArb(i))));

/** Registry ngẫu nhiên (mọi entry mang navItem) — gồm cả cấu hình "rò rỉ". */
const leakyRegistryArb: fc.Arbitrary<ScopeRegistry> = fc
  .uniqueArray(fc.integer({ min: 0, max: 999 }), { minLength: 0, maxLength: 12 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) => menuEntryArb(id))).map(
      (entries): ScopeRegistry => ({
        baseline: [
          { app: 'cskh', mainMenuCount: 7 },
          { app: 'baogia', mainMenuCount: 8 },
        ],
        // đảm bảo id duy nhất (uniqueArray theo ids đầu vào)
        entries: entries.map((e, i) => ({ ...e, id: `r-${ids[i]}` })),
      }),
    ),
  );

describe(FEATURE_TAG, () => {
  it('verdict ĐẠT ⇔ mọi mục là core; ngược lại KHÔNG ĐẠT và leaks = đúng tập non-core (giữ thứ tự) (Req 1.7)', () => {
    fc.assert(
      fc.property(menuEntriesArb, (menu) => {
        const report = evaluateMenuLeaks(menu);
        const expectedLeaks = menu.filter((e) => e.scope !== 'core');
        const allCore = expectedLeaks.length === 0;

        // IFF: ĐẠT ⇔ không có mục non-core nào.
        expect(report.pass).toBe(allCore);
        expect(report.verdict).toBe(allCore ? 'ĐẠT' : 'KHÔNG ĐẠT');

        // leaks bằng ĐÚNG tập non-core, GIỮ NGUYÊN thứ tự (so khớp tham chiếu từng phần tử).
        expect(report.leaks).toEqual(expectedLeaks);
        expect(report.leaks.length).toBe(expectedLeaks.length);
        report.leaks.forEach((leak, i) => {
          expect(leak).toBe(expectedLeaks[i]);
          expect(leak.scope).not.toBe('core');
        });

        // Khi ĐẠT, leaks rỗng.
        if (report.pass) expect(report.leaks).toHaveLength(0);
      }),
      { numRuns: RUNS },
    );
  });

  it('menu toàn core luôn cho ĐẠT với leaks rỗng (chiều thuận của IFF)', () => {
    fc.assert(
      fc.property(allCoreMenuArb, (menu) => {
        const report = evaluateMenuLeaks(menu);
        expect(report.pass).toBe(true);
        expect(report.verdict).toBe('ĐẠT');
        expect(report.leaks).toHaveLength(0);
      }),
      { numRuns: RUNS },
    );
  });

  it('menu có ít nhất một mục non-core luôn cho KHÔNG ĐẠT và phát hiện đủ mục vi phạm', () => {
    fc.assert(
      fc.property(
        // ép tồn tại ít nhất một mục non-core bằng cách ghép thêm vào danh sách bất kỳ.
        fc.tuple(
          menuEntriesArb,
          fc
            .tuple(menuEntryArb(9999), fc.constantFrom<ScopeClass>('frozen', 'removed'))
            .map(([e, scope]) => ({ ...e, scope })),
        ),
        ([base, leak]) => {
          const menu = [...base, leak];
          const report = evaluateMenuLeaks(menu);
          expect(report.pass).toBe(false);
          expect(report.verdict).toBe('KHÔNG ĐẠT');
          expect(report.leaks.length).toBeGreaterThan(0);
          expect(report.leaks).toEqual(menu.filter((e) => e.scope !== 'core'));
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('an toàn với đầu vào null/undefined: ĐẠT, leaks rỗng', () => {
    for (const input of [null, undefined]) {
      const report = evaluateMenuLeaks(input);
      expect(report.pass).toBe(true);
      expect(report.verdict).toBe('ĐẠT');
      expect(report.leaks).toHaveLength(0);
    }
  });

  it('evaluateRegistryMenuLeaks: phán quyết khớp đánh giá trên các ứng viên mang navItem (gồm registry rò rỉ)', () => {
    fc.assert(
      fc.property(
        leakyRegistryArb,
        fc.option(fc.constantFrom(...APPS), { nil: undefined }),
        (registry, app) => {
          const report = evaluateRegistryMenuLeaks(registry, app);
          const candidates = menuCandidateEntries(registry, app);
          const expectedLeaks = candidates.filter((e) => e.scope !== 'core');

          expect(report.pass).toBe(expectedLeaks.length === 0);
          expect(report.verdict).toBe(
            expectedLeaks.length === 0 ? 'ĐẠT' : 'KHÔNG ĐẠT',
          );
          expect(report.leaks).toEqual(expectedLeaks);

          // Mọi ứng viên đều phải mang navItem và (nếu có app) khớp trục.
          for (const c of candidates) {
            expect(isNonEmptyString(c.navItem)).toBe(true);
            if (app) expect(axisMatchesApp(c.axis, app)).toBe(true);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
