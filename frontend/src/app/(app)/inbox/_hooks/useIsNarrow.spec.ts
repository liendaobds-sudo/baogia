import { renderHook, act } from '@testing-library/react';
import { useIsNarrow } from './useIsNarrow';

/**
 * useIsNarrow phản ánh đúng ngưỡng matchMedia và cập nhật khi 'change'.
 * Validates: Requirements 1.1
 */
describe('useIsNarrow', () => {
    let listeners: Array<(e: any) => void>;
    let currentMatches: boolean;

    beforeEach(() => {
        listeners = [];
        currentMatches = false;
        (window as any).matchMedia = jest.fn().mockImplementation((query: string) => ({
            matches: currentMatches,
            media: query,
            addEventListener: (_: string, cb: (e: any) => void) => listeners.push(cb),
            removeEventListener: (_: string, cb: (e: any) => void) => {
                listeners = listeners.filter(l => l !== cb);
            },
        }));
    });

    it('trả false khi viewport rộng', () => {
        currentMatches = false;
        const { result } = renderHook(() => useIsNarrow());
        expect(result.current).toBe(false);
    });

    it('trả true khi viewport hẹp', () => {
        currentMatches = true;
        const { result } = renderHook(() => useIsNarrow());
        expect(result.current).toBe(true);
    });

    it('cập nhật khi bắn sự kiện change', () => {
        currentMatches = false;
        const { result } = renderHook(() => useIsNarrow());
        expect(result.current).toBe(false);
        act(() => { listeners.forEach(l => l({ matches: true })); });
        expect(result.current).toBe(true);
    });
});
