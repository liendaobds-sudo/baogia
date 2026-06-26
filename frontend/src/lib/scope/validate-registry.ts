/**
 * Validator well-formedness của Đăng_Ký_Phạm_Vi (Scope Registry).
 *
 * Kiểm các bất biến cấu trúc của registry:
 * - mỗi entry có `scope` thuộc đúng MỘT trong ba nhóm `{core, frozen, removed}`;
 * - mọi `id` là duy nhất (không entry nào bị bỏ sót hoặc gán nhiều hơn một nhóm);
 * - mỗi entry có `rule`, `reason`, `featureRef` không rỗng.
 *
 * Đây là phần hiện thực hoá Property 1 (Registry well-formedness).
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md`
 *
 * _Requirements: 2.1, 2.5_
 */

import type { ScopeClass, ScopeEntry, ScopeRegistry } from './types';

/** Tập hợp các giá trị `scope` hợp lệ — đúng ba nhóm phân loại (Req 2.1). */
export const VALID_SCOPES: readonly ScopeClass[] = ['core', 'frozen', 'removed'];

/** Loại vi phạm well-formedness có thể phát hiện. */
export type RegistryViolationKind =
  | 'invalid-scope'
  | 'duplicate-id'
  | 'empty-id'
  | 'empty-rule'
  | 'empty-reason'
  | 'empty-feature-ref';

/** Một vi phạm well-formedness cụ thể trên một entry. */
export interface RegistryViolation {
  /** Loại vi phạm. */
  kind: RegistryViolationKind;
  /** `id` của entry vi phạm (nếu xác định được). */
  entryId: string;
  /** Chỉ số entry trong mảng `entries`. */
  index: number;
  /** Mô tả người đọc. */
  message: string;
}

/** Kết quả kiểm chứng well-formedness. */
export interface RegistryValidationResult {
  /** Registry hợp lệ khi và chỉ khi không có vi phạm nào. */
  valid: boolean;
  /** Danh sách đầy đủ các vi phạm phát hiện được. */
  violations: RegistryViolation[];
}

/** Một chuỗi được coi là "không rỗng" khi sau khi bỏ khoảng trắng vẫn còn ký tự. */
function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** `scope` hợp lệ khi thuộc đúng một trong ba nhóm. */
function isValidScope(scope: unknown): scope is ScopeClass {
  return typeof scope === 'string' && (VALID_SCOPES as readonly string[]).includes(scope);
}

/**
 * Kiểm chứng well-formedness của một Scope Registry.
 *
 * Hàm thuần (pure): không gây hiệu ứng phụ, không ném lỗi cho input bất kỳ; mọi vấn đề
 * được trả về dưới dạng danh sách `violations` để gọi bên ngoài xử lý.
 *
 * @param registry Đăng_Ký_Phạm_Vi cần kiểm.
 * @returns Kết quả gồm cờ `valid` và danh sách vi phạm.
 *
 * _Requirements: 2.1, 2.5_
 */
export function validateRegistryWellFormedness(
  registry: ScopeRegistry,
): RegistryValidationResult {
  const violations: RegistryViolation[] = [];
  const entries: ScopeEntry[] = registry?.entries ?? [];

  // Theo dõi các `id` đã gặp để phát hiện trùng lặp (Req 2.1).
  const seenIds = new Map<string, number>();

  entries.forEach((entry, index) => {
    const entryId = isNonEmpty(entry?.id) ? entry.id : '';

    // 1. `id` không rỗng và duy nhất (Req 2.1).
    if (!isNonEmpty(entry?.id)) {
      violations.push({
        kind: 'empty-id',
        entryId: '',
        index,
        message: `Entry tại vị trí ${index} có \`id\` rỗng.`,
      });
    } else if (seenIds.has(entry.id)) {
      violations.push({
        kind: 'duplicate-id',
        entryId: entry.id,
        index,
        message: `\`id\` "${entry.id}" trùng lặp (đã xuất hiện ở vị trí ${seenIds.get(
          entry.id,
        )}).`,
      });
    } else {
      seenIds.set(entry.id, index);
    }

    // 2. `scope` thuộc đúng một trong ba nhóm (Req 2.1).
    if (!isValidScope(entry?.scope)) {
      violations.push({
        kind: 'invalid-scope',
        entryId,
        index,
        message: `Entry "${entryId || index}" có \`scope\` không hợp lệ: ${JSON.stringify(
          entry?.scope,
        )}. Phải thuộc {core, frozen, removed}.`,
      });
    }

    // 3. `rule`, `reason`, `featureRef` không rỗng (Req 2.5).
    if (!isNonEmpty(entry?.rule)) {
      violations.push({
        kind: 'empty-rule',
        entryId,
        index,
        message: `Entry "${entryId || index}" có \`rule\` rỗng.`,
      });
    }
    if (!isNonEmpty(entry?.reason)) {
      violations.push({
        kind: 'empty-reason',
        entryId,
        index,
        message: `Entry "${entryId || index}" có \`reason\` rỗng.`,
      });
    }
    if (!isNonEmpty(entry?.featureRef)) {
      violations.push({
        kind: 'empty-feature-ref',
        entryId,
        index,
        message: `Entry "${entryId || index}" có \`featureRef\` rỗng.`,
      });
    }
  });

  return { valid: violations.length === 0, violations };
}
