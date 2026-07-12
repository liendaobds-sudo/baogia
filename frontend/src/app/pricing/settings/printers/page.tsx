"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../_components/CrudModal';
import { api } from '../../_components/apiClient';

// Hồ sơ chi phí máy in (tầng 3) — nguồn để suy machine/labor/overhead per tờ khi gợi ý giá định mức.
interface Printer {
    id: number;
    code: string;
    name: string;
    resolution?: string;
    machineValue?: number;
    depreciationYears?: number;
    sheetsPerMonth?: number;
    electricityPerHour?: number;
    sheetsPerHour?: number;
    staffCount?: number;
    avgSalaryMonthly?: number;
    rentMonthly?: number;
    utilitiesMonthly?: number;
    otherMonthly?: number;
    costBasis?: string;
    sqmPerMonth?: number;
    sqmPerHour?: number;
    is_active?: number;
}

const FIELDS: FieldDef[] = [
    { key: 'code', label: 'Mã máy', type: 'text', required: true, placeholder: 'VD: KM-C3070' },
    { key: 'name', label: 'Tên máy', type: 'text', required: true, placeholder: 'Konica Minolta C3070' },
    { key: 'resolution', label: 'Độ phân giải', type: 'text', placeholder: '1200dpi' },
    // Đơn vị phân bổ chi phí: máy in nhanh tính theo TỜ, máy khổ lớn (bạt/decal) tính theo M².
    { key: 'costBasis', label: 'Đơn vị tính chi phí', type: 'select', defaultValue: 'sheet', section: 'Đơn vị máy',
        options: [{ value: 'sheet', label: 'Theo tờ (in nhanh)' }, { value: 'sqm', label: 'Theo m² (khổ lớn)' }],
        hint: 'Chọn "m²" cho máy in khổ lớn (bạt, decal); "tờ" cho máy in nhanh.' },
    // ── Máy (khấu hao + điện) ──
    { key: 'machineValue', label: 'Nguyên giá máy (đ)', type: 'number', defaultValue: 0, placeholder: 'VD: 1200000000', section: 'Máy (khấu hao + điện)' },
    { key: 'depreciationYears', label: 'Số năm khấu hao', type: 'number', defaultValue: 5 },
    { key: 'electricityPerHour', label: 'Điện / giờ (đ)', type: 'number', defaultValue: 50000 },
    // Mẫu số phân bổ theo TỜ (cost_basis='sheet').
    { key: 'sheetsPerMonth', label: 'Sản lượng / tháng (tờ)', type: 'number', defaultValue: 100000, hint: 'Dùng khi tính theo tờ.' },
    { key: 'sheetsPerHour', label: 'Tốc độ (tờ / giờ)', type: 'number', defaultValue: 1000, hint: 'Dùng khi tính theo tờ.' },
    // Mẫu số phân bổ theo M² (cost_basis='sqm').
    { key: 'sqmPerMonth', label: 'Sản lượng / tháng (m²)', type: 'number', defaultValue: 0, hint: 'Dùng khi tính theo m² (khổ lớn).' },
    { key: 'sqmPerHour', label: 'Tốc độ (m² / giờ)', type: 'number', defaultValue: 0, hint: 'Dùng khi tính theo m² (khổ lớn).' },
    // ── Công ──
    { key: 'staffCount', label: 'Số nhân công', type: 'number', defaultValue: 3, section: 'Công' },
    { key: 'avgSalaryMonthly', label: 'Lương bình quân / tháng (đ)', type: 'number', defaultValue: 12000000 },
    // ── Overhead ──
    { key: 'rentMonthly', label: 'Thuê mặt bằng / tháng (đ)', type: 'number', defaultValue: 20000000, section: 'Overhead' },
    { key: 'utilitiesMonthly', label: 'Tiện ích chung / tháng (đ)', type: 'number', defaultValue: 5000000 },
    { key: 'otherMonthly', label: 'Chi phí khác / tháng (đ)', type: 'number', defaultValue: 5000000 },
];

const fmt = (n: number | undefined | null) => new Intl.NumberFormat('vi-VN').format(n || 0);

export default function PrintersPage() {
    const [data, setData] = useState<Printer[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Printer | null>(null);
    const [deleteItem, setDeleteItem] = useState<Printer | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<Printer[]>('/erp/printers');
        if (res.success && res.data) setData(res.data);
        else setData([]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        if (editItem) {
            const res = await api.put(`/erp/printers/${editItem.id}`, formData);
            if (!res.success) throw new Error(res.error || 'Lỗi cập nhật');
        } else {
            const res = await api.post('/erp/printers', formData);
            if (!res.success) throw new Error(res.error || 'Lỗi thêm mới');
        }
        await loadData();
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        await api.delete(`/erp/printers/${deleteItem.id}`);
        await loadData();
    };

    const columns: ColumnDef<Printer>[] = [
        { header: 'Máy', cell: (p) => (
            <div>
                <div className="font-bold text-slate-800 flex items-center gap-2">
                    {p.name}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.costBasis === 'sqm' ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700'}`}>
                        {p.costBasis === 'sqm' ? 'm² · khổ lớn' : 'tờ · in nhanh'}
                    </span>
                </div>
                <div className="text-xs text-slate-500 font-mono">{p.code}{p.resolution ? ` · ${p.resolution}` : ''}</div>
            </div>
        )},
        { header: 'Nguyên giá', cell: (p) => <span className="text-slate-700">{fmt(p.machineValue)}đ</span> },
        { header: 'SL / tháng', cell: (p) => <span className="text-slate-700">{p.costBasis === 'sqm' ? `${fmt(p.sqmPerMonth)} m²` : `${fmt(p.sheetsPerMonth)} tờ`}</span> },
        { header: 'Nhân công', cell: (p) => <span className="text-slate-700">{p.staffCount || 0} × {fmt(p.avgSalaryMonthly)}đ</span> },
        { header: 'Overhead / tháng', cell: (p) => <span className="text-slate-700">{fmt((p.rentMonthly || 0) + (p.utilitiesMonthly || 0) + (p.otherMonthly || 0))}đ</span> },
        { header: 'Thao tác', cell: (p) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditItem(p); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => setDeleteItem(p)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Chi phí máy in</h1>
                    <p className="text-slate-500 text-sm mt-1">Hồ sơ chi phí từng máy (khấu hao, điện, nhân công, overhead) — dùng để gợi ý giá định mức.</p>
                </div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Thêm máy
                </button>
            </div>

            <div className="flex-1 min-h-0">
                <DataTable columns={columns} data={data} isLoading={loading} />
            </div>

            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="Chi phí máy in" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />
        </div>
    );
}
