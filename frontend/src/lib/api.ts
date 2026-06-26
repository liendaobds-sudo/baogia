// ═══════════════════════════════════════
// ZeplaoPrint — Centralized API Client
// ═══════════════════════════════════════

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
export const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1$/, '') || 'http://localhost:4000';

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

export async function apiGet<T = any>(path: string, token?: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        headers: getAuthHeaders(token),
    });
    if (!res.ok) throw new Error(`API GET ${path} failed: ${res.status}`);
    return res.json();
}

export async function apiPost<T = any>(path: string, body?: any, token?: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API POST ${path} failed: ${res.status}`);
    return res.json();
}

export async function apiPut<T = any>(path: string, body?: any, token?: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API PUT ${path} failed: ${res.status}`);
    return res.json();
}

export async function apiPatch<T = any>(path: string, body?: any, token?: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        method: 'PATCH',
        headers: getAuthHeaders(token),
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`API PATCH ${path} failed: ${res.status}`);
    return res.json();
}

export async function apiDelete(path: string, token?: string): Promise<void> {
    const res = await fetch(`${API_URL}${path}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
    });
    if (!res.ok) throw new Error(`API DELETE ${path} failed: ${res.status}`);
}
