'use client';

import {
    createContext,
    useCallback,
    useContext,
    useState,
    type ReactNode,
} from 'react';

/**
 * Hệ thống Thông_Báo (toast) dùng chung cho App_BaoGia.
 * Nhẹ, dựa trên React context, không phụ thuộc thư viện ngoài.
 * _Requirements: 4.2, 4.3, 4.5_
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
    id: number;
    kind: ToastKind;
    message: string;
}

export interface ToastApi {
    /** Hiển thị một Thông_Báo; tự ẩn sau ~4 giây. */
    show: (kind: ToastKind, message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

/** Thời gian tự ẩn một Thông_Báo (ms). */
const AUTO_DISMISS_MS = 4000;

const KIND_STYLES: Record<ToastKind, string> = {
    success: 'bg-emerald-600 text-white border-emerald-700',
    error: 'bg-rose-600 text-white border-rose-700',
    info: 'bg-indigo-600 text-white border-indigo-700',
};

/**
 * Bao bọc cây con để cung cấp `useToast`. Giữ state danh sách toast,
 * render vùng thông báo cố định với role="status"/aria-live="polite".
 */
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const show = useCallback<ToastApi['show']>((kind, message) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, kind, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, AUTO_DISMISS_MS);
    }, []);

    return (
        <ToastCtx.Provider value={{ show }}>
            {children}
            <div
                role="status"
                aria-live="polite"
                className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
            >
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`pointer-events-auto min-w-[240px] max-w-sm rounded-lg border px-4 py-2.5 text-sm shadow-lg ${KIND_STYLES[t.kind]}`}
                    >
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastCtx.Provider>
    );
}

/**
 * Truy cập API Thông_Báo. Ném lỗi nếu dùng ngoài `ToastProvider`.
 */
export function useToast(): ToastApi {
    const ctx = useContext(ToastCtx);
    if (!ctx) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return ctx;
}
