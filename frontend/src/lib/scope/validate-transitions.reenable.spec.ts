/**
 * Property test — Property 3: Frozen entries luôn kèm điều kiện bật lại.
 *
 * Feature: product-rescope-cskh-quote, Property 3
 *
 * Property: với bất kỳ entry nào có `scope === 'frozen'`, kiểm chứng `reenable`
 * ĐẠT (không có lỗi) KHI VÀ CHỈ KHI entry có khối `reenable` với:
 *   - `trigger` không rỗng (sau trim),
 *   - `steps` là mảng không rỗng gồm các chuỗi không rỗng,
 *   - `expected` không rỗng (sau trim),
 *   - VÀ nếu entry là tính năng Multi_Tenant (`id === MULTI_TENANT_ID`) thì
 *     `reenable.perTenant` cũng là mảng không rỗng gồm các chuỗi không rỗng.
 *
 * Validates: Requirements 2.4, 5.8
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md` (Property 3).
 */

import fc from 'fast-check';

import {
  MULTI_TENANT_ID,
  validateReenable,
  validateEntryTransitions,
  validateTransitions,
} from './validate-transitions';
import type { ScopeEntry, ScopeRegistry } from './types';
import registryArtefact from './scope-registry.json';

const NUM_RUNS = 200; // ≥100 iteration theo yêu cầu spec

/** Chuỗi không rỗng (luôn còn ký tự non-whitespace sau khi trim). */
const nonEmptyString = fc.string({ minLength: 0, maxLength: 20 }).map((s) => `x${s}`);

/** Giá trị chuỗi "không hợp lệ" theo isNonEmptyString: rỗng/khoảng trắng/undefined. */
const invalidStringValue = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t\n  '),
  fc.constant(undefined),
);

/** Mảng steps hợp lệ: ≥1 phần tử, mọi phần tử non-empty. */
const validSteps = fc.array(nonEmptyString, { minLength: 1, maxLength: 5 });

/** Mảng steps không hợp lệ: rỗng / chứa phần tử rỗng / undefined / không phải mảng. */
const invalidSteps = fc.oneof(
  fc.constant([] as string[]),
  fc.array(nonEmptyString, { maxLength: 3 }).map((arr) => [...arr, '']),
  fc.array(nonEmptyString, { maxLength: 3 }).map((arr) => [...arr, '   ']),
  fc.constant(undefined),
);

/**
 * Sinh một entry `frozen` cùng cờ `shouldBeValid` mô tả kỳ vọng theo spec.
 *
 * Mỗi trường con của `reenable` được sinh độc lập ở dạng hợp lệ/không hợp lệ,
 * và `reenable` có thể vắng mặt hoàn toàn.
 */
const frozenEntryArb = fc
  .record({
    isMultiTenant: fc.boolean(),
    otherId: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `feat-${s}`),
    includeReenable: fc.boolean(),
    triggerValid: fc.boolean(),
    stepsValid: fc.boolean(),
    expectedValid: fc.boolean(),
    perTenantValid: fc.boolean(),
    triggerValue: nonEmptyString,
    invalidTrigger: invalidStringValue,
    expectedValue: nonEmptyString,
    invalidExpected: invalidStringValue,
    validStepsValue: validSteps,
    invalidStepsValue: invalidSteps,
    validPerTenant: fc.array(nonEmptyString, { minLength: 1, maxLength: 4 }),
    invalidPerTenant: fc.oneof(
      fc.constant(undefined),
      fc.constant([] as string[]),
      fc.array(nonEmptyString, { maxLength: 2 }).map((arr) => [...arr, '']),
    ),
  })
  .map((g) => {
    // id: Multi_Tenant dùng đúng MULTI_TENANT_ID; ngược lại dùng id khác hẳn.
    const id = g.isMultiTenant ? MULTI_TENANT_ID : g.otherId;

    const baseEntry: ScopeEntry = {
      id,
      title: 'Generated frozen entry',
      scope: 'frozen',
      axis: 'none',
      rule: '2.3',
      reason: 'reason không rỗng (không liên quan tới validateReenable)',
      featureRef: 'featureRef không rỗng',
    };

    if (!g.includeReenable) {
      // Thiếu hẳn khối reenable ⇒ không hợp lệ.
      return { entry: baseEntry, shouldBeValid: false };
    }

    const reenable: Record<string, unknown> = {
      trigger: g.triggerValid ? g.triggerValue : g.invalidTrigger,
      steps: g.stepsValid ? g.validStepsValue : g.invalidStepsValue,
      expected: g.expectedValid ? g.expectedValue : g.invalidExpected,
    };

    // Chỉ Multi_Tenant mới quan tâm perTenant; với entry khác, perTenant không
    // ảnh hưởng kết quả nên ta vẫn gắn để đảm bảo bất biến độc lập với id.
    reenable.perTenant = g.perTenantValid ? g.validPerTenant : g.invalidPerTenant;

    const entry: ScopeEntry = {
      ...baseEntry,
      // `reenable` được sinh ở dạng lỏng (Record<string, unknown>) để cố tình
      // exercise các trường hợp thiếu/không hợp lệ. Cast qua `unknown` chỉ tại
      // ranh giới gán này để thoả strict typing mà KHÔNG đổi dữ liệu test.
      reenable: reenable as unknown as ScopeEntry['reenable'],
    };

    const coreFieldsValid = g.triggerValid && g.stepsValid && g.expectedValid;
    const shouldBeValid = g.isMultiTenant
      ? coreFieldsValid && g.perTenantValid
      : coreFieldsValid;

    return { entry, shouldBeValid };
  });

