"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { DeleteConfirm } from '../../_components/CrudModal';
import { FinishingModal, type Tier } from './_components/FinishingModal';
import { api } from '../../_components/apiClient';
import { useMethodVisibility } from '@/lib/scope/use-method-visibility';

interface ProcessingOption {
    id: number;
    code: string;
    name: string;
    category: string;
    price: number;
    priceType?: string;
    is_active?: number;
    description?: string;
    scope_offset?: boolean;
    billing_mode?: string;
    moq_param?: string;
    min_charge_param?: string;
    scope_loose?: number;
    scope_bound?: number;
    scope_large_format?: number;
}

export default function FinishingsPage() {
    const [data, setData] = useState<ProcessingOption[]>([]);
    const [tiersByOption, setTiersByOption] = useState<Record<number, Tier[]>>({});
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<ProcessingOption | null>(null);
    const [deleteItem, setDeleteItem] = useState<ProcessingOption | null>(null);
    const [tab, setTab] = useState<'all' | 'digital' | 'offset'>('all');
    // Cờ hiển thị theo Phương_Pháp_In khả dụng của tenant (Req 2.2): chỉ tách tab
    // digital/offset khi CẢ HAI cùng bật; nếu chỉ 1 phương pháp thì ẩn thanh tab và
    // ép lọc về đúng phương pháp đó — không để lọt tab của phương pháp không khả dụng.
    const { showOffset, bothMethods, loaded: methodsLoaded } = useMethodVisibility();

    const loadData = useCallback(async () => {
        setLoading(true);
        const [optRes, tierRes] = await Promise.all([
            api.get<ProcessingOption[]>('/erp/processing-options'),
            api.get<Tier[]>('/erp/processing-pricing'),
        ]);
        if (optRes.success && optRes.data) setData(optRes.data);
        if (tierRes.success && tierRes.data) {
            const map: Record<number, Tier[]> = {};
            for (const t of tierRes.data) {
                const oid = Number(t.processingOptionId);
                (map[oid] ||= []).push(t);
            }
            for (const k of Object.keys(map)) map[Number(k)].sort((a, b) => Number(a.quantityFrom) - Number(b.quantityFrom));
            setTiersByOption(map);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleDelete = async () => {
        if (!deleteItem) return;
        await api.delete(`/erp/processing-options/${deleteItem.id}`);
        await loadData();
    };

    const unitMap: Record<string, string> = { per_item: 'Theo cái', per_piece: 'Theo cái', per_sheet: 'Theo tờ', fixed: 'Cố định', per_m2: 'Theo m²', per_sqm: 'Theo m²', tier: 'Bậc thang (Offset)' };
    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
    const empty = <span className="text-slate-300 text-xs">—</span>;

    const colMa: ColumnDef<ProcessingOption> = { header: 'Mã Gia Công', accessorKey: 'code' };
    const colTen: ColumnDef<ProcessingOption> = { header: 'Tên Gia Công', accessorKey: 'name' };
    const colDanhMuc: ColumnDef<ProcessingOption> = { header: 'Danh Mục', cell: (p) => {
        const catMap: Record<string, string> = { lamination: 'Cán màng', cutting: 'Cấn bế', foiling: 'Ép nhũ', binding: 'Đóng cuốn', coating: 'Phủ UV', mounting: 'Bồi/dán', other: 'Khác' };
        if (!p.category) return empty;
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">{catMap[p.category] || p.category}</span>;
    }};
    const colTinhTheo: ColumnDef<ProcessingOption> = { header: 'Tính theo', cell: (p) => p.priceType ? (unitMap[p.priceType] || p.priceType) : empty };
    const colDonGia: ColumnDef<ProcessingOption> = { header: 'Đơn giá In Nhanh', cell: (p) => {
        const cost = Number(p.price) || 0;
        return cost ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(cost) : empty;
    }};
    // ── Cột riêng cho Offset ──
    const colOffsetBilling: ColumnDef<ProcessingOption> = { header: 'Cách tính tiền', cell: (p) => {
        const bm: Record<string, string> = { perUnit: 'Theo số lượng', minCharge: 'Tối thiểu → SL', external: 'Ngoài bảng (ép kim…)' };
        return p.billing_mode ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">{bm[p.billing_mode] || p.billing_mode}</span> : empty;
    }};
    const colOffsetGia: ColumnDef<ProcessingOption> = { header: 'Giá bậc thang', cell: (p) => {
        const ts = tiersByOption[p.id] || [];
        if (!ts.length) return <span className="text-amber-500 text-xs">Chưa có mốc giá</span>;
        const prices = ts.map(t => Number(t.unitPrice) || 0);
        const lo = Math.min(...prices), hi = Math.max(...prices);
        return <span className="text-emerald-600 font-semibold text-[13px]">{lo === hi ? `${fmt(lo)}₫` : `${fmt(lo)} – ${fmt(hi)}₫`} <span className="text-slate-400 font-normal">· {ts.length} mốc</span></span>;
    }};
    const colTrangThai: ColumnDef<ProcessingOption> = { header: 'Trạng Thái', cell: (p) => (
        <span className={`px-2 py-1 rounded text-xs font-bold ${Number(p.is_active) === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {Number(p.is_active) === 1 ? 'Hiện hành' : 'Ngừng'}
        </span>
    )};
    const colThaoTac: ColumnDef<ProcessingOption> = { header: 'Thao tác', cell: (p) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={() => { setEditItem(p); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors" title="Sửa">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </button>
            <button onClick={() => setDeleteItem(p)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors" title="Xóa">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        </div>
    )};
    // ── Cột THÍCH ỨNG cho tab "Tất cả" (đổi theo từng dòng là In Nhanh hay Offset) ──
    const colLoai: ColumnDef<ProcessingOption> = { header: 'Loại', cell: (p) => p.scope_offset
        ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">Offset</span>
        : <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-700">In Nhanh</span> };
    const colTinhTheoMix: ColumnDef<ProcessingOption> = { header: 'Tính theo', cell: (p) => {
        if (p.scope_offset) {
            const bm: Record<string, string> = { perUnit: 'Theo số lượng', minCharge: 'Tối thiểu → SL', external: 'Ngoài bảng' };
            return p.billing_mode ? (bm[p.billing_mode] || p.billing_mode) : empty;
        }
        return p.priceType ? (unitMap[p.priceType] || p.priceType) : empty;
    }};
    const colGiaMix: ColumnDef<ProcessingOption> = { header: 'Giá', cell: (p) => {
        if (p.scope_offset) {
            const ts = tiersByOption[p.id] || [];
            if (!ts.length) return <span className="text-amber-500 text-xs">Chưa có mốc giá</span>;
            const prices = ts.map(t => Number(t.unitPrice) || 0);
            const lo = Math.min(...prices), hi = Math.max(...prices);
            return <span className="text-emerald-600 font-semibold text-[13px]">{lo === hi ? `${fmt(lo)}₫` : `${fmt(lo)}–${fmt(hi)}₫`} <span className="text-slate-400 font-normal">· {ts.length} mốc</span></span>;
        }
        const cost = Number(p.price) || 0;
        return cost ? <span className="font-semibold text-slate-700">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(cost)}</span> : empty;
    }};
    const columnsFor = (t: 'all' | 'digital' | 'offset'): ColumnDef<ProcessingOption>[] =>
        t === 'offset' ? [colMa, colTen, colOffsetBilling, colOffsetGia, colTrangThai, colThaoTac]
        : t === 'digital' ? [colMa, colTen, colDanhMuc, colTinhTheo, colDonGia, colTrangThai, colThaoTac]
        : [colMa, colTen, colLoai, colTinhTheoMix, colGiaMix, colTrangThai, colThaoTac];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cấu hình gia công</h1>
                    <p className="text-slate-500 text-sm mt-1">Danh mục thành phẩm sau in (cán màng, bế, ép kim…). <strong>In Nhanh</strong> dùng đơn giá gốc; bật <strong>"Dùng cho In Offset"</strong> để cấu hình luôn bảng bậc thang Offset ngay trong mục này.</p>
                </div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Thêm gia công
                </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
                {(() => {
                    const isDigital = (p: ProcessingOption) => !!(p.scope_loose || p.scope_bound || p.scope_large_format) || !p.scope_offset;
                    const isOffset = (p: ProcessingOption) => !!p.scope_offset;
                    const nDigital = data.filter(isDigital).length;
                    const nOffset = data.filter(isOffset).length;

                    // Tenant chỉ bật digital (offset tắt): ẩn hẳn thanh tab + mọi dòng
                    // Offset; chỉ hiện danh mục gia công In Nhanh. Ngược lại khi chỉ bật
                    // offset thì tương tự cho digital. Chỉ khi CẢ HAI bật mới hiện 3 tab.
                    const effTab = methodsLoaded && !bothMethods
                        ? (showOffset ? 'offset' : 'digital')
                        : tab;
                    const baseData = methodsLoaded && !bothMethods
                        ? (showOffset ? data.filter(isOffset) : data.filter(isDigital))
                        : data;
                    const filtered = effTab === 'digital' ? baseData.filter(isDigital)
                        : effTab === 'offset' ? baseData.filter(isOffset)
                        : baseData;
                    return (
                        <>
                            {bothMethods && (
                                <div className="flex gap-1 mb-3">
                                    {([['all', `Tất cả (${data.length})`], ['digital', `In Nhanh (${nDigital})`], ['offset', `In Offset (${nOffset})`]] as [typeof tab, string][]).map(([id, label]) => (
                                        <button key={id} onClick={() => setTab(id)}
                                            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${tab === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex-1 min-h-0">
                                <DataTable columns={columnsFor(effTab)} data={filtered} isLoading={loading} stickyActions />
                            </div>
                        </>
                    );
                })()}
            </div>

            <FinishingModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSaved={loadData} editItem={editItem} initialTiers={editItem ? (tiersByOption[editItem.id] || []) : []} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />
        </div>
    );
}
