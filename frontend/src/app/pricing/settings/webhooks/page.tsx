"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../_components/CrudModal';
import { api } from '../../_components/apiClient';

interface Webhook { id: number; name: string; url: string; events: string; secret?: string; is_active: boolean; }

const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Tên webhook', type: 'text', required: true, placeholder: 'VD: Order notification' },
    { key: 'url', label: 'URL đích', type: 'text', required: true, placeholder: 'https://your-domain.com/webhook' },
    { key: 'events', label: 'Sự kiện', type: 'select', options: [
        { value: 'quote.created', label: 'Tạo báo giá' },
        { value: 'quote.updated', label: 'Cập nhật BG' },
        { value: 'quote.approved', label: 'Duyệt BG' },
        { value: 'all', label: 'Tất cả sự kiện' },
    ], defaultValue: 'all' },
    { key: 'is_active', label: 'Kích hoạt', type: 'checkbox', placeholder: 'Bật', defaultValue: true },
];

export default function WebhooksPage() {
    const [data, setData] = useState<Webhook[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Webhook | null>(null);
    const [deleteItem, setDeleteItem] = useState<Webhook | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<Webhook[]>('/erp/webhooks');
        if (res.success && res.data) setData(res.data);
        else setData([]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        if (editItem) { const res = await api.put(`/erp/webhooks/${editItem.id}`, formData); if (!res.success) throw new Error(res.error || 'Lỗi'); }
        else { const res = await api.post('/erp/webhooks', formData); if (!res.success) throw new Error(res.error || 'Lỗi'); }
        await loadData();
    };
    const handleDelete = async () => { if (deleteItem) { await api.delete(`/erp/webhooks/${deleteItem.id}`); await loadData(); } };

    const columns: ColumnDef<Webhook>[] = [
        { header: 'Tên', accessorKey: 'name' },
        { header: 'URL', cell: (w) => <code className="text-xs bg-slate-50 px-2 py-0.5 rounded text-slate-600 truncate max-w-[200px] inline-block">{w.url}</code> },
        { header: 'Sự kiện', cell: (w) => <span className="px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700">{w.events}</span> },
        { header: 'Trạng thái', cell: (w) => <span className={`px-2 py-1 rounded text-xs font-bold ${w.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{w.is_active ? 'Active' : 'Off'}</span> },
        { header: 'Thao tác', cell: (w) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditItem(w); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => setDeleteItem(w)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div><h1 className="text-2xl font-black text-slate-800 tracking-tight">Webhooks</h1><p className="text-slate-500 text-sm mt-1">Cấu hình webhook cho các sự kiện hệ thống.</p></div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Thêm Webhook
                </button>
            </div>
            <div className="flex-1 min-h-0"><DataTable columns={columns} data={data} isLoading={loading} /></div>
            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="Webhook" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />
        </div>
    );
}
