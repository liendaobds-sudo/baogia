"use client";
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../_components/apiClient';
import { fetchQuoteMaterials } from '../../_components/fetchQuoteMaterials';
import React from 'react';

interface LFTier {
    id: number;
    materialId: number;
    materialName?: string;
    materialCode?: string;
    areaFrom: number;
    areaTo: number;
    pricePerSqm: number;
    minCharge?: number;
    isActive?: boolean;
    // Tầng 3: tách 4 thành phần giá vốn thuần/m² (vật liệu + máy + công + overhead) + máy gắn.
    printerId?: number | null;
    materialCost?: number;
    machineCost?: number;
    laborCost?: number;
    overheadCost?: number;
    // Giá vốn vật liệu/m² hiện tại (materials.cost_price, tầng 1) — mốc tham chiếu + cảnh báo lỗ.
    current_cost_price?: number | null;
}

interface Material { id: number; name: string; cost_price?: number }
interface Printer { id: number; name: string; costBasis?: string }

// Mốc giá khổ lớn: 4 thành phần (giá vốn thuần/m²). Tổng/m² = material+machine+labor+overhead.
type FormTier = {
    id?: number;
    areaFrom: number | string | null;
    areaTo: number | string | null;
    materialPrice: number | string | null;
    machinePrice: number | string | null;
    laborPrice: number | string | null;
    overheadPrice: number | string | null;
};

const initFormTiers: FormTier[] = [{ areaFrom: 0, areaTo: 999999, materialPrice: 0, machinePrice: 0, laborPrice: 0, overheadPrice: 0 }];

