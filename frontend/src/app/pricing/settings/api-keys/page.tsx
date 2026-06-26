"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../_components/CrudModal';
import { api } from '../../_components/apiClient';

interface ApiKey { id: number; name: string; key: string; permissions: string; created_at: string; last_used?: string; is_active: boolean; }

const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Tên API Key', type: 'text', required: true, placeholder: 'VD: Website Integration' },
    { key: 'permissions', label: 'Quyền truy cập', type: 'select', options: [
        { value: 'read', label: 'Chỉ đọc (Read-only)' },
        { value: 'read_write', label: 'Đọc & Ghi (Read-Write)' },
        { value: 'full', label: 'Toàn quyền (Full Access)' },
    ], defaultValue: 'read' },
    { key: 'is_active', label: 'Trạng thái', type: 'checkbox', placeholder: 'Kích hoạt', defaultValue: true },
];

export default function ApiKeysPage() {
    const [data, setData] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<ApiKey | null>(null);
    const [deleteItem, setDeleteItem] = useState<ApiKey | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<ApiKey[]>('/erp/api-keys');
        if (res.success && res.data) setData(res.data);
        else setData([]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        if (editItem) {
            const res = await api.put(`/erp/api-keys/${editItem.id}`, formData);
            if (!res.success) throw new Error(res.error || 'Lỗi');
        } else {
            const res = await api.post('/erp/api-keys', formData);
            if (!res.success) throw new Error(res.error || 'Lỗi');
        }
        await loadData();
    };

    const handleDelete = async () => { if (deleteItem) { await api.delete(`/erp/api-keys/${deleteItem.id}`); await loadData(); } };

    const columns: ColumnDef<ApiKey>[] = [
        { header: 'Tên', accessorKey: 'name' },
        { header: 'API Key', cell: (k) => <code className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-mono">{k.key ? '••••' + k.key.slice(-8) : '—'}</code> },
        { header: 'Quyền', cell: (k) => <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">{k.permissions}</span> },
        { header: 'Trạng thái', cell: (k) => <span className={`px-2 py-1 rounded text-xs font-bold ${k.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{k.is_active ? 'Active' : 'Inactive'}</span> },
        { header: 'Thao tác', cell: (k) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditItem(k); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => setDeleteItem(k)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">API Keys</h1>
                    <p className="text-slate-500 text-sm mt-1">Quản lý khóa API cho các hệ thống bên ngoài.</p>
                </div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Tạo API Key
                </button>
            </div>
            <div className="flex-1 min-h-0"><DataTable columns={columns} data={data} isLoading={loading} /></div>
            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="API Key" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />
        </div>
    );
}
