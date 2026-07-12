/**
 * Parity test (drift guard) — Quy_Tắc_Phạm_Vi frontend (mirror) so với tập vector dùng chung.
 *
 * Feature: resource-scope-config, Property 10: Quy tắc backend và frontend không lệch nhau (drift guard)
 *
 * Property 10 (Design — Correctness Properties):
 *   For any `ScopeFlags` trong tập vector dùng chung `scope-rule-vectors.json`, hàm canonical
 *   phía backend và hàm mirror phía frontend cho ra `classifyResource` và `isOffsetOnly` trùng
 *   khớp hoàn toàn.
 *
 * Cơ chế chống-lệch: cùng một file `scope-rule-vectors.json` được commit GIỐNG HỆT ở cả hai
 * phía (backend: backend/src/modules/pricing/scope/scope-rule-vectors.json; frontend:
 * frontend/src/lib/scope/scope-rule-vectors.json). Mỗi phía chạy TOÀN BỘ vector qua hàm
 * canonical/mirror cục bộ và khẳng định:
 *   - classifyResource(flags) === expectedScopes
 *   - isOffsetOnly(flags)     === expectedOffsetOnly
 * Khi ai đó sửa một phía mà quên phía kia (hoặc làm lệch khỏi vector đã khoá), test gãy.
 *
 * Validates: Requirements 1.1, 1.2
 *
 * Khung kiểm thử: Jest + fast-check (v3); duyệt qua từng vector dùng chung.
 */
import fc from 'fast-check';

import {
  classifyResource,
  isOffsetOnly,
  type Scope,
  type ScopeFlags,
} from './resource-scope';
import vectorsFile from './scope-rule-vectors.json';

const FEATURE_TAG =
  'Feature: resource-scope-config, Property 10: Quy tắc backend và frontend không lệch nhau (drift guard)';

interface ScopeVector {
  name: string;
  flags: ScopeFlags;
  expectedScopes: Scope[];
  expectedOffsetOnly: boolean;
}

const vectors = (vectorsFile as { vectors: ScopeVector[] }).vectors;

describe(FEATURE_TAG, () => {
  it('tập vector dùng chung không rỗng (drift guard có dữ liệu để kiểm)', () => {
    expect(Array.isArray(vectors)).toBe(true);
    expect(vectors.length).toBeGreaterThan(0);
  });

  // Feature: resource-scope-config, Property 10: Quy tắc backend và frontend không lệch nhau (drift guard)
  it('Property 10: mirror frontend khớp expectedScopes + expectedOffsetOnly cho MỌI vector (Req 1.1, 1.2)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...vectors), (vector) => {
        expect(classifyResource(vector.flags)).toEqual(vector.expectedScopes);
        expect(isOffsetOnly(vector.flags)).toBe(vector.expectedOffsetOnly);
      }),
      { numRuns: Math.max(200, vectors.length) },
    );
  });

  // Duyệt cạn (exhaustive) toàn bộ vector — bảo đảm không vector nào bị bỏ sót.
  it.each(vectors.map((v) => [v.name, v] as const))(
    'Property 10 (vector): %s — classify + isOffsetOnly khớp baseline đã khoá',
    (_name, vector) => {
      expect(classifyResource(vector.flags)).toEqual(vector.expectedScopes);
      expect(isOffsetOnly(vector.flags)).toBe(vector.expectedOffsetOnly);
    },
  );
});
