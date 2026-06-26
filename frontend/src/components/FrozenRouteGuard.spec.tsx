/**
 * Unit test cho FrozenRouteGuard (task 7.4).
 *
 * Kiểm:
 *  1. Route frozen ⇒ hiển thị thông báo FROZEN_FEATURE_MESSAGE, KHÔNG render children.
 *  2. Route không frozen ⇒ render children bình thường.
 *  3. Giữ session / không ném lỗi: render trên route frozen không throw và hiển thị
 *     thông báo (guard không đụng auth); registry hỏng vẫn fail-open (render children).
 *
 * _Requirements: 4.6_
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import {
  FrozenRouteGuard,
  FROZEN_FEATURE_MESSAGE,
} from './FrozenRouteGuard';
import type { ScopeRegistry } from '@/lib/scope/types';

// usePathname luôn được gọi (Rules of Hooks) dù ta truyền pathname tường minh.
// Mock trả null để hook hoạt động ngoài context router của Next; các test luôn
// truyền pathname tường minh nên giá trị mock không ảnh hưởng kết quả.
jest.mock('next/navigation', () => ({
  usePathname: () => null,
}));

/** Registry tối thiểu: một entry frozen (super-admin) + một entry core (inbox). */
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
      id: 'inbox',
      title: 'Hộp thư',
      scope: 'core',
      axis: 'cskh',
      rule: '2.2',
      reason: 'Bề mặt Lõi CSKH',
      featureRef: 'frontend/src/app/(app)/inbox/page.tsx',
      navItem: 'inbox',
    },
  ],
};

const PROTECTED_TEXT = 'Nội dung được bảo vệ';

function Protected() {
  return <div data-testid="protected-children">{PROTECTED_TEXT}</div>;
}

describe('FrozenRouteGuard', () => {
  it('hiển thị thông báo và KHÔNG render children khi route khớp tính năng frozen', () => {
    render(
      <FrozenRouteGuard registry={registry} pathname="/super-admin">
        <Protected />
      </FrozenRouteGuard>,
    );

    // Thông báo đóng băng hiển thị.
    expect(screen.getByTestId('frozen-route-notice')).toBeInTheDocument();
    expect(screen.getByText(FROZEN_FEATURE_MESSAGE)).toBeInTheDocument();

    // Children được bảo vệ KHÔNG xuất hiện.
    expect(screen.queryByTestId('protected-children')).not.toBeInTheDocument();
    expect(screen.queryByText(PROTECTED_TEXT)).not.toBeInTheDocument();
  });

  it('hiển thị thông báo cho route con của featureRef frozen (/settings/api-keys)', () => {
    render(
      <FrozenRouteGuard registry={registry} pathname="/settings/api-keys">
        <Protected />
      </FrozenRouteGuard>,
    );

    expect(screen.getByTestId('frozen-route-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-children')).not.toBeInTheDocument();
  });

  it('render children bình thường khi route KHÔNG bị đóng băng', () => {
    render(
      <FrozenRouteGuard registry={registry} pathname="/inbox">
        <Protected />
      </FrozenRouteGuard>,
    );

    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
    expect(screen.getByText(PROTECTED_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId('frozen-route-notice')).not.toBeInTheDocument();
  });

  it('không ném lỗi khi render trên route frozen và vẫn hiển thị thông báo (giữ session)', () => {
    // Guard không đụng auth/localStorage/redirect ⇒ chỉ cần render an toàn.
    expect(() =>
      render(
        <FrozenRouteGuard registry={registry} pathname="/super-admin">
          <Protected />
        </FrozenRouteGuard>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId('frozen-route-notice')).toBeInTheDocument();
  });

  it('fail-open: registry hỏng vẫn render children mà không throw', () => {
    // Registry thiếu trường `entries` đúng kiểu — guard phải fail-open, không crash.
    const malformed = { foo: 'bar' } as unknown as ScopeRegistry;

    expect(() =>
      render(
        <FrozenRouteGuard registry={malformed} pathname="/super-admin">
          <Protected />
        </FrozenRouteGuard>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId('protected-children')).toBeInTheDocument();
    expect(screen.queryByTestId('frozen-route-notice')).not.toBeInTheDocument();
  });
});