export default function PricingLargeFormatPage() {
    const [tiers, setTiers] = useState<LFTier[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [suggesting, setSuggesting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Form states
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editModeKey, setEditModeKey] = useState<string | null>(null);
    const [deletedTierIds, setDeletedTierIds] = useState<number[]>([]);
    const [formData, setFormData] = useState({
        materialId: '',
        printerId: '',
        minCharge: 0 as number | string,
        isActive: true,
        tiers: initFormTiers as any[],
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        // Vật tư: qua fetchQuoteMaterials (scope large_format, cả tấm phẳng + cuộn) — nguồn dùng
        // chung, không tự ghép scope+category nữa.
        const [tiersRes, mats, printersRes] = await Promise.all([
            api.get<LFTier[]>('/erp/large-format-pricing'),
            fetchQuoteMaterials(['large_format']),
            api.get<Printer[]>('/erp/printers'),
        ]);
        if (tiersRes.success && tiersRes.data) setTiers(tiersRes.data);
        setMaterials(mats as unknown as Material[]);
        // Chỉ máy đo theo m² (cost_basis='sqm') mới dùng suy giá khổ lớn — máy 'sheet' là của in nhanh.
        if (printersRes.success && printersRes.data) setPrinters(printersRes.data.filter(p => p.costBasis === 'sqm'));
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Handle ESC key to close form
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showForm) {
                setShowForm(false);
                setEditModeKey(null);
                setFormData(prev => ({ ...prev, tiers: initFormTiers as any }));
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showForm]);

    const groups: Record<string, { material: string; technology: string; unit: string; tiers: LFTier[]; materialIdRaw: number; minCharge: number; isActive: boolean; costPerSqm: number | null; printerIdRaw: number | null }> = {};
    tiers.forEach(t => {
        const key = `${t.materialId}_lf`;
        if (!groups[key]) {
            const mat = materials.find(m => m.id == t.materialId);
            groups[key] = {
                material: mat?.name || t.materialName || t.materialCode || 'Vật tư in khổ lớn',
                technology: 'Cơ bản',
                unit: 'm²',
                tiers: [],
                materialIdRaw: t.materialId,
                minCharge: t.minCharge || 0,
                isActive: t.isActive !== false,
                costPerSqm: t.current_cost_price != null ? Number(t.current_cost_price) : null,
                printerIdRaw: t.printerId ?? null,
            };
        }
        groups[key].tiers.push(t);
    });

    const groupEntries = Object.entries(groups);
    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    };

    const handleAddTierRow = () => {
        const last = formData.tiers[formData.tiers.length - 1];
        setFormData(f => ({
            ...f,
            tiers: [...f.tiers, { areaFrom: last ? Number(last.areaTo) : 0, areaTo: 999999, materialPrice: 0, machinePrice: 0, laborPrice: 0, overheadPrice: 0 }],
        }));
    };

    // Giá vốn vật liệu/m² hiện tại của vật tư đang chọn (mốc tham chiếu trong form).
    const selectedMaterialCost = (() => {
        const m = materials.find(x => x.id === Number(formData.materialId));
        return m?.cost_price != null ? Number(m.cost_price) : null;
    })();

    // Gợi ý giá định mức khổ lớn từ chi phí (tầng 3): gọi /suggest → điền breakdown 4 thành phần
    // vào MỌI mốc. KHÔNG tự lưu — người dùng xem, sửa được, rồi bấm lưu. Máy/công/overhead giống
    // nhau mọi mốc (chi phí/m² không phụ thuộc diện tích); người dùng tự chỉnh giảm theo mốc nếu muốn.
    const suggestFromCost = async () => {
        if (!formData.materialId) { alert('Chọn vật tư trước khi gợi ý.'); return; }
        setSuggesting(true);
        try {
            const res = await api.post<{ breakdown: { materialCost: number; machineCost: number; laborCost: number; overheadCost: number } }>(
                '/erp/large-format-pricing/suggest',
                {
                    material_id: Number(formData.materialId),
                    printer_id: formData.printerId ? Number(formData.printerId) : undefined,
                },
            );
            const b = (res as any)?.data?.breakdown;
            if (!(res as any).success || !b) { alert('Không gợi ý được. Kiểm tra vật tư có giá vốn chưa.'); return; }
            setFormData(f => ({
                ...f,
                tiers: f.tiers.map(t => ({
                    ...t,
                    materialPrice: b.materialCost, machinePrice: b.machineCost,
                    laborPrice: b.laborCost, overheadPrice: b.overheadCost,
                })),
            }));
        } catch (e) { console.error('Suggest failed:', e); alert('Lỗi khi gợi ý giá.'); }
        finally { setSuggesting(false); }
    };

    const handleRemoveTierRow = (idx: number) => {
        const tierToRemove = formData.tiers[idx];
        if (tierToRemove.id) setDeletedTierIds(prev => [...prev, tierToRemove.id!]);
        setFormData(f => ({ ...f, tiers: f.tiers.filter((_, i) => i !== idx) }));
    };

    const updateTierRow = (idx: number, field: string, value: any) => {
        setFormData(f => {
            const next = [...f.tiers] as any[];
            next[idx] = { ...next[idx], [field]: value };
            return { ...f, tiers: next };
        });
    };

    const handleEditGroup = (key: string) => {
        const group = groups[key];
        if (!group) return;
        setFormData({
            materialId: String(group.materialIdRaw),
            minCharge: group.minCharge,
            isActive: group.isActive,
            printerId: group.printerIdRaw ? String(group.printerIdRaw) : '',
            tiers: group.tiers.sort((a, b) => a.areaFrom - b.areaFrom).map(t => ({
                id: t.id,
                areaFrom: t.areaFrom,
                areaTo: t.areaTo,
                // Đọc 4 thành phần THẬT. Dòng cũ chưa tách: material_cost=tổng, còn lại 0 (backfill).
                materialPrice: t.materialCost ?? t.pricePerSqm,
                machinePrice: t.machineCost ?? 0,
                laborPrice: t.laborCost ?? 0,
                overheadPrice: t.overheadCost ?? 0,
            })),
        });
        setEditModeKey(key);
        setDeletedTierIds([]);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const resetForm = () => {
        setShowForm(false);
        setEditModeKey(null);
        setDeletedTierIds([]);
        setFormData({ materialId: '', minCharge: 0, isActive: true, tiers: initFormTiers as any });
    };

    const handleSubmit = async () => {
        if (!formData.materialId) {
            alert('Vui lòng chọn vật tư.');
            return;
        }
        if (!formData.tiers.length) {
            alert('Cần ít nhất một mốc giá.');
            return;
        }
        setSubmitting(true);
        try {
            if (deletedTierIds.length > 0) {
                await Promise.all(deletedTierIds.map(id => api.delete(`/erp/large-format-pricing/${id}`)));
            }
            const payloads = formData.tiers.map(t => ({
                id: t.id,
                materialId: Number(formData.materialId),
                printerId: formData.printerId ? Number(formData.printerId) : undefined,
                areaFrom: String(t.areaFrom) === '' ? null : Number(t.areaFrom),
                areaTo: String(t.areaTo) === '' ? null : Number(t.areaTo),
                // Gửi 4 thành phần tách để backend tự tính pricePerSqm = tổng (giá vốn thuần).
                materialCost: Number(t.materialPrice || 0),
                machineCost: Number(t.machinePrice || 0),
                laborCost: Number(t.laborPrice || 0),
                overheadCost: Number(t.overheadPrice || 0),
                pricePerSqm: Number(t.materialPrice || 0) + Number(t.machinePrice || 0) + Number(t.laborPrice || 0) + Number(t.overheadPrice || 0),
                minCharge: Number(formData.minCharge || 0),
                isActive: formData.isActive,
            }));
            await Promise.all(payloads.map(p => p.id
                ? api.put(`/erp/large-format-pricing/${p.id}`, p)
                : api.post('/erp/large-format-pricing', p)));
            resetForm();
            await loadData();
        } catch (err) {
            console.error(err);
            alert('Có lỗi xảy ra khi lưu định mức.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteGroup = async (key: string) => {
        const g = groups[key];
        if (!g || !confirm(`Xóa tất cả ${g.tiers.length} mốc giá của "${g.material}"?`)) return;
        await Promise.all(g.tiers.map(t => api.delete(`/erp/large-format-pricing/${t.id}`)));
        await loadData();
    };

    const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Định mức giá in khổ lớn</h1>
                    <p className="text-slate-500 text-sm mt-1">Bảng giá theo m² cho sản phẩm in phẳng khổ lớn: banner, decal, pp, hiflex.</p>
                </div>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Thêm định mức mới
                </button>
            </div>

            {showForm && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 p-6">
                    <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">{editModeKey ? '✎' : '+'}</span>
                            {editModeKey ? 'Sửa định mức giá' : 'Thêm định mức mới'}
                        </h2>
                        <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="w-full lg:w-1/3 flex flex-col gap-4">
                            <div>
                                <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Vật tư <span className="text-red-500">*</span></label>
                                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.materialId} onChange={e => setFormData({ ...formData, materialId: e.target.value })}>
                                    <option value="">-- Chọn vật tư ({materials.length}) --</option>
                                    {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Phí tối thiểu (₫)</label>
                                    <input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.minCharge} onChange={e => setFormData({ ...formData, minCharge: e.target.value === '' ? '' : Number(e.target.value) })} />
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer py-2">
                                        <input type="checkbox" className="w-4 h-4 rounded" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />
                                        <span className="font-bold text-slate-600">Đang áp dụng</span>
                                    </label>
                                </div>
                            </div>

                            {/* Chọn máy khổ lớn (cost_basis='sqm') + gợi ý giá vốn/m² từ chi phí máy. */}
                            <div>
                                <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Máy in khổ lớn</label>
                                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.printerId} onChange={e => setFormData({ ...formData, printerId: e.target.value })}>
                                    <option value="">-- Không tính máy (chỉ vật liệu) --</option>
                                    {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <div className="mt-1.5 flex items-center justify-between text-[12px]">
                                    <span className="text-slate-500">{selectedMaterialCost != null && selectedMaterialCost > 0 ? <>Giá vốn vật liệu: <b className="text-slate-700">{fmt(selectedMaterialCost)}₫/m²</b></> : 'Vật tư chưa có giá vốn'}</span>
                                    <button type="button" onClick={suggestFromCost} disabled={suggesting} className="text-indigo-600 font-bold hover:text-indigo-700 disabled:opacity-50">{suggesting ? 'Đang tính...' : '✨ Gợi ý giá định mức'}</button>
                                </div>
                            </div>

                            <div className="mt-4 flex gap-2">
                                {editModeKey && (
                                    <button onClick={resetForm} disabled={submitting} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50">Hủy</button>
                                )}
                                <button onClick={handleSubmit} disabled={submitting} className={`flex-[2] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50 ${editModeKey ? 'bg-blue-500 hover:bg-blue-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                                    {submitting ? 'Đang lưu...' : (editModeKey ? '✓ Lưu thay đổi' : '+ Thêm định mức')}
                                </button>
                            </div>
                        </div>

                        <div className="w-full lg:w-2/3">
                            <label className="block text-[13px] font-bold text-slate-800 mb-2">Bảng giá theo diện tích (m²)</label>
                            <div className="bg-white rounded-xl">
                                <p className="text-[11px] text-slate-400 mb-2">Giá vốn thuần/m² = vật liệu + máy + công + overhead. Markup áp khi báo giá — KHÔNG nhập lời ở đây.</p>
                                <div className="space-y-3">
                                    {formData.tiers.map((row, idx) => {
                                        const rowTotal = Number(row.materialPrice || 0) + Number(row.machinePrice || 0) + Number(row.laborPrice || 0) + Number(row.overheadPrice || 0);
                                        return (
                                        <div key={idx} className="bg-slate-50/60 p-2 rounded-lg border border-slate-100">
                                            <div className="grid grid-cols-12 gap-2 items-center mb-2">
                                                <span className="col-span-2 text-[11px] font-bold text-slate-500">Từ (m²)</span>
                                                <div className="col-span-3"><input type="number" step="0.01" className="w-full px-2 py-1.5 text-sm rounded border border-slate-200" value={row.areaFrom ?? ''} onChange={e => updateTierRow(idx, 'areaFrom', e.target.value === '' ? '' : Number(e.target.value))} /></div>
                                                <span className="col-span-2 text-[11px] font-bold text-slate-500 text-center">Đến (m²)</span>
                                                <div className="col-span-3"><input type="number" step="0.01" className="w-full px-2 py-1.5 text-sm rounded border border-slate-200" value={row.areaTo ?? ''} onChange={e => updateTierRow(idx, 'areaTo', e.target.value === '' ? '' : Number(e.target.value))} /></div>
                                                <div className="col-span-2 text-right">
                                                    {formData.tiers.length > 1 && (
                                                        <button onClick={() => handleRemoveTierRow(idx)} className="text-red-400 hover:text-red-600 transition-colors"><svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-5 gap-2 items-end">
                                                <div><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Vật liệu</label><input type="number" className="w-full px-2 py-1.5 text-sm rounded border border-slate-200" value={row.materialPrice ?? ''} onChange={e => updateTierRow(idx, 'materialPrice', e.target.value === '' ? '' : Number(e.target.value))} /></div>
                                                <div><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Máy</label><input type="number" className="w-full px-2 py-1.5 text-sm rounded border border-slate-200" value={row.machinePrice ?? ''} onChange={e => updateTierRow(idx, 'machinePrice', e.target.value === '' ? '' : Number(e.target.value))} /></div>
                                                <div><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Công</label><input type="number" className="w-full px-2 py-1.5 text-sm rounded border border-slate-200" value={row.laborPrice ?? ''} onChange={e => updateTierRow(idx, 'laborPrice', e.target.value === '' ? '' : Number(e.target.value))} /></div>
                                                <div><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Overhead</label><input type="number" className="w-full px-2 py-1.5 text-sm rounded border border-slate-200" value={row.overheadPrice ?? ''} onChange={e => updateTierRow(idx, 'overheadPrice', e.target.value === '' ? '' : Number(e.target.value))} /></div>
                                                <div className="text-right"><label className="block text-[10px] font-bold text-slate-500 mb-0.5">Tổng/m²</label><div className="text-sm font-black text-emerald-600 py-1.5">{fmt(rowTotal)}₫</div></div>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                                <button onClick={handleAddTierRow} className="mt-4 text-[13px] text-indigo-500 font-bold hover:text-indigo-700 flex items-center gap-1.5 px-0 transition-colors"><span className="text-lg leading-none">+</span> Thêm mốc giá</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3 w-8"></th>
                                <th className="px-4 py-3">Vật tư</th>
                                <th className="px-4 py-3 text-center">Công nghệ</th>
                                <th className="px-4 py-3 text-center">Đơn vị</th>
                                <th className="px-4 py-3 text-center">Số mốc</th>
                                <th className="px-4 py-3 text-right">Khoảng giá</th>
                                <th className="px-4 py-3 text-center w-28">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groupEntries.length === 0 ? (
                                <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-500">Chưa có định mức khổ lớn</td></tr>
                            ) : groupEntries.map(([key, g]) => {
                                const isExpanded = expandedGroups.has(key);
                                const prices = g.tiers.map(t => t.pricePerSqm);
                                const minP = Math.min(...prices);
                                const maxP = Math.max(...prices);
                                const range = minP === maxP ? `${fmt(minP)}₫/${g.unit}` : `${fmt(minP)} – ${fmt(maxP)}₫/${g.unit}`;
                                // Cảnh báo LỖ: giá bán/m² thấp nhất < giá vốn vật liệu/m². Khổ lớn KHÔNG auto-set
                                // (giá/m² gộp sẵn mực+cán+lời), chỉ hiện mốc tham chiếu + cờ lỗ để người dùng tự sửa.
                                const belowCost = g.costPerSqm != null && g.costPerSqm > 0 && minP < g.costPerSqm;

                                return (
                                    <React.Fragment key={key}>
                                        <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => toggleGroup(key)}>
                                            <td className="px-4 py-3"><svg className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg></td>
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-800 flex items-center gap-2">
                                                    {g.material}
                                                    {belowCost && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700" title={`Có mốc giá/m² thấp hơn giá vốn vật liệu (${fmt(g.costPerSqm!)}₫/m²) — đang bán lỗ`}>⚠ dưới giá vốn</span>}
                                                </div>
                                                {g.costPerSqm != null && g.costPerSqm > 0 && (
                                                    <div className="text-[11px] text-slate-400 mt-0.5">Giá vốn vật liệu: {fmt(g.costPerSqm)}₫/{g.unit} <span className="text-slate-300">(tham chiếu — giá/m² đã gồm mực+cán+lời)</span></div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">{g.technology}</span></td>
                                            <td className="px-4 py-3 text-center text-slate-500">{g.unit}</td>
                                            <td className="px-4 py-3 text-center"><span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">{g.tiers.length} mốc</span></td>
                                            <td className="px-4 py-3 text-right font-bold text-emerald-600">{range}</td>
                                            <td className="px-4 py-3 text-center flex justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => handleEditGroup(key)} className={`p-1.5 rounded transition-colors ${editModeKey === key ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-blue-100 text-blue-500'}`} title="Sửa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                                <button onClick={() => handleDeleteGroup(key)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500" title="Xóa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </td>
                                        </tr>
                                        {isExpanded && g.tiers.sort((a, b) => a.areaFrom - b.areaFrom).map(tier => (
                                            <tr key={tier.id} className="bg-slate-50/50">
                                                <td></td>
                                                <td className="px-4 py-2 text-xs text-slate-500 pl-10">
                                                    {fmt(tier.areaFrom)} → {tier.areaTo ? fmt(tier.areaTo) : 'Trở lên'} {g.unit}
                                                </td>
                                                <td colSpan={3}></td>
                                                <td className="px-4 py-2 text-right font-bold text-sm text-slate-700">{fmt(tier.pricePerSqm)}₫/{g.unit}</td>
                                                <td></td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="mt-4 text-center text-xs text-slate-400">{groupEntries.length} nhóm • {tiers.length} mốc giá</div>
        </div>
    );
}
