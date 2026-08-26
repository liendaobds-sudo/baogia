// ═══════════════════════════════════════
// ZeplaoPrint — Centralized API Client
// ═══════════════════════════════════════

import { refreshAuthSession } from './auth-refresh';

function resolveApiUrl(): string {
    const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    // Browser production build without env → hard fail (never silent-localhost)
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
        throw new Error(
            'NEXT_PUBLIC_API_URL is required in production. Set it to your API base (…/api/v1).',
        );
    }
    return 'http://localhost:4000/api/v1';
}

export const API_URL = resolveApiUrl();
export const API_BASE = API_URL.replace(/\/api\/v1\/?$/, '') || 'http://localhost:4000';

function getAuthHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('zh_token') : null);
    if (t) {
        headers['Authorization'] = `Bearer ${t}`;
    }
    return headers;
}

async function fetchWithRefresh(path: string, init: RequestInit, token?: string): Promise<Response> {
    let t = token || (typeof window !== 'undefined' ? localStorage.getItem('zh_token') : null) || undefined;
    const headers = { ...getAuthHeaders(t), ...(init.headers as Record<string, string> | undefined) };
    let res = await fetch(`${API_URL}${path}`, { ...init, headers });
    if (res.status === 401 && typeof window !== 'undefined' && !token) {
        const refreshed = await refreshAuthSession(API_URL);
        if (refreshed) {
            res = await fetch(`${API_URL}${path}`, {
                ...init,
                headers: { ...getAuthHeaders(refreshed.accessToken), ...(init.headers as Record<string, string> | undefined) },
            });
        }
    }
    return res;
}

export async function apiGet<T = any>(path: string, token?: string): Promise<T> {
    const res = await fetchWithRefresh(path, { method: 'GET' }, token);
    if (!res.ok) throw new Error(`API GET ${path} failed: ${res.status}`);
    return res.json();
}

export async function apiPost<T = any>(path: string, body?: any, token?: string): Promise<T> {
    const res = await fetchWithRefresh(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
    }, token);
    if (!res.ok) throw new Error(`API POST ${path} failed: ${res.status}`);
    return res.json();
}

export async function apiPut<T = any>(path: string, body?: any, token?: string): Promise<T> {
    const res = await fetchWithRefresh(path, {
        method: 'PUT',
        body: body ? JSON.stringify(body) : undefined,
    }, token);
    if (!res.ok) throw new Error(`API PUT ${path} failed: ${res.status}`);
    return res.json();
}

export async function apiPatch<T = any>(path: string, body?: any, token?: string): Promise<T> {
    const res = await fetchWithRefresh(path, {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
    }, token);
    if (!res.ok) throw new Error(`API PATCH ${path} failed: ${res.status}`);
    return res.json();
}

export async function apiDelete(path: string, token?: string): Promise<void> {
    const res = await fetchWithRefresh(path, { method: 'DELETE' }, token);
    if (!res.ok) throw new Error(`API DELETE ${path} failed: ${res.status}`);
}
