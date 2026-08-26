import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { API_URL } from './api';
import { AuthProvider, useAuth } from './auth-context';

const SESSION_KEYS = [
    'zh_token',
    'zh_user',
    'zh_refresh_token',
    'imp_sa_token',
    'imp_sa_user',
    'imp_sa_refresh',
    'imp_tenant_name',
] as const;

function makeToken(): string {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
        sub: 'user-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
    }));
    return `${header}.${payload}.sig`;
}

function seedSession(): void {
    localStorage.setItem('zh_token', makeToken());
    localStorage.setItem('zh_refresh_token', 'refresh-token-1');
    localStorage.setItem('zh_user', JSON.stringify({
        id: 'user-1',
        email: 'agent@example.com',
        fullName: 'Agent A',
        role: 'agent',
        permissions: [],
    }));
    localStorage.setItem('imp_sa_token', 'super-admin-token');
    localStorage.setItem('imp_sa_user', '{"id":"super-admin-1"}');
    localStorage.setItem('imp_sa_refresh', 'super-admin-refresh');
    localStorage.setItem('imp_tenant_name', 'Tenant A');
}

function LogoutProbe() {
    const { connected, logout, token, user } = useAuth();
    const [logoutDone, setLogoutDone] = useState(false);

    return (
        <div>
            <span data-testid="connected">{String(connected)}</span>
            <span data-testid="token">{token ?? ''}</span>
            <span data-testid="user">{user?.email ?? ''}</span>
            <span data-testid="logout-done">{String(logoutDone)}</span>
            <button
                type="button"
                onClick={() => {
                    void logout().then(() => setLogoutDone(true));
                }}
            >
                Đăng xuất
            </button>
        </div>
    );
}

function renderSession(): ReturnType<typeof render> {
    seedSession();
    return render(
        <AuthProvider>
            <LogoutProbe />
        </AuthProvider>,
    );
}

describe('AuthProvider logout', () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
        localStorage.clear();
        fetchMock.mockReset();
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            writable: true,
            value: fetchMock,
        });
    });

    afterEach(() => {
        localStorage.clear();
        jest.restoreAllMocks();
    });

    it('xóa local session trước và không phụ thuộc request logout đang chờ', async () => {
        let resolveRequest!: (response: Response) => void;
        const pendingRequest = new Promise<Response>((resolve) => {
            resolveRequest = resolve;
        });
        let sessionAtRequest: Array<string | null> = [];
        fetchMock.mockImplementation(() => {
            sessionAtRequest = SESSION_KEYS.map((key) => localStorage.getItem(key));
            return pendingRequest;
        });

        renderSession();
        await waitFor(() => {
            expect(screen.getByTestId('connected')).toHaveTextContent('true');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(sessionAtRequest).toEqual(SESSION_KEYS.map(() => null));
        for (const key of SESSION_KEYS) {
            expect(localStorage.getItem(key)).toBeNull();
        }
        expect(screen.getByTestId('connected')).toHaveTextContent('false');
        expect(screen.getByTestId('token')).toBeEmptyDOMElement();
        expect(screen.getByTestId('user')).toBeEmptyDOMElement();
        expect(screen.getByTestId('logout-done')).toHaveTextContent('false');

        await act(async () => {
            resolveRequest({ ok: true, status: 200 } as Response);
            await pendingRequest;
        });
        await waitFor(() => {
            expect(screen.getByTestId('logout-done')).toHaveTextContent('true');
        });
    });

    it('gửi access Bearer, refresh token và keepalive tới endpoint logout', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

        renderSession();
        await waitFor(() => {
            expect(screen.getByTestId('connected')).toHaveTextContent('true');
        });
        const accessToken = localStorage.getItem('zh_token');

        fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
        await waitFor(() => {
            expect(screen.getByTestId('logout-done')).toHaveTextContent('true');
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            `${API_URL}/auth/logout`,
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ refreshToken: 'refresh-token-1' }),
                keepalive: true,
            }),
        );
    });

    it('giữ session đã xóa khi request logout lỗi mạng', async () => {
        const networkError = new TypeError('network unavailable');
        fetchMock.mockRejectedValue(networkError);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

        renderSession();
        await waitFor(() => {
            expect(screen.getByTestId('connected')).toHaveTextContent('true');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
        await waitFor(() => {
            expect(screen.getByTestId('logout-done')).toHaveTextContent('true');
        });

        for (const key of SESSION_KEYS) {
            expect(localStorage.getItem(key)).toBeNull();
        }
        expect(screen.getByTestId('connected')).toHaveTextContent('false');
        expect(screen.getByTestId('token')).toBeEmptyDOMElement();
        expect(screen.getByTestId('user')).toBeEmptyDOMElement();
        expect(consoleError).toHaveBeenCalledWith('[Auth] Server logout failed:', networkError);
    });
});
