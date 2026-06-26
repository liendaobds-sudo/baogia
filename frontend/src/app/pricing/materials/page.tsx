"use client";
import { useState, useEffect, useCallback } from 'react';
import { api } from '../_components/apiClient';
import MaterialEditModal from '../_components/MaterialEditModal';
import StockActionModal from '../_components/StockActionModal';

// ─── Types ────────────────────────────────────
interface Material {
    id: number; code: string; name: string; type?: string; type_code?: string; type_name?: string;
    category?: string; category_code?: string; unit?: string; unit_price?: number; cost_price?: number;
    stock_quantity?: number; stock?: number; min_stock?: number; status?: string;
    width?: number; height?: number; gsm?: number;
    scope_loose?: number; scope_bound?: number; scope_large_format?: number;
    
    // Missing Parity Fields
    materialFormat?: string; // 'sheet' | 'roll'
    paperSizeId?: number;
    rollWidth?: number; // m
    rollLength?: number; // m
    chargeFullWidth?: boolean;
    minChargeArea?: number; // m2
    priceUnit?: string;
    wastePercent?: number;
    setupFee?: number;
}
interface Category { code: string; name: string; icon?: string; color?: string; id?: number; }
interface PaperSize { id: number; name: string; width: number; height: number; }
interface StockAction { type: 'import' | 'export' | 'adjust'; material: Material; }

