/**
 * Property-based tests cho `validateRegistryWellFormedness`.
 *
 * Feature: product-rescope-cskh-quote, Property 1: Registry well-formedness
 * (phân loại trọn vẹn, không trùng).
 *
 * Validates: Requirements 2.1, 2.5
 *
 * Property 1 nói: *For any* Scope Registry, mỗi entry có `scope` thuộc đúng một trong
 * `{core, frozen, removed}`, mọi `id` là duy nhất và không rỗng, và mỗi entry có
 * `rule`, `reason`, `featureRef` không rỗng. `validateRegistryWellFormedness` trả về
 * `valid === true` KHI VÀ CHỈ KHI mọi điều kiện trên đều thoả; ngược lại nó báo đúng
 * các vi phạm tương ứng.
 */

import fc from 'fast-check';
import scopeRegistryArtefact from './scope-registry.json';
import {
  VALID_SCOPES,
  validateRegistryWellFormedness,
} from './validate-registry';
import type { ScopeEntry, ScopeRegistry } from './types';

/**
 * Tiên đề tham chiếu (oracle) độc lập với hiện thực được kiểm: một entry là
 * well-formed khi `id` không rỗng, `scope` hợp lệ, và `rule`/`reason`/`featureRef`
 * không rỗng (so theo nghĩa "không rỗng sau khi trim").
 */
function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function expectedValid(registry: ScopeRegistry): boolean {
  const entries = registry.entries ?? [];
  const ids = new Set<string>();
  for (const e of entries) {
    if (!nonEmpty(e.id)) return false;
    if (ids.has(e.id)) return false;
    ids.add(e.id);
    if (!(VALID_SCOPES as readonly string[]).includes(e.scope as string)) return false;
    if (!nonEmpty(e.rule)) return false;
    if (!nonEmpty(e.reason)) return false;
    if (!nonEmpty(e.featureRef)) return false;
  }
  return true;
}

/** Generator cho một chuỗi "có thể rỗng": rỗng, toàn khoảng trắng, hoặc nội dung thật. */
const maybeEmptyString = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.string({ minLength: 1, maxLength: 12 }).map((s) => s + 'x'),
);

/** Generator cho `scope`: trộn giá trị hợp lệ và giá trị không hợp lệ. */
const scopeArb = fc.oneof(
  fc.constantFrom('core', 'frozen', 'removed'),
  fc.constantFrom('CORE', 'archived', '', 'frozen ', 'unknown'),
) as fc.Arbitrary<ScopeEntry['scope']>;

/**
 * Generator entry "thô": các trường có thể hợp lệ hoặc vi phạm, và `id` lấy từ một
 * không gian nhỏ để xác suất trùng `id` đủ cao (giúp kiểm nhánh duplicate-id).
 */
const rawEntryArb: fc.Arbitrary<ScopeEntry> = fc.record({
  id: fc.oneof(
    fc.constantFrom('a', 'b', 'c', 'd'),
    fc.constant(''),
    fc.constant('   '),
    fc.string({ minLength: 1, maxLength: 6 }),
  ),
  title: fc.string({ maxLength: 10 }),
  scope: scopeArb,
  axis: fc.constantFrom('cskh', 'baogia', 'shared', 'none'),
  rule: fc.oneof(fc.constantFrom('2.2', '2.3', '2.4'), fc.constant('')),
  reason: maybeEmptyString,
  featureRef: maybeEmptyString,
}) as unknown as fc.Arbitrary<ScopeEntry>;

const registryArb: fc.Arbitrary<ScopeRegistry> = fc.record({
  baseline: fc.constant([
    { app: 'cskh' as const, mainMenuCount: 7 },
    { app: 'baogia' as const, mainMenuCount: 8 },
  ]),
  entries: fc.array(rawEntryArb, { maxLength: 8 }),
});

describe('Feature: product-rescope-cskh-quote, Property 1: Registry well-formedness (phân loại trọn vẹn, không trùng)', () => {
  it('valid === true KHI VÀ CHỈ KHI mọi entry hợp lệ (scope đúng nhóm, id duy nhất & không rỗng, rule/reason/featureRef không rỗng)', () => {
    fc.assert(
      fc.property(registryArb, (registry) => {
        const result = validateRegistryWellFormedness(registry);
        // IFF: kết quả của hàm khớp với tiên đề tham chiếu độc lập.
        expect(result.valid).toBe(expectedValid(registry));
        // Bất biến phụ: valid <=> không có vi phạm nào.
        expect(result.valid).toBe(result.violations.length === 0);
      }),
      { numRuns: 300 },
    );
  });

  it('khi invalid thì báo đúng loại vi phạm tương ứng cho từng entry', () => {
    fc.assert(
      fc.property(registryArb, (registry) => {
        const { violations } = validateRegistryWellFormedness(registry);
        const entries = registry.entries ?? [];
        const seen = new Set<string>();

        entries.forEach((entry, index) => {
          const here = violations.filter((v) => v.index === index);
          const kinds = new Set(here.map((v) => v.kind));

          if (!nonEmpty(entry.id)) {
            expect(kinds.has('empty-id')).toBe(true);
          } else {
            if (seen.has(entry.id)) {
              expect(kinds.has('duplicate-id')).toBe(true);
            }
            seen.add(entry.id);
          }

          if (!(VALID_SCOPES as readonly string[]).includes(entry.scope as string)) {
            expect(kinds.has('invalid-scope')).toBe(true);
          }
          if (!nonEmpty(entry.rule)) {
            expect(kinds.has('empty-rule')).toBe(true);
          }
          if (!nonEmpty(entry.reason)) {
            expect(kinds.has('empty-reason')).toBe(true);
          }
          if (!nonEmpty(entry.featureRef)) {
            expect(kinds.has('empty-feature-ref')).toBe(true);
          }
        });
      }),
      { numRuns: 300 },
    );
  });

  it('phát hiện id trùng lặp khi có ít nhất hai entry cùng id không rỗng', () => {
    const dupArb = fc
      .tuple(
        fc.constantFrom('x', 'y', 'z'),
        fc.array(rawEntryArb, { maxLength: 4 }),
      )
      .map(([dupId, rest]) => {
        const entries: ScopeEntry[] = [
          { id: dupId, title: 't', scope: 'core', axis: 'cskh', rule: '2.2', reason: 'r', featureRef: 'f' } as ScopeEntry,
          { id: dupId, title: 't', scope: 'core', axis: 'cskh', rule: '2.2', reason: 'r', featureRef: 'f' } as ScopeEntry,
          ...rest,
        ];
        return {
          baseline: [
            { app: 'cskh' as const, mainMenuCount: 7 },
            { app: 'baogia' as const, mainMenuCount: 8 },
          ],
          entries,
        } as ScopeRegistry;
      });

    fc.assert(
      fc.property(dupArb, (registry) => {
        const { valid, violations } = validateRegistryWellFormedness(registry);
        expect(valid).toBe(false);
        expect(violations.some((v) => v.kind === 'duplicate-id')).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
});

describe('Artefact thật scope-registry.json', () => {
  it('vượt qua kiểm chứng well-formedness (không có vi phạm)', () => {
    const result = validateRegistryWellFormedness(
      scopeRegistryArtefact as unknown as ScopeRegistry,
    );
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
