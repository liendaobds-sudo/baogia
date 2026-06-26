"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../_components/CrudModal';
import { api } from '../../_components/apiClient';

interface User { id: number; username: string; email: string; fullName: string; role: string; roleId?: number; isActive: boolean; createdAt?: string; }

const FIELDS: FieldDef[] = [
    { key: 'username', label: 'Tên đăng nhập', type: 'text', required: true, placeholder: 'admin' },
    { key: 'email', label: 'Email', type: 'text', required: true, placeholder: 'admin@kprint.vn' },
    { key: 'fullName', label: 'Họ tên', type: 'text', required: true, placeholder: 'Nguyen Van A' },
    { key: 'role', label: 'Vai trò', type: 'select', options: [
        { value: 'admin', label: 'Quản trị viên' },
        { value: 'supervisor', label: 'Giám sát' },
        { value: 'agent', label: 'Nhân viên' },
        { value: 'viewer', label: 'Chỉ xem' },
    ], defaultValue: 'agent' },
    { key: 'isActive', label: 'Trạng thái', type: 'checkbox', placeholder: 'Đang hoạt động', defaultValue: true },
];

export default function UsersPage() {
    const [data, setData] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<User | null>(null);
    const [deleteItem, setDeleteItem] = useState<User | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<User[]>('/erp/users');
        if (res.success && res.data) setData(res.data);
        else setData([]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        if (editItem) { const res = await api.put(`/erp/users/${editItem.id}`, formData); if (!res.success) throw new Error(res.error || 'Lỗi'); }
        else { const res = await api.post('/erp/users', formData); if (!res.success) throw new Error(res.error || 'Lỗi'); }
        await loadData();
    };
    const handleDelete = async () => { if (deleteItem) { await api.delete(`/erp/users/${deleteItem.id}`); await loadData(); } };

    const roleMap: Record<string, [string, string]> = { admin: ['Quản trị viên', 'bg-red-100 text-red-700'], supervisor: ['Giám sát', 'bg-blue-100 text-blue-700'], agent: ['Nhân viên', 'bg-slate-100 text-slate-700'], viewer: ['Chỉ xem', 'bg-slate-50 text-slate-500'] };

    const columns: ColumnDef<User>[] = [
        { header: 'ID', accessorKey: 'id' },
        { header: 'Tên đăng nhập', cell: (u) => <span className="font-mono font-bold text-indigo-600">{u.username}</span> },
        { header: 'Email', accessorKey: 'email' },
        { header: 'Họ tên', accessorKey: 'fullName' },
        { header: 'Vai trò', cell: (u) => { const [l, c] = roleMap[u.role] || [u.role, 'bg-slate-100 text-slate-700']; return <span className={`px-2 py-0.5 rounded text-xs font-bold ${c}`}>{l}</span>; } },
        { header: 'Trạng thái', cell: (u) => <span className={`px-2 py-1 rounded text-xs font-bold ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{u.isActive ? 'Active' : 'Inactive'}</span> },
        { header: 'Thao tác', cell: (u) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditItem(u); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => setDeleteItem(u)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div><h1 className="text-2xl font-black text-slate-800 tracking-tight">Quản Lý Người Dùng</h1><p className="text-slate-500 text-sm mt-1">Quản lý tài khoản và phân quyền người dùng.</p></div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Thêm Người Dùng
                </button>
            </div>
            <div className="flex-1 min-h-0"><DataTable columns={columns} data={data} isLoading={loading} /></div>
            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="Người Dùng" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.username || ''} />
        </div>
    );
}
