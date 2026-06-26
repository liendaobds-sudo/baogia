/**
 * Unit test cho usePermissions (task 6.7).
 *
 * Kiểm `usePermissions()` phơi đúng `permissions` từ AuthProvider và `hasPermission`
 * dùng cùng lõi `canAccess`/`normalizeCapability`.
 *
 * Cách dựng: AuthProvider khôi phục phiên từ localStorage trong useEffect. Ta seed một
 * JWT giả (chưa hết hạn, đúng định dạng header.payload.signature) cùng `zh_user` có
 * `permissions`, rồi render một consumer nhỏ đọc qua `usePermissions`. Không gọi
 * network (login mới cần fetch); việc khôi phục phiên chỉ đọc localStorage.
 *
 * _Requirements: 5.2, 5.4_
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

import { AuthProvider, usePermissions } from './auth-context';

/** Tạo JWT giả hợp lệ về định dạng với `exp` ở tương lai để qua kiểm tra hết hạn. */
function makeToken(expSecondsFromNow = 3600): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: 'u1',
      exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    }),
  );
  return `${header}.${payload}.sig`;
}

function seedSession(permissions: string[]): void {
  localStorage.setItem('zh_token', makeToken());
  localStorage.setItem(
    'zh_user',
    JSON.stringify({
      id: 'u1',
      email: 'agent@example.com',
      fullName: 'Agent A',
      role: 'agent',
      permissions,
    }),
  );
}

/** Consumer nhỏ phơi kết quả usePermissions ra DOM để assert. */
function PermissionsProbe() {
  const { permissions, hasPermission } = usePermissions();
  return (
    <div>
      <span data-testid="perms">{permissions.join(',')}</span>
      <span data-testid="has-order-view">
        {String(hasPermission('order.view'))}
      </span>
      <span data-testid="has-order-view-colon">
        {String(hasPermission('order:view'))}
      </span>
      <span data-testid="has-quote-approve">
        {String(hasPermission('quote.approve'))}
      </span>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <PermissionsProbe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('usePermissions', () => {
  it('trả về permissions từ phiên đã khôi phục và hasPermission đúng', async () => {
    seedSession(['order.view', 'quote.view']);
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('perms')).toHaveTextContent('order.view,quote.view');
    });

    expect(screen.getByTestId('has-order-view')).toHaveTextContent('true');
    // Chuẩn hoá delimiter ':' → '.'
    expect(screen.getByTestId('has-order-view-colon')).toHaveTextContent('true');
    // Không có quyền duyệt
    expect(screen.getByTestId('has-quote-approve')).toHaveTextContent('false');
  });

  it('mặc định permissions rỗng khi chưa đăng nhập; hasPermission = false', async () => {
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('perms')).toHaveTextContent('');
    });
    expect(screen.getByTestId('has-order-view')).toHaveTextContent('false');
    expect(screen.getByTestId('has-quote-approve')).toHaveTextContent('false');
  });

  it('phiên cũ thiếu trường permissions ⇒ mặc định rỗng (fail-closed ở UX)', async () => {
    localStorage.setItem('zh_token', makeToken());
    localStorage.setItem(
      'zh_user',
      JSON.stringify({
        id: 'u1',
        email: 'old@example.com',
        fullName: 'Old User',
        role: 'agent',
        // không có `permissions`
      }),
    );
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('has-order-view')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('perms')).toHaveTextContent('');
  });

  it('wildcard "*" cho phép mọi capability', async () => {
    seedSession(['*']);
    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('has-quote-approve')).toHaveTextContent('true');
    });
    expect(screen.getByTestId('has-order-view')).toHaveTextContent('true');
  });
});
