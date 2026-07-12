import { useEffect } from 'react';

interface DeleteConfirmModalProps {
    onConfirm: () => void;
    onCancel: () => void;
}

export function DeleteConfirmModal({ onConfirm, onCancel }: DeleteConfirmModalProps) {
    // Close on Escape key
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onCancel]);

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
            onClick={onCancel}
        >
            <div
                className="bg-white p-6 rounded-2xl w-[420px] shadow-[0_20px_40px_rgba(0,0,0,0.2)] border border-slate-200 animate-[scaleIn_0.2s_ease-out]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                    </div>
                    <h3 className="m-0 text-lg text-slate-900 font-semibold">Xóa hội thoại?</h3>
                </div>
                <p className="mb-6 text-slate-600 text-[14.5px] leading-relaxed">
                    Bạn có chắc chắn muốn xóa vĩnh viễn cuộc hội thoại này không?<br/>
                    Toàn bộ tin nhắn và dữ liệu liên quan sẽ bị xóa sạch, <b>không thể khôi phục</b>.
                </p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-[18px] py-2.5 bg-slate-100 border border-slate-300 rounded-lg cursor-pointer text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-[18px] py-2.5 bg-red-600 border-none rounded-lg cursor-pointer text-white font-semibold text-sm hover:bg-red-700 transition-colors"
                    >
                        Xóa Vĩnh Viễn
                    </button>
                </div>
            </div>
        </div>
    );
}
