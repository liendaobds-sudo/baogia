/**
 * Property test — Property 7: Mọi bước rút gọn đều hoàn tác được (round-trip).
 *
 * Feature: product-rescope-cskh-quote, Property 7
 *
 * Property: với bất kỳ registry nào và bất kỳ bước rút gọn khả nghịch hợp lệ nào
 * (freeze, unfreeze, remove, restore) — trong đó `action` khớp với trạng thái hiện
 * tại của entry mục tiêu và mang theo đủ payload (`reenable`/`backup`) cần thiết —
 * việc áp dụng rồi hoàn tác bước đó trả về registry TƯƠNG ĐƯƠNG SÂU trạng thái
 * ban đầu:
 *
 *     undo(step, apply(step, registry)) ≡ registry
 *
 * Trường hợp đặc biệt (Req 5.4): `unfreeze(freeze(entry))` khôi phục entry về
 * `core` mà không cần khôi phục dữ liệu từ sao lưu ngoài — toàn bộ thông tin hoàn
 * tác nằm trong chính `step`.
 *
 * Validates: Requirements 5.4, 7.5
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md` (Property 7).
 */

import fc from 'fast-check';

import { ACTION_TRANSITIONS, apply, undo } from './lifecycle';
import type { LifecycleAction, LifecycleStep } from './lifecycle';
import type {
  Axis,
  BackupRecord,
  BaselineEntry,
  ClassificationRule,
  ReenablePlan,
  ScopeClass,
  ScopeEntry,
  ScopeRegistry,
} from './types';

const NUM_RUNS = 200; // ≥100 iteration theo yêu cầu spec

/** Chuỗi không rỗng (luôn còn ký tự non-whitespace). */
const nonEmptyString = fc.string({ maxLength: 16 }).map((s) => `x${s}`);

const axisArb = fc.constantFrom<Axis>('cskh', 'baogia', 'shared', 'none');
const ruleArb = fc.constantFrom<ClassificationRule>('2.2', '2.3', '2.4');
const actionArb = fc.constantFrom<LifecycleAction>('freeze', 'unfreeze', 'remove', 'restore');

/** Khối `reenable` đầy đủ — gắn với trạng thái `frozen`. */
const reenableArb: fc.Arbitrary<ReenablePlan> = fc.record({
  trigger: nonEmptyString,
  steps: fc.array(nonEmptyString, { minLength: 1, maxLength: 4 }),
  expected: nonEmptyString,
  perTenant: fc.option(fc.array(nonEmptyString, { minLength: 1, maxLength: 3 }), {
    nil: undefined,
  }),
});

/** Bản `backup` đã kiểm chứng — gắn với trạng thái `removed`. */
const backupArb: fc.Arbitrary<BackupRecord> = fc.record({
  codeBackupRef: nonEmptyString,
  dataBackupRef: nonEmptyString,
  restoreVerified: fc.constant(true),
});

/** Các trường nền của một entry, không gồm `scope` và payload có điều kiện. */
const baseFieldsArb = fc.record({
  title: nonEmptyString,
  axis: axisArb,
  rule: ruleArb,
  reason: nonEmptyString,
  featureRef: nonEmptyString,
  navItem: fc.option(nonEmptyString, { nil: undefined }),
});

/** Baseline tuỳ ý cho registry — phải được bảo toàn qua apply/undo. */
const baselineArb = fc.array(
  fc.record({
    app: fc.constantFrom<BaselineEntry['app']>('cskh', 'baogia'),
    mainMenuCount: fc.nat({ max: 50 }),
  }),
  { maxLength: 2 },
);

/**
 * Các entry "khác" không bị bước rút gọn chạm tới. Chúng phải giữ nguyên hoàn
 * toàn sau apply/undo, nên đa dạng scope mà không cần payload hợp lệ.
 */
const otherEntriesArb = fc
  .array(
    fc.record({
      title: nonEmptyString,
      scope: fc.constantFrom<ScopeClass>('core', 'frozen', 'removed'),
      axis: axisArb,
      rule: ruleArb,
      reason: nonEmptyString,
      featureRef: nonEmptyString,
    }),
    { maxLength: 5 },
  )
  .map((arr) => arr.map((e, i): ScopeEntry => ({ id: `other-${i}`, ...e })));

