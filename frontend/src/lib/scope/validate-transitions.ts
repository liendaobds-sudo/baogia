/**
 * Validator cho các khối chuyển trạng thái của một `ScopeEntry`:
 *
 * - `scope === 'frozen'` ⇒ BẮT BUỘC có khối `reenable` đầy đủ
 *   (`trigger`, `steps` không rỗng, `expected`), và nếu là tính năng
 *   Multi_Tenant thì `reenable.perTenant` không rỗng (Req 2.4, 5.8).
 * - `scope === 'removed'` ⇒ BẮT BUỘC có khối `backup` với
 *   `codeBackupRef`, `dataBackupRef` không rỗng và `restoreVerified === true` (Req 5.7).
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md`
 * (Correctness Properties 3 & 4).
 *
 * _Requirements: 2.4, 5.7, 5.8_
 */

import type { ScopeEntry, ScopeRegistry } from './types';

/** Định danh quy ước cho tính năng Multi_Tenant trong registry. */
export const MULTI_TENANT_ID = 'multi-tenant';

/** Kết quả kiểm chứng một hoặc nhiều entry. */
export interface TransitionValidationResult {
  /** `true` khi không có vi phạm nào. */
  valid: boolean;
  /** Danh sách thông điệp vi phạm (rỗng khi `valid === true`). */
  errors: string[];
}

/** Một chuỗi được coi là "không rỗng" khi sau khi trim còn ký tự. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Một mảng chuỗi được coi là "không rỗng" khi có ít nhất một phần tử non-empty. */
function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

/**
 * Một entry có phải tính năng Multi_Tenant hay không.
 *
 * Quy ước: định danh `MULTI_TENANT_ID`. Multi_Tenant yêu cầu thêm
 * `reenable.perTenant` (các bước bật lại cho từng tenant — Req 5.8).
 */
export function isMultiTenant(entry: ScopeEntry): boolean {
  return entry.id === MULTI_TENANT_ID;
}

/**
 * Kiểm chứng một entry `frozen` có khối `reenable` đầy đủ.
 *
 * Yêu cầu: `reenable` tồn tại; `trigger` và `expected` không rỗng;
 * `steps` không rỗng; và nếu là Multi_Tenant thì `perTenant` không rỗng.
 *
 * Trả về mảng thông điệp vi phạm (rỗng nếu hợp lệ).
 *
 * _Requirements: 2.4, 5.8_
 */
export function validateReenable(entry: ScopeEntry): string[] {
  const errors: string[] = [];

  if (entry.scope !== 'frozen') {
    return errors;
  }

  const reenable = entry.reenable;
  if (!reenable) {
    errors.push(`Entry "${entry.id}": scope='frozen' nhưng thiếu khối 'reenable'.`);
    return errors;
  }

  if (!isNonEmptyString(reenable.trigger)) {
    errors.push(`Entry "${entry.id}": 'reenable.trigger' không được rỗng.`);
  }
  if (!isNonEmptyStringArray(reenable.steps)) {
    errors.push(`Entry "${entry.id}": 'reenable.steps' phải có ít nhất một bước không rỗng.`);
  }
  if (!isNonEmptyString(reenable.expected)) {
    errors.push(`Entry "${entry.id}": 'reenable.expected' không được rỗng.`);
  }

  if (isMultiTenant(entry) && !isNonEmptyStringArray(reenable.perTenant)) {
    errors.push(
      `Entry "${entry.id}": tính năng Multi_Tenant phải có 'reenable.perTenant' không rỗng.`,
    );
  }

  return errors;
}

/**
 * Kiểm chứng một entry `removed` có khối `backup` đã được kiểm chứng.
 *
 * Yêu cầu: `backup` tồn tại; `codeBackupRef` và `dataBackupRef` không rỗng;
 * `restoreVerified === true`.
 *
 * Trả về mảng thông điệp vi phạm (rỗng nếu hợp lệ).
 *
 * _Requirements: 5.7_
 */
export function validateBackup(entry: ScopeEntry): string[] {
  const errors: string[] = [];

  if (entry.scope !== 'removed') {
    return errors;
  }

  const backup = entry.backup;
  if (!backup) {
    errors.push(`Entry "${entry.id}": scope='removed' nhưng thiếu khối 'backup'.`);
    return errors;
  }

  if (!isNonEmptyString(backup.codeBackupRef)) {
    errors.push(`Entry "${entry.id}": 'backup.codeBackupRef' không được rỗng.`);
  }
  if (!isNonEmptyString(backup.dataBackupRef)) {
    errors.push(`Entry "${entry.id}": 'backup.dataBackupRef' không được rỗng.`);
  }
  if (backup.restoreVerified !== true) {
    errors.push(`Entry "${entry.id}": 'backup.restoreVerified' phải bằng true.`);
  }

  return errors;
}

/**
 * Kiểm chứng cả hai khối chuyển trạng thái (`reenable` + `backup`) cho một entry.
 *
 * _Requirements: 2.4, 5.7, 5.8_
 */
export function validateEntryTransitions(entry: ScopeEntry): TransitionValidationResult {
  const errors = [...validateReenable(entry), ...validateBackup(entry)];
  return { valid: errors.length === 0, errors };
}

/**
 * Kiểm chứng toàn bộ registry: mọi entry `frozen` có `reenable` hợp lệ và mọi
 * entry `removed` có `backup` đã kiểm chứng.
 *
 * _Requirements: 2.4, 5.7, 5.8_
 */
export function validateTransitions(registry: ScopeRegistry): TransitionValidationResult {
  const errors = registry.entries.flatMap(
    (entry) => validateEntryTransitions(entry).errors,
  );
  return { valid: errors.length === 0, errors };
}
