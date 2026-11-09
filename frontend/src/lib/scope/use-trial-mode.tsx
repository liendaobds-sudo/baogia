'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'zp_trial_mode';
const EVENT_NAME = 'zp-trial-mode-change';

/**
 * Danh sách các đường dẫn Cấu hình sâu ("Bí kíp lõi" của nhà in) cần ẩn/khoá
 * khi bật Chế độ Dùng thử (Trial Mode).
 */
export const DEEP_CONFIG_ROUTES = new Set<string>([
    '/pricing/settings/offset-materials',
    '/pricing/settings/waste-stages',
    '/pricing/settings/offset-fees',
    '/pricing/settings/printers',
    '/pricing/settings/waste-config',
    '/pricing/settings/pricing-markup',
    '/pricing/settings/units',
    '/pricing/settings/print-types',
]);

export function isDeepConfigRoute(href?: string): boolean {
    if (!href) return false;
    return DEEP_CONFIG_ROUTES.has(href);
}

function readStoredTrialMode(): boolean {
    if (typeof window === 'undefined') {
        return process.env.NEXT_PUBLIC_TRIAL_MODE === 'true';
    }
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === '1' || raw === 'true') return true;
        if (raw === '0' || raw === 'false') return false;
    } catch {
        // ignore storage error
    }
    return process.env.NEXT_PUBLIC_TRIAL_MODE === 'true';
}

/**
 * Hook quản lý trạng thái Chế độ Dùng thử (Trial Mode) toàn cục trên trình duyệt.
 * Khi bật:
 *  1. Ẩn các menu & trang Cấu hình sâu (Bù hao công đoạn, Kẽm/Máy, Hệ số MOQ, Lợi nhuận).
 *  2. Gộp 12 dòng bóc tách chi phí Offset thành 3 nhóm tổng quát (Vật tư · In ấn · Gia công).
 *  3. Ẩn dòng Lợi nhuận định mức & Giá vốn nội bộ trên báo giá In nhanh / Khổ lớn / Đóng cuốn.
 */
export function useTrialMode() {
    const [isTrialMode, setIsTrialMode] = useState<boolean>(false);

    useEffect(() => {
        setIsTrialMode(readStoredTrialMode());
        const onStorageOrCustom = () => {
            setIsTrialMode(readStoredTrialMode());
        };
        window.addEventListener('storage', onStorageOrCustom);
        window.addEventListener(EVENT_NAME, onStorageOrCustom);
        return () => {
            window.removeEventListener('storage', onStorageOrCustom);
            window.removeEventListener(EVENT_NAME, onStorageOrCustom);
        };
    }, []);

    const setTrialMode = useCallback((next: boolean) => {
        try {
            window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        } catch {
            // ignore
        }
        setIsTrialMode(next);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event(EVENT_NAME));
        }
    }, []);

    const toggleTrialMode = useCallback(() => {
        setTrialMode(!readStoredTrialMode());
    }, [setTrialMode]);

    return { isTrialMode, setTrialMode, toggleTrialMode };
}

/**
 * Gộp 12+ dòng bóc tách chi phí sản xuất Offset thành 3 nhóm tổng quát khi ở Chế độ Dùng thử,
 * giúp khách hàng vẫn kiểm chứng được cơ cấu giá hợp lý mà không lộ công thức Lên bài / Chạy máy / XLBM / Khuôn.
 */
export function groupOffsetLinesForTrial(
    lines: Array<{ label: string; amount: number }>,
): Array<{ label: string; amount: number }> {
    let vatTuAmount = 0;
    let inAnAmount = 0;
    let giaCongAmount = 0;

    for (const l of lines || []) {
        const amt = Number(l.amount) || 0;
        const lbl = (l.label || '').toLowerCase();
        if (lbl.includes('giấy') || lbl.includes('kẽm') || lbl.includes('vật tư bề mặt')) {
            vatTuAmount += amt;
        } else if (lbl.includes('lên bài') || lbl.includes('chạy máy') || lbl.includes('in (') || lbl.includes('thiết kế')) {
            inAnAmount += amt;
        } else {
            giaCongAmount += amt;
        }
    }

    const grouped = [
        { label: 'Vật tư giấy & Bản in', amount: vatTuAmount },
        { label: 'In ấn & Chạy máy', amount: inAnAmount },
        { label: 'Gia công & Thành phẩm', amount: giaCongAmount },
    ];
    return grouped.filter((g) => g.amount > 0);
}

/**
 * Màn hình thông báo khi truy cập trực tiếp URL cấu hình sâu trong lúc đang bật Chế độ Dùng thử.
 */
export function TrialLockBanner({
    title = 'Cấu hình Chuyên sâu (Đã ẩn ở Chế độ Dùng thử)',
    description = 'Ma trận bù hao luỹ tiến theo công đoạn, đơn giá bản kẽm/canh máy và hệ số định mức lõi đang được hệ thống tự động vận hành ngầm ở Server để bảo vệ bí quyết công nghệ.',
}: {
    title?: string;
    description?: string;
}) {
    const { setTrialMode } = useTrialMode();
    return (
        <div className="p-6 max-w-2xl mx-auto mt-10">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto text-xl">
                    🔒
                </div>
                <h2 className="text-lg font-extrabold text-slate-800">{title}</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-left text-xs text-slate-600 space-y-1.5">
                    <div className="font-bold text-slate-700">Trong Chế độ Dùng thử, bạn vẫn có thể tự do trải nghiệm:</div>
                    <div>• Tính giá tự động &amp; bình bài / khuôn bế 2D cho mọi dòng sản phẩm.</div>
                    <div>• Chỉnh sửa Danh mục Sản phẩm, Giá giấy in và Định mức in cơ bản.</div>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                    <Link
                        href="/pricing/quotes/new"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-colors"
                    >
                        ← Quay lại Màn hình Báo giá
                    </Link>
                    <button
                        type="button"
                        onClick={() => setTrialMode(false)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
                    >
                        🔓 Chuyển sang Chế độ Chủ xưởng (Full)
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Thanh gạt Xem trước (Dev Preview Toggle Switch) đặt ngay trên thanh tiêu đề
 * để Chủ xưởng gạt qua lại tức thì giữa "Góc nhìn Chủ xưởng (Full)" và "Góc nhìn Khách dùng thử (Ẩn sâu)".
 */
export function TrialModeSwitch({ className = '' }: { className?: string }) {
    const { isTrialMode, toggleTrialMode } = useTrialMode();
    return (
        <button
            type="button"
            role="switch"
            aria-checked={isTrialMode}
            onClick={toggleTrialMode}
            title={
                isTrialMode
                    ? 'Đang xem góc nhìn Khách dùng thử (Đã ẩn cấu hình sâu & gộp dòng chi phí). Bấm để gạt về Chủ xưởng (Full).'
                    : 'Đang ở chế độ Chủ xưởng (Full). Bấm để gạt xem trước giao diện Khách dùng thử.'
            }
            className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11.5px] font-bold transition-all cursor-pointer select-none shadow-xs ${
                isTrialMode
                    ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            } ${className}`}
        >
            {/* Thanh gạt (Toggle Track + Thumb) */}
            <span
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    isTrialMode ? 'bg-amber-500' : 'bg-slate-300'
                }`}
            >
                <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200 ${
                        isTrialMode ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`}
                />
            </span>
            <span className="whitespace-nowrap flex items-center gap-1">
                <span>{isTrialMode ? '🔒' : '🔓'}</span>
                <span>{isTrialMode ? 'Xem trước: Khách dùng thử' : 'Chế độ: Chủ xưởng (Full)'}</span>
            </span>
        </button>
    );
}
