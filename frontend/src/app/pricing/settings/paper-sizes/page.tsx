"use client";
import { useState } from 'react';
import { DigitalPaperSizes } from './_components/DigitalPaperSizes';
import { OffsetPaperSizes } from './_components/OffsetPaperSizes';

export default function PaperSizesPage() {
    const [activeTab, setActiveTab] = useState<'digital' | 'offset'>('digital');

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Kích Thước Khổ Giấy</h1>
                <p className="text-slate-500 text-sm mt-1">
                    Thiết lập các tiêu chuẩn cắt khổ và định mức kích thước dùng cho bảng tính giá.
                </p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 mb-0">
                <button
                    onClick={() => setActiveTab('digital')}
                    className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 ${
                        activeTab === 'digital'
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    In Kỹ Thuật Số (Digital)
                </button>
                <button
                    onClick={() => setActiveTab('offset')}
                    className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 ${
                        activeTab === 'offset'
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                    In Offset
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 flex flex-col pt-4">
                {activeTab === 'digital' && <DigitalPaperSizes />}
                {activeTab === 'offset' && <OffsetPaperSizes />}
            </div>
        </div>
    );
}
