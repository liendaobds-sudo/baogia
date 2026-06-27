'use client';
/**
 * quote-ui — Nguồn dùng chung (single source) cho UI hai luồng báo giá:
 * KỸ THUẬT SỐ (pricing/quotes/new) và OFFSET (pricing/quotes/offset).
 *
 * Mục tiêu: đồng bộ format tiền, token nhãn/input, thẻ chỉ số, tiêu đề section
 * để hai trang nhìn nhất quán. Tránh mỗi nơi tự định nghĩa một kiểu.
 */
import React from 'react';

// Re-export bộ định dạng tiền tệ dùng chung — cả 2 luồng phải dùng đúng 1 ký hiệu " ₫".
export { formatVND } from '@/lib/format/currency';

// ── Token nhãn & input dùng chung ────────────────────────────────
/** Nhãn field: chữ nhỏ in hoa, theo quy ước của trang báo giá chi tiết. */
export const LBL = 'block text-[10px] font-bold text-slate-600 mb-1 uppercase tracking-wide';
/** Ô input/select dùng chung. */
export const INP =
    'w-full text-sm font-medium px-3 py-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white';

// ── Thẻ chỉ số thống kê dùng chung (Số con/tờ, Hiệu suất, …) ──────
export function StatCard({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
    return (
        <div className={`pt-2 pb-2.5 rounded-lg border shadow-sm ${tone}`}>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-0.5 opacity-80">{label}</div>
            <div className="text-lg font-black tracking-tight">{value}</div>
        </div>
    );
}

/** Tông màu chuẩn cho StatCard — dùng chung để hai trang trùng bảng màu. */
export const STAT_TONE = {
    blue: 'bg-blue-50/80 border-blue-100/60 text-blue-700',
    emerald: 'bg-emerald-50/80 border-emerald-100/60 text-emerald-700',
    amber: 'bg-amber-50/80 border-amber-100/60 text-amber-700',
    indigo: 'bg-indigo-50/80 border-indigo-100/60 text-indigo-700',
} as const;

// ── Tiêu đề section đánh số dùng chung ───────────────────────────
export function SectionTitle({ num, children }: { num: number; children: React.ReactNode }) {
    return (
        <h4 className="font-bold text-[11px] mb-2.5 text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b-2 border-slate-200 pb-1.5">
            <span className="bg-indigo-100 text-indigo-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px]">{num}</span>
            {children}
        </h4>
    );
}
