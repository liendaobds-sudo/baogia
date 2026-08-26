export interface AuthRefreshResult {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
}

let refreshInFlight: Promise<AuthRefreshResult | null> | null = null;

/**
 * Một refresh request duy nhất cho toàn bộ frontend.
 *
 * Backend rotate refresh JTI theo kiểu consume-once, nên mọi API client phải cùng
 * chờ một promise thay vì tự POST /auth/refresh song song. Trước khi ghi token mới,
 * kiểm lại refresh token hiện hành để response cũ không hồi sinh phiên đã logout
 * hoặc ghi đè phiên impersonation vừa được chuyển.
 */
export function refreshAuthSession(apiUrl: string): Promise<AuthRefreshResult | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (refreshInFlight) return refreshInFlight;

    const refreshToken = localStorage.getItem('zh_refresh_token');
    if (!refreshToken) return Promise.resolve(null);

    const request = (async (): Promise<AuthRefreshResult | null> => {
        try {
            const res = await fetch(`${apiUrl}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
            });
            if (!res.ok) return null;

            const data = await res.json() as Partial<AuthRefreshResult>;
            if (typeof data.accessToken !== 'string' || !data.accessToken) return null;

            // Session đã đổi trong khi request đang chạy: bỏ response cũ.
            if (localStorage.getItem('zh_refresh_token') !== refreshToken) return null;

            localStorage.setItem('zh_token', data.accessToken);
            if (typeof data.refreshToken === 'string' && data.refreshToken) {
                localStorage.setItem('zh_refresh_token', data.refreshToken);
            }

            return {
                accessToken: data.accessToken,
                ...(typeof data.refreshToken === 'string' ? { refreshToken: data.refreshToken } : {}),
                ...(typeof data.expiresIn === 'number' ? { expiresIn: data.expiresIn } : {}),
            };
        } catch {
            return null;
        }
    })();

    let shared: Promise<AuthRefreshResult | null>;
    shared = request.finally(() => {
        if (refreshInFlight === shared) refreshInFlight = null;
    });
    refreshInFlight = shared;
    return shared;
}
