import { API_URL } from '@/lib/api';

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
): Promise<{ success: boolean; data?: T; message?: string; error?: string }> {
    const token = getToken();
    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });
    return res.json();
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
