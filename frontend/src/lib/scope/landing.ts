import { API_URL } from '@/lib/api';

/** Đọc payload JWT (không xác thực chữ ký) để lấy `role`. Trả null nếu hỏng. */
function roleFromJwt(token: string): string | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        return typeof payload?.role === 'string' ? payload.role : null;
    } catch {
        return null;
    }
}

/**
 * Chọn trang đích sau đăng nhập/điều hướng theo VAI TRÒ + Trục_Ứng_Dụng của tenant.
 *
 * Kiến trúc SaaS: super_admin là control plane (vận hành nền tảng), KHÔNG thuộc tenant
 * nào — nên đáp thẳng `/super-admin`, không hỏi `/me/app-scope` (vô nghĩa vì không có
 * tenant context). User tenant là tenant plane → landing theo Trục_Ứng_Dụng:
 *  - CSKH tắt  → `/pricing` (trang Báo_Giá — lõi luôn bật).
 *  - CSKH bật  → `cskhLanding` (mặc định `/inbox`).
 *
 * Fail-open: mọi lỗi/không rõ → trả `cskhLanding` (giữ hành vi cũ, không chặn nhầm).
 *
 * @param token       JWT để đọc role + gọi `/me/app-scope`. Bỏ trống → đọc `zh_token`.
 * @param cskhLanding Đích khi CSKH bật (mặc định `/inbox`).
 */
export async function resolveLandingPath(
    token?: string,
    cskhLanding: string = '/inbox',
): Promise<string> {
    const jwt = token ?? (typeof window !== 'undefined' ? localStorage.getItem('zh_token') : null);
    if (!jwt) return cskhLanding;

    // Super_Admin (control plane): luôn về trang quản trị nền tảng, bỏ qua app-scope.
    if (roleFromJwt(jwt) === 'super_admin') return '/super-admin';

    try {
        const res = await fetch(`${API_URL}/me/app-scope`, {
            headers: { Authorization: `Bearer ${jwt}` },
        });
        const json = await res.json().catch(() => ({}));
        const apps: string[] = json?.data?.enabledApps || json?.enabledApps || [];
        if (apps.length && !apps.includes('cskh')) return '/pricing';
    } catch {
        /* fail-open → cskhLanding */
    }
    return cskhLanding;
}
