"use client";
import { useEffect, useState, useCallback, useMemo } from 'react';
import { DataTable, ColumnDef } from '../_components/DataTable';
import { DeleteConfirm } from '../_components/CrudModal';
import { api } from '../_components/apiClient';
import ProductModal from './ProductModal';
import BatchMiniQuoteModal from './BatchMiniQuoteModal';

// ─── Types ────────────────────────────────────
interface Product {
    id: number; code: string; name_vi: string; name_en?: string;
    quote_type: string; category_id?: string; category_name?: string;
    icon?: string; is_active: boolean;
    has_auto_pricing?: boolean; ai_enabled?: boolean;
    allowed_materials?: unknown[]; allowed_paper_sizes?: unknown[];
    ai_keywords?: string[]; quote_config?: Record<string, unknown>;
}
interface Category { id: number; code: string; name_vi: string; icon?: string; is_active?: boolean; }

export default function ProductsPage() {
    const [data, setData] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<Product | null>(null);
    const [deleteItem, setDeleteItem] = useState<Product | null>(null);
    const [mainTab, setMainTab] = useState<'products' | 'categories'>('products');

    // Filters
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [showHidden, setShowHidden] = useState(true);

    // Category modal
    const [catModalOpen, setCatModalOpen] = useState(false);
    const [catEdit, setCatEdit] = useState<Category | null>(null);
    const [catForm, setCatForm] = useState({ code: '', name_vi: '', icon: '', is_active: true });

    // Đóng Category modal bằng ESC (đồng bộ UX với các modal khác).
    useEffect(() => {
        if (!catModalOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCatModalOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [catModalOpen]);

    // Batch selection
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [batchModalOpen, setBatchModalOpen] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        const [pRes, cRes] = await Promise.all([
            api.get<Product[]>('/erp/products'),
            api.get<Category[]>('/erp/product-categories'),
        ]);
        if (pRes.success && pRes.data) setData(pRes.data);
        else if (Array.isArray(pRes)) setData(pRes as unknown as Product[]);
        if (cRes.success && cRes.data) setCategories(cRes.data);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleDelete = async () => {
        if (!deleteItem) return;
        await api.delete(`/erp/products/${deleteItem.id}`);
        await loadData();
    };

    // ---- Filtered data ----
    const filtered = useMemo(() => {
        return data.filter(p => {
            if (!showHidden && !p.is_active) return false;
            if (filterType && p.quote_type !== filterType) return false;
            if (filterCat && String(p.category_id) !== filterCat) return false;
            if (search) {
                const s = search.toLowerCase();
                if (!p.name_vi.toLowerCase().includes(s) && !p.code.toLowerCase().includes(s)) return false;
            }
            return true;
        });
    }, [data, search, filterType, filterCat, showHidden]);

    // ---- Stats ----
    const statTotal = data.length;
    const statActive = data.filter(p => p.is_active).length;
    const statAi = data.filter(p => p.ai_enabled).length;
    const statCats = categories.length;

    // ---- Category CRUD ----
    const handleCatSave = async () => {
        try {
            if (catEdit) await api.put(`/erp/product-categories/${catEdit.id}`, catForm);
            else await api.post('/erp/product-categories', catForm);
            setCatModalOpen(false);
            setCatEdit(null);
            await loadData();
        } catch { /* */ }
    };
    const handleCatDelete = async (id: number) => {
        if (!confirm('Xóa danh mục này?')) return;
        await api.delete(`/erp/product-categories/${id}`);
        await loadData();
    };

    const typeMap: Record<string, [string, string]> = { loose: ['Tờ rời', 'bg-blue-50 text-blue-700'], bound: ['Sách/Cuốn', 'bg-purple-50 text-purple-700'], large_format: ['Khổ Lớn', 'bg-green-50 text-green-700'] };

    const columns: ColumnDef<Product>[] = [
        { header: '', cell: (p) => (
            <input type="checkbox" className="w-4 h-4 rounded text-indigo-600 cursor-pointer" checked={selectedIds.has(p.id)} onChange={e => { e.stopPropagation(); setSelectedIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; }); }} onClick={e => e.stopPropagation()} />
        )},
        { header: 'Sản phẩm', cell: (p) => (
            <div className="min-w-0">
                <div className="font-semibold text-slate-800 truncate">{p.name_vi}</div>
                <div className="text-xs text-slate-400">{p.code}</div>
            </div>
        )},
        { header: 'Danh mục', cell: (p) => {
            const cat = categories.find(c => c.code === p.category_id);
            return <span className="text-sm text-slate-600">{cat?.name_vi || '—'}</span>;
        }},
        { header: 'Loại', cell: (p) => { const [l, c] = typeMap[p.quote_type] || [p.quote_type, 'bg-slate-100 text-slate-700']; return <span className={`px-2 py-0.5 rounded text-xs font-medium ${c}`}>{l}</span>; }},
        { header: 'Flags', cell: (p) => {
            const notReady = !(p.allowed_materials?.length) || !(p.allowed_paper_sizes?.length);
            return (
                <div className="flex gap-1 items-center">
                    {p.ai_enabled && <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-600 font-bold">AI</span>}
                    {notReady && <span title="Chưa whitelist vật liệu/khổ giấy — báo giá sẽ trống" className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 font-bold">⚠ Chưa đủ cấu hình</span>}
                </div>
            );
        }},
        { header: 'Trạng Thái', cell: (p) => <span className={`px-2 py-1 rounded text-xs font-bold ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.is_active ? 'Active' : 'Ẩn'}</span> },
        { header: 'Thao tác', cell: (p) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditItem(p); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600" title="Sửa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                <button onClick={() => setDeleteItem(p)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title="Xóa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {/* Header */}
            <div className="mb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Danh mục sản phẩm</h1>
                    <p className="text-slate-500 text-sm mt-1">Quản lý sản phẩm mẫu (dùng cho dropdown báo giá), danh mục và AI. Ràng buộc theo sản phẩm ở mục “Ràng buộc Báo giá”.</p>
                </div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Thêm sản phẩm
                </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                    { label: 'Tổng sản phẩm', val: statTotal, icon: '📦', color: 'border-blue-200' },
                    { label: 'Đang hoạt động', val: statActive, icon: '✅', color: 'border-emerald-200' },
                    { label: 'AI kích hoạt', val: statAi, icon: '🤖', color: 'border-purple-200' },
                    { label: 'Danh mục', val: statCats, icon: '📂', color: 'border-amber-200' },
                ].map((s, i) => (
                    <div key={i} className={`bg-white rounded-xl border ${s.color} p-3 flex items-center gap-3`}>
                        <span className="text-2xl">{s.icon}</span>
                        <div><p className="text-xs text-slate-500 font-semibold">{s.label}</p><p className="text-xl font-black text-slate-800">{s.val}</p></div>
                    </div>
                ))}
            </div>

            {/* Main Tabs */}
            <div className="flex border-b border-slate-200 mb-4">
                <button onClick={() => setMainTab('products')} className={`px-5 py-2.5 font-semibold text-sm ${mainTab === 'products' ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-700'}`}>📦 Sản phẩm ({statTotal})</button>
                <button onClick={() => setMainTab('categories')} className={`px-5 py-2.5 font-semibold text-sm ${mainTab === 'categories' ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-700'}`}>📂 Danh mục ({statCats})</button>
            </div>

            {mainTab === 'products' ? (
                <>
                    {/* Search + Filter Bar */}
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                        <div className="flex-1 min-w-[200px] relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input type="text" className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white" placeholder="Tìm theo tên, mã sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                            <option value="">Tất cả danh mục</option>
                            {categories.map(c => <option key={c.id} value={c.code}>{c.name_vi}</option>)}
                        </select>
                        <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={filterType} onChange={e => setFilterType(e.target.value)}>
                            <option value="">Tất cả loại</option>
                            <option value="loose">Tờ rời</option>
                            <option value="bound">Sách/Cuốn</option>
                            <option value="large_format">Khổ Lớn</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
                            Hiện SP ẩn
                        </label>
                    </div>

                    {/* Table */}
                    <div className="flex-1 min-h-0">
                        <DataTable columns={columns} data={filtered} isLoading={loading} />
                    </div>
                    <div className="mt-2 text-xs text-slate-400 text-center">Hiển thị {filtered.length}/{data.length} sản phẩm</div>
                </>
            ) : (
                /* Categories Tab */
                <div className="flex-1 min-h-0">
                    <div className="flex justify-end mb-3">
                        <button onClick={() => { setCatEdit(null); setCatForm({ code: '', name_vi: '', icon: '', is_active: true }); setCatModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            Thêm danh mục
                        </button>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                                <tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Tên danh mục</th><th className="px-4 py-3">Icon</th><th className="px-4 py-3 text-center">Trạng thái</th><th className="px-4 py-3 text-center">Thao tác</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {categories.length === 0 ? (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Chưa có danh mục nào</td></tr>
                                ) : categories.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-mono text-indigo-600 font-bold">{c.code}</td>
                                        <td className="px-4 py-3 font-semibold">{c.name_vi}</td>
                                        <td className="px-4 py-3 text-slate-500">{c.icon || '—'}</td>
                                        <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded text-xs font-bold ${c.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{c.is_active !== false ? 'Active' : 'Ẩn'}</span></td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => { setCatEdit(c); setCatForm({ code: c.code, name_vi: c.name_vi, icon: c.icon || '', is_active: c.is_active !== false }); setCatModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                                <button onClick={() => handleCatDelete(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Product Modal (3-tab) */}
            <ProductModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSaved={loadData} product={editItem as any} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name_vi || ''} />

            {/* Category Modal */}
            {catModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCatModalOpen(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100"><h3 className="text-lg font-bold text-slate-800">{catEdit ? 'Sửa danh mục' : 'Thêm danh mục'}</h3></div>
                        <div className="p-6 space-y-4">
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Mã danh mục</label><input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={catForm.code} onChange={e => setCatForm(f => ({ ...f, code: e.target.value }))} /></div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Tên danh mục</label><input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={catForm.name_vi} onChange={e => setCatForm(f => ({ ...f, name_vi: e.target.value }))} /></div>
                            <div><label className="block text-sm font-semibold text-slate-700 mb-1">Icon</label><input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="fa-folder" /></div>
                            <label className="flex items-center gap-2"><input type="checkbox" className="w-4 h-4 rounded" checked={catForm.is_active} onChange={e => setCatForm(f => ({ ...f, is_active: e.target.checked }))} /><span className="text-sm text-slate-700">Hoạt động</span></label>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
                            <button onClick={() => setCatModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Hủy</button>
                            <button onClick={handleCatSave} className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-indigo-900 text-white rounded-2xl shadow-2xl px-6 py-3.5 flex items-center gap-4 min-w-[400px]">
                    <span className="text-sm font-bold">{selectedIds.size} sản phẩm đã chọn</span>
                    <div className="flex-1" />
                    <button 
                        onClick={() => setBatchModalOpen(true)}
                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5"
                    >
                        📱 Cấu hình Mini Quote
                    </button>
                    <button 
                        onClick={() => setSelectedIds(new Set())}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-semibold transition-colors"
                    >
                        Bỏ chọn
                    </button>
                </div>
            )}

            <BatchMiniQuoteModal
                isOpen={batchModalOpen}
                onClose={() => setBatchModalOpen(false)}
                selectedProducts={data.filter(p => selectedIds.has(p.id))}
                onSaved={() => { setSelectedIds(new Set()); loadData(); }}
            />
        </div>
    );
}
