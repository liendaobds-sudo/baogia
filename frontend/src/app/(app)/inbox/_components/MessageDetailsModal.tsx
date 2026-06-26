'use client';

import type { ChatMessage } from '../types';

const STATUS_LABELS: Record<string, string> = {
    new: 'Mới', in_progress: 'Đang xử lý', waiting_customer: 'Chờ khách',
    waiting_file: 'Chờ file', quoted: 'Đã báo giá', won: 'Chốt đơn',
    lost: 'Mất đơn', closed: 'Đã đóng',
};

interface MessageDetailsModalProps {
    message: ChatMessage;
    onClose: () => void;
}

export function MessageDetailsModal({ message, onClose }: MessageDetailsModalProps) {
    return (
        <div className="absolute inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl p-6 min-w-[320px] shadow-xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="m-0 text-base text-slate-900">Chi tiết tin nhắn</h3>
                    <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-lg text-slate-500">✕</button>
                </div>
                <div className="flex flex-col gap-3 text-sm">
                    {[
                        ['ID Giao dịch:', <span key="id" className="font-mono text-slate-900">{message.id.split('-')[0]}</span>],
                        ['Thời gian tạo:', new Date(message.createdAt).toLocaleString('vi-VN')],
                        ['Loại nội dung:', <span key="ct" className="capitalize">{message.contentType}</span>],
                        ['Trạng thái gửi:', STATUS_LABELS[message.status] || message.status],
                        ['Lưu trữ trích dẫn:', message.quoteData ? 'Có' : 'Không'],
                    ].map(([label, value], i) => (
                        <div key={i} className="flex justify-between">
                            <span className="text-slate-500">{label}</span>
                            <span className="text-slate-900">{value}</span>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-100 border-none rounded-md cursor-pointer text-slate-700 font-medium">Đóng</button>
                </div>
            </div>
        </div>
    );
}
