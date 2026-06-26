/**
 * Property test cho `validateBackup` — sao lưu đã kiểm chứng của entry `removed`.
 *
 * Property 4: Removed entries luôn kèm sao lưu đã kiểm chứng.
 *   Với mọi entry có `scope === 'removed'`, kiểm chứng PASS KHI VÀ CHỈ KHI entry
 *   có khối `backup` với `codeBackupRef` không rỗng, `dataBackupRef` không rỗng
 *   và `restoreVerified === true`.
 *
 * Framework: fast-check v3 (≥100 runs).
 *
 * **Validates: Requirements 5.7**
 */

import fc from 'fast-check';
import { validateBackup } from './validate-transitions';
import type { BackupRecord, ScopeEntry } from './types';
import registry from './scope-registry.json';

/**
 * Tham chiếu định nghĩa "non-empty string" trùng với validator: một chuỗi chỉ
 * "không rỗng" khi sau khi trim còn ký tự. Dùng cho oracle độc lập.
 */
function isNonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Sinh chuỗi có thể "rỗng theo nghĩa validator": chuỗi rỗng, chỉ khoảng trắng,
 * hoặc chuỗi thật có nội dung. Bao trùm cả ranh giới trim.
 */
const stringMaybeEmpty = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t\n'),
  fc.string({ minLength: 1, maxLength: 40 }),
);

/**
 * Sinh khối `backup` đầy đủ/khuyết với `restoreVerified` true/false và các ref
 * có thể rỗng — để bao trùm mọi tổ hợp quyết định validity.
 */
const backupArb: fc.Arbitrary<BackupRecord> = fc.record({
  codeBackupRef: stringMaybeEmpty,
  dataBackupRef: stringMaybeEmpty,
  restoreVerified: fc.boolean(),
});

/** Sinh một entry `removed` với backup có hoặc không (undefined). */
const removedEntryArb: fc.Arbitrary<ScopeEntry> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 12 }),
    backup: fc.option(backupArb, { nil: undefined }),
  })
  .map(({ id, backup }) => ({
    id: id.trim().length > 0 ? id : 'entry',
    title: 'generated removed entry',
    scope: 'removed' as const,
    axis: 'none' as const,
    rule: '2.3' as const,
    reason: 'generated for property test',
    featureRef: 'generated/featureRef',
    ...(backup ? { backup } : {}),
  }));

/** Oracle độc lập: backup hợp lệ khi đủ ba điều kiện. */
function expectedValid(entry: ScopeEntry): boolean {
  const b = entry.backup;
  return (
    !!b &&
    isNonEmpty(b.codeBackupRef) &&
    isNonEmpty(b.dataBackupRef) &&
    b.restoreVerified === true
  );
}

describe('Feature: product-rescope-cskh-quote, Property 4 — Removed entries luôn kèm sao lưu đã kiểm chứng', () => {
  it('validateBackup PASS iff backup đầy đủ (codeBackupRef + dataBackupRef không rỗng & restoreVerified=true)', () => {
    fc.assert(
      fc.property(removedEntryArb, (entry) => {
        const errors = validateBackup(entry);
        const passes = errors.length === 0;
        expect(passes).toBe(expectedValid(entry));
      }),
      { numRuns: 200 },
    );
  });

  it('báo lỗi đúng khi thiếu backup, ref rỗng, hoặc restoreVerified=false', () => {
    // Thiếu hẳn backup
    expect(
      validateBackup({
        id: 'no-backup',
        title: 't',
        scope: 'removed',
        axis: 'none',
        rule: '2.3',
        reason: 'r',
        featureRef: 'f',
      }).length,
    ).toBeGreaterThan(0);

    // restoreVerified=false dù ref đầy đủ
    expect(
      validateBackup({
        id: 'unverified',
        title: 't',
        scope: 'removed',
        axis: 'none',
        rule: '2.3',
        reason: 'r',
        featureRef: 'f',
        backup: { codeBackupRef: 'commit-abc', dataBackupRef: 'dump-1', restoreVerified: false },
      }).length,
    ).toBeGreaterThan(0);

    // Backup hợp lệ đầy đủ → không lỗi
    expect(
      validateBackup({
        id: 'ok',
        title: 't',
        scope: 'removed',
        axis: 'none',
        rule: '2.3',
        reason: 'r',
        featureRef: 'f',
        backup: { codeBackupRef: 'commit-abc', dataBackupRef: 'dump-1', restoreVerified: true },
      }),
    ).toEqual([]);
  });

  it('artefact thực: mọi entry removed trong scope-registry.json đều có sao lưu đã kiểm chứng', () => {
    const removed = (registry.entries as ScopeEntry[]).filter((e) => e.scope === 'removed');
    // Phải tồn tại ít nhất một entry removed để khẳng định có ý nghĩa.
    expect(removed.length).toBeGreaterThan(0);
    for (const entry of removed) {
      expect(validateBackup(entry)).toEqual([]);
    }
  });
});
