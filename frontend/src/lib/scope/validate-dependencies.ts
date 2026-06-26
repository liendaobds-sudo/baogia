/**
 * Validator phụ thuộc của Scope Registry.
 *
 * Hiện thực hai bất biến:
 *
 * 1. **Phụ thuộc `dependsOnFrozen`** (Property 5 / Req 2.6): nếu một entry `core`
 *    khai báo `dependsOnFrozen` trỏ tới entry X, thì X phải tồn tại và KHÔNG BAO GIỜ
 *    có `scope === 'removed'` (X phải ở `frozen` cho tới khi phụ thuộc được gỡ và ghi nhận).
 *
 * 2. **Phân loại rủi ro endpoint không-auth** (Property 12 / Req 7.3): mọi entry có
 *    Endpoint_Không_Auth phải ghi `unauthEndpointRisk ∈ {high, medium, low}`.
 *
 * Module thuần (pure) — không side effect, không I/O — để thuận tiện kiểm thử.
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md`
 *
 * _Requirements: 2.6, 7.3_
 */

import type {
  ScopeEntry,
  ScopeRegistry,
  UnauthEndpointRisk,
} from './types';

/** Tập giá trị hợp lệ cho phân loại rủi ro của Endpoint_Không_Auth (Req 7.3). */
export const VALID_UNAUTH_RISKS: readonly UnauthEndpointRisk[] = [
  'high',
  'medium',
  'low',
];

/**
 * Vi phạm bất biến phụ thuộc: một entry `core` phụ thuộc tới một thành phần
 * không tồn tại hoặc đã bị gỡ bỏ.
 */
export interface DependencyViolation {
  /** Id của entry `core` khai báo phụ thuộc. */
  entryId: string;
  /** Id của thành phần được phụ thuộc tới. */
  dependsOn: string;
  /**
   * Lý do vi phạm:
   * - `missing` : id được phụ thuộc không tồn tại trong registry (mất tham chiếu).
   * - `removed` : id được phụ thuộc đang ở `scope === 'removed'` (vi phạm Req 2.6).
   */
  reason: 'missing' | 'removed';
}

/** Vi phạm phân loại rủi ro: entry có endpoint không-auth nhưng thiếu/sai phân loại. */
export interface UnauthRiskViolation {
  /** Id của entry có Endpoint_Không_Auth. */
  entryId: string;
  /** Giá trị rủi ro đã ghi (nếu có) — không thuộc tập hợp lệ. */
  recordedRisk?: string;
}

/** Kết quả kiểm chứng phụ thuộc và phân loại rủi ro của registry. */
export interface DependencyValidationResult {
  /** `true` khi không có vi phạm nào. */
  valid: boolean;
  /** Danh sách vi phạm bất biến phụ thuộc `dependsOnFrozen`. */
  dependencyViolations: DependencyViolation[];
  /** Danh sách vi phạm phân loại rủi ro endpoint không-auth. */
  unauthRiskViolations: UnauthRiskViolation[];
}

/** Tuỳ chọn cho `validateDependencies`. */
export interface ValidateDependenciesOptions {
  /**
   * Vị ngữ xác định một entry CÓ Endpoint_Không_Auth hay không.
   *
   * Mặc định: coi một entry là có endpoint không-auth khi nó khai báo trường
   * `unauthEndpointRisk` (kể cả khi giá trị không hợp lệ — khi đó sẽ bị ghi nhận
   * là vi phạm). Khi nguồn dữ liệu khác (ví dụ rà soát route thực tế) xác định
   * tập endpoint không-auth, truyền vị ngữ tuỳ biến để kiểm "thiếu phân loại".
   */
  hasUnauthEndpoint?: (entry: ScopeEntry) => boolean;
}

/** Một giá trị rủi ro có nằm trong tập hợp lệ không. */
function isValidUnauthRisk(value: unknown): value is UnauthEndpointRisk {
  return (
    typeof value === 'string' &&
    (VALID_UNAUTH_RISKS as readonly string[]).includes(value)
  );
}

/** Vị ngữ mặc định: entry có endpoint không-auth khi đã khai báo `unauthEndpointRisk`. */
function defaultHasUnauthEndpoint(entry: ScopeEntry): boolean {
  return Object.prototype.hasOwnProperty.call(entry, 'unauthEndpointRisk');
}

/**
 * Kiểm chứng bất biến phụ thuộc và phân loại rủi ro endpoint không-auth của registry.
 *
 * @param registry Đăng_Ký_Phạm_Vi cần kiểm chứng.
 * @param options  Tuỳ chọn (vị ngữ xác định endpoint không-auth).
 * @returns Kết quả gồm cờ `valid` và danh sách vi phạm từng loại.
 *
 * _Requirements: 2.6, 7.3_
 */
export function validateDependencies(
  registry: ScopeRegistry,
  options: ValidateDependenciesOptions = {},
): DependencyValidationResult {
  const entries = registry.entries ?? [];
  const byId = new Map<string, ScopeEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }

  const hasUnauthEndpoint =
    options.hasUnauthEndpoint ?? defaultHasUnauthEndpoint;

  const dependencyViolations: DependencyViolation[] = [];
  const unauthRiskViolations: UnauthRiskViolation[] = [];

  for (const entry of entries) {
    // (1) Bất biến phụ thuộc: entry `core` trỏ `dependsOnFrozen` tới X ⇒ X tồn tại
    //     và không bao giờ `removed` (Property 5 / Req 2.6).
    if (entry.scope === 'core' && entry.dependsOnFrozen) {
      for (const depId of entry.dependsOnFrozen) {
        const target = byId.get(depId);
        if (!target) {
          dependencyViolations.push({
            entryId: entry.id,
            dependsOn: depId,
            reason: 'missing',
          });
        } else if (target.scope === 'removed') {
          dependencyViolations.push({
            entryId: entry.id,
            dependsOn: depId,
            reason: 'removed',
          });
        }
      }
    }

    // (2) Phân loại rủi ro: entry có endpoint không-auth phải ghi
    //     `unauthEndpointRisk ∈ {high, medium, low}` (Property 12 / Req 7.3).
    if (hasUnauthEndpoint(entry) && !isValidUnauthRisk(entry.unauthEndpointRisk)) {
      unauthRiskViolations.push({
        entryId: entry.id,
        recordedRisk:
          entry.unauthEndpointRisk === undefined
            ? undefined
            : String(entry.unauthEndpointRisk),
      });
    }
  }

  return {
    valid:
      dependencyViolations.length === 0 && unauthRiskViolations.length === 0,
    dependencyViolations,
    unauthRiskViolations,
  };
}
