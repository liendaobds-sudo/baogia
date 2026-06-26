"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../_components/CrudModal';
import { api } from '../../_components/apiClient';

interface Role { id: number; name: string; description: string; permissions: string[]; isSystem?: boolean; }

const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Tên vai trò', type: 'text', required: true, placeholder: 'VD: Quản lý kho' },
    { key: 'description', label: 'Mô tả', type: 'textarea', placeholder: 'Người quản lý kho vật tư, giấy in...' },
];

const PERMISSION_GROUPS = [
    { group: 'Báo giá', perms: ['quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete', 'quotes.approve'] },
    { group: 'Vật tư', perms: ['materials.view', 'materials.create', 'materials.edit', 'materials.delete'] },
    { group: 'Sản phẩm', perms: ['products.view', 'products.create', 'products.edit', 'products.delete'] },
    { group: 'Cài đặt', perms: ['settings.view', 'settings.edit'] },
    { group: 'Quản trị', perms: ['admin.users', 'admin.roles', 'admin.system'] },
];

export default function RolesPage() {
    const [data, setData] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Role | null>(null);
    const [deleteItem, setDeleteItem] = useState<Role | null>(null);
    const [permModalOpen, setPermModalOpen] = useState(false);
    const [permRole, setPermRole] = useState<Role | null>(null);
    const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<Role[]>('/erp/roles');
        if (res.success && res.data) setData(res.data);
        else setData([]);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        if (editItem) { const res = await api.put(`/erp/roles/${editItem.id}`, formData); if (!res.success) throw new Error(res.error || 'Lỗi'); }
        else { const res = await api.post('/erp/roles', formData); if (!res.success) throw new Error(res.error || 'Lỗi'); }
        await loadData();
    };

    const handleDelete = async () => { if (deleteItem) { await api.delete(`/erp/roles/${deleteItem.id}`); await loadData(); } };

    const openPermissions = (role: Role) => {
        setPermRole(role);
        setSelectedPerms(new Set(role.permissions || []));
        setPermModalOpen(true);
    };

    const savePermissions = async () => {
        if (!permRole) return;
        await api.put(`/erp/roles/${permRole.id}`, { permissions: Array.from(selectedPerms) });
        setPermModalOpen(false);
        await loadData();
    };

    const columns: ColumnDef<Role>[] = [
        { header: 'ID', accessorKey: 'id' },
        { header: 'Tên Vai Trò', cell: (r) => <span className="font-bold text-slate-800">{r.name}</span> },
        { header: 'Mô Tả', cell: (r) => <span className="text-slate-500 text-sm">{r.description || '—'}</span> },
        { header: 'Quyền', cell: (r) => (
            <div className="flex flex-wrap gap-1">
                {(r.permissions || []).slice(0, 3).map(p => <span key={p} className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 font-medium">{p}</span>)}
                {(r.permissions || []).length > 3 && <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500">+{r.permissions.length - 3}</span>}
            </div>
        )},
        { header: 'Thao tác', cell: (r) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => openPermissions(r)} className="p-1.5 hover:bg-purple-50 rounded-lg text-purple-600 transition-colors" title="Phân quyền"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></button>
                <button onClick={() => { setEditItem(r); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => setDeleteItem(r)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div><h1 className="text-2xl font-black text-slate-800 tracking-tight">Vai Trò & Phân Quyền</h1><p className="text-slate-500 text-sm mt-1">Quản lý vai trò và ma trận quyền hạn.</p></div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Thêm Vai Trò
                </button>
            </div>
            <div className="flex-1 min-h-0"><DataTable columns={columns} data={data} isLoading={loading} /></div>
            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="Vai Trò" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />

            {/* Permission Matrix Modal */}
            {permModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPermModalOpen(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-indigo-50">
                            <h3 className="text-lg font-bold text-slate-800">🔐 Phân quyền: {permRole?.name}</h3>
                        </div>
                        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                            {PERMISSION_GROUPS.map(pg => (
                                <div key={pg.group} className="border border-slate-200 rounded-xl p-4">
                                    <h4 className="font-bold text-slate-800 mb-2">{pg.group}</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {pg.perms.map(p => (
                                            <label key={p} className="flex items-center gap-2 cursor-pointer text-sm">
                                                <input type="checkbox" checked={selectedPerms.has(p)} onChange={e => { const n = new Set(selectedPerms); e.target.checked ? n.add(p) : n.delete(p); setSelectedPerms(n); }} className="w-4 h-4 text-indigo-600 rounded" />
                                                <span className="text-slate-700">{p}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
                            <button onClick={() => setPermModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Hủy</button>
                            <button onClick={savePermissions} className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Lưu phân quyền</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