export default function MaterialsPage() {
    const [data, setData] = useState<Material[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [paperSizes, setPaperSizes] = useState<PaperSize[]>([]);
    const [units, setUnits] = useState<{ id: number; symbol: string; name: string }[]>([]);
    const [activeTab, setActiveTab] = useState('');
    const [loading, setLoading] = useState(true);

    // Filters
    const [keyword, setKeyword] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterScope, setFilterScope] = useState('');
    // Tách hệ in: '' = tất cả, 'loose' = In nhanh (digital), 'offset' = In Offset.
    const [printMode, setPrintMode] = useState<'' | 'loose' | 'offset'>('');

    // Modals
    const [editModal, setEditModal] = useState(false);
    const [editItem, setEditItem] = useState<Material | null>(null);
    const [stockAction, setStockAction] = useState<StockAction | null>(null);
    const [deleteItem, setDeleteItem] = useState<Material | null>(null);

    // Edit form
    const [form, setForm] = useState<Record<string, unknown>>({});

    // Stock form
    const [stockForm, setStockForm] = useState({ quantity: 0, cost_price: 0, reference: '', notes: '', reason: 'production', adjustment_type: 'set' });

    // Bulk select
    const [selected, setSelected] = useState<Set<number>>(new Set());

    // Load categories & paper sizes
    const loadCategoriesAndRefs = useCallback(async () => {
        const [catRes, psRes] = await Promise.all([
            api.get<Category[]>('/erp/material-categories'),
            api.get<PaperSize[]>('/erp/paper-sizes')
        ]);
        if (psRes.success && psRes.data) setPaperSizes(psRes.data);
        const unitRes = await api.get<{ id: number; symbol: string; name: string }[]>('/erp/units');
        if (unitRes.success && unitRes.data) setUnits(unitRes.data);
        
        if (catRes.success && catRes.data) {
            setCategories(catRes.data);
            if (catRes.data.length > 0 && !activeTab) {
                setActiveTab(catRes.data[0].code);
            }
        }
    }, [activeTab]);

    // Load materials
    const loadData = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (activeTab) params.append('category', activeTab);
        if (keyword) params.append('search', keyword);
        if (filterType) params.append('type', filterType);
        if (filterStatus) params.append('status', filterStatus);
        // printMode (In nhanh/Offset) ưu tiên hơn bộ lọc Phạm vi.
        const scope = printMode || filterScope;
        if (scope) params.append('scope', scope);

        const res = await api.get<Material[]>(`/erp/materials?${params.toString()}`);
        if (res.success && res.data) setData(res.data);
        else if (Array.isArray(res)) setData(res as unknown as Material[]);
        setLoading(false);
    }, [activeTab, keyword, filterType, filterStatus, filterScope, printMode]);

    useEffect(() => { loadCategoriesAndRefs(); }, [loadCategoriesAndRefs]);
    useEffect(() => { if (activeTab) loadData(); }, [activeTab, loadData]);

    // Handle ESC key to close modals
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (deleteItem) setDeleteItem(null);
                else if (stockAction) setStockAction(null);
                else if (editModal) setEditModal(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteItem, stockAction, editModal]);

    // Tab switch
    const switchTab = (code: string) => {
        setActiveTab(code);
        setSelected(new Set());
        localStorage.setItem('materials_active_tab', code);
    };

    // Save material
    const handleSave = async () => {
        try {
            const endpoint = editItem ? `/erp/materials/${editItem.id}` : '/erp/materials';
            const method = editItem ? api.put : api.post;

            const payload = {
                ...form,
                categoryTab: activeTab,
                category: 'printing'
            };
            
            const res = await method<Material>(endpoint, payload);
            setEditModal(false);
            setEditItem(null);
            await loadData();
        } catch (e) { console.error('Save material failed:', e); }
    };

    // Delete
    const handleDelete = async () => {
        if (!deleteItem) return;
        await api.delete(`/erp/materials/${deleteItem.id}`);
        setDeleteItem(null);
        await loadData();
    };

    // Stock operations
    const handleStockSubmit = async () => {
        if (!stockAction) return;
        const { type, material } = stockAction;
        try {
            const payload: Record<string, unknown> = {
                type,
                status: 'confirmed',
                items: [{
                    material_id: material.id,
                    quantity: stockForm.quantity,
                    unit_price: stockForm.cost_price,
                    notes: stockForm.notes,
                }]
            };
            if (type === 'import') {
                payload.reason = 'Nhập kho nhanh';
                payload.notes = stockForm.reference ? `${stockForm.reference} - ${stockForm.notes}` : stockForm.notes;
            } else if (type === 'export') {
                const reasonMap: Record<string, string> = { production: 'Xuất sản xuất', order: 'Xuất đơn hàng', sample: 'Xuất mẫu', damaged: 'Xuất hư hỏng', other: 'Xuất khác' };
                payload.reason = reasonMap[stockForm.reason] || 'Xuất kho';
            } else {
                payload.reason = stockForm.adjustment_type;
                payload.notes = `Điều chỉnh tồn kho: ${stockForm.notes}`;
            }
            await api.post('/erp/inventory', payload);
            setStockAction(null);
            await loadData();
        } catch (e) { console.error('Stock action failed:', e); }
    };

    // Bulk
    const toggleSelect = (id: number) => {
        setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    };
    const toggleAll = () => {
        if (selected.size === data.length) setSelected(new Set());
        else setSelected(new Set(data.map(m => m.id)));
    };
    const bulkDelete = async () => {
        if (!confirm(`Xóa ${selected.size} vật tư đã chọn?`)) return;
        await Promise.all(Array.from(selected).map(id => api.delete(`/erp/materials/${id}`)));
        setSelected(new Set());
        await loadData();
    };

    // Helpers
    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
    const fmtVND = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
    const stockStatus = (m: Material) => {
        const q = m.stock ?? m.stock_quantity ?? 0;
        const min = m.min_stock || 0;
        if (q <= 0) return { label: 'Hết hàng', cls: 'bg-red-100 text-red-700' };
        if (min > 0 && q <= min) return { label: 'Sắp hết', cls: 'bg-amber-100 text-amber-700' };
        return { label: 'Bình thường', cls: 'bg-emerald-100 text-emerald-700' };
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {/* Header */}
            <div className="mb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">📦 Quản lý Kho Vật Tư</h1>
                    <p className="text-slate-500 text-sm mt-1">Theo dõi tồn kho, xuất nhập vật tư — {categories.length} nhóm</p>
                </div>
                <button onClick={() => { setEditItem(null); setForm({ category: activeTab, status: 'normal' }); setEditModal(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm flex items-center gap-2">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Thêm Vật Tư
                </button>
            </div>

            {/* Tách hệ in: In nhanh / Offset */}
            <div className="flex items-center gap-1.5 mb-3">
                {[
                    { id: '', label: 'Tất cả hệ in' },
                    { id: 'loose', label: '⚡ In nhanh' },
                    { id: 'offset', label: '🖨️ In Offset' },
                ].map(opt => (
                    <button key={opt.id} onClick={() => setPrintMode(opt.id as '' | 'loose' | 'offset')}
                        className={`px-4 py-1.5 text-sm font-bold rounded-lg border transition-all ${printMode === opt.id ? 'bg-purple-600 text-white border-purple-600 shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                        {opt.label}
                    </button>
                ))}
                <span className="text-[11px] text-slate-400 ml-2">Giấy in offset & in nhanh dùng chung kho, tách theo hệ in.</span>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-thin">
                {categories.map(cat => (
                    <button key={cat.code} onClick={() => switchTab(cat.code)} className={`whitespace-nowrap px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === cat.code ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-bold text-slate-600 mb-1">Từ khóa</label>
                        <input className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Mã hoặc tên vật tư..." value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadData()} />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Trạng thái</label>
                        <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="">Tất cả</option>
                            <option value="normal">Bình thường</option>
                            <option value="low_stock">Sắp hết</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1">Phạm vi</label>
                        <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={filterScope} onChange={e => setFilterScope(e.target.value)}>
                            <option value="">Tất cả</option>
                            <option value="loose">SP Rời</option>
                            <option value="bound">SP Cuốn</option>
                            <option value="large_format">Khổ lớn</option>
                            <option value="offset">Offset</option>
                        </select>
                    </div>
                    <button onClick={loadData} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">🔍 Tìm</button>
                </div>
            </div>

            {/* Bulk Action Bar */}
            {selected.size > 0 && (
                <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-sm font-medium text-blue-700">Đã chọn <b>{selected.size}</b> vật tư</span>
                    <button onClick={bulkDelete} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-sm font-bold">🗑️ Xóa đã chọn</button>
                    <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-slate-600 text-sm">✖ Bỏ chọn</button>
                </div>
            )}

            {/* Table */}
            <div className="flex-1 min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto h-full">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider sticky top-0">
                            <tr>
                                <th className="px-3 py-4 text-center w-12"><input type="checkbox" className="w-4 h-4 rounded cursor-pointer" checked={data.length > 0 && selected.size === data.length} onChange={toggleAll} /></th>
                                <th className="px-4 py-4">Mã VT</th>
                                <th className="px-4 py-4">Tên vật tư</th>
                                <th className="px-4 py-4 text-center">Loại</th>
                                <th className="px-4 py-4 text-center">Kích thước</th>
                                <th className="px-4 py-4 text-center">Tồn kho</th>
                                <th className="px-4 py-4 text-center">ĐVT</th>
                                <th className="px-4 py-4 text-right">Giá vốn</th>
                                <th className="px-4 py-4 text-center">Trạng thái</th>
                                <th className="px-4 py-4 text-center">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-400"><svg className="animate-spin w-5 h-5 inline mr-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Đang tải...</td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-400">Không tìm thấy vật tư nào</td></tr>
                            ) : data.map(m => {
                                const ss = stockStatus(m);
                                return (
                                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-4 text-center"><input type="checkbox" className="w-4 h-4 rounded cursor-pointer" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} /></td>
                                        <td className="px-4 py-4 font-mono text-indigo-600 font-bold text-sm">{m.code}</td>
                                        <td className="px-4 py-4 font-bold text-slate-800 text-sm">{m.name}</td>
                                        <td className="px-4 py-4 text-center text-sm text-slate-600">{m.type_name || m.type_code || '—'}</td>
                                        <td className="px-4 py-4 text-center text-sm text-slate-600">{m.width && m.height ? `${m.width}×${m.height}` : m.gsm ? `${m.gsm}gsm` : '—'}</td>
                                        <td className="px-4 py-4 text-center font-black text-slate-800 text-base">{fmt(m.stock ?? m.stock_quantity ?? 0)}</td>
                                        <td className="px-4 py-4 text-center text-sm text-slate-600 font-medium">{m.unit || '—'}</td>
                                        <td className="px-4 py-4 text-right text-sm font-bold text-slate-700">{fmtVND(m.cost_price || m.unit_price || 0)}</td>
                                        <td className="px-4 py-4 text-center"><span className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide ${ss.cls}`}>{ss.label}</span></td>
                                        <td className="px-4 py-4 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button onClick={() => setStockAction({ type: 'import', material: m })} className="p-2 hover:bg-green-100 rounded-lg text-green-700 transition-colors" title="Nhập kho"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-4-4m4 4l4-4" /></svg></button>
                                                <button onClick={() => setStockAction({ type: 'export', material: m })} className="p-2 hover:bg-amber-100 rounded-lg text-amber-700 transition-colors" title="Xuất kho"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 20V4m0 0l-4 4m4-4l4 4" /></svg></button>
                                                <button onClick={() => setStockAction({ type: 'adjust', material: m })} className="p-2 hover:bg-blue-100 rounded-lg text-blue-700 transition-colors" title="Điều chỉnh"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg></button>
                                                <button onClick={() => { setEditItem(m); setForm({ ...m }); setEditModal(true); }} className="p-2 hover:bg-indigo-100 rounded-lg text-indigo-700 transition-colors" title="Sửa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                                <button onClick={() => setDeleteItem(m)} className="p-2 hover:bg-red-100 rounded-lg text-red-600 transition-colors" title="Xóa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="mt-2 text-xs text-slate-400 text-center">Hiển thị {data.length} vật tư | Tab: {categories.find(c => c.code === activeTab)?.name || '—'}</div>

            <MaterialEditModal
                isOpen={editModal}
                onClose={() => setEditModal(false)}
                onSave={handleSave}
                form={form}
                setForm={setForm}
                editItem={editItem}
                paperSizes={paperSizes}
                units={units}
            />

            <StockActionModal
                action={stockAction}
                onClose={() => setStockAction(null)}
                onSubmit={handleStockSubmit}
                stockForm={stockForm}
                setStockForm={setStockForm}
            />

            {/* ─── DELETE CONFIRM ─── */}
            {deleteItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteItem(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
                        <div className="text-4xl mb-3">⚠️</div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2">Xóa vật tư?</h3>
                        <p className="text-sm text-slate-600 mb-4">Bạn có chắc muốn xóa <b>{deleteItem.name}</b>?</p>
                        <div className="flex justify-center gap-3">
                            <button onClick={() => setDeleteItem(null)} className="px-5 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg">Hủy</button>
                            <button onClick={handleDelete} className="px-5 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700">Xóa</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
