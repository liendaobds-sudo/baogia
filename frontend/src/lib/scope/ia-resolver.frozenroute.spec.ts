/**
 * Unit test cho route guard `isFrozenRoute` sử dụng artefact THẬT
 * `scope-registry.json` (Req 4.6).
 *
 * Bối cảnh: 5 trang Cài đặt đóng băng (settings-ai-quote, settings-api-keys,
 * settings-api-docs, settings-webhooks, settings-product-configs) cùng Super Admin
 * KHÔNG có `navItem`, nên route frozen của chúng chỉ suy ra được từ `featureRef`
 * dạng Next.js route-group, ví dụ `frontend/src/app/(app)/settings/api-keys/`.
 *
 * Test này khoá hành vi: `isFrozenRoute` phải trả `true` cho các route đóng băng đó
 * (route guard bảo vệ chúng) và `false` cho các route Lõi (Inbox, Contacts, Quotes,
 * Pricing-create...).
 *
 * Validates: Requirements 4.6
 */

import fc from 'fast-check';
import scopeRegistryArtefact from './scope-registry.json';
import { isFrozenRoute } from './ia-resolver';
import type { ScopeRegistry } from './types';

const registry = scopeRegistryArtefact as unknown as ScopeRegistry;

/** Các route đóng băng suy ra từ `featureRef` route-group (không có navItem). */
const FROZEN_ROUTES = [
  '/settings/api-keys',
  '/settings/ai-quote',
  '/settings/api-docs',
  '/settings/webhooks',
  '/settings/product-configs',
  '/super-admin',
] as const;

/** Các route thuộc Tính_Năng_Lõi — guard KHÔNG được chặn. */
const CORE_ROUTES = ['/inbox', '/contacts', '/quotes', '/pricing-create'] as const;

describe('isFrozenRoute — artefact thật scope-registry.json (Req 4.6)', () => {
  it.each(FROZEN_ROUTES)(
    'trả true cho route đóng băng %s (route-group featureRef không có navItem)',
    (path) => {
      expect(isFrozenRoute(registry, path)).toBe(true);
    },
  );

  it.each(CORE_ROUTES)('trả false cho route Lõi %s', (path) => {
    expect(isFrozenRoute(registry, path)).toBe(false);
  });

  it('khớp cả route con của một tính năng đóng băng', () => {
    expect(isFrozenRoute(registry, '/settings/api-keys/new')).toBe(true);
    expect(isFrozenRoute(registry, '/super-admin/tenants')).toBe(true);
  });

  it('an toàn với input rỗng / không hợp lệ', () => {
    expect(isFrozenRoute(registry, '')).toBe(false);
    expect(isFrozenRoute(registry, '   ')).toBe(false);
  });

  // Property nhẹ: với mọi route Lõi nối thêm hậu tố con, guard vẫn KHÔNG chặn.
  it('property: route con của bất kỳ route Lõi nào đều không bị coi là frozen', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CORE_ROUTES),
        fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.replace(/\s/g, '')),
        (coreRoute, suffix) => {
          const sub = suffix.length > 0 ? `${coreRoute}/${suffix}` : coreRoute;
          expect(isFrozenRoute(registry, sub)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
