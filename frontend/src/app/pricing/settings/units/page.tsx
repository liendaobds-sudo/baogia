"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../_components/CrudModal';
import { api } from '../../_components/apiClient';

interface Unit {
    id: number;
    code: string;
    name: string;
    symbol: string;
    type?: string;
}

const FIELDS: FieldDef[] = [
    { key: 'code', label: 'Mã đơn vị', type: 'text', required: true, placeholder: 'VD: sheet, sqm, kg, roll' },
    { key: 'name', label: 'Tên đơn vị', type: 'text', required: true, placeholder: 'Tờ / Mét vuông / Kilôgam' },
    { key: 'symbol', label: 'Ký hiệu (hiển thị)', type: 'text', required: true, placeholder: 'tờ / m² / kg' },
    { key: 'type', label: 'Nhóm', type: 'select', defaultValue: 'count', options: [
        { value: 'count', label: 'Đếm (cái/tờ...)' },
        { value: 'area', label: 'Diện tích (m²)' },
        { value: 'weight', label: 'Khối lượng (kg)' },
        { value: 'volume', label: 'Thể tích' },
    ] },
];

export default function UnitsPage() {
    const [data, setData] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Unit | null>(null);
    const [deleteItem, setDeleteItem] = useState<Unit | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<Unit[]>('/erp/units');
        if (res.success && res.data) setData(res.data);
        else setData([]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        if (editItem) {
            const res = await api.put(`/erp/units/${editItem.id}`, formData);
            if (!res.success) throw new Error(res.error || 'Lỗi cập nhật');
        } else {
            const res = await api.post('/erp/units', formData);
            if (!res.success) throw new Error(res.error || 'Lỗi thêm mới');
        }
        await loadData();
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        await api.delete(`/erp/units/${deleteItem.id}`);
        await loadData();
    };

    const columns: ColumnDef<Unit>[] = [
        { header: 'ID', accessorKey: 'id' },
        { header: 'Mã', accessorKey: 'code' },
        { header: 'Tên Đơn Vị', accessorKey: 'name' },
        { header: 'Ký Hiệu', cell: (u) => <span className="font-semibold text-slate-700">{u.symbol || '—'}</span> },
        { header: 'Nhóm', cell: (u) => <span className="text-slate-500 text-sm">{({ count: 'Đếm', area: 'Diện tích', weight: 'Khối lượng', volume: 'Thể tích' } as Record<string, string>)[u.type || ''] || u.type || '—'}</span> },
        { header: 'Thao tác', cell: (u) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditItem(u); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => setDeleteItem(u)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Đơn vị tính</h1>
                    <p className="text-slate-500 text-sm mt-1">Quản lý các đơn vị tính: tờ, cái, cuốn, m², kg.</p>
                </div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Thêm Đơn Vị
                </button>
            </div>
            <div className="flex-1 min-h-0">
                <DataTable columns={columns} data={data} isLoading={loading} />
            </div>
            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="Đơn Vị Tính" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />
        </div>
    );
}
