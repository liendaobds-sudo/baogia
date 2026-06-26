import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmModal } from './ConfirmModal';

/**
 * Component test cho ConfirmModal.
 * _Requirements: 4.1_
 */

describe('ConfirmModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <ConfirmModal
        open={false}
        title="Xác nhận hành động"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes the typed reason to onConfirm when requireReason is set', () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmModal
        open
        title="Từ chối báo giá"
        requireReason
        reasonLabel="Lý do từ chối"
        confirmLabel="Từ chối"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    const textarea = screen.getByLabelText('Lý do từ chối');
    fireEvent.change(textarea, { target: { value: 'Giá quá cao' } });

    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('Giá quá cao');
  });

  it('disables the confirm button when pending=true', () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmModal
        open
        title="Đang xử lý"
        pending
        confirmLabel="Xác nhận"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    // Khi pending, nhãn nút đổi sang trạng thái đang xử lý.
    const confirmButton = screen.getByRole('button', { name: 'Đang xử lý…' });
    expect(confirmButton).toBeDisabled();

    // Click trong lúc pending không kích hoạt onConfirm.
    fireEvent.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when the Cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmModal
        open
        title="Xác nhận hành động"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmModal
        open
        title="Xác nhận hành động"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