describe('Feature: product-rescope-cskh-quote, Property 3: Frozen entries luôn kèm điều kiện bật lại', () => {
  it('validateReenable ĐẠT (không lỗi) KHI VÀ CHỈ KHI khối reenable đầy đủ (perTenant cho Multi_Tenant)', () => {
    fc.assert(
      fc.property(frozenEntryArb, ({ entry, shouldBeValid }) => {
        const errors = validateReenable(entry);
        const isValid = errors.length === 0;

        // IFF: hợp lệ theo validator ⇔ kỳ vọng theo spec.
        expect(isValid).toBe(shouldBeValid);

        // Khi không hợp lệ phải có ít nhất một thông điệp vi phạm.
        if (!shouldBeValid) {
          expect(errors.length).toBeGreaterThan(0);
        }

        // validateEntryTransitions phải nhất quán với validateReenable cho frozen.
        const combined = validateEntryTransitions(entry);
        expect(combined.valid).toBe(shouldBeValid);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Multi_Tenant thiếu perTenant ⇒ luôn KHÔNG ĐẠT, dù các trường khác hợp lệ', () => {
    fc.assert(
      fc.property(
        fc.record({
          trigger: nonEmptyString,
          steps: validSteps,
          expected: nonEmptyString,
        }),
        ({ trigger, steps, expected }) => {
          const entry: ScopeEntry = {
            id: MULTI_TENANT_ID,
            title: 'Multi tenant',
            scope: 'frozen',
            axis: 'none',
            rule: '2.4',
            reason: 'reason',
            featureRef: 'featureRef',
            reenable: { trigger, steps, expected }, // không có perTenant
          };
          const errors = validateReenable(entry);
          expect(errors.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Entry không-frozen không bao giờ phát sinh lỗi reenable (bất kể reenable)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'core' | 'removed'>('core', 'removed'),
        fc.boolean(),
        (scope, includeReenable) => {
          const entry: ScopeEntry = {
            id: 'x',
            title: 'x',
            scope,
            axis: 'none',
            rule: '2.2',
            reason: 'r',
            featureRef: 'f',
            ...(includeReenable
              ? { reenable: { trigger: 'x', steps: ['s'], expected: 'e' } }
              : {}),
          };
          expect(validateReenable(entry)).toEqual([]);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Feature: product-rescope-cskh-quote, Property 3 — artefact thực tế', () => {
  it('mọi entry frozen trong scope-registry.json đều có khối reenable hợp lệ', () => {
    const registry = registryArtefact as unknown as ScopeRegistry;
    const frozenEntries = registry.entries.filter((e) => e.scope === 'frozen');

    // Phải có ít nhất một entry frozen để khẳng định có ý nghĩa.
    expect(frozenEntries.length).toBeGreaterThan(0);

    for (const entry of frozenEntries) {
      expect(validateReenable(entry)).toEqual([]);
    }

    // Toàn bộ registry cũng phải đạt validateTransitions.
    expect(validateTransitions(registry).valid).toBe(true);
  });
});
