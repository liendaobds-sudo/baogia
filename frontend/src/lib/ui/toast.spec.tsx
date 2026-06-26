import { act, render, screen, within } from '@testing-library/react';
import { ToastProvider, useToast } from './toast';

/**
 * Component test cho ToastProvider / useToast.
 * _Requirements: 4.2, 4.3, 4.5_
 */

/** Consumer nhỏ: phơi bày `show` ra các nút bấm để test kích hoạt toast. */
function ToastConsumer() {
  const { show } = useToast();
  return (
    <div>
      <button onClick={() => show('success', 'Đã lưu báo giá')}>show-success</button>
      <button onClick={() => show('error', 'Lưu thất bại')}>show-error</button>
    </div>
  );
}

function renderConsumer() {
  return render(
    <ToastProvider>
      <ToastConsumer />
    </ToastProvider>,
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders a success message inside the role="status" / aria-live region', () => {
    renderConsumer();

    act(() => {
      screen.getByText('show-success').click();
    });

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(within(region).getByText('Đã lưu báo giá')).toBeInTheDocument();
  });

  it('renders multiple toasts together', () => {
    renderConsumer();

    act(() => {
      screen.getByText('show-success').click();
      screen.getByText('show-error').click();
    });

    const region = screen.getByRole('status');
    expect(within(region).getByText('Đã lưu báo giá')).toBeInTheDocument();
    expect(within(region).getByText('Lưu thất bại')).toBeInTheDocument();
  });

  it('auto-dismisses a toast after ~4000ms', () => {
    renderConsumer();

    act(() => {
      screen.getByText('show-success').click();
    });

    expect(screen.getByText('Đã lưu báo giá')).toBeInTheDocument();

    // Chưa tới ngưỡng tự ẩn: vẫn còn hiển thị.
    act(() => {
      jest.advanceTimersByTime(3999);
    });
    expect(screen.getByText('Đã lưu báo giá')).toBeInTheDocument();

    // Qua ngưỡng ~4000ms: tự ẩn.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Đã lưu báo giá')).not.toBeInTheDocument();
  });
});
