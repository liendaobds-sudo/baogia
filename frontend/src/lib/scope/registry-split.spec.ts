/**
 * Tests kiểm registry vẫn well-formed / IA đúng SAU KHI tách
 * `quote-order-lifecycle` → `quotes` + `orders` (Task 11.9).
 *
 * Feature: product-rescope-cskh-quote
 * Validates: Requirements 2.2, 4.4, 4.7, 8.1
 *
 * Mục tiêu: chạy lại các bất biến lõi trên ARTEFACT THẬT
 * `frontend/src/lib/scope/scope-registry.json` sau bước tách, xác nhận:
 *  - Property 1 (well-formedness) vẫn giữ (ids duy nhất, gồm cả `quotes`/`orders`);
 *  - không còn entry `quote-order-lifecycle`; có entry core/baogia `quotes` và `orders`;
 *  - resolveMenu(registry, 'baogia') chứa CẢ HAI mục `quotes` và `orders`, chỉ gồm core (Property 8);
 *  - validateDependencies không vi phạm; validateTransitions hợp lệ;
 *  - số mục menu 'baogia' vẫn ≤ baseline.mainMenuCount của 'baogia' (Property 9).
 */

import fc from 'fast-check';
import scopeRegistryArtefact from './scope-registry.json';
import { validateRegistryWellFormedness } from './validate-registry';
import { validateDependencies } from './validate-dependencies';
import { validateTransitions } from './validate-transitions';
import { resolveMenu, axisMatchesApp } from './ia-resolver';
import { scopeRegistry } from './registry';
import type { ScopeEntry, ScopeRegistry } from './types';

const registry = scopeRegistryArtefact as unknown as ScopeRegistry;

function entryById(reg: ScopeRegistry, id: string): ScopeEntry | undefined {
  return reg.entries.find((e) => e.id === id);
}

