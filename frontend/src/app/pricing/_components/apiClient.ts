import { API_URL } from '@/lib/api';
import { refreshAuthSession } from '@/lib/auth-refresh';

const API_BASE = API_URL;

function getToken(): string {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('zh_token') || '';
    }
    return '';
}

export async function apiFetch<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
): Promise<{ success: boolean; data?: T; message?: string; error?: string } & Record<string, unknown>> {
    const doFetch = async (token: string) =>
        fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: token ? `Bearer ${token}` : '',
                ...options.headers,
            },
        });

    let token = getToken();
    let res = await doFetch(token);

    if (res.status === 401) {
        const refreshed = await refreshAuthSession(API_URL);
        if (refreshed) {
            token = refreshed.accessToken;
            res = await doFetch(token);
        }
    }

    const text = await res.text();
    let body: any = {};
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = { success: false, error: text || `HTTP ${res.status}` };
    }

    // Normalize Nest array responses and error shapes for pricing CRUD pages
    if (res.ok) {
        if (Array.isArray(body)) {
            return { success: true, data: body as T, ...{ raw: body } };
        }
        if (body && typeof body === 'object' && body.success === undefined) {
            // e.g. single entity or { data } already
            if (body.data !== undefined) return { success: true, ...body };
            return { success: true, data: body as T };
        }
        return body;
    }

    return {
        success: false,
        error: body.message || body.error || `HTTP ${res.status}`,
        message: body.message,
        statusCode: res.status,
        ...body,
    };
}

export const api = {
    get: <T = unknown>(endpoint: string) => apiFetch<T>(endpoint),
    post: <T = unknown>(endpoint: string, body: unknown) =>
        apiFetch<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
    put: <T = unknown>(endpoint: string, body: unknown) =>
        apiFetch<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (endpoint: string) =>
        apiFetch(endpoint, { method: 'DELETE' }),
};
