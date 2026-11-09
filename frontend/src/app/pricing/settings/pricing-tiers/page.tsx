"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../_components/apiClient';
import { fetchQuoteMaterials } from '../../_components/fetchQuoteMaterials';
import {
    DigitalSettingsNav,
    computePreviewSellingUnit,
    type MarkupSummary,
} from '../_components/DigitalSettingsNav';

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

interface Material { id: number; name: string; cost_price?: number; paper_size_id?: number; paperSizeId?: number }
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

const initFormTiers: FormTier[] = [
    { quantityFrom: 1, quantityTo: 999999, paperPrice: 0, inkPrice: 0, machinePrice: 0, laborPrice: 0, overheadPrice: 0 },
];

const STANDARD_BRACKETS: Array<[number, number]> = [
    [1, 10],
    [11, 50],
    [51, 200],
    [201, 500],
    [501, 999999],
];

export default function PricingTiersPage() {
    const [tiers, setTiers] = useState<PricingTier[]>([]);
    const [materials, setMaterials] = useState<Material[]>([]);
    const [paperSizes, setPaperSizes] = useState<PaperSize[]>([]);
    const [printers, setPrinters] = useState<Printer[]>([]);
    const [markupRule, setMarkupRule] = useState<MarkupSummary | null>(null);
    const [suggesting, setSuggesting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [filterScope, setFilterScope] = useState('');
    const [filterMaterial, setFilterMaterial] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Chế độ nhập: 'quick' (1 ô tổng/tờ) vs 'detailed' (5 ô thành phần)
    const [inputMode, setInputMode] = useState<'quick' | 'detailed'>('quick');
    // % giảm chi phí in mỗi bậc khi tạo mốc bậc thang
    const [stepDiscountPct, setStepDiscountPct] = useState<number>(8);
    // Tự động tạo kèm bản 2 mặt khi đang thêm mới bản 1 mặt
    const [autoCreateDoubleSide, setAutoCreateDoubleSide] = useState<boolean>(true);
    // Inline edit state cho các dòng đang mở trên bảng
    const [inlineEdits, setInlineEdits] = useState<Record<number, number>>({});
    const [savingInlineId, setSavingInlineId] = useState<number | null>(null);

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
        printType: '4c',
        printerId: '',
        tiers: initFormTiers as FormTier[],
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
                    setFormData(prev => ({ ...prev, tiers: initFormTiers }));
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteConfirmKey, showForm]);

    const loadData = useCallback(async () => {
        setLoading(true);
        const dedupeById = <T extends { id: number }>(...lists: (T[] | undefined)[]): T[] => {
            const byId = new Map<number, T>();
            for (const list of lists) for (const item of list || []) byId.set(item.id, item);
            return Array.from(byId.values());
        };
        const [tiersRes, mats, psLooseRes, psBoundRes, printersRes, markupRes] = await Promise.all([
            api.get<PricingTier[]>('/erp/pricing-tiers'),
            fetchQuoteMaterials(['loose', 'bound'], ['substrate_sheet']),
            api.get<PaperSize[]>('/erp/paper-sizes?scope=loose'),
            api.get<PaperSize[]>('/erp/paper-sizes?scope=bound'),
            api.get<Printer[]>('/erp/printers'),
            api.get<MarkupSummary>('/erp/pricing-markup').catch(() => ({ success: false, data: null })),
        ]);
        if (tiersRes.success && tiersRes.data) setTiers(tiersRes.data);
        setMaterials(mats as unknown as Material[]);
        setPaperSizes(dedupeById(psLooseRes.data, psBoundRes.data));
        if (printersRes.success && printersRes.data) setPrinters(printersRes.data);
        if (markupRes?.success && markupRes.data) setMarkupRule(markupRes.data);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Giá vốn giấy hiện tại của vật tư đang chọn
    const selectedMaterialCost = (() => {
        const m = materials.find(x => x.id === Number(formData.materialId));
        return m?.cost_price != null ? Number(m.cost_price) : null;
    })();

    const fillPaperFromCost = () => {
        if (selectedMaterialCost == null || selectedMaterialCost <= 0) {
            alert('Vật tư chưa có giá vốn (cost_price). Nhập kho để cập nhật giá vốn trước.');
            return;
        }
        setFormData(f => ({ ...f, tiers: f.tiers.map(t => ({ ...t, paperPrice: selectedMaterialCost })) }));
    };

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
            tiers: [
                ...f.tiers,
                {
                    quantityFrom: last ? Number(last.quantityTo) + 1 : 1,
                    quantityTo: 999999,
                    paperPrice: last?.paperPrice ?? (selectedMaterialCost || 0),
                    inkPrice: last?.inkPrice ?? 0,
                    machinePrice: last?.machinePrice ?? 0,
                    laborPrice: last?.laborPrice ?? 0,
                    overheadPrice: last?.overheadPrice ?? 0,
                },
            ],
        }));
    };

    // Tạo nhanh 5 mốc số lượng chuẩn + giảm dần chi phí in theo % mỗi bậc
    const applyStandardBrackets = () => {
        const first = formData.tiers[0] || initFormTiers[0];
        const basePaper = Number(first.paperPrice || selectedMaterialCost || 0);
        const baseInk = Number(first.inkPrice || 0);
        const baseMachine = Number(first.machinePrice || 0);
        const baseLabor = Number(first.laborPrice || 0);
        const baseOverhead = Number(first.overheadPrice || 0);
        const hasPrintCost = baseInk + baseMachine + baseLabor + baseOverhead > 0;
        const fallbackPrintCost = hasPrintCost ? 0 : Math.max(500, Math.round(basePaper * 0.5));

        const nextTiers: FormTier[] = STANDARD_BRACKETS.map(([qFrom, qTo], idx) => {
            const factor = Math.max(0.4, Math.pow(1 - (stepDiscountPct || 0) / 100, idx));
            return {
                quantityFrom: qFrom,
                quantityTo: qTo,
                paperPrice: basePaper,
                inkPrice: hasPrintCost ? Math.round(baseInk * factor) : Math.round(fallbackPrintCost * factor),
                machinePrice: Math.round(baseMachine * factor),
                laborPrice: Math.round(baseLabor * factor),
                overheadPrice: Math.round(baseOverhead * factor),
            };
        });
        setFormData(f => ({ ...f, tiers: nextTiers }));
    };

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
                tiers: f.tiers.map((t, idx) => {
                    // Nếu chỉ có 1 mốc: giữ nguyên 100% giá gợi ý. Nếu có nhiều mốc: giảm nhẹ chi phí máy/công/OH theo bậc.
                    const factor = f.tiers.length > 1 ? Math.max(0.5, Math.pow(1 - (stepDiscountPct || 0) / 100, idx)) : 1;
                    return {
                        ...t,
                        paperPrice: b.paperCost,
                        inkPrice: b.inkCost,
                        machinePrice: Math.round(b.machineCost * factor),
                        laborPrice: Math.round(b.laborCost * factor),
                        overheadPrice: Math.round(b.overheadCost * factor),
                    };
                }),
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

    // Trong chế độ Nhập nhanh (1 ô tổng giá vốn/tờ): tự giữ giá giấy (paperPrice) và dồn phần còn lại vào inkPrice
    const updateQuickTotalCost = (idx: number, totalVal: number | '') => {
        setFormData(f => {
            const next = [...f.tiers] as FormTier[];
            const row = next[idx];
            if (totalVal === '') {
                next[idx] = { ...row, paperPrice: 0, inkPrice: 0, machinePrice: 0, laborPrice: 0, overheadPrice: 0 };
                return { ...f, tiers: next };
            }
            const targetTotal = Math.max(0, Number(totalVal) || 0);
            const paper = Math.min(targetTotal, Number(row.paperPrice || selectedMaterialCost || 0));
            const fixedOthers = Number(row.machinePrice || 0) + Number(row.laborPrice || 0) + Number(row.overheadPrice || 0);
            if (targetTotal >= paper + fixedOthers) {
                next[idx] = { ...row, paperPrice: paper, inkPrice: targetTotal - paper - fixedOthers };
            } else {
                next[idx] = { ...row, paperPrice: paper, inkPrice: Math.max(0, targetTotal - paper), machinePrice: 0, laborPrice: 0, overheadPrice: 0 };
            }
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
            if (deletedTierIds.length > 0) {
                await Promise.all(deletedTierIds.map(id => api.delete(`/erp/pricing-tiers/${id}`)));
            }

            const buildPayloadsForSide = (side: string, printMultiplier: number, keepIds: boolean) =>
                formData.tiers.map(t => {
                    const paperCost = Number(t.paperPrice || 0);
                    const inkCost = Math.round(Number(t.inkPrice || 0) * printMultiplier);
                    const machineCost = Math.round(Number(t.machinePrice || 0) * printMultiplier);
                    const laborCost = Math.round(Number(t.laborPrice || 0) * printMultiplier);
                    const overheadCost = Math.round(Number(t.overheadPrice || 0) * printMultiplier);
                    return {
                        id: keepIds ? t.id : undefined,
                        materialId: Number(formData.materialId),
                        paperSizeId: Number(formData.paperSizeId),
                        technology: formData.technology,
                        printSide: side,
                        printType: formData.printType,
                        quantityFrom: String(t.quantityFrom) === '' ? null : Number(t.quantityFrom),
                        quantityTo: String(t.quantityTo) === '' ? null : Number(t.quantityTo),
                        printerId: formData.printerId ? Number(formData.printerId) : undefined,
                        paperCost,
                        inkCost,
                        machineCost,
                        laborCost,
                        overheadCost,
                        pricePerSheet: paperCost + inkCost + machineCost + laborCost + overheadCost,
                    };
                });

            const payloads = buildPayloadsForSide(formData.printSide, 1, true);
            const promises = payloads.map(p => (p.id ? api.put(`/erp/pricing-tiers/${p.id}`, p) : api.post('/erp/pricing-tiers', p)));

            // Nếu đang thêm mới 1 Mặt và bật tự động tạo kèm bản 2 Mặt (chưa có sẵn nhóm 2 mặt)
            if (!editModeKey && formData.printSide === 'single' && autoCreateDoubleSide) {
                const doubleKey = `${formData.materialId}_${formData.paperSizeId}_${formData.technology}_double_${formData.printType || ''}`;
                if (!groups[doubleKey]) {
                    const doublePayloads = buildPayloadsForSide('double', 1.8, false);
                    for (const dp of doublePayloads) {
                        promises.push(api.post('/erp/pricing-tiers', dp));
                    }
                }
            }

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

    const handleInlineSave = async (tier: PricingTier) => {
        const newTotal = inlineEdits[tier.id];
        if (newTotal == null || newTotal === tier.pricePerSheet) return;
        setSavingInlineId(tier.id);
        try {
            const paper = Math.min(newTotal, Number(tier.paperCost ?? tier.current_cost_price ?? 0));
            const others = Number(tier.machineCost || 0) + Number(tier.laborCost || 0) + Number(tier.overheadCost || 0);
            const ink = Math.max(0, newTotal - paper - others);
            await api.put(`/erp/pricing-tiers/${tier.id}`, {
                ...tier,
                paperCost: paper,
                inkCost: ink,
                pricePerSheet: newTotal,
            });
            setInlineEdits(prev => {
                const cp = { ...prev };
                delete cp[tier.id];
                return cp;
            });
            await loadData();
        } catch (e) {
            console.error(e);
            alert('Lỗi khi lưu nhanh mốc giá');
        } finally {
            setSavingInlineId(null);
        }
    };

    // Grouping
    const groups: Record<string, { material: string; paperSize: string; technology: string; printSide: string; printType: string; tiers: PricingTier[]; materialIdRaw: number; paperSizeIdRaw: number; printerIdRaw: number | null; costDrift: boolean }> = {};
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
                costDrift: false,
            };
        }
        groups[key].tiers.push(t);
        if (t.cost_drift) groups[key].costDrift = true;
    });

    // Phát hiện các vật tư chưa có bất kỳ định mức nào
    const configuredMatIds = new Set(tiers.map(t => Number(t.materialId)));
    const unconfiguredMaterials = materials.filter(m => !configuredMatIds.has(Number(m.id)));

    const handleQuickSetupMaterial = (mat: Material) => {
        const defaultPsId = mat.paper_size_id || mat.paperSizeId || paperSizes[0]?.id || '';
        const basePaper = Number(mat.cost_price || 0);
        const defaultInk = basePaper > 0 ? Math.max(500, Math.round(basePaper * 0.4)) : 1000;
        setEditModeKey(null);
        setDeletedTierIds([]);
        setFormData({
            materialId: String(mat.id),
            paperSizeId: defaultPsId ? String(defaultPsId) : '',
            technology: 'digital_toner',
            printSide: 'single',
            printType: '4c',
            printerId: printers[0]?.id ? String(printers[0].id) : '',
            tiers: STANDARD_BRACKETS.map(([qFrom, qTo], idx) => {
                const factor = Math.pow(0.92, idx);
                return {
                    quantityFrom: qFrom,
                    quantityTo: qTo,
                    paperPrice: basePaper,
                    inkPrice: Math.round(defaultInk * factor),
                    machinePrice: 0,
                    laborPrice: 0,
                    overheadPrice: 0,
                };
            }),
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

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
            tiers: group.tiers.sort((a, b) => a.quantityFrom - b.quantityFrom).map(t => ({
                id: t.id,
                quantityFrom: t.quantityFrom,
                quantityTo: t.quantityTo,
                paperPrice: t.paperCost ?? t.pricePerSheet,
                inkPrice: t.inkCost ?? 0,
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

    const handleDuplicateGroup = (key: string) => {
        const group = groups[key];
        if (!group) return;

        setFormData({
            materialId: String(group.materialIdRaw),
            paperSizeId: String(group.paperSizeIdRaw),
            technology: group.technology,
            printSide: group.printSide === 'single' ? 'double' : 'single',
            printType: group.printType || '4c',
            printerId: group.printerIdRaw ? String(group.printerIdRaw) : '',
            tiers: group.tiers.sort((a, b) => a.quantityFrom - b.quantityFrom).map(t => ({
                quantityFrom: t.quantityFrom,
                quantityTo: t.quantityTo,
                paperPrice: t.paperCost ?? t.pricePerSheet,
                inkPrice: t.inkCost ?? 0,
                machinePrice: t.machineCost ?? 0,
                laborPrice: t.laborCost ?? 0,
                overheadPrice: t.overheadCost ?? 0,
            })),
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
            <DigitalSettingsNav activeTab="tiers" markup={markupRule} />

            <div className="mb-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Định mức in nhanh (khổ nhỏ)</h1>
                    <p className="text-slate-500 text-sm mt-1">Bảng giá vốn theo số lượng tờ in — hệ thống tự cộng lợi nhuận (Markup) khi lên báo giá.</p>
                </div>
                <div className="flex flex-wrap gap-2.5 items-center">
                    <input
                        type="text"
                        value={filterMaterial}
                        onChange={e => setFilterMaterial(e.target.value)}
                        placeholder="Lọc theo giấy (vd: couche)"
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white w-52 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <select className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={filterScope} onChange={e => setFilterScope(e.target.value)}>
                        <option value="">Tất cả mặt in</option>
                        <option value="single">1 Mặt</option>
                        <option value="double">2 Mặt</option>
                    </select>
                    <button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Thêm định mức mới
                    </button>
                </div>
            </div>

            {/* Banner phát hiện vật tư chưa cài định mức — bấm 1 click để khởi tạo */}
            {unconfiguredMaterials.length > 0 && (
                <div className="mb-5 bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                            <span>⚡</span> Phát hiện {unconfiguredMaterials.length} loại giấy trong kho chưa có định mức giá
                        </div>
                        <p className="text-[11px] text-amber-700 mt-0.5">Bấm vào tên giấy bên dưới để tạo nhanh bảng giá 5 mốc số lượng chuẩn (1 Mặt + 2 Mặt):</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {unconfiguredMaterials.slice(0, 8).map(m => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => handleQuickSetupMaterial(m)}
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold shadow-xs transition-colors"
                            >
                                + {m.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {showForm && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 p-6">
                    <div className="flex flex-wrap justify-between items-center mb-5 border-b border-slate-100 pb-4 gap-3">
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">{editModeKey ? '✎' : '+'}</span>
                            {editModeKey ? 'Sửa định mức giá' : 'Thêm định mức mới'}
                        </h2>
                        <div className="flex items-center gap-3">
                            {/* Chuyển chế độ Nhập nhanh (1 ô) vs Chi tiết (5 ô) */}
                            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
                                <button
                                    type="button"
                                    onClick={() => setInputMode('quick')}
                                    className={`px-3 py-1.5 rounded-md transition-all ${inputMode === 'quick' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
                                >
                                    ⚡ Nhập nhanh (1 ô/mốc)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInputMode('detailed')}
                                    className={`px-3 py-1.5 rounded-md transition-all ${inputMode === 'detailed' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-800'}`}
                                >
                                    🔬 Chi tiết 5 thành phần
                                </button>
                            </div>
                            <button onClick={() => { setShowForm(false); setEditModeKey(null); setFormData({ ...formData, tiers: initFormTiers }); }} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
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

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Khổ giấy <span className="text-red-500">*</span></label>
                                    <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.paperSizeId} onChange={e => setFormData({ ...formData, paperSizeId: e.target.value })}>
                                        <option value="">-- Chọn khổ --</option>
                                        {paperSizes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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

                            <div>
                                <label className="block text-[13px] font-bold text-slate-600 mb-1.5">Số mặt in</label>
                                <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.printSide} onChange={e => setFormData({ ...formData, printSide: e.target.value })}>
                                    <option value="single">1 Mặt</option>
                                    <option value="double">2 Mặt</option>
                                </select>
                                {!editModeKey && formData.printSide === 'single' && (
                                    <label className="mt-2 flex items-start gap-2 text-xs text-indigo-800 bg-indigo-50/70 border border-indigo-100 rounded-lg p-2.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={autoCreateDoubleSide}
                                            onChange={e => setAutoCreateDoubleSide(e.target.checked)}
                                            className="mt-0.5 rounded border-indigo-300 text-indigo-600"
                                        />
                                        <span>
                                            <b>Tự động tạo luôn bản 2 Mặt</b> (Giấy ×1 + Chi phí in ×1.8) để không phải nhập lại lần 2.
                                        </span>
                                    </label>
                                )}
                            </div>

                            {/* Máy in — dùng để suy chi phí máy/công/overhead khi gợi ý (tầng 3). */}
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                                <label className="block text-[12px] font-bold text-slate-600 mb-1.5">Máy in chuẩn (để gợi ý giá vốn tự động)</label>
                                <select className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" value={formData.printerId} onChange={e => setFormData({ ...formData, printerId: e.target.value })}>
                                    <option value="">-- Không gắn máy (máy/công/overhead = 0) --</option>
                                    {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <button type="button" onClick={suggestFromCost} disabled={suggesting || !formData.materialId} className="mt-2 w-full text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg py-2 transition-colors shadow-xs">
                                    {suggesting ? 'Đang gợi ý...' : '✨ Gợi ý giá định mức từ chi phí'}
                                </button>
                            </div>

                            <div className="mt-2 flex gap-2">
                                {editModeKey && (
                                    <button onClick={() => { setShowForm(false); setEditModeKey(null); setFormData({ ...formData, tiers: initFormTiers }); }} disabled={submitting} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-4 rounded-lg shadow-xs transition-colors disabled:opacity-50">
                                        Hủy
                                    </button>
                                )}
                                <button onClick={handleSubmit} disabled={submitting} className={`flex-[2] text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50 ${editModeKey ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                    {submitting ? 'Đang lưu...' : (editModeKey ? '✓ Lưu thay đổi' : '+ Lưu định mức')}
                                </button>
                            </div>
                        </div>

                        {/* Cột phải: Bảng mốc giá */}
                        <div className="w-full lg:w-2/3">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <div>
                                    <label className="block text-[14px] font-bold text-slate-800">Bảng giá theo mốc số lượng tờ</label>
                                    <p className="text-[11px] text-slate-500">
                                        Nhập <b>Giá vốn/tờ</b> — cột bên phải sẽ hiển thị ngay <b>Giá bán dự kiến/tờ</b> (đã cộng Markup).
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 bg-indigo-50/80 border border-indigo-100 rounded-lg px-2.5 py-1.5">
                                    <span className="text-[11px] font-semibold text-indigo-800">Giảm mỗi bậc:</span>
                                    <select
                                        value={stepDiscountPct}
                                        onChange={e => setStepDiscountPct(Number(e.target.value))}
                                        className="text-xs font-bold bg-white border border-indigo-200 rounded px-1.5 py-0.5 text-indigo-900"
                                    >
                                        <option value={0}>0%</option>
                                        <option value={5}>-5%</option>
                                        <option value={8}>-8%</option>
                                        <option value={10}>-10%</option>
                                        <option value={15}>-15%</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={applyStandardBrackets}
                                        className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-md shadow-xs transition-colors"
                                    >
                                        ⚡ Tạo 5 mốc SL chuẩn
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl">
                                <div className="space-y-2.5">
                                    {formData.tiers.map((row, idx) => {
                                        const rowTotal = Number(row.paperPrice || 0) + Number(row.inkPrice || 0) + Number(row.machinePrice || 0) + Number(row.laborPrice || 0) + Number(row.overheadPrice || 0);
                                        const previewSelling = computePreviewSellingUnit(rowTotal, markupRule);
                                        return (
                                            <div key={idx} className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
                                                <div className="flex flex-wrap items-center gap-2.5">
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase w-7">SL:</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Từ"
                                                        className="w-20 px-2.5 py-1.5 text-sm font-semibold bg-white rounded-lg border border-slate-200 focus:border-indigo-500"
                                                        value={row.quantityFrom ?? ''}
                                                        onChange={e => updateTierRow(idx, 'quantityFrom', e.target.value === '' ? '' : Number(e.target.value))}
                                                    />
                                                    <span className="text-slate-400 font-bold">→</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Đến"
                                                        className="w-24 px-2.5 py-1.5 text-sm font-semibold bg-white rounded-lg border border-slate-200 focus:border-indigo-500"
                                                        value={row.quantityTo ?? ''}
                                                        onChange={e => updateTierRow(idx, 'quantityTo', e.target.value === '' ? '' : Number(e.target.value))}
                                                    />

                                                    {inputMode === 'quick' && (
                                                        <div className="flex items-center gap-2 ml-2">
                                                            <span className="text-xs font-bold text-slate-600">Giá vốn/tờ:</span>
                                                            <input
                                                                type="number"
                                                                placeholder="Tổng giá vốn/tờ"
                                                                className="w-32 px-3 py-1.5 text-sm font-black text-emerald-700 bg-white rounded-lg border border-emerald-300 focus:border-emerald-600"
                                                                value={rowTotal || ''}
                                                                onChange={e => updateQuickTotalCost(idx, e.target.value === '' ? '' : Number(e.target.value))}
                                                            />
                                                            <span className="text-xs text-slate-500">₫</span>
                                                        </div>
                                                    )}

                                                    <div className="ml-auto flex items-center gap-3">
                                                        {inputMode === 'detailed' && (
                                                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                                                                Vốn: <b>{fmt(rowTotal)}₫/tờ</b>
                                                            </span>
                                                        )}
                                                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200" title="Giá bán dự kiến sau khi áp quy tắc Lợi nhuận & Làm tròn">
                                                            → Giá bán: <b>{fmt(previewSelling)}₫/tờ</b>
                                                        </span>
                                                        {formData.tiers.length > 1 && (
                                                            <button onClick={() => handleRemoveTierRow(idx)} className="text-red-400 hover:text-red-600 p-1 transition-colors" title="Xóa mốc này">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {inputMode === 'detailed' && (
                                                    <div className="grid grid-cols-5 gap-2 mt-2.5 pt-2.5 border-t border-slate-200/60">
                                                        {([
                                                            ['paperPrice', 'Giấy'], ['inkPrice', 'Mực'], ['machinePrice', 'Máy'], ['laborPrice', 'Công'], ['overheadPrice', 'Overhead'],
                                                        ] as const).map(([field, label]) => (
                                                            <div key={field}>
                                                                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">{label}</label>
                                                                <input
                                                                    type="number"
                                                                    className="w-full px-2 py-1.5 text-sm bg-white rounded border border-slate-200 focus:border-indigo-500"
                                                                    value={(row as any)[field] ?? ''}
                                                                    onChange={e => updateTierRow(idx, field, e.target.value === '' ? '' : Number(e.target.value))}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <button onClick={handleAddTierRow} className="mt-3 text-[13px] text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1.5 px-0 transition-colors">
                                    <span className="text-lg leading-none">+</span> Thêm mốc số lượng
                                </button>
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
                                <th className="px-4 py-3.5">Vật tư / Khổ giấy</th>
                                <th className="px-4 py-3.5 text-center">Mặt in / Hệ màu</th>
                                <th className="px-4 py-3.5 text-center">Số mốc</th>
                                <th className="px-4 py-3.5 text-right">Giá vốn / tờ</th>
                                <th className="px-4 py-3.5 text-right">Giá bán dự kiến / tờ</th>
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
                                const minSell = computePreviewSellingUnit(minP, markupRule);
                                const maxSell = computePreviewSellingUnit(maxP, markupRule);
                                const sellRange = minSell === maxSell ? `${fmt(minSell)}₫` : `${fmt(minSell)} – ${fmt(maxSell)}₫`;
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
                                            <td className="px-4 py-3.5 text-center">
                                                <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded mr-1.5 ${g.printSide === 'double' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>{sideLabel}</span>
                                                {typeLabel && <span className="text-xs font-medium text-slate-500">{typeLabel}</span>}
                                            </td>
                                            <td className="px-4 py-3.5 text-center"><span className="text-[13px] font-medium text-slate-600">{g.tiers.length} mốc</span></td>
                                            <td className="px-4 py-3.5 text-right font-bold text-emerald-600">{priceRange}</td>
                                            <td className="px-4 py-3.5 text-right font-bold text-indigo-600">{sellRange}</td>
                                            <td className="px-4 py-3.5 text-center flex justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEditGroup(key); }} className={`p-1 rounded transition-colors ${editModeKey === key ? 'bg-blue-500 text-white shadow-sm' : 'hover:bg-blue-100 text-blue-500'}`} title="Sửa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDuplicateGroup(key); }} className="p-1 hover:bg-cyan-100 rounded text-cyan-500 transition-colors" title="Nhân bản sang mặt in còn lại"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg></button>
                                                <button onClick={(e) => handleDeleteGroupClick(e, key)} className="p-1 hover:bg-red-100 rounded text-red-500 transition-colors" title="Xóa"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </td>
                                        </tr>
                                        {isExpanded && g.tiers.sort((a, b) => a.quantityFrom - b.quantityFrom).map(tier => {
                                            const editedVal = inlineEdits[tier.id] ?? tier.pricePerSheet;
                                            const isDirty = inlineEdits[tier.id] != null && inlineEdits[tier.id] !== tier.pricePerSheet;
                                            return (
                                                <tr key={tier.id} className="bg-slate-50 border-b border-b-slate-100/50 last:border-b-0">
                                                    <td colSpan={2}></td>
                                                    <td className="px-4 py-2 text-xs text-slate-500 pl-8 font-mono flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                        <span>SL: <span className="text-slate-800 font-bold">{fmt(tier.quantityFrom)}</span> → <span className="text-slate-800 font-bold">{fmt(tier.quantityTo)}</span> tờ</span>
                                                    </td>
                                                    <td colSpan={2} className="px-4 py-2 text-[11px] text-slate-500">
                                                        <span className="mr-2">Giấy <b className="text-slate-700">{fmt(tier.paperCost ?? tier.pricePerSheet)}</b></span>
                                                        <span className="mr-2">Mực <b className="text-slate-700">{fmt(tier.inkCost ?? 0)}</b></span>
                                                        <span className="mr-2">Máy <b className="text-slate-700">{fmt(tier.machineCost ?? 0)}</b></span>
                                                        <span className="mr-2">Công <b className="text-slate-700">{fmt(tier.laborCost ?? 0)}</b></span>
                                                        <span>OH <b className="text-slate-700">{fmt(tier.overheadCost ?? 0)}</b></span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                                                        <div className="inline-flex items-center gap-1 justify-end">
                                                            <input
                                                                type="number"
                                                                value={editedVal}
                                                                onChange={e => setInlineEdits(prev => ({ ...prev, [tier.id]: Number(e.target.value) || 0 }))}
                                                                className="w-24 px-2 py-0.5 text-right font-black text-[13px] text-emerald-700 bg-white border border-slate-200 rounded focus:border-indigo-500"
                                                                title="Sửa trực tiếp tổng giá vốn/tờ"
                                                            />
                                                            <span className="text-[10px] text-slate-400">₫/tờ</span>
                                                            {isDirty && (
                                                                <button
                                                                    type="button"
                                                                    disabled={savingInlineId === tier.id}
                                                                    onClick={() => handleInlineSave(tier)}
                                                                    className="ml-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                                                >
                                                                    {savingInlineId === tier.id ? '...' : 'Lưu'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-bold text-[13px] text-indigo-700">
                                                        {fmt(computePreviewSellingUnit(editedVal, markupRule))}₫<span className="text-[10px] text-indigo-400 font-normal ml-0.5">/tờ bán</span>
                                                    </td>
                                                    <td></td>
                                                </tr>
                                            );
                                        })}
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
