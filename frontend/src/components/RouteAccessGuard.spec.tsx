/**
 * Unit test cho RouteAccessGuard (task 6.7) — guard RBAC THỰC THI.
 *
 * RouteAccessGuard nay dùng `usePermissions()` + `canAccess` để quyết định hiển thị.
 * Ta mock `@/lib/auth-context` để điều khiển danh sách quyền (permissions) trả về,
 * nhờ đó kiểm thử hành vi guard mà không cần dựng AuthProvider/network.
 *
 * Kiểm:
 *  1. Có requiredCapability + người dùng CÓ quyền ⇒ render children.
 *  2. Có requiredCapability + người dùng THIẾU quyền ⇒ render thông báo
 *     "Không đủ quyền truy cập", KHÔNG render children (không ném lỗi).
 *  3. KHÔNG có requiredCapability ⇒ permissive, luôn render children.
 *  4. Chuẩn hoá delimiter: permissions ['order.view'] + requiredCapability 'order:view'
 *     (dạng ':') ⇒ được phép (guard tự normalize ':' → '.').
 *  5. Compose FrozenRouteGuard (ngoài) → RouteAccessGuard (trong):
 *     - route KHÔNG frozen + đủ quyền ⇒ render children.
 *     - route frozen ⇒ hiển thị thông báo đóng băng, KHÔNG render children.
 *
 * _Requirements: 5.4, 5.5, 5.8_
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import { RouteAccessGuard } from './RouteAccessGuard';
import {
  FrozenRouteGuard,
  FROZEN_FEATURE_MESSAGE,
} from './FrozenRouteGuard';
import type { ScopeRegistry } from '@/lib/scope/types';

// usePathname luôn được gọi (Rules of Hooks); các test luôn truyền pathname tường
// minh nên giá trị mock không ảnh hưởng kết quả.
jest.mock('next/navigation', () => ({
  usePathname: () => null,
}));

// Mock auth-context để điều khiển permissions mà guard nhìn thấy. Dùng cùng lõi
// `canAccess`/`normalizeCapability` thật để hasPermission phản chiếu hành vi guard.
let mockPermissions: string[] = [];
jest.mock('@/lib/auth-context', () => {
  const { canAccess, normalizeCapability } = jest.requireActual(
    '@/lib/access-decision',
  );
  return {
    usePermissions: () => ({
      permissions: mockPermissions,
      hasPermission: (cap: string) =>
        canAccess(mockPermissions, [normalizeCapability(cap)]),
    }),
  };
});

const PROTECTED_TEXT = 'Nội dung được bảo vệ';
const DENIED_TEXT = 'Không đủ quyền truy cập';

function Protected() {
  return <div data-testid="protected-children">{PROTECTED_TEXT}</div>;
}

/** Registry tối thiểu: một entry frozen (super-admin) + một entry core (orders). */
const registry: ScopeRegistry = {
  baseline: [
    { app: 'cskh', mainMenuCount: 5 },
    { app: 'baogia', mainMenuCount: 4 },
  ],
  entries: [
    {
      id: 'super-admin',
      title: 'Super Admin',
      scope: 'frozen',
      axis: 'none',
      rule: '2.4',
      reason: 'SaaS super-admin — đóng băng theo Req 2.4',
      featureRef: 'frontend/src/app/settings/api-keys/page.tsx',
      navItem: 'super-admin',
      reenable: {
        trigger: 'Khi mở lại mô hình SaaS',
        steps: ['Bật route', 'Khôi phục menu'],
        expected: 'Super admin truy cập được',
      },
    },
    {
      id: 'orders',
      title: 'Đơn hàng',
      scope: 'core',
      axis: 'baogia',
      rule: '2.2',
      reason: 'Bề mặt Lõi Báo giá',
      featureRef: 'frontend/src/app/pricing/orders/page.tsx',
      navItem: 'orders',
    },
  ],
};

beforeEach(() => {
  mockPermissions = [];
});

describe('RouteAccessGuard — thực thi theo quyền', () => {
  it('render children khi có requiredCapability và người dùng CÓ quyền', () => {
    mockPermissions = ['order.view'];
    render(
      <RouteAccessGuard requiredCapability="order.view">
        <Protected />
      </RouteAccessGuard>,
    );

    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
    expect(screen.queryByText(DENIED_TEXT)).not.toBeInTheDocument();
  });

  it('render thông báo từ chối, KHÔNG render children khi THIẾU quyền', () => {
    mockPermissions = ['quote.view']; // không có order.view
    render(
      <RouteAccessGuard requiredCapability="order.view">
        <Protected />
      </RouteAccessGuard>,
    );

    expect(screen.getByText(DENIED_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-children')).not.toBeInTheDocument();
    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
  });

  it('permissive: render children khi KHÔNG có requiredCapability (kể cả permissions rỗng)', () => {
    mockPermissions = [];
    render(
      <RouteAccessGuard>
        <Protected />
      </RouteAccessGuard>,
    );

    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
  });

  it('wildcard "*" được phép truy cập mọi capability', () => {
    mockPermissions = ['*'];
    render(
      <RouteAccessGuard requiredCapability="quote.approve">
        <Protected />
      </RouteAccessGuard>,
    );

    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
  });

  it('chuẩn hoá delimiter: permissions ["order.view"] + requiredCapability "order:view" ⇒ được phép', () => {
    mockPermissions = ['order.view'];
    render(
      <RouteAccessGuard requiredCapability="order:view">
        <Protected />
      </RouteAccessGuard>,
    );

    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
    expect(screen.queryByText(DENIED_TEXT)).not.toBeInTheDocument();
  });

  it('thiếu quyền với capability dạng ":" ⇒ render thông báo từ chối', () => {
    mockPermissions = []; // không có order.view
    render(
      <RouteAccessGuard requiredCapability="order:view">
        <Protected />
      </RouteAccessGuard>,
    );

    expect(screen.getByText(DENIED_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-children')).not.toBeInTheDocument();
  });
});

describe('RouteAccessGuard — compose với FrozenRouteGuard', () => {
  it('route KHÔNG frozen + đủ quyền ⇒ render children qua cả hai guard', () => {
    mockPermissions = ['order.view'];
    render(
      <FrozenRouteGuard registry={registry} pathname="/pricing/orders">
        <RouteAccessGuard requiredCapability="order:view">
          <Protected />
        </RouteAccessGuard>
      </FrozenRouteGuard>,
    );

    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
    expect(screen.getByText(PROTECTED_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId('frozen-route-notice')).not.toBeInTheDocument();
  });

  it('route frozen ⇒ hiển thị thông báo đóng băng, KHÔNG render children (frozen-guard ngoài chặn trước)', () => {
    // Dù có đủ quyền RBAC, guard đóng băng ở NGOÀI vẫn chặn trước.
    mockPermissions = ['order.view'];
    render(
      <FrozenRouteGuard registry={registry} pathname="/super-admin">
        <RouteAccessGuard requiredCapability="order:view">
          <Protected />
        </RouteAccessGuard>
      </FrozenRouteGuard>,
    );

    expect(screen.getByTestId('frozen-route-notice')).toBeInTheDocument();
    expect(screen.getByText(FROZEN_FEATURE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId('protected-children')).not.toBeInTheDocument();
    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
  });
});
