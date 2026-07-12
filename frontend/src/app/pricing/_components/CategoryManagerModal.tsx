"use client";
import { useEffect, useState, useCallback } from 'react';
import { api } from './apiClient';

/**
 * CategoryManagerModal — quản lý NHÓM vật tư (`material_categories`) ngay trong màn Vật tư.
 * Cho admin sửa nhãn / thứ tự / ẩn-hiện nhóm mà không phải chạy migration mỗi lần.
 *
 * Nạp TẤT CẢ nhóm (kể cả is_active=0) — khác màn Vật tư (chỉ nạp active_only=1) — để admin
 * quản được cả nhóm đang ẩn. `code` là KHÓA LỌC (materials.category_tab tham chiếu) nên
 * KHÓA sửa khi edit; chỉ cho đặt lúc tạo mới.
 */
interface Category {
    id?: number;
    code: string;
    name: string;
    sort_order?: number;
    is_active?: number;
}

interface CategoryManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Gọi sau mỗi thay đổi để màn cha nạp lại danh sách tab. */
    onSaved: () => void | Promise<void>;
}

export default function CategoryManagerModal({ isOpen, onClose, onSaved }: CategoryManagerModalProps) {
    const [cats, setCats] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);
    const [editId, setEditId] = useState<number | 'new' | null>(null);
    const [draft, setDraft] = useState<Category>({ code: '', name: '', sort_order: 0, is_active: 1 });
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        // KHÔNG active_only → lấy cả nhóm ẩn để quản.
        const res = await api.get<Category[]>('/erp/material-categories');
        if (res.success && res.data) setCats(res.data);
        setLoading(false);
    }, []);

    useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

    if (!isOpen) return null;

    const startEdit = (c: Category) => { setEditId(c.id!); setDraft({ ...c }); };
    const startNew = () => { setEditId('new'); setDraft({ code: '', name: '', sort_order: (cats.length + 1) * 10, is_active: 1 }); };
    const cancelEdit = () => { setEditId(null); };

    const save = async () => {
        if (!draft.name.trim()) { alert('Tên nhóm bắt buộc.'); return; }
        if (editId === 'new' && !draft.code.trim()) { alert('Mã nhóm (code) bắt buộc khi tạo mới.'); return; }
        setBusy(true);
        try {
            const payload = {
                code: draft.code.trim(),
                name: draft.name.trim(),
                sort_order: Number(draft.sort_order) || 0,
                is_active: draft.is_active ? 1 : 0,
            };
            if (editId === 'new') {
                await api.post('/erp/material-categories', payload);
            } else {
                // KHÔNG gửi code khi sửa — khóa lọc, không được đổi.
                const { code, ...rest } = payload;
                await api.put(`/erp/material-categories/${editId}`, rest);
            }
            setEditId(null);
            await load();
            await onSaved();
        } catch (e) {
            console.error(e);
            alert('Lưu nhóm thất bại.');
        } finally {
            setBusy(false);
        }
    };

    const remove = async (c: Category) => {
        if (!confirm(`Xóa nhóm "${c.name}"? Vật tư đang thuộc nhóm này sẽ không còn tab để lọc.`)) return;
        setBusy(true);
        try {
            await api.delete(`/erp/material-categories/${c.id}`);
            await load();
            await onSaved();
        } catch (e) {
            console.error(e);
            alert('Xóa nhóm thất bại.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-black text-slate-800">Quản lý nhóm vật tư</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    <div className="flex justify-between items-center mb-3">
                        <p className="text-xs text-slate-500">Sửa nhãn, thứ tự, ẩn/hiện nhóm. Mã nhóm (code) khóa sau khi tạo vì là khóa lọc vật tư.</p>
                        {editId !== 'new' && (
                            <button onClick={startNew} className="text-sm font-bold text-indigo-600 hover:text-indigo-700 whitespace-nowrap">+ Thêm nhóm</button>
                        )}
                    </div>

                    {editId === 'new' && (
                        <div className="mb-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <input value={draft.code} onChange={e => setDraft(d => ({ ...d, code: e.target.value }))} placeholder="Mã (vd: substrate_sheet)" className="px-2 py-1.5 text-sm border border-slate-200 rounded" />
                                <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Tên hiển thị" className="px-2 py-1.5 text-sm border border-slate-200 rounded" />
                                <input type="number" value={draft.sort_order} onChange={e => setDraft(d => ({ ...d, sort_order: Number(e.target.value) }))} placeholder="Thứ tự" className="px-2 py-1.5 text-sm border border-slate-200 rounded" />
                                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.is_active} onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked ? 1 : 0 }))} /> Đang hiện</label>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button onClick={cancelEdit} className="px-3 py-1.5 text-slate-600 text-sm">Hủy</button>
                                <button onClick={save} disabled={busy} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm font-bold disabled:opacity-50">Lưu</button>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center text-slate-400 py-8 text-sm">Đang tải…</div>
                    ) : (
                        <div className="space-y-1">
                            {cats.map(c => editId === c.id ? (
                                <div key={c.id} className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                        <input value={draft.code} disabled className="px-2 py-1.5 text-sm border border-slate-200 rounded bg-slate-100 text-slate-400" title="Mã khóa — không đổi được" />
                                        <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Tên hiển thị" className="px-2 py-1.5 text-sm border border-slate-200 rounded" />
                                        <input type="number" value={draft.sort_order} onChange={e => setDraft(d => ({ ...d, sort_order: Number(e.target.value) }))} className="px-2 py-1.5 text-sm border border-slate-200 rounded" />
                                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.is_active} onChange={e => setDraft(d => ({ ...d, is_active: e.target.checked ? 1 : 0 }))} /> Đang hiện</label>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={cancelEdit} className="px-3 py-1.5 text-slate-600 text-sm">Hủy</button>
                                        <button onClick={save} disabled={busy} className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm font-bold disabled:opacity-50">Lưu</button>
                                    </div>
                                </div>
                            ) : (
                                <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100">
                                    <span className="text-xs text-slate-400 font-mono w-8 text-center">{c.sort_order}</span>
                                    <span className="flex-1 text-sm font-medium text-slate-700">{c.name}</span>
                                    <span className="text-[11px] font-mono text-slate-400">{c.code}</span>
                                    {!c.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">Ẩn</span>}
                                    <button onClick={() => startEdit(c)} className="p-1 text-blue-500 hover:bg-blue-100 rounded" title="Sửa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                    <button onClick={() => remove(c)} className="p-1 text-red-500 hover:bg-red-100 rounded" title="Xóa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
