'use client';
/**
 * ResizableColumns — bố cục N cột kéo giãn được, ghi nhớ độ rộng vào localStorage.
 *
 * Dùng cho trang báo giá đầy đủ: người dùng kéo các thanh ngăn (gutter) giữa các
 * cột để chỉnh độ rộng cho vừa ý; tỉ lệ được lưu theo `storageKey` nên lần sau
 * mở lại giữ nguyên, khỏi chỉnh lại.
 *
 * - Mỗi child là một cột. Số cột = số child.
 * - `defaultRatios`: tỉ lệ mặc định (độ dài = số cột). flexGrow tự chuẩn hoá nên
 *   không bắt buộc cộng đúng bằng 1.
 * - `minPx`: bề rộng tối thiểu mỗi cột khi kéo.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
    storageKey: string;
    defaultRatios: number[];
    minPx?: number;
    className?: string;
    children: React.ReactNode;
};

export function ResizableColumns({ storageKey, defaultRatios, minPx = 200, className = '', children }: Props) {
    const cols = React.Children.toArray(children);
    const n = cols.length;
    const containerRef = useRef<HTMLDivElement>(null);
    const [ratios, setRatios] = useState<number[]>(defaultRatios);
    const dragRef = useRef<{ idx: number; startX: number; startRatios: number[]; width: number } | null>(null);

    // Nạp tỉ lệ đã lưu (chỉ ở client để tránh lệch hydrate).
    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length === n && parsed.every((x) => typeof x === 'number' && x > 0)) {
                    setRatios(parsed);
                }
            }
        } catch { /* bỏ qua localStorage lỗi */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey, n]);

    const onPointerMove = useCallback((e: PointerEvent) => {
        const d = dragRef.current;
        if (!d || d.width <= 0) return;
        const deltaRatio = (e.clientX - d.startX) / d.width;
        const minRatio = minPx / d.width;
        let left = d.startRatios[d.idx] + deltaRatio;
        let right = d.startRatios[d.idx + 1] - deltaRatio;
        if (left < minRatio) { right -= minRatio - left; left = minRatio; }
        if (right < minRatio) { left -= minRatio - right; right = minRatio; }
        if (left < minRatio || right < minRatio) return; // không đủ chỗ cho cả hai
        const next = [...d.startRatios];
        next[d.idx] = left;
        next[d.idx + 1] = right;
        setRatios(next);
    }, [minPx]);

    const onPointerUp = useCallback(() => {
        dragRef.current = null;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setRatios((cur) => {
            try { localStorage.setItem(storageKey, JSON.stringify(cur)); } catch { /* noop */ }
            return cur;
        });
    }, [onPointerMove, storageKey]);

    const startDrag = (idx: number) => (e: React.PointerEvent) => {
        const el = containerRef.current;
        if (!el) return;
        e.preventDefault();
        dragRef.current = { idx, startX: e.clientX, startRatios: ratios, width: el.getBoundingClientRect().width };
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    return (
        <div ref={containerRef} className={`flex w-full ${className}`}>
            {cols.map((col, i) => (
                <React.Fragment key={i}>
                    <div style={{ flexGrow: ratios[i] ?? 1, flexBasis: 0, minWidth: 0 }} className="flex flex-col min-h-0">
                        {col}
                    </div>
                    {i < n - 1 && (
                        <div
                            onPointerDown={startDrag(i)}
                            role="separator"
                            aria-orientation="vertical"
                            title="Kéo để chỉnh độ rộng cột"
                            className="group relative flex-shrink-0 w-3 cursor-col-resize flex items-center justify-center self-stretch"
                        >
                            <div className="w-px h-full bg-slate-200 group-hover:bg-indigo-400 group-active:bg-indigo-500 transition-colors" />
                            <div className="absolute top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-slate-300 group-hover:bg-indigo-400 transition-colors" />
                        </div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}
