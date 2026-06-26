'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface ConfirmModalProps {
  /** Hiển thị modal khi true; ẩn hoàn toàn khi false. */
  open: boolean;
  /** Tiêu đề hộp thoại, dùng làm nhãn accessible cho dialog. */
  title: string;
  /** Bật ô nhập lý do (ví dụ từ chối / hủy). */
  requireReason?: boolean;
  /** Nhãn cho ô nhập lý do khi requireReason = true. */
  reasonLabel?: string;
  /** Nhãn nút xác nhận. Mặc định "Xác nhận". */
  confirmLabel?: string;
  /** Đang xử lý: vô hiệu hóa nút xác nhận và chặn double-click. */
  pending?: boolean;
  /** Gọi khi người dùng xác nhận; truyền lý do (chuỗi rỗng nếu không yêu cầu). */
  onConfirm: (reason: string) => void;
  /** Gọi khi người dùng hủy (nút Hủy, phím Esc, hoặc click nền). */
  onCancel: () => void;
}

/**
 * Hộp_Thoại_Xác_Nhận dùng chung trong ứng dụng, thay cho `confirm`/`prompt` trình duyệt.
 * - role="dialog", aria-modal, được nhãn bởi title.
 * - requireReason → hiển thị textarea (nhãn = reasonLabel) và truyền giá trị qua onConfirm.
 * - pending → vô hiệu hóa nút xác nhận, chặn kích hoạt trùng lặp.
 * - Esc / click nền → onCancel.
 * _Requirements: 4.1_
 */
export function ConfirmModal({
  open,
  title,
  requireReason = false,
  reasonLabel = 'Lý do',
  confirmLabel = 'Xác nhận',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');
  const titleId = useId();
  const reasonId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset ô lý do mỗi lần mở modal.
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  // Đóng bằng phím Esc khi đang mở và không trong trạng thái pending.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, pending, onCancel]);

  // Tự focus ô lý do khi mở (nếu có).
  useEffect(() => {
    if (open && requireReason) textareaRef.current?.focus();
  }, [open, requireReason]);

  if (!open) return null;

  const handleConfirm = () => {
    if (pending) return;
    onConfirm(requireReason ? reason : '');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        // Chỉ đóng khi click trực tiếp lên nền (không phải bên trong dialog).
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg bg-white shadow-xl ring-1 ring-slate-200"
      >
        <div className="px-5 pt-5 pb-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-800">
            {title}
          </h2>
        </div>

        {requireReason && (
          <div className="px-5 pb-2">
            <label htmlFor={reasonId} className="mb-1.5 block text-sm font-medium text-slate-600">
              {reasonLabel}
            </label>
            <textarea
              id={reasonId}
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              disabled={pending}
              className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            aria-busy={pending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
