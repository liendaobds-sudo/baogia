/**
 * Property test cho phân loại rủi ro endpoint không-auth của Scope Registry.
 *
 * Property 12: Endpoint không-auth luôn được ghi phân loại rủi ro.
 *
 * *For any* registry và một vị ngữ `hasUnauthEndpoint` đánh dấu entry nào CÓ
 * Endpoint_Không_Auth, `validateDependencies` báo một `unauthRiskViolation` cho
 * một entry KHI VÀ CHỈ KHI entry đó được đánh dấu là có endpoint không-auth VÀ
 * `unauthEndpointRisk` của nó thiếu hoặc không thuộc tập {high, medium, low}.
 *
 * **Validates: Requirements 7.3**
 *
 * Khung kiểm thử: Jest + fast-check (v3), ≥100 iteration (chạy 200).
 */

import fc from 'fast-check';

import {
  validateDependencies,
  VALID_UNAUTH_RISKS,
  type UnauthRiskViolation,
} from './validate-dependencies';
import type {
  Axis,
  ClassificationRule,
  ScopeClass,
  ScopeEntry,
  ScopeRegistry,
} from './types';

const FEATURE_TAG = 'Feature: product-rescope-cskh-quote, Property 12';

const SCOPES: readonly ScopeClass[] = ['core', 'frozen', 'removed'];
const AXES: readonly Axis[] = ['cskh', 'baogia', 'shared', 'none'];
const RULES: readonly ClassificationRule[] = ['2.2', '2.3', '2.4'];

const VALID_RISK_SET = new Set<string>(VALID_UNAUTH_RISKS as readonly string[]);

/**
 * Generator cho giá trị `unauthEndpointRisk`, trải đều trên các trường hợp:
 * - hợp lệ ('high' | 'medium' | 'low'),
 * - chuỗi không hợp lệ (ví dụ 'critical', '', 'HIGH'),
 * - undefined (không khai báo).
 *
 * Trả về cờ `present` để biết có nên gắn trường này vào entry hay không, mô phỏng
 * cả trường hợp thuộc tính vắng mặt hoàn toàn lẫn trường hợp gán `undefined`.
 */
const riskFieldArb = fc.oneof(
  // Hợp lệ.
  fc.constantFrom(...VALID_UNAUTH_RISKS).map((value) => ({
    present: true as const,
    value: value as unknown,
  })),
  // Chuỗi không hợp lệ.
  fc
    .oneof(
      fc.constantFrom('critical', 'none', '', 'HIGH', 'Low', 'medium '),
      fc.string(),
    )
    .filter((s) => !VALID_RISK_SET.has(s))
    .map((value) => ({ present: true as const, value: value as unknown })),
  // Khai báo trường nhưng giá trị undefined.
  fc.constant({ present: true as const, value: undefined as unknown }),
  // Không khai báo trường (vắng mặt hoàn toàn).
  fc.constant({ present: false as const, value: undefined as unknown }),
);

/**
 * Generator cho một `ScopeEntry` well-formed tối giản, kèm trường
 * `unauthEndpointRisk` (có thể vắng mặt / undefined / hợp lệ / không hợp lệ).
 */
const entryArb = (id: string): fc.Arbitrary<ScopeEntry> =>
  fc
    .record({
      scope: fc.constantFrom(...SCOPES),
      axis: fc.constantFrom(...AXES),
      rule: fc.constantFrom(...RULES),
      risk: riskFieldArb,
    })
    .map(({ scope, axis, rule, risk }) => {
      const entry: ScopeEntry = {
        id,
        title: `Tính năng ${id}`,
        scope,
        axis,
        rule,
        reason: `lý do ${id}`,
        featureRef: `ref/${id}`,
      };
      if (risk.present) {
        // Gán kể cả khi value là undefined để mô phỏng thuộc tính được khai báo.
        (entry as { unauthEndpointRisk?: unknown }).unauthEndpointRisk =
          risk.value;
      }
      return entry;
    });

/** Registry với các id duy nhất; mỗi entry sinh độc lập theo `entryArb`. */
const registryArb: fc.Arbitrary<ScopeRegistry> = fc
  .uniqueArray(
    fc
      .string({ minLength: 1, maxLength: 6 })
      .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
    { minLength: 1, maxLength: 8 },
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

/** Một giá trị rủi ro có hợp lệ không (oracle, độc lập với hiện thực). */
function isValidRisk(value: unknown): boolean {
  return typeof value === 'string' && VALID_RISK_SET.has(value);
}

const sortViolations = (
  v: UnauthRiskViolation[],
): UnauthRiskViolation[] =>
  [...v].sort((a, b) => a.entryId.localeCompare(b.entryId));

describe(FEATURE_TAG, () => {
  it('reports an unauth-risk violation IFF an entry is marked as having an unauth endpoint AND its risk is missing or invalid', () => {
    fc.assert(
      fc.property(
        registryArb,
        // Vị ngữ ngẫu nhiên: mỗi id được đánh dấu có/không có endpoint không-auth.
        fc.func(fc.boolean()),
        (registry, markPredicate) => {
          // Ánh xạ ổn định id -> có endpoint không-auth (vị ngữ phải deterministic).
          const markById = new Map<string, boolean>();
          for (const e of registry.entries) {
            markById.set(e.id, markPredicate(e.id));
          }
          const hasUnauthEndpoint = (entry: ScopeEntry): boolean =>
            markById.get(entry.id) ?? false;

          const result = validateDependencies(registry, { hasUnauthEndpoint });

          // Oracle: tập vi phạm kỳ vọng suy trực tiếp từ Property 12.
          const expected: UnauthRiskViolation[] = [];
          for (const entry of registry.entries) {
            if (
              hasUnauthEndpoint(entry) &&
              !isValidRisk(entry.unauthEndpointRisk)
            ) {
              expected.push({
                entryId: entry.id,
                recordedRisk:
                  entry.unauthEndpointRisk === undefined
                    ? undefined
                    : String(entry.unauthEndpointRisk),
              });
            }
          }

          // IFF: tập trả về đúng bằng tập kỳ vọng (cả thuận lẫn nghịch).
          expect(sortViolations(result.unauthRiskViolations)).toEqual(
            sortViolations(expected),
          );

          const byId = new Map(registry.entries.map((e) => [e.id, e]));

          // Chiều thuận: mọi vi phạm trả về thực sự là entry được đánh dấu + risk sai.
          for (const v of result.unauthRiskViolations) {
            const owner = byId.get(v.entryId);
            expect(owner).toBeDefined();
            expect(hasUnauthEndpoint(owner as ScopeEntry)).toBe(true);
            expect(isValidRisk((owner as ScopeEntry).unauthEndpointRisk)).toBe(
              false,
            );
          }

          // Chiều nghịch: entry không-đánh-dấu HOẶC risk hợp lệ thì KHÔNG bị báo.
          for (const entry of registry.entries) {
            const flagged = result.unauthRiskViolations.some(
              (v) => v.entryId === entry.id,
            );
            if (
              !hasUnauthEndpoint(entry) ||
              isValidRisk(entry.unauthEndpointRisk)
            ) {
              expect(flagged).toBe(false);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
