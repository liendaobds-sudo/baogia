'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { API_URL } from '@/lib/api';
import { canAccess, normalizeCapability } from '@/lib/access-decision';

interface User {
    id: string;
    email: string;
    fullName: string;
    role: string;
    avatarUrl?: string;
    permissions: string[];
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
    isLoading: boolean;
    error: string | null;
    connected: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);


const LOGIN_TIMEOUT_MS = 8000;

// ============================================
// HELPERS
// ============================================

/** Safely parse JSON from localStorage — returns null if corrupted */
function safeParse<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch {
        console.warn(`[Auth] Corrupted localStorage key "${key}" — removing`);
        localStorage.removeItem(key);
        return null;
    }
}

/** Decode JWT payload without a library (no validation, just read expiry) */
function decodeJwtPayload(token: string): { exp?: number; sub?: string } | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        return payload;
    } catch {
        return null;
    }
}

/** Check if a JWT token is expired (with 60s buffer) */
function isTokenExpired(token: string): boolean {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return true; // No exp = treat as expired
    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp < nowSeconds + 60; // 60s buffer
}

/** Convert network/API errors to user-friendly Vietnamese messages */
function toFriendlyError(err: unknown): string {
    if (err instanceof DOMException && err.name === 'AbortError') {
        return 'Không thể kết nối server. Vui lòng kiểm tra backend đang chạy.';
    }
    if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'))) {
        return 'Không thể kết nối server. Vui lòng kiểm tra kết nối mạng.';
    }
    if (err instanceof Error) {
        // Pass through Vietnamese messages from backend
        if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(err.message)) {
            return err.message;
        }
        return 'Đăng nhập thất bại. Vui lòng thử lại.';
    }
    return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}

// ============================================
// PROVIDER
// ============================================

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const refreshTimerRef = React.useRef<NodeJS.Timeout | null>(null);
    const isRefreshing = React.useRef(false);

    // --- Restore session from localStorage (with validation) ---
    useEffect(() => {
        const savedToken = localStorage.getItem('zh_token');
        const savedUser = safeParse<User>('zh_user');

        if (savedToken && savedUser) {
            // Check token expiry before restoring
            if (isTokenExpired(savedToken)) {
                console.warn('[Auth] Saved token expired — clearing session');
                localStorage.removeItem('zh_token');
                localStorage.removeItem('zh_user');
            } else {
                setToken(savedToken);
                // Tương thích phiên cũ: user lưu trước đây có thể thiếu `permissions`.
                // Mặc định [] (fail-closed ở UX); quyền thật nạp lại ở lần đăng nhập/refresh kế.
                setUser({ ...savedUser, permissions: savedUser.permissions ?? [] });
            }
        }
        setIsLoading(false);
    }, []);

    // --- Login with timeout ---
    const login = useCallback(async (email: string, password: string) => {
        setError(null);
        setIsLoading(true);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                let message = 'Đăng nhập thất bại';
                try {
                    const data = await res.json();
                    message = data.message || message;
                } catch { /* ignore parse error */ }
                throw new Error(message);
            }

            const data = await res.json();
            setToken(data.accessToken);
            setUser(data.user);
            localStorage.setItem('zh_token', data.accessToken);
            localStorage.setItem('zh_user', JSON.stringify(data.user));
            if (data.refreshToken) {
                localStorage.setItem('zh_refresh_token', data.refreshToken);
            }

            // Schedule proactive refresh before expiry
            doScheduleRefresh(data.expiresIn || 604800);
        } catch (err: unknown) {
            const friendlyMsg = toFriendlyError(err);
            setError(friendlyMsg);
            throw new Error(friendlyMsg);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // --- Logout (clear everything) ---
    const logout = useCallback(() => {
        setUser(null);
        setToken(null);
        setError(null);
        localStorage.removeItem('zh_token');
        localStorage.removeItem('zh_user');
        localStorage.removeItem('zh_refresh_token');
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }
    }, []);

    // --- Silent token refresh (plain function using refs — no circular deps) ---
    async function doRefresh(): Promise<boolean> {
        if (isRefreshing.current) return false;
        isRefreshing.current = true;
        const rt = localStorage.getItem('zh_refresh_token');
        if (!rt) { isRefreshing.current = false; return false; }
        try {
            const res = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: rt }),
            });
            if (!res.ok) { isRefreshing.current = false; return false; }
            const data = await res.json();
            setToken(data.accessToken);
            localStorage.setItem('zh_token', data.accessToken);
            if (data.refreshToken) localStorage.setItem('zh_refresh_token', data.refreshToken);
            doScheduleRefresh(data.expiresIn || 604800);
            isRefreshing.current = false;
            return true;
        } catch {
            isRefreshing.current = false;
            return false;
        }
    }

    function doScheduleRefresh(expiresInSeconds: number) {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        const refreshAfterMs = expiresInSeconds * 800; // 80% of expiry in ms
        refreshTimerRef.current = setTimeout(() => { doRefresh(); }, refreshAfterMs);
    }

    // --- Auth-aware fetch helper: auto-attach token, detect 401 → auto logout ---
    const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
        let currentToken = localStorage.getItem('zh_token');

        // Check token expiry — try refreshing before giving up
        if (currentToken && isTokenExpired(currentToken)) {
            const refreshed = await doRefresh();
            if (refreshed) {
                currentToken = localStorage.getItem('zh_token');
            } else {
                logout();
                throw new Error('Phiên đăng nhập đã hết hạn');
            }
        }

        const headers = new Headers(options.headers);
        if (currentToken) {
            headers.set('Authorization', `Bearer ${currentToken}`);
        }

        const res = await fetch(url, { ...options, headers });

        // On 401, try one refresh then retry
        if (res.status === 401) {
            const refreshed = await doRefresh();
            if (refreshed) {
                const retryToken = localStorage.getItem('zh_token');
                headers.set('Authorization', `Bearer ${retryToken}`);
                return fetch(url, { ...options, headers });
            }
            logout();
            throw new Error('Phiên đăng nhập đã hết hạn');
        }

        return res;
    }, [logout]);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, authFetch, isLoading, error, connected: !!token }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

/**
 * Hook phơi quyền của người dùng hiện tại cho lớp UX.
 *
 * @returns `permissions` — danh sách quyền hiệu lực (mặc định [] cho phiên cũ/chưa đăng nhập);
 *          `hasPermission(cap)` — kiểm tra một capability (tự chuẩn hoá ':' → '.') bằng cùng
 *          logic `canAccess` mà backend dùng để thực thi.
 */
export function usePermissions() {
    const { user } = useAuth();
    const permissions = user?.permissions ?? [];
    return {
        permissions,
        hasPermission: (cap: string) => canAccess(permissions, [normalizeCapability(cap)]),
    };
}
