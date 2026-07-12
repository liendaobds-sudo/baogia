"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../_components/apiClient';
import { fetchQuoteMaterials } from '../../_components/fetchQuoteMaterials';

interface PricingTier {
    id: number;
    materialId: number;
    paperSizeId: number;
    technology: string;
    printSide: string;
    printType?: string;
    quantityFrom: number;
    quantityTo: number;
    pricePerSheet: number;
    // Tách chi phí (tầng 2): giá vốn giấy dẫn từ materials.cost_price + mực nhập tay.
    paperCost?: number;
    inkCost?: number;
    // Tầng 3: máy + công + overhead per-máy.
    printerId?: number;
    machineCost?: number;
    laborCost?: number;
    overheadCost?: number;
    // Cột phái sinh từ backend (findAllTiers): cost_price hiện tại + cờ lệch.
    current_cost_price?: number | null;
    cost_drift?: boolean;
}

interface Material { id: number; name: string; cost_price?: number }
interface PaperSize { id: number; name: string; }
interface Printer { id: number; name: string; }

// Mốc giá form: 5 thành phần chi phí (giá vốn thuần). Tổng/tờ = paper+ink+machine+labor+overhead.
type FormTier = {
    id?: number;
    quantityFrom: number | string | null;
    quantityTo: number | string | null;
    paperPrice: number | string | null;
    inkPrice: number | string | null;
    machinePrice: number | string | null;
    laborPrice: number | string | null;
    overheadPrice: number | string | null;
};

const initFormTiers: FormTier[] = [{ quantityFrom: 1, quantityTo: 999999, paperPrice: 0, inkPrice: 0, machinePrice: 0, laborPrice: 0, overheadPrice: 0 }];

