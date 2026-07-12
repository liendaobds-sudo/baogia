import { useEffect, useState } from 'react';

/**
 * Phát hiện Bố_Cục_Hẹp (single-column) theo Điểm_Ngắt.
 * Mặc định 1024px: viewport < 1024 ⇒ narrow. SSR-safe (mặc định false khi không có window).
 *
 * _Requirements: 1.1_
 */
export function useIsNarrow(query = '(max-width: 1023.98px)'): boolean {
    const [isNarrow, setIsNarrow] = useState<boolean>(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(query);
        const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
        // Đồng bộ lần đầu (phòng trường hợp giá trị đổi giữa render và effect).
        setIsNarrow(mql.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);

    return isNarrow;
}
