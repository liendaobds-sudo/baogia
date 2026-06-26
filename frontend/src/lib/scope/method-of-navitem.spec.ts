/**
 * Unit test cho `methodOfNavItem` — ánh xạ navItem → Phương_Pháp_In từ Scope Registry.
 *
 * Feature: print-method-unification (Task 4.1 — bổ sung trường `method` vào Scope
 * Registry và hàm tra cứu `methodOfNavItem`).
 *
 * _Requirements: 2.3_
 */

import { methodOfNavItem } from './ia-resolver';
import type { ScopeEntry, ScopeRegistry } from './types';

function entry(partial: Partial<ScopeEntry>): ScopeEntry {
  return {
    id: partial.id ?? 'id',
    title: partial.title ?? 'title',
    scope: partial.scope ?? 'core',
    axis: partial.axis ?? 'baogia',
    rule: partial.rule ?? '2.2',
    reason: partial.reason ?? 'reason',
    featureRef: partial.featureRef ?? 'frontend/src/app/x',
    ...partial,
  };
}

const registry: ScopeRegistry = {
  baseline: [
    { app: 'cskh', mainMenuCount: 7 },
    { app: 'baogia', mainMenuCount: 8 },
  ],
  entries: [
    entry({ id: 'offset-config', navItem: 'offset-config', method: 'offset' }),
    entry({ id: 'digital-config', navItem: 'digital-config', method: 'digital' }),
    entry({ id: 'dashboard', navItem: 'dashboard' }), // không gắn method
  ],
};

describe('methodOfNavItem — ánh xạ navItem → Phương_Pháp_In (Req 2.3)', () => {
  it('trả về method của mục nav khi mục có gắn Phương_Pháp_In', () => {
    expect(methodOfNavItem(registry, 'offset-config')).toBe('offset');
    expect(methodOfNavItem(registry, 'digital-config')).toBe('digital');
  });

  it('trả về null cho mục nav không gắn Phương_Pháp_In', () => {
    expect(methodOfNavItem(registry, 'dashboard')).toBeNull();
  });

  it('trả về null khi không tìm thấy mục nav', () => {
    expect(methodOfNavItem(registry, 'khong-ton-tai')).toBeNull();
  });

  it('an toàn với navItem rỗng/khoảng trắng và registry rỗng', () => {
    expect(methodOfNavItem(registry, '')).toBeNull();
    expect(methodOfNavItem(registry, '   ')).toBeNull();
    expect(
      methodOfNavItem({ baseline: [], entries: [] }, 'offset-config'),
    ).toBeNull();
  });
});
