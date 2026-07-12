import { useEffect } from 'react';

/**
 * Đặt chiều cao phần tử = chiều cao khả dụng thực tế (innerHeight - top của phần tử),
 * để Inbox vừa khít viewport KỂ CẢ khi có banner (impersonation) đẩy nội dung xuống —
 * mà KHÔNG cần sửa `.main-content` trong globals.css.
 *
 * Fallback: nếu chưa đo được (SSR/first paint) thì phần tử giữ height CSS mặc định (100dvh).
 *
 * _Requirements: 1.5_
 */
export function useViewportFit(ref: React.RefObject<HTMLElement | null>): void {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        let raf = 0;

        const apply = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const el = ref.current;
                if (!el) return;
                const top = el.getBoundingClientRect().top;
                const h = Math.max(0, window.innerHeight - top);
                const next = `${h}px`;
                if (el.style.height !== next) el.style.height = next;
            });
        };

        apply();
        window.addEventListener('resize', apply);

        // Bắt cả trường hợp banner xuất hiện/mất (thay đổi layout body → đổi top).
        let ro: ResizeObserver | undefined;
        if (typeof ResizeObserver === 'function') {
            ro = new ResizeObserver(apply);
            ro.observe(document.body);
        }

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', apply);
            ro?.disconnect();
        };
    }, [ref]);
}