export default function PricingTiersPage() {
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [paperSizes, setPaperSizes] = useState<PaperSize[]>([]);
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [suggesting, setSuggesting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [filterScope, setFilterScope] = useState('');
    const [filterMaterial, setFilterMaterial] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Form states
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editModeKey, setEditModeKey] = useState<string | null>(null);
    const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);
    const [deletedTierIds, setDeletedTierIds] = useState<number[]>([]);
    
    const [formData, setFormData] = useState({
        materialId: '',
        paperSizeId: '',
        technology: 'digital_toner',
        printSide: 'single',
        printType: '',
        printerId: '',
        tiers: initFormTiers as any[]
    });

    // Handle ESC key to close modals
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (deleteConfirmKey) {
                    setDeleteConfirmKey(null);
                } else if (showForm) {
                    setShowForm(false);
                    setEditModeKey(null);
                    setFormData(prev => ({ ...prev, tiers: initFormTiers as any }));
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteConfirmKey, showForm]);

    const loadData = useCallback(async () => {
        setLoading(true);
        // Vật tư: qua fetchQuoteMaterials (scope loose+bound, chỉ giấy tờ) — nguồn dùng chung,
        // không tự ghép scope+category nữa. Khổ giấy: gọi loose+bound rồi hợp nhất theo id.
        const dedupeById = <T extends { id: number }>(...lists: (T[] | undefined)[]): T[] => {
            const byId = new Map<number, T>();
            for (const list of lists) for (const item of list || []) byId.set(item.id, item);
            return Array.from(byId.values());
        };
        const [tiersRes, mats, psLooseRes, psBoundRes, printersRes] = await Promise.all([
            api.get<PricingTier[]>('/erp/pricing-tiers'),
            fetchQuoteMaterials(['loose', 'bound'], ['substrate_sheet']),
            api.get<PaperSize[]>('/erp/paper-sizes?scope=loose'),
            api.get<PaperSize[]>('/erp/paper-sizes?scope=bound'),
            api.get<Printer[]>('/erp/printers'),
        ]);
        if (tiersRes.success && tiersRes.data) setTiers(tiersRes.data);
        setMaterials(mats as unknown as Material[]);
        setPaperSizes(dedupeById(psLooseRes.data, psBoundRes.data));
        if (printersRes.success && printersRes.data) setPrinters(printersRes.data);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Giá vốn giấy hiện tại của vật tư đang chọn (để auto-fill "Giá Giấy" + preview lệch trong form).
    const selectedMaterialCost = (() => {
        const m = materials.find(x => x.id === Number(formData.materialId));
        return m?.cost_price != null ? Number(m.cost_price) : null;
    })();

    // Auto-fill "Giá Giấy" của mọi mốc từ cost_price vật tư đang chọn (nút "lấy từ giá vốn").
    const fillPaperFromCost = () => {
        if (selectedMaterialCost == null || selectedMaterialCost <= 0) {
            alert('Vật tư chưa có giá vốn (cost_price). Nhập kho để cập nhật giá vốn trước.');
            return;
        }
        setFormData(f => ({ ...f, tiers: f.tiers.map(t => ({ ...t, paperPrice: selectedMaterialCost })) }));
    };

    // Đồng bộ giá vốn giấy từ cost_price vào tier đã lưu (theo vật tư hoặc tất cả). Không tự đè —
    // chỉ chạy khi bấm. Backend set paper_cost = cost_price, cập nhật tổng, ghi cost_synced_at.
    const syncCost = async (materialId?: number) => {
        setSubmitting(true);
        try {
            const res = await api.post<{ synced: number }>('/erp/pricing-tiers/sync-cost', materialId ? { material_id: materialId } : {});
            if ((res as any).success) await loadData();
        } catch (e) { console.error('Sync cost failed:', e); }
        finally { setSubmitting(false); }
    };

    const handleAddTierRow = () => {
        const last = formData.tiers[formData.tiers.length - 1];
        setFormData(f => ({
            ...f,
            tiers: [...f.tiers, { quantityFrom: last ? Number(last.quantityTo) + 1 : 1, quantityTo: 999999, paperPrice: 0, inkPrice: 0, machinePrice: 0, laborPrice: 0, overheadPrice: 0 }]
        }));
    };

    // Gợi ý giá định mức từ chi phí (tầng 3): gọi /suggest → điền breakdown 5 thành phần vào MỌI mốc.
    // KHÔNG tự lưu — người dùng xem, sửa được, rồi bấm lưu. Máy/công/overhead giống nhau mọi mốc
    // (chi phí/tờ không phụ thuộc SL); giấy+mực cũng vậy — người dùng tự chỉnh giảm theo mốc nếu muốn.
    const suggestFromCost = async () => {
        if (!formData.materialId) { alert('Chọn vật tư trước khi gợi ý.'); return; }
        setSuggesting(true);
        try {
            const res = await api.post<{ breakdown: { paperCost: number; inkCost: number; machineCost: number; laborCost: number; overheadCost: number } }>(
                '/erp/pricing-tiers/suggest',
                {
                    material_id: Number(formData.materialId),
                    printer_id: formData.printerId ? Number(formData.printerId) : undefined,
                    print_type: formData.printType || undefined,
                    sides: formData.printSide === 'double' ? 2 : 1,
                    paper_size_id: formData.paperSizeId ? Number(formData.paperSizeId) : undefined,
                },
            );
            const b = (res as any)?.data?.breakdown;
            if (!(res as any).success || !b) { alert('Không gợi ý được. Kiểm tra vật tư có giá vốn chưa.'); return; }
            setFormData(f => ({
                ...f,
                tiers: f.tiers.map(t => ({
                    ...t,
                    paperPrice: b.paperCost, inkPrice: b.inkCost,
                    machinePrice: b.machineCost, laborPrice: b.laborCost, overheadPrice: b.overheadCost,
                })),
            }));
        } catch (e) { console.error('Suggest failed:', e); alert('Lỗi khi gợi ý giá.'); }
        finally { setSuggesting(false); }
    };

    const handleRemoveTierRow = (idx: number) => {
        const tierToRemove = formData.tiers[idx];
        if (tierToRemove.id) {
            setDeletedTierIds(prev => [...prev, tierToRemove.id!]);
        }
        setFormData(f => ({ ...f, tiers: f.tiers.filter((_, i) => i !== idx) }));
    };

    const updateTierRow = (idx: number, field: string, value: any) => {
        setFormData(f => {
            const next = [...f.tiers] as any[];
            next[idx] = { ...next[idx], [field]: value };
            return { ...f, tiers: next };
        });
    };

    const handleSubmit = async () => {
        if (!formData.materialId || !formData.paperSizeId) {
            alert('Vui lòng chọn đầy đủ vật tư và khổ giấy.');
            return;
        }
        setSubmitting(true);
        try {
            // Xóa các tier đã bị remove trong lúc edit
            if (deletedTierIds.length > 0) {
                await Promise.all(deletedTierIds.map(id => api.delete(`/erp/pricing-tiers/${id}`)));
            }

            const payloads = formData.tiers.map(t => ({
                id: t.id,
                materialId: Number(formData.materialId),
                paperSizeId: Number(formData.paperSizeId),
                technology: formData.technology,
                printSide: formData.printSide,
                printType: formData.printType,
                quantityFrom: String(t.quantityFrom) === '' ? null : Number(t.quantityFrom),
                quantityTo: String(t.quantityTo) === '' ? null : Number(t.quantityTo),
                // Gửi 5 thành phần tách để backend tự tính pricePerSheet = tổng (giá vốn thuần, nguồn phái sinh).
                printerId: formData.printerId ? Number(formData.printerId) : undefined,
                paperCost: Number(t.paperPrice || 0),
                inkCost: Number(t.inkPrice || 0),
                machineCost: Number(t.machinePrice || 0),
                laborCost: Number(t.laborPrice || 0),
                overheadCost: Number(t.overheadPrice || 0),
                pricePerSheet: Number(t.paperPrice || 0) + Number(t.inkPrice || 0) + Number(t.machinePrice || 0) + Number(t.laborPrice || 0) + Number(t.overheadPrice || 0),
            }));
            
            const promises = payloads.map(p => {
                if (p.id) {
                    return api.put(`/erp/pricing-tiers/${p.id}`, p);
                } else {
                    return api.post('/erp/pricing-tiers', p);
                }
            });
            await Promise.all(promises);
            
            setFormData({ ...formData, tiers: initFormTiers });
            setEditModeKey(null);
            setDeletedTierIds([]);
            setShowForm(false);
            await loadData();
        } catch (err) {
            console.error(err);
            alert('Có lỗi xảy ra khi lưu định mức.');
        } finally {
            setSubmitting(false);
        }
    };

    // Grouping using CamelCase properties
    const groups: Record<string, { material: string; paperSize: string; technology: string; printSide: string; printType: string; tiers: PricingTier[], materialIdRaw: number, paperSizeIdRaw: number, printerIdRaw: number | null, costDrift: boolean }> = {};
    tiers.forEach(t => {
        const key = `${t.materialId}_${t.paperSizeId}_${t.technology}_${t.printSide}_${t.printType || ''}`;
        if (!groups[key]) {
            const mat = materials.find(m => m.id == t.materialId);
            const ps = paperSizes.find(p => p.id == t.paperSizeId);
            groups[key] = {
                material: mat?.name || `Mã VT: ${t.materialId}`,
                paperSize: ps?.name || `Mã khổ: ${t.paperSizeId || 'N/A'}`,
                technology: t.technology,
                printSide: t.printSide,
                printType: t.printType || '',
                tiers: [],
                materialIdRaw: t.materialId,
                paperSizeIdRaw: t.paperSizeId,
                printerIdRaw: t.printerId ?? null,
                costDrift: false
            };
        }
        groups[key].tiers.push(t);
        if (t.cost_drift) groups[key].costDrift = true;
    });

    const handleEditGroup = (key: string) => {
        const group = groups[key];
        if (!group) return;
        
        setFormData({
            materialId: String(group.materialIdRaw),
            paperSizeId: String(group.paperSizeIdRaw),
            technology: group.technology,
            printSide: group.printSide,
            printType: group.printType || '4c',
            printerId: group.printerIdRaw ? String(group.printerIdRaw) : '',
            tiers: group.tiers.sort((a,b) => a.quantityFrom - b.quantityFrom).map(t => ({
                id: t.id,
                quantityFrom: t.quantityFrom,
                quantityTo: t.quantityTo,
                // Đọc 5 thành phần THẬT. Dòng cũ chưa tách: paper_cost=tổng, còn lại 0 (backfill).
                paperPrice: t.paperCost ?? t.pricePerSheet,
                inkPrice: t.inkCost ?? 0,
                machinePrice: t.machineCost ?? 0,
                laborPrice: t.laborCost ?? 0,
                overheadPrice: t.overheadCost ?? 0,
            }))
        });
        setEditModeKey(key);
        setDeletedTierIds([]);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDuplicateGroup = (key: string) => {
        const group = groups[key];
        if (!group) return;
        
        setFormData({
            materialId: String(group.materialIdRaw),
            paperSizeId: String(group.paperSizeIdRaw),
            technology: group.technology,
            printSide: group.printSide,
            printType: group.printType || '4c',
            printerId: group.printerIdRaw ? String(group.printerIdRaw) : '',
            tiers: group.tiers.sort((a,b) => a.quantityFrom - b.quantityFrom).map(t => ({
                // Không copy ID để tạo mới
                quantityFrom: t.quantityFrom,
                quantityTo: t.quantityTo,
                paperPrice: t.paperCost ?? t.pricePerSheet,
                inkPrice: t.inkCost ?? 0,
                machinePrice: t.machineCost ?? 0,
                laborPrice: t.laborCost ?? 0,
                overheadPrice: t.overheadCost ?? 0,
            }))
        });
        setEditModeKey(null);
        setDeletedTierIds([]);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const groupEntries = Object.entries(groups).filter(([, g]) => {
        if (filterMaterial && !g.material.toLowerCase().includes(filterMaterial.trim().toLowerCase())) return false;
        if (filterScope && g.printSide !== filterScope && filterScope !== 'all') {
            if (filterScope === 'single' && g.printSide !== 'single') return false;
            if (filterScope === 'double' && g.printSide !== 'double') return false;
        }
        return true;
    });

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const handleDeleteGroupClick = (e: React.MouseEvent, key: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDeleteConfirmKey(key);
    };

    const handleDeleteGroupConfirm = async () => {
        if (!deleteConfirmKey) return;
        const group = groups[deleteConfirmKey];
        if (!group) return;
        
        setSubmitting(true);
        try {
            const results = await Promise.all(group.tiers.map(t => api.delete(`/erp/pricing-tiers/${t.id}`)));
            const failed = results.find(r => !(r as any).success);
            if (failed) {
                alert('Có lỗi khi xóa (từ server): ' + ((failed as any).error || (failed as any).message || JSON.stringify(failed)));
            }
        } catch (e: any) {
            alert('Có lỗi khi gọi API: ' + e.message);
        } finally {
            setDeleteConfirmKey(null);
            setSubmitting(false);
            await loadData();
        }
    };

    const fmt = (n: number | undefined | null) => new Intl.NumberFormat('vi-VN').format(n || 0);

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto relative">
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Định mức in nhanh (khổ nhỏ)</h1>
                    <p className="text-slate-500 text-sm mt-1">Bảng giá theo số lượng cho sản phẩm in nhanh kỹ thuật số.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <input
                        type="text"
                        value={filterMaterial}
                        onChange={e => setFilterMaterial(e.target.value)}
                        placeholder="Lọc theo giấy (vd: couche)"
                        className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white w-56 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <select className="px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white" value={filterScope} onChange={e => setFilterScope(e.target.value)}>
                        <option value="">Tất cả loại</option>
                        <option value="single">1 Mặt</option>
                        <option value="double">2 Mặt</option>
                    </select>
                    <button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Thêm định mức mới
                    </button>
                </div>
            </div>



            {showForm && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 p-6">
                    <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">{editModeKey ? '✎' : '+'}</span>
                            {editModeKey ? 'Sửa định mức giá' : 'Thêm định mức mới'}
                        </h2>
                        <button onClick={() => { setShowForm(false); setEditModeKey(null); setFormData({ ...formData, tiers: initFormTiers as any }); }} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Cột trái: Form cấu hình */}
                        <div className="w-full lg:w-1/3 flex flex-col gap-4">
                            <div>
                                <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Vật tư <span className="text-red-500">*</span></label>
                                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.materialId} onChange={e => setFormData({ ...formData, materialId: e.target.value })}>
                                    <option value="">-- Chọn vật tư ({materials.length}) --</option>
                                    {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                {formData.materialId && (
                                    selectedMaterialCost != null && selectedMaterialCost > 0 ? (
                                        <div className="mt-1.5 flex items-center justify-between text-[12px]">
                                            <span className="text-slate-500">Giá vốn hiện tại: <b className="text-slate-700">{fmt(selectedMaterialCost)}₫/tờ</b></span>
                                            <button type="button" onClick={fillPaperFromCost} className="text-indigo-600 font-bold hover:text-indigo-700">↺ Lấy vào giá giấy</button>
                                        </div>
                                    ) : (
                                        <p className="mt-1.5 text-[12px] text-amber-600">Vật tư chưa có giá vốn — nhập kho để cập nhật.</p>
                                    )
                                )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Khổ giấy <span className="text-red-500">*</span></label>
                                    <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.paperSizeId} onChange={e => setFormData({ ...formData, paperSizeId: e.target.value })}>
                                        <option value="">-- Chọn khổ --</option>
                                        {paperSizes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Số mặt in</label>
                                    <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.printSide} onChange={e => setFormData({ ...formData, printSide: e.target.value })}>
                                        <option value="single">1 Mặt</option>
                                        <option value="double">2 Mặt</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Loại in</label>
                                    <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.printType} onChange={e => setFormData({ ...formData, printType: e.target.value })}>
                                        <option value="">-- Chọn loại in --</option>
                                        <option value="4c">4 màu (CMYK)</option>
                                        <option value="bw">Trắng đen</option>
                                        <option value="5c">5 màu</option>
                                        <option value="6c">6 màu</option>
                                    </select>
                                </div>
                            </div>

                            {/* Máy in — dùng để suy chi phí máy/công/overhead khi gợi ý (tầng 3). */}
                            <div>
                                <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Máy in</label>
                                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.printerId} onChange={e => setFormData({ ...formData, printerId: e.target.value })}>
                                    <option value="">-- Không gắn máy (máy/công/overhead = 0) --</option>
                                    {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <button type="button" onClick={suggestFromCost} disabled={suggesting || !formData.materialId} className="mt-2 w-full text-[13px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-lg py-2 transition-colors">
                                    {suggesting ? 'Đang gợi ý...' : '✨ Gợi ý giá định mức từ chi phí'}
                                </button>
                                <p className="mt-1 text-[11px] text-slate-400">Suy giấy + mực + máy + công + overhead → điền vào mọi mốc để xem trước. Sửa được trước khi lưu. Chưa gồm lời (markup áp lúc báo giá).</p>
                            </div>

                            <div className="mt-4 flex gap-2">
                                {editModeKey && (
                                    <button onClick={() => { setShowForm(false); setEditModeKey(null); setFormData({ ...formData, tiers: initFormTiers as any }); }} disabled={submitting} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                                        Hủy
                                    </button>
                                )}
                                <button onClick={handleSubmit} disabled={submitting} className={`flex-[2] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50 ${editModeKey ? 'bg-blue-500 hover:bg-blue-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                                    {submitting ? 'Đang lưu...' : (editModeKey ? '✓ Lưu thay đổi' : '+ Thêm định mức')}
                                </button>
                            </div>
                        </div>

                        {/* Cột phải: Bảng mốc giá */}
                        <div className="w-full lg:w-2/3">
                            <label className="block text-[13px] font-bold text-slate-800 mb-2">Bảng giá theo số lượng</label>
                            <div className="bg-white rounded-xl">
                                <p className="text-[11px] text-slate-400 mb-2">Giá vốn thuần/tờ = giấy + mực + máy + công + overhead. Lời (markup) áp riêng khi báo giá — KHÔNG nhập ở đây.</p>
                                <div className="space-y-3">
                                    {formData.tiers.map((row, idx) => {
                                        const rowTotal = Number(row.paperPrice || 0) + Number(row.inkPrice || 0) + Number(row.machinePrice || 0) + Number(row.laborPrice || 0) + Number(row.overheadPrice || 0);
                                        return (
                                        <div key={idx} className="bg-slate-50/60 p-2.5 rounded-lg border border-slate-100">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[11px] font-bold text-slate-500 uppercase">SL</span>
                                                <input type="number" placeholder="Từ" className="w-20 px-2 py-1 text-sm rounded border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={row.quantityFrom ?? ''} onChange={e => updateTierRow(idx, 'quantityFrom', e.target.value === '' ? '' : Number(e.target.value))} />
                                                <span className="text-slate-400">→</span>
                                                <input type="number" placeholder="Đến" className="w-20 px-2 py-1 text-sm rounded border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={row.quantityTo ?? ''} onChange={e => updateTierRow(idx, 'quantityTo', e.target.value === '' ? '' : Number(e.target.value))} />
                                                <span className="ml-auto text-sm font-black text-emerald-600">{fmt(rowTotal)}₫/tờ</span>
                                                {formData.tiers.length > 1 && (
                                                    <button onClick={() => handleRemoveTierRow(idx)} className="text-red-400 hover:text-red-600 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-5 gap-2">
                                                {([
                                                    ['paperPrice', 'Giấy'], ['inkPrice', 'Mực'], ['machinePrice', 'Máy'], ['laborPrice', 'Công'], ['overheadPrice', 'Overhead'],
                                                ] as const).map(([field, label]) => (
                                                    <div key={field}>
                                                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">{label}</label>
                                                        <input type="number" className="w-full px-2 py-1.5 text-sm rounded border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={(row as any)[field] ?? ''} onChange={e => updateTierRow(idx, field, e.target.value === '' ? '' : Number(e.target.value))} />
                                                    </div>
                                                ))}
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

            <div className="flex-1 min-h-[300px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm relative">
                        <thead className="bg-slate-100/80 backdrop-blur-sm sticky top-0 z-10 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3.5 w-10 text-center"><input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" /></th>
                                <th className="px-2 py-3.5 w-8"></th>
                                <th className="px-4 py-3.5">Vật tư / Khổ</th>
                                <th className="px-4 py-3.5 text-center">Loại in</th>
                                <th className="px-4 py-3.5 text-center">Số mốc giá</th>
                                <th className="px-4 py-3.5 text-right">Khoảng giá</th>
                                <th className="px-4 py-3.5 text-center w-28">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groupEntries.length === 0 ? (
                                <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-500 bg-slate-50/30">Chưa có định mức giá nào phù hợp</td></tr>
                            ) : groupEntries.map(([key, g]) => {
                                const isExpanded = expandedGroups.has(key);
                                const prices = g.tiers.map(t => t.pricePerSheet || 0);
                                const minP = Math.min(...prices);
                                const maxP = Math.max(...prices);
                                const priceRange = minP === maxP ? `${fmt(minP)}₫` : `${fmt(minP)} – ${fmt(maxP)}₫`;
                                const sideLabel = g.printSide === 'single' ? '1 mặt' : '2 mặt';
                                const typeLabel = g.printType === '4c' ? '4 màu' : g.printType === 'bw' ? 'Trắng đen' : g.printType === '5c' ? '5 màu' : g.printType === '6c' ? '6 màu' : g.printType;

                                return (
                                    <React.Fragment key={key}>
                                        <tr className="hover:bg-indigo-50/20 cursor-pointer transition-colors group" onClick={() => toggleGroup(key)}>
                                            <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                                                <input type="checkbox" className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                                            </td>
                                            <td className="px-2 py-3.5 text-center">
                                                <svg className={`w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="font-bold text-slate-800 flex items-center gap-2">
                                                    {g.material}
                                                    {g.costDrift && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700" title="Giá vốn giấy (cost_price) đã đổi sau lần nhập kho gần nhất — bấm Đồng bộ để cập nhật giá giấy trong định mức">⚠ giá vốn đã đổi</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 font-medium mt-0.5">{g.paperSize}</div>
                                                {g.costDrift && (
                                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); syncCost(g.materialIdRaw); }} disabled={submitting} className="mt-1 text-[11px] font-bold text-amber-600 hover:text-amber-800 disabled:opacity-50">↻ Đồng bộ giá vốn</button>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 text-center flex items-center justify-center gap-2 mt-2">
                                                <span className="text-[13px] font-medium text-slate-600">{sideLabel}</span>
                                                {typeLabel && <span className="text-[13px] font-medium text-slate-600">{typeLabel}</span>}
                                            </td>
                                            <td className="px-4 py-3.5 text-center"><span className="text-[13px] font-medium text-slate-600">{g.tiers.length} mốc</span></td>
                                            <td className="px-4 py-3.5 text-right font-bold text-emerald-600">{priceRange}</td>
                                            <td className="px-4 py-3.5 text-center flex justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditGroup(key); }} className={`p-1 rounded transition-colors ${editModeKey === key ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-blue-100 text-blue-500'}`} title="Sửa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDuplicateGroup(key); }} className="p-1 hover:bg-cyan-100 rounded text-cyan-500 transition-colors" title="Nhân bản"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg></button>
                                                <button onClick={(e) => handleDeleteGroupClick(e, key)} className="p-1 hover:bg-red-100 rounded text-red-500 transition-colors" title="Xóa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </td>
                                        </tr>
                                        {isExpanded && g.tiers.sort((a, b) => a.quantityFrom - b.quantityFrom).map(tier => (
                                            <tr key={tier.id} className="bg-slate-50 border-b border-b-slate-100/50 last:border-b-0">
                                                <td colSpan={2}></td>
                                                <td className="px-4 py-2 text-xs text-slate-500 pl-8 font-mono flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                    <span>SL: <span className="text-slate-800 font-bold">{fmt(tier.quantityFrom)}</span> → <span className="text-slate-800 font-bold">{fmt(tier.quantityTo)}</span></span>
                                                </td>
                                                <td colSpan={2} className="px-4 py-2 text-[11px] text-slate-500">
                                                    <span className="mr-2">Giấy <b className="text-slate-700">{fmt(tier.paperCost ?? tier.pricePerSheet)}</b></span>
                                                    <span className="mr-2">Mực <b className="text-slate-700">{fmt(tier.inkCost ?? 0)}</b></span>
                                                    <span className="mr-2">Máy <b className="text-slate-700">{fmt(tier.machineCost ?? 0)}</b></span>
                                                    <span className="mr-2">Công <b className="text-slate-700">{fmt(tier.laborCost ?? 0)}</b></span>
                                                    <span>OH <b className="text-slate-700">{fmt(tier.overheadCost ?? 0)}</b></span>
                                                </td>
                                                <td colSpan={2} className="px-4 py-2 text-right font-black text-[13px] text-slate-800">{fmt(tier.pricePerSheet)}₫<span className="text-[10px] text-slate-400 font-normal ml-0.5">/tờ vốn</span></td>
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
            <div className="mt-4 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-widest">{groupEntries.length} NHÓM • {tiers.length} MỐC GIÁ</div>

            {/* Modal Xóa Định Mức */}
            {deleteConfirmKey && groups[deleteConfirmKey] && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-3">
                                <span className="bg-red-100 text-red-600 p-1.5 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></span>
                                Xác nhận xóa định mức
                            </h3>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                Bạn có chắc chắn muốn xóa tất cả <strong className="text-slate-800">{groups[deleteConfirmKey].tiers.length}</strong> mốc giá của <strong className="text-slate-800">{groups[deleteConfirmKey].material}</strong>?
                            </p>
                            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                                <p className="text-xs font-bold text-red-600">Thao tác này không thể hoàn tác.</p>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setDeleteConfirmKey(null)} disabled={submitting} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">Hủy bỏ</button>
                            <button onClick={handleDeleteGroupConfirm} disabled={submitting} className="px-4 py-2 text-sm font-bold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                                {submitting ? <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> Đang xóa...</> : 'Xóa vĩnh viễn'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
