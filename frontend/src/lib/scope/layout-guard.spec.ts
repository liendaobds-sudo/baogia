/**
 * Unit test cấp layout cho route guard đóng băng (Req 4.6).
 *
 * Test này nạp artefact THẬT `scope-registry.json` thông qua loader runtime
 * `./registry` (cùng bản dữ liệu mà `FrozenRouteGuard` dùng ở layout của hai app)
 * và khoá hành vi của `isFrozenRoute(registry, path)`:
 *
 * - Trả `false` cho MỌI route Lõi của cả hai app (App_CSKH + App_BaoGia): guard
 *   cấp layout KHÔNG được chặn các bề mặt Lõi.
 * - Trả `true` cho các route đóng băng tiêu biểu (Super Admin + 5 trang Cài đặt ẩn).
 * - Xác nhận phân biệt `/settings` (landing Lõi) ≠ `/settings/api-keys` (đóng băng).
 *
 * Validates: Requirements 4.6
 */

import { scopeRegistry } from './registry';
import { isFrozenRoute } from './ia-resolver';

/**
 * Route Lõi của cả hai app — guard cấp layout KHÔNG được chặn.
 * Gồm các bề mặt App_BaoGia (`/pricing*`) và App_CSKH (`/inbox`, `/contacts`, ...).
 */
const CORE_ROUTES = [
  // App_BaoGia
  '/pricing',
  '/pricing/quotes',
  '/pricing/quotes/new',
  '/pricing/quotes/offset',
  '/pricing/orders',
  '/pricing/products',
  '/pricing/materials',
  '/pricing/customers',
  // App_CSKH
  '/inbox',
  '/contacts',
  '/ai',
  '/dashboard',
  '/reports',
  '/settings',
  '/test-chat',
  '/profile',
  // Super Admin — bật lại thành Lõi để quản lý multi-tenant (unfreeze, xem scope-registry.json).
  '/super-admin',
] as const;

/** Route đóng băng tiêu biểu — guard cấp layout PHẢI chặn. */
const FROZEN_ROUTES = [
  '/settings/api-keys',
  '/settings/ai-quote',
  '/settings/api-docs',
  '/settings/webhooks',
  '/settings/product-configs',
] as const;

describe('Guard cấp layout — artefact thật scope-registry.json (Req 4.6)', () => {
  it.each(CORE_ROUTES)('KHÔNG chặn route Lõi %s', (path) => {
    expect(isFrozenRoute(scopeRegistry, path)).toBe(false);
  });

  it.each(FROZEN_ROUTES)('CHẶN route đóng băng %s', (path) => {
    expect(isFrozenRoute(scopeRegistry, path)).toBe(true);
  });

  it('phân biệt /settings (landing Lõi) với /settings/api-keys (đóng băng)', () => {
    // Trang Cài đặt landing là Tính_Năng_Lõi → không bị chặn.
    expect(isFrozenRoute(scopeRegistry, '/settings')).toBe(false);
    // Trang con nâng cao đang đóng băng → bị chặn.
    expect(isFrozenRoute(scopeRegistry, '/settings/api-keys')).toBe(true);
  });
});
