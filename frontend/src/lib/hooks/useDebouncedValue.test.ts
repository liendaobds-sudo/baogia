import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

// Unit tests cho useDebouncedValue dùng jest fake timers.
// _Requirements: 8.1, 8.2_

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('trả về giá trị khởi tạo ngay lập tức', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('cập nhật giá trị trễ sau khi qua đủ delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    // Chưa qua delay -> vẫn giữ giá trị cũ.
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('b');
  });

  it('không cập nhật trước khi đủ delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });

    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('nhiều cập nhật nhanh trong < delay chỉ emit giá trị CUỐI một lần sau khi yên >= delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'v0' } },
    );

    // Mỗi lần đổi cách nhau 100ms (< delay 300ms) -> timer trước bị huỷ.
    rerender({ value: 'v1' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe('v0');

    rerender({ value: 'v2' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe('v0');

    rerender({ value: 'v3' });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBe('v0');

    // Bây giờ để yên đủ delay -> chỉ giá trị cuối (v3) được emit.
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('v3');

    // Không có cập nhật thừa khi tiếp tục chạy timer.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe('v3');
  });

  it('emit đúng MỘT lần giá trị cuối (không nhảy qua giá trị trung gian)', () => {
    const seen: string[] = [];
    const { rerender } = renderHook(
      ({ value }) => {
        const debounced = useDebouncedValue(value, 300);
        seen.push(debounced);
        return debounced;
      },
      { initialProps: { value: 'start' } },
    );

    rerender({ value: 'mid' });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    rerender({ value: 'final' });
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Giá trị trung gian 'mid' không bao giờ được commit.
    expect(seen).not.toContain('mid');
    // Giá trị cuối được emit đúng một lần.
    expect(seen.filter((v) => v === 'final')).toHaveLength(1);
  });

  it('dọn timeout khi unmount (không cập nhật state sau unmount)', () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    unmount();

    // Chạy hết timer còn lại; không có lỗi/cảnh báo cập nhật sau unmount.
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('a');
  });

  it('tôn trọng delay tuỳ biến', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 500),
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe('b');
  });
});
