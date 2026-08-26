"use client";
import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../_components/CrudModal';
import { api } from '../../_components/apiClient';

interface Role {
    id: number;
    name: string;
    description?: string;
    permissions?: string[];
    isSystem?: boolean;
}

const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Tên vai trò', type: 'text', required: true, placeholder: 'VD: Quản lý kho' },
    { key: 'description', label: 'Mô tả', type: 'textarea', placeholder: 'Người quản lý kho vật tư, giấy in...' },
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
    const [allPerms, setAllPerms] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!permModalOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPermModalOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [permModalOpen]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<{ data: Role[] } | Role[]>('/rbac/roles');
            const list = Array.isArray(res) ? res : (res as any)?.data;
            setData(Array.isArray(list) ? list : []);
            const permsRes = await api.get<{ data: string[] } | string[]>('/rbac/permissions');
            const perms = Array.isArray(permsRes) ? permsRes : (permsRes as any)?.data;
            if (Array.isArray(perms)) {
                setAllPerms(perms.map((p: any) => typeof p === 'string' ? p : p.key || p.name || String(p)));
            }
        } catch (e: unknown) {
            setData([]);
            setError(e instanceof Error ? e.message : 'Không tải được roles');
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        if (editItem) {
            // Update permissions endpoint is separate; name/description via recreate not supported for all — keep create path
            throw new Error('Sửa tên role: dùng Super Admin hoặc tạo role mới. Cập nhật quyền qua nút Quyền.');
        }
        const res = await api.post('/rbac/roles', formData);
        if ((res as any)?.statusCode >= 400) throw new Error((res as any).message || 'Lỗi tạo role');
        await loadData();
    };

    const handleDelete = async () => {
        if (deleteItem) {
            await api.delete(`/rbac/roles/${deleteItem.id}`);
            await loadData();
        }
    };

    const openPermissions = (role: Role) => {
        setPermRole(role);
        setSelectedPerms(new Set(role.permissions || []));
        setPermModalOpen(true);
    };

    const savePermissions = async () => {
        if (!permRole) return;
        const res = await api.put(`/rbac/roles/${permRole.id}/permissions`, {
            permissions: Array.from(selectedPerms),
        });
        if ((res as any)?.statusCode >= 400) throw new Error((res as any).message || 'Lỗi lưu quyền');
        setPermModalOpen(false);
        await loadData();
    };

    const columns: ColumnDef<Role>[] = [
        { header: 'ID', accessorKey: 'id' },
        { header: 'Tên Vai Trò', cell: (r) => <span className="font-bold text-slate-800">{r.name}</span> },
        { header: 'Mô Tả', cell: (r) => <span className="text-slate-500 text-sm">{r.description || '—'}</span> },
        { header: 'Quyền', cell: (r) => (
            <div className="flex flex-wrap gap-1">
                {(r.permissions || []).slice(0, 3).map(p => (
                    <span key={p} className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-700 font-medium">{p}</span>
                ))}
                {(r.permissions || []).length > 3 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-500">+{r.permissions!.length - 3}</span>
                )}
            </div>
        )},
        { header: 'Thao tác', cell: (r) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => openPermissions(r)} className="px-2 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded">Quyền</button>
                {!r.isSystem && (
                    <button onClick={() => setDeleteItem(r)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" aria-label="Xóa">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                )}
            </div>
        )},
    ];

    const permList = allPerms.length > 0 ? allPerms : Array.from(selectedPerms);

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Vai trò & quyền</h1>
                    <p className="text-slate-500 text-sm mt-1">API: <code className="text-xs">/api/v1/rbac/*</code></p>
                </div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm">
                    Thêm vai trò
                </button>
            </div>
            {error && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
            <div className="flex-1 min-h-0"><DataTable columns={columns} data={data} isLoading={loading} /></div>
            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="Vai trò" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />

            {permModalOpen && permRole && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-auto p-6">
                        <h2 className="text-lg font-bold mb-4">Quyền: {permRole.name}</h2>
                        <div className="flex flex-col gap-2 mb-4">
                            {permList.map(p => (
                                <label key={p} className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={selectedPerms.has(p)}
                                        onChange={(e) => {
                                            const next = new Set(selectedPerms);
                                            if (e.target.checked) next.add(p); else next.delete(p);
                                            setSelectedPerms(next);
                                        }}
                                    />
                                    {p}
                                </label>
                            ))}
                            {permList.length === 0 && <p className="text-slate-500 text-sm">Chưa có danh sách permission từ server.</p>}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setPermModalOpen(false)} className="px-4 py-2 rounded-lg border">Hủy</button>
                            <button onClick={() => savePermissions().catch(e => alert(e.message))} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold">Lưu</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
