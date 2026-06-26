/**
 * Property test cho bất biến phụ thuộc của Scope Registry.
 *
 * Property 5: Phụ thuộc giữ thành phần Phụ ở frozen, không removed.
 *
 * *For any* registry, nếu một entry `core` khai báo `dependsOnFrozen` trỏ tới
 * entry X, thì validation báo `dependencyViolation` KHI VÀ CHỈ KHI X không tồn tại
 * (missing) HOẶC X có `scope === 'removed'`; không có vi phạm khi X tồn tại và ở
 * `frozen`/`core`.
 *
 * **Validates: Requirements 2.6**
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration.
 */

import fc from 'fast-check';

import {
  validateDependencies,
  type DependencyViolation,
} from './validate-dependencies';
import { scopeRegistry } from './registry';
import type {
  Axis,
  ClassificationRule,
  ScopeClass,
  ScopeEntry,
  ScopeRegistry,
} from './types';

const FEATURE_TAG = 'Feature: product-rescope-cskh-quote, Property 5';

const SCOPES: readonly ScopeClass[] = ['core', 'frozen', 'removed'];
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];
const RULES: readonly ClassificationRule[] = ['2.2', '2.3', '2.4'];

/**
 * Generator cho một `ScopeEntry` tối giản nhưng well-formed đủ để kiểm phụ thuộc.
 * `dependsOnFrozen` được sinh ở bước registry (cần biết các id mục tiêu), nên ở
 * đây chỉ sinh các trường cơ bản.
 */
const baseEntryArb = (id: string): fc.Arbitrary<ScopeEntry> =>
  fc.record({
    scope: fc.constantFrom(...SCOPES),
    axis: fc.constantFrom(...AXES),
    rule: fc.constantFrom(...RULES),
  }).map(({ scope, axis, rule }) => ({
    id,
    title: `Tính năng ${id}`,
    scope,
    axis,
    rule,
    reason: `lý do ${id}`,
    featureRef: `ref/${id}`,
  }));

/**
 * Sinh một registry với các id duy nhất, trong đó mỗi entry `core` có thể trỏ
 * `dependsOnFrozen` tới một tập con các id khác (kể cả id không tồn tại để bao
 * trường hợp `missing`). Các mục tiêu trải đều trên mọi scope (core/frozen/removed).
 */
const registryArb: fc.Arbitrary<ScopeRegistry> = fc
  .uniqueArray(
    fc.string({ minLength: 1, maxLength: 6 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
    { minLength: 1, maxLength: 8 },
  )
  .chain((ids) =>
    fc
      .tuple(
        ...ids.map((id) =>
          fc
            .tuple(
              baseEntryArb(id),
              // Phụ thuộc: tập con các id thật + một id rác (có thể không tồn tại).
              fc.subarray([...ids, '__ghost__'], { minLength: 0, maxLength: ids.length }),
            )
            .map(([entry, deps]): ScopeEntry => {
              if (deps.length === 0) return entry;
              return { ...entry, dependsOnFrozen: deps };
            }),
        ),
      )
      .map((entries): ScopeRegistry => ({
        baseline: [
          { app: 'cskh', mainMenuCount: 7 },
          { app: 'baogia', mainMenuCount: 8 },
        ],
        entries,
      })),
  );

/**
 * Đặc tả tham chiếu (oracle) được suy trực tiếp từ Property 5: tính tập vi phạm
 * phụ thuộc kỳ vọng một cách độc lập với hiện thực dưới test.
 */
function expectedDependencyViolations(
  registry: ScopeRegistry,
): DependencyViolation[] {
  const byId = new Map(registry.entries.map((e) => [e.id, e]));
  const out: DependencyViolation[] = [];
  for (const entry of registry.entries) {
    if (entry.scope !== 'core' || !entry.dependsOnFrozen) continue;
    for (const depId of entry.dependsOnFrozen) {
      const target = byId.get(depId);
      if (!target) {
        out.push({ entryId: entry.id, dependsOn: depId, reason: 'missing' });
      } else if (target.scope === 'removed') {
        out.push({ entryId: entry.id, dependsOn: depId, reason: 'removed' });
      }
    }
  }
  return out;
}

const sortViolations = (v: DependencyViolation[]): DependencyViolation[] =>
  [...v].sort((a, b) =>
    `${a.entryId}|${a.dependsOn}|${a.reason}`.localeCompare(
      `${b.entryId}|${b.dependsOn}|${b.reason}`,
    ),
  );

describe(FEATURE_TAG, () => {
  it('reports a dependency violation IFF a core dependency target is missing or removed', () => {
    fc.assert(
      fc.property(registryArb, (registry) => {
        const result = validateDependencies(registry);
        const expected = expectedDependencyViolations(registry);

        // Tập vi phạm trả về đúng bằng tập kỳ vọng (đúng cả chiều thuận và nghịch — IFF).
        expect(sortViolations(result.dependencyViolations)).toEqual(
          sortViolations(expected),
        );

        // Mọi vi phạm có lý do hợp lệ và thực sự ứng với entry `core` có phụ thuộc.
        const byId = new Map(registry.entries.map((e) => [e.id, e]));
        for (const v of result.dependencyViolations) {
          const owner = byId.get(v.entryId);
          expect(owner?.scope).toBe('core');
          expect(owner?.dependsOnFrozen).toContain(v.dependsOn);
          const target = byId.get(v.dependsOn);
          if (v.reason === 'missing') {
            expect(target).toBeUndefined();
          } else {
            expect(target?.scope).toBe('removed');
          }
        }

        // Không có entry `core` nào phụ thuộc tới một target tồn tại & frozen/core
        // mà lại bị báo vi phạm.
        for (const entry of registry.entries) {
          if (entry.scope !== 'core' || !entry.dependsOnFrozen) continue;
          for (const depId of entry.dependsOnFrozen) {
            const target = byId.get(depId);
            if (target && target.scope !== 'removed') {
              const flagged = result.dependencyViolations.some(
                (v) => v.entryId === entry.id && v.dependsOn === depId,
              );
              expect(flagged).toBe(false);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('finds no dependency violations in the real scope-registry.json artefact', () => {
    const result = validateDependencies(scopeRegistry);
    expect(result.dependencyViolations).toEqual([]);
  });
});
