"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../_components/CrudModal';
import { api } from '../../_components/apiClient';

interface PrintType {
    id: number;
    code: string;
    name: string;
    shortName?: string;
    description?: string;
    sortOrder?: number;
    isActive?: boolean;
}

const FIELDS: FieldDef[] = [
    { key: 'code', label: 'Mã hệ màu', type: 'text', required: true, placeholder: 'VD: 4c, 1c, uv' },
    { key: 'name', label: 'Tên đầy đủ', type: 'text', required: true, placeholder: '4 màu (CMYK)' },
    { key: 'shortName', label: 'Tên tắt', type: 'text', placeholder: '4C' },
    { key: 'description', label: 'Mô tả', type: 'textarea', placeholder: 'Mô tả chi tiết...' },
    { key: 'sortOrder', label: 'Thứ tự', type: 'number', defaultValue: 0 },
    { key: 'isActive', label: 'Trạng thái', type: 'checkbox', placeholder: 'Đang hoạt động', defaultValue: true },
];

const COLOR_BADGES: Record<string, [string, string]> = {
    '4c': ['4C CMYK', 'bg-cyan-100 text-cyan-700'],
    '1c': ['1C Đen', 'bg-slate-200 text-slate-700'],
    '5c': ['5C', 'bg-violet-100 text-violet-700'],
    '6c': ['6C', 'bg-purple-100 text-purple-700'],
    'uv': ['UV', 'bg-amber-100 text-amber-700'],
    'silk': ['Lụa', 'bg-rose-100 text-rose-700'],
    'bw': ['B&W', 'bg-gray-200 text-gray-700'],
};

export default function PrintTypesPage() {
    const [data, setData] = useState<PrintType[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<PrintType | null>(null);
    const [deleteItem, setDeleteItem] = useState<PrintType | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<PrintType[]>('/erp/print-types');
        if (res.success && res.data) setData(res.data);
        else setData([]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        if (editItem) {
            const res = await api.put(`/erp/print-types/${editItem.id}`, formData);
            if (!res.success) throw new Error(res.error || 'Lỗi cập nhật');
        } else {
            const res = await api.post('/erp/print-types', formData);
            if (!res.success) throw new Error(res.error || 'Lỗi thêm mới');
        }
        await loadData();
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        await api.delete(`/erp/print-types/${deleteItem.id}`);
        await loadData();
    };

    const columns: ColumnDef<PrintType>[] = [
        { header: 'Mã', accessorKey: 'code', cell: (t) => {
            const [label, cls] = COLOR_BADGES[t.code] || [t.code, 'bg-slate-100 text-slate-700'];
            return <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{label}</span>;
        }},
        { header: 'Tên Hệ Màu', accessorKey: 'name' },
        { header: 'Tên Tắt', accessorKey: 'shortName' },
        { header: 'Trạng Thái', cell: (t) => (
            <span className={`px-2 py-1 rounded text-xs font-bold ${t.isActive !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                {t.isActive !== false ? 'Hoạt động' : 'Tắt'}
            </span>
        )},
        { header: 'Thao tác', cell: (t) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditItem(t); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => setDeleteItem(t)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Hệ Màu In</h1>
                    <p className="text-slate-500 text-sm mt-1">Quản lý các hệ màu: CMYK, Đen trắng, UV, In Lụa — liên kết với bảng giá theo mốc.</p>
                </div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Thêm Hệ Màu
                </button>
            </div>

            <div className="flex-1 min-h-0">
                <DataTable columns={columns} data={data} isLoading={loading} />
            </div>

            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="Hệ Màu In" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />
        </div>
    );
}
