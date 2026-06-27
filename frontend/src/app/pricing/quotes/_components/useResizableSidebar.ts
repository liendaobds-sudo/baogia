'use client';
/**
 * useResizableSidebar — quản lý độ rộng sidebar kéo giãn được, lưu vào localStorage.
 *
 * Trả về:
 *  - width: độ rộng hiện tại (px)
 *  - isResizing: đang kéo (để tắt transition cho mượt)
 *  - startResize: gắn vào onPointerDown của thanh kéo
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useResizableSidebar(storageKey: string, defaultWidth = 320, min = 220, max = 600) {
    const [width, setWidth] = useState(defaultWidth);
    const [isResizing, setIsResizing] = useState(false);
    const dragRef = useRef<{ startX: number; startW: number } | null>(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const w = parseInt(raw, 10);
                if (Number.isFinite(w) && w >= min && w <= max) setWidth(w);
            }
        } catch { /* bỏ qua */ }
    }, [storageKey, min, max]);

    const onMove = useCallback((e: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        let w = d.startW + (e.clientX - d.startX);
        if (w < min) w = min;
        if (w > max) w = max;
        setWidth(w);
    }, [min, max]);

    const onUp = useCallback(() => {
        dragRef.current = null;
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setIsResizing(false);
        setWidth((w) => {
            try { localStorage.setItem(storageKey, String(w)); } catch { /* noop */ }
            return w;
        });
    }, [onMove, storageKey]);

    const startResize = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        dragRef.current = { startX: e.clientX, startW: width };
        setIsResizing(true);
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [width, onMove, onUp]);

    return { width, isResizing, startResize };
}