/**
 * Sinh một kịch bản { registry, step, action } sao cho `step` là một bước rút
 * gọn HỢP LỆ trên entry mục tiêu:
 *  - entry mục tiêu khởi đầu ở đúng `from` của hành động;
 *  - khi `from === 'frozen'`, entry mang `reenable` và `step.reenable` KHỚP entry
 *    (để chiều hoàn tác freeze tái lập đúng khối reenable);
 *  - khi `from === 'removed'`, entry mang `backup` và `step.backup` KHỚP entry
 *    (để chiều hoàn tác remove tái lập đúng khối backup);
 *  - `step` luôn mang đủ payload mà chiều áp dụng cần.
 */
const scenarioArb = fc
  .record({
    action: actionArb,
    targetSuffix: nonEmptyString,
    base: baseFieldsArb,
    reenable: reenableArb,
    backup: backupArb,
    others: otherEntriesArb,
    baseline: baselineArb,
    position: fc.nat(),
  })
  .map(({ action, targetSuffix, base, reenable, backup, others, baseline, position }) => {
    const from = ACTION_TRANSITIONS[action].from;
    const targetId = `target-${targetSuffix}`;

    // Loại bỏ các trường undefined (navItem) để toEqual không bị nhiễu.
    const cleanBase: Partial<ScopeEntry> = { ...base };
    if (cleanBase.navItem === undefined) delete cleanBase.navItem;

    let target: ScopeEntry;
    let step: LifecycleStep;

    if (from === 'frozen') {
      // unfreeze / remove: entry đang frozen, có reenable; step mang reenable KHỚP
      // (và backup để phục vụ chiều remove → removed).
      target = { ...(cleanBase as ScopeEntry), id: targetId, scope: 'frozen', reenable };
      step = { action, targetId, reenable, backup };
    } else if (from === 'removed') {
      // restore: entry đang removed, có backup; step mang backup KHỚP (và reenable
      // để phục vụ chiều restore → frozen).
      target = { ...(cleanBase as ScopeEntry), id: targetId, scope: 'removed', backup };
      step = { action, targetId, reenable, backup };
    } else {
      // freeze: entry đang core, không payload; step mang reenable cho chiều
      // freeze → frozen.
      target = { ...(cleanBase as ScopeEntry), id: targetId, scope: 'core' };
      step = { action, targetId, reenable, backup };
    }

    // Chèn target vào giữa các entry khác ở một vị trí bất kỳ.
    const entries = [...others];
    const pos = position % (entries.length + 1);
    entries.splice(pos, 0, target);

    const registry: ScopeRegistry = { baseline, entries };
    return { registry, step, action };
  });

describe('Feature: product-rescope-cskh-quote, Property 7: Mọi bước rút gọn đều hoàn tác được (round-trip)', () => {
  it('undo(step, apply(step, registry)) tương đương sâu với registry cho cả 4 hành động', () => {
    fc.assert(
      fc.property(scenarioArb, ({ registry, step }) => {
        // Bản sao sâu để chứng minh registry gốc không bị đột biến.
        const original = JSON.parse(JSON.stringify(registry)) as ScopeRegistry;

        const applied = apply(step, registry);
        const roundTripped = undo(step, applied);

        // Round-trip phải khôi phục đúng registry ban đầu.
        expect(roundTripped).toEqual(original);

        // apply/undo không được đột biến registry đầu vào.
        expect(registry).toEqual(original);

        // Bước áp dụng phải thật sự thay đổi trạng thái entry mục tiêu
        // (không phải no-op), nên registry sau apply phải khác registry gốc.
        expect(applied).not.toEqual(original);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('unfreeze(freeze(entry)) đưa entry mục tiêu về core (Req 5.4)', () => {
    const freezeScenario = scenarioArb.filter((s) => s.action === 'freeze');

    fc.assert(
      fc.property(freezeScenario, ({ registry, step }) => {
        // undo của một bước freeze chính là unfreeze ⇒ unfreeze(freeze(...)).
        const result = undo(step, apply(step, registry));

        const targetAfter = result.entries.find((e) => e.id === step.targetId);
        expect(targetAfter).toBeDefined();
        expect(targetAfter?.scope).toBe('core');
        // Không cần payload sao lưu/bật lại khi trở về core.
        expect(targetAfter?.reenable).toBeUndefined();
        expect(targetAfter?.backup).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