describe('Registry sau khi tách quotes/orders — well-formedness (Property 1)', () => {
  it('validateRegistryWellFormedness(registry).valid === true (không vi phạm)', () => {
    const result = validateRegistryWellFormedness(registry);
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('mọi id là duy nhất, bao gồm cả `quotes` và `orders` mới', () => {
    const ids = registry.entries.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    expect(unique.has('quotes')).toBe(true);
    expect(unique.has('orders')).toBe(true);
  });

  it('module runtime ./registry.ts cũng trỏ tới cùng artefact well-formed', () => {
    expect(validateRegistryWellFormedness(scopeRegistry).valid).toBe(true);
  });
});

describe('Registry sau khi tách — cấu trúc entry quotes/orders (Req 2.2, 8.1)', () => {
  it('KHÔNG còn entry id `quote-order-lifecycle`', () => {
    expect(entryById(registry, 'quote-order-lifecycle')).toBeUndefined();
  });

  it('có entry core/baogia `quotes` với navItem `quotes` tham chiếu /erp/orders', () => {
    const quotes = entryById(registry, 'quotes');
    expect(quotes).toBeDefined();
    expect(quotes!.scope).toBe('core');
    expect(quotes!.axis).toBe('baogia');
    expect(quotes!.rule).toBe('2.2');
    expect(quotes!.navItem).toBe('quotes');
    expect(quotes!.backendRoutes).toContain('/erp/orders');
  });

  it('có entry core/baogia `orders` với navItem `orders` tham chiếu /erp/orders', () => {
    const orders = entryById(registry, 'orders');
    expect(orders).toBeDefined();
    expect(orders!.scope).toBe('core');
    expect(orders!.axis).toBe('baogia');
    expect(orders!.rule).toBe('2.2');
    expect(orders!.navItem).toBe('orders');
    expect(orders!.backendRoutes).toContain('/erp/orders');
  });

  it('hai entry cùng featureRef-pattern tham chiếu chung backend `/erp/orders`', () => {
    const quotes = entryById(registry, 'quotes')!;
    const orders = entryById(registry, 'orders')!;
    expect(quotes.backendRoutes).toEqual(orders.backendRoutes);
  });
});

describe('IA soundness sau khi tách — resolveMenu (Property 8, Req 4.4, 4.7)', () => {
  const menu = resolveMenu(registry, 'baogia');

  it('chứa CẢ HAI mục navItem `quotes` và `orders`', () => {
    const navItems = menu.map((m) => m.navItem);
    expect(navItems).toContain('quotes');
    expect(navItems).toContain('orders');
  });

  it('mục `quotes` trỏ href /quotes (suy từ navItem mặc định)', () => {
    const quotes = menu.find((m) => m.navItem === 'quotes');
    expect(quotes).toBeDefined();
    expect(quotes!.href).toBe('/quotes');
    expect(quotes!.axis).toBe('baogia');
  });

  it('mục `orders` trỏ href /orders (suy từ navItem mặc định)', () => {
    const orders = menu.find((m) => m.navItem === 'orders');
    expect(orders).toBeDefined();
    expect(orders!.href).toBe('/orders');
    expect(orders!.axis).toBe('baogia');
  });

  it('hỗ trợ ánh xạ href tuỳ biến (/pricing/quotes, /pricing/orders)', () => {
    const mapped = resolveMenu(registry, 'baogia', {
      hrefFor: (e) => `/pricing/${e.navItem}`,
    });
    const quotes = mapped.find((m) => m.navItem === 'quotes');
    const orders = mapped.find((m) => m.navItem === 'orders');
    expect(quotes!.href).toBe('/pricing/quotes');
    expect(orders!.href).toBe('/pricing/orders');
  });

  it('menu chỉ chứa entry core đúng trục — không lọt frozen/removed (Property 8)', () => {
    for (const item of menu) {
      const source = registry.entries.find(
        (e) => e.navItem === item.navItem && e.axis === item.axis,
      );
      expect(source).toBeDefined();
      expect(source!.scope).toBe('core');
      expect(axisMatchesApp(source!.axis, 'baogia')).toBe(true);
    }
    // Không entry frozen/removed nào mang navItem trùng với mục đang hiển thị.
    const shown = new Set(menu.map((m) => m.navItem));
    for (const entry of registry.entries) {
      if (entry.scope !== 'core' && entry.navItem) {
        expect(shown.has(entry.navItem)).toBe(false);
      }
    }
  });
});

describe('Phụ thuộc & chuyển trạng thái vẫn hợp lệ sau khi tách', () => {
  it('validateDependencies(registry) không có vi phạm', () => {
    const result = validateDependencies(registry);
    expect(result.dependencyViolations).toEqual([]);
    expect(result.unauthRiskViolations).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('validateTransitions(registry).valid === true', () => {
    const result = validateTransitions(registry);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});

describe('Menu shrink sau khi tách — Property 9 (Req 1.5)', () => {
  it('số mục resolveMenu(baogia) ≤ baseline.mainMenuCount của baogia', () => {
    const baseline = registry.baseline.find((b) => b.app === 'baogia');
    expect(baseline).toBeDefined();
    const menu = resolveMenu(registry, 'baogia');
    expect(menu.length).toBeLessThanOrEqual(baseline!.mainMenuCount);
    // Sau tách vẫn còn nghiêm ngặt nhỏ hơn baseline (nhiều mục ERP đã frozen).
    expect(menu.length).toBeLessThan(baseline!.mainMenuCount);
  });

  it('property: với mọi app, resolveMenu chỉ trả entry core đúng trục và ≤ baseline', () => {
    fc.assert(
      fc.property(fc.constantFrom('cskh' as const, 'baogia' as const), (app) => {
        const menu = resolveMenu(registry, app);
        const baseline = registry.baseline.find((b) => b.app === app)!;
        expect(menu.length).toBeLessThanOrEqual(baseline.mainMenuCount);
        for (const item of menu) {
          const source = registry.entries.find(
            (e) => e.navItem === item.navItem && e.axis === item.axis,
          );
          expect(source!.scope).toBe('core');
          expect(axisMatchesApp(source!.axis, app)).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });
});
