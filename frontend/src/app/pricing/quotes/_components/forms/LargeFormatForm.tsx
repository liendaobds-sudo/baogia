// @ts-nocheck
import React from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { useQuoteConfigurator } from '../_hooks/useQuoteConfigurator';
import { formatVND } from '../quote-ui';
import { useTrialMode } from '@/lib/scope/use-trial-mode';
import { useCustomPresets, PresetSaveControls } from '@/lib/quote/use-custom-presets';

type QuoteState = ReturnType<typeof useQuoteConfigurator>;

export function LargeFormatForm({ state }: { state: QuoteState }) {
    const {
        masterData, fileName, setFileName,
        templates, selectedTemplateCode, handleTemplateChange,
        allowedMaterialIds, allowedProcessingIds, allowedAccessoryIds,
        lockPrintType, minQuantity = 1, maxQuantity,
        lfQuantity, setLfQuantity, lfMaterialId, setLfMaterialId, lfWidth, setLfWidth, lfHeight, setLfHeight, lfPrintType, setLfPrintType, lfSelectedProc, setLfSelectedProc, lfCurProcId, setLfCurProcId, lfSelectedAcc, setLfSelectedAcc, lfCurAccId, setLfCurAccId, lfCurAccQty, setLfCurAccQty,
        pricingResult, lastPricingPayload, calculating,
        addItem, updateItem, editingItemId, setEditingItemId, productName
    } = state;

    const { isTrialMode } = useTrialMode();
    const { presets: userPresets, savePreset, deletePreset, resetDefaultPresets } = useCustomPresets('large_format');
    const [activeUserPresetId, setActiveUserPresetId] = React.useState<string | null>(null);
    const activeUserPreset = userPresets.find((p) => p.id === activeUserPresetId);
    const formatCurrency = formatVND;
    const isEditingCartItem = Boolean(editingItemId);

    const lfSellingSubtotal = (() => {
        const r = pricingResult as any;
        if (!r || r.type !== 'large_format') return 0;
        const n = Number(r.selling_subtotal ?? r.total);
        return Number.isFinite(n) ? n : 0;
    })();

    const allMats = (masterData?.materials as any[]) || [];
    const allProc = (masterData?.processing_options as any[]) || [];

    const isAccessory = (m: any) => {
        const c = (m.category || '').toLowerCase().trim();
        const t = (m.type || '').toLowerCase().trim();
        return ['accessory', 'accessories', 'phụ kiện'].includes(c) || ['accessory', 'accessories', 'phụ kiện'].includes(t) || c.includes('accessory') || t.includes('accessory');
    };

    const lfMats = allMats.filter(m => (m.scopeLargeFormat || m.scope_large_format == 1) && !isAccessory(m) && (!selectedTemplateCode || allowedMaterialIds.length === 0 || allowedMaterialIds.includes(String(m.id))));
    const allAcc = ((masterData?.accessories as any[])?.length ? (masterData.accessories as any[]) : allMats.filter(m => isAccessory(m)));
    const lfAccessories = allAcc.filter(m => (!selectedTemplateCode || allowedAccessoryIds.length === 0 || allowedAccessoryIds.includes(String(m.id))));
    const lfProc = allProc.filter(p => (p.scopeLargeFormat || p.scope_large_format == 1) && (!selectedTemplateCode || allowedProcessingIds.length === 0 || allowedProcessingIds.includes(String(p.id))));
    const selectedMat = lfMats.find(m => m.id.toString() === lfMaterialId);

    const labelClass = 'block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1';
    const inputClass = 'w-full text-[12px] font-bold px-2.5 h-8 border border-slate-200 rounded-md focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-slate-800 transition-colors';

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 w-full">
            {/* LEFT AND CENTER PANELS: Form */}
            <div className="xl:col-span-8 flex flex-col gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] space-y-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-slate-100 pb-2.5 gap-2">
                        <div className="flex items-center gap-2.5">
                            <h3 className="font-extrabold text-[13px] uppercase tracking-wider text-slate-800 m-0">
                                CẤU HÌNH IN KHỔ LỚN
                            </h3>
                            <PresetSaveControls
                                defaultLabel={fileName || (lfWidth && lfHeight ? `Khổ lớn ${Math.round(lfWidth / 10)}×${Math.round(lfHeight / 10)}cm` : '')}
                                activeCustomPresetId={activeUserPresetId}
                                activeCustomPresetLabel={activeUserPreset?.label}
                                hasAnyPreset={userPresets.length > 0}
                                onResetDefaults={resetDefaultPresets}
                                onSave={(lbl, updateId) => {
                                    const saved = savePreset(lbl, fileName || lbl, {
                                        w: lfWidth,
                                        h: lfHeight,
                                        qty: lfQuantity,
                                        lfMaterialId,
                                        lfPrintType,
                                        lfSelectedProc,
                                        lfSelectedAcc,
                                    }, updateId);
                                    setActiveUserPresetId(saved.id);
                                }}
                                onDelete={(id) => {
                                    deletePreset(id);
                                    setActiveUserPresetId(null);
                                }}
                            />
                        </div>
                        <div className="w-full sm:w-[300px]">
                            <SearchableSelect
                                value={activeUserPresetId || selectedTemplateCode}
                                onChange={v => {
                                    const val = v.toString();
                                    const userPreset = userPresets.find((p) => p.id === val);
                                    if (userPreset) {
                                        setActiveUserPresetId(userPreset.id);
                                        if (selectedTemplateCode) {
                                            handleTemplateChange({ target: { value: '' } } as React.ChangeEvent<HTMLSelectElement>);
                                        }
                                        const d: any = userPreset.data || {};
                                        setFileName(userPreset.name || userPreset.label);
                                        if (d.w) setLfWidth(d.w);
                                        if (d.h) setLfHeight(d.h);
                                        if (d.qty) setLfQuantity(d.qty);
                                        if (d.lfMaterialId) setLfMaterialId(d.lfMaterialId);
                                        if (d.lfPrintType) setLfPrintType(d.lfPrintType);
                                        if (Array.isArray(d.lfSelectedProc)) setLfSelectedProc(d.lfSelectedProc);
                                        if (Array.isArray(d.lfSelectedAcc)) setLfSelectedAcc(d.lfSelectedAcc);
                                        return;
                                    }
                                    setActiveUserPresetId(null);
                                    const syntheticEvent = { target: { value: val } } as React.ChangeEvent<HTMLSelectElement>;
                                    handleTemplateChange(syntheticEvent);
                                }}
                                options={[
                                    ...userPresets.map((up) => ({ id: up.id, label: up.label, group: 'Mẫu gợi ý nhanh (Sửa / Xoá được)' })),
                                    ...templates.flatMap((group: any) => {
                                        const lft = group.templates.filter((t: any) => t.product_type === 'large_format' || t.quoteType === 'large_format');
                                        return lft.map((t: any) => ({ id: t.code || t.id, label: t.name || t.nameVi, group: group.code === 'other' ? undefined : (group.name || group.title) }));
                                    }),
                                ]}
                                placeholder="-- Chọn mẫu sản phẩm khổ lớn --"
                            />
                        </div>
                    </div>

                    {/* 1. Thông tin chung */}
                    <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 sm:col-span-6">
                            <label className={labelClass}>
                                Tên File / Sản Phẩm <span className="text-slate-400 font-normal normal-case">(mặc định theo mẫu)</span>
                            </label>
                            <input
                                type="text"
                                value={fileName}
                                onChange={e => setFileName(e.target.value)}
                                placeholder="Ví dụ: Băng rôn Tết, Standee..."
                                className={inputClass}
                            />
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                            <label className={labelClass}>
                                Số lượng {minQuantity > 1 && <span className="text-indigo-600 normal-case font-normal">(≥{minQuantity})</span>}
                            </label>
                            <input
                                type="number"
                                min={minQuantity || 1}
                                max={maxQuantity}
                                value={lfQuantity}
                                onChange={e => setLfQuantity(Number(e.target.value))}
                                onBlur={() => {
                                    if (minQuantity > 1 && lfQuantity < minQuantity) setLfQuantity(minQuantity);
                                    else if (maxQuantity && lfQuantity > maxQuantity) setLfQuantity(maxQuantity);
                                }}
                                className={`${inputClass} text-center`}
                            />
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                            <label className={labelClass}>ĐVT (theo vật tư)</label>
                            <div className={`${inputClass} bg-slate-50 text-slate-600 flex items-center justify-center select-none`}>
                                {selectedMat?.unitName || selectedMat?.unit_name || ((selectedMat?.rollWidth || selectedMat?.roll_width) ? 'Tấm (từ cuộn)' : 'Tấm / Tờ')}
                            </div>
                        </div>
                    </div>

                    {/* Vật tư & Kích thước */}
                    <div className="border-t border-slate-100 pt-3.5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2.5">
                            <label className={labelClass}>Vật tư cuộn / tấm</label>
                            <SearchableSelect
                                value={lfMaterialId}
                                onChange={v => setLfMaterialId(v.toString())}
                                options={lfMats.map(m => {
                                    const pArea = m.pricePerSqm || m.price_per_sqm;
                                    return {
                                        id: m.id.toString(),
                                        label: `${m.name}${m.has_large_format_tier === false && !pArea ? ' ⚠ (chưa có định mức)' : (pArea ? ` — ${formatCurrency(pArea)}/m²` : '')}`,
                                    };
                                })}
                                placeholder="-- Chọn vật liệu (cuộn/bạt/decal) --"
                            />
                            {selectedMat && (
                                <div className="text-[10px] text-slate-600 bg-slate-50 p-2 rounded-md border border-slate-100 flex flex-wrap justify-between gap-2">
                                    {(selectedMat.rollWidth || selectedMat.roll_width) && (
                                        <span>Khổ cuộn: <b className="text-slate-800">{((selectedMat.rollWidth || selectedMat.roll_width) / 1000).toFixed(2)}m</b> ({selectedMat.chargeFullWidth || selectedMat.charge_full_width == 1 ? 'Tính bù hao' : 'Không bù hao'})</span>
                                    )}
                                    <span className={(parseInt(selectedMat.stock) || 0) <= 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>Tồn: {(parseInt(selectedMat.stock) || 0).toLocaleString()} {selectedMat.unitName || selectedMat.unit_name || 'đv'}</span>
                                </div>
                            )}

                            <div>
                                <label className={labelClass}>Công nghệ in</label>
                                <select value={lfPrintType} onChange={e => setLfPrintType(e.target.value)} disabled={lockPrintType} className={`${inputClass} ${lockPrintType ? 'bg-slate-100 cursor-not-allowed opacity-70' : ''}`}>
                                    {((masterData?.print_types as any[]) || []).map(p => (<option key={p.code} value={p.code}>{p.name}</option>))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className={labelClass}>Chiều Rộng (mm)</label>
                                    <input type="number" min="10" value={lfWidth} onChange={e => setLfWidth(Number(e.target.value))} className={`${inputClass} text-center`} />
                                </div>
                                <div>
                                    <label className={labelClass}>Chiều Cao (mm)</label>
                                    <input type="number" min="10" value={lfHeight} onChange={e => setLfHeight(Number(e.target.value))} className={`${inputClass} text-center`} />
                                </div>
                            </div>
                            <div className="text-[11px] text-slate-600 bg-slate-50 rounded-md px-3 py-2 border border-slate-100 flex justify-between font-medium">
                                <div>Diện tích 1 tấm: <b className="text-indigo-600">{(lfWidth * lfHeight / 1000000).toFixed(3)} m²</b></div>
                                <div>Tổng: <b className="text-indigo-600">{(lfWidth * lfHeight / 1000000 * lfQuantity).toFixed(3)} m²</b></div>
                            </div>
                        </div>
                    </div>

                    {/* Gia công & Phụ kiện */}
                    <div className="border-t border-slate-100 pt-3.5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className={labelClass}>Gia công sau in</label>
                            <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0">
                                    <SearchableSelect
                                        value={lfCurProcId}
                                        onChange={v => setLfCurProcId(v.toString())}
                                        options={lfProc.map(p => ({ id: String(p.id), label: p.name }))}
                                        placeholder="-- Chọn gia công --"
                                    />
                                </div>
                                <button type="button" onClick={() => {
                                    if (!lfCurProcId) return;
                                    const procItem = lfProc.find(p => String(p.id) === String(lfCurProcId));
                                    if (procItem && !lfSelectedProc.find(p => String(p.id) === String(lfCurProcId))) {
                                        setLfSelectedProc(prev => [...prev, { id: String(procItem.id), name: procItem.name }]);
                                    }
                                    setLfCurProcId('');
                                }} disabled={!lfCurProcId} className="bg-indigo-600 hover:bg-indigo-700 text-white w-8 h-8 shrink-0 rounded-md text-sm font-bold disabled:opacity-50 flex items-center justify-center transition-colors">+</button>
                            </div>
                            {lfSelectedProc.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {lfSelectedProc.map(p => (
                                        <span key={p.id} className="bg-orange-50 border border-orange-200 text-orange-800 text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1.5">
                                            {p.name}
                                            <button type="button" onClick={() => setLfSelectedProc(prev => prev.filter(x => String(x.id) !== String(p.id)))} className="text-slate-400 hover:text-red-500 font-bold">×</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className={labelClass}>Phụ kiện (Chân standee, khoen...)</label>
                            <div className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0">
                                    <SearchableSelect
                                        value={lfCurAccId}
                                        onChange={v => setLfCurAccId(v.toString())}
                                        options={lfAccessories.map(a => ({ id: String(a.id), label: `${a.name} — ${formatCurrency(a.unitPrice || a.unit_price || a.price || 0)}` }))}
                                        placeholder="-- Chọn phụ kiện --"
                                    />
                                </div>
                                <input type="number" min="1" value={lfCurAccQty} onChange={e => setLfCurAccQty(Number(e.target.value))} className="w-16 shrink-0 px-1 text-[11px] h-8 text-center font-bold text-slate-800 border border-slate-200 rounded-md outline-none focus:border-indigo-500 bg-white" />
                                <button type="button" onClick={() => {
                                    if (!lfCurAccId) return;
                                    const acc = lfAccessories.find(a => a.id.toString() === lfCurAccId);
                                    if (acc && !lfSelectedAcc.find(a => a.id === lfCurAccId)) {
                                        setLfSelectedAcc(prev => [...prev, { id: lfCurAccId, qty: lfCurAccQty, name: acc.name, price: acc.unitPrice || acc.unit_price || acc.price || 0 }]);
                                    }
                                    setLfCurAccId(''); setLfCurAccQty(1);
                                }} disabled={!lfCurAccId} className="bg-indigo-600 hover:bg-indigo-700 text-white w-8 h-8 shrink-0 rounded-md text-sm font-bold disabled:opacity-50 flex items-center justify-center transition-colors">+</button>
                            </div>
                            {lfSelectedAcc.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {lfSelectedAcc.map(a => (
                                        <span key={a.id} className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1.5">
                                            {a.name} (×{a.qty})
                                            <button type="button" onClick={() => setLfSelectedAcc(prev => prev.filter(x => x.id !== a.id))} className="text-slate-400 hover:text-red-500 font-bold">×</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* DETAILED BREAKDOWN */}
                    {pricingResult && (pricingResult as any).type === 'large_format' && (
                        <div className="border-t border-slate-100 pt-3.5">
                            <h4 className="font-bold text-[10px] mb-2 text-slate-500 uppercase tracking-wider">
                                Chi tiết diện tích & đơn giá m²
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                <div className="bg-slate-50 p-2 rounded-md border border-slate-100">
                                    <div className="text-[10px] text-slate-500">DT thuần (1 bản)</div>
                                    <div className="font-bold text-slate-800">{(pricingResult as any).breakdown?.area_m2} m²</div>
                                </div>
                                <div className="bg-indigo-50/70 p-2 rounded-md border border-indigo-100">
                                    <div className="text-[10px] text-indigo-700 font-semibold">Tổng m² tính tiền</div>
                                    <div className="font-black text-indigo-700">{(pricingResult as any).breakdown?.charge_area_m2} m²</div>
                                </div>
                                {!isTrialMode && (
                                    <div className="bg-emerald-50/70 p-2 rounded-md border border-emerald-100 col-span-2">
                                        <div className="text-[10px] text-emerald-700 font-semibold">Đơn giá Vật liệu / m²</div>
                                        <div className="font-bold text-emerald-700">
                                            {formatCurrency((pricingResult as any).breakdown?.price_per_sqm || 0)} {(pricingResult as any).breakdown?.tier_area_from != null ? `(Bậc ${(pricingResult as any).breakdown.tier_area_from}–${(pricingResult as any).breakdown.tier_area_to && (pricingResult as any).breakdown.tier_area_to < 999999 ? (pricingResult as any).breakdown.tier_area_to : '∞'} m²)` : ''}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: Totals */}
            <div className="xl:col-span-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col sticky top-0">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                        <h3 className="font-extrabold text-[13px] text-slate-800 uppercase tracking-wider m-0">
                            TỔNG CHI PHÍ KHỔ LỚN
                        </h3>
                        {calculating && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Đang tính...
                            </span>
                        )}
                    </div>
                    <div className={`space-y-3 text-[12px] transition-opacity ${calculating ? 'opacity-60' : 'opacity-100'}`}>
                        <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                            <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Chi phí in ấn:</span>
                            <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{pricingResult && (pricingResult as any).type === 'large_format' ? formatCurrency((pricingResult as any).material_cost) : '-'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                                <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Chi phí gia công:</span>
                                <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{pricingResult && (pricingResult as any).type === 'large_format' ? formatCurrency((pricingResult as any).processing_cost || 0) : '-'}</span>
                            </div>
                            {(pricingResult as any)?.processing_details?.length > 0 && (
                                <div className="pl-3 border-l-2 border-slate-100 text-[11px] text-slate-500 font-medium ml-1.5 flex flex-col gap-0.5">
                                    {(pricingResult as any).processing_details.map((pd: any, i: number) => (
                                        <span key={i} className="flex justify-between gap-2">
                                            <span className="truncate">{pd.name}</span>
                                            <span className="whitespace-nowrap shrink-0">{formatCurrency(pd.cost)}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        {!isTrialMode && pricingResult && (pricingResult as any).type === 'large_format' && lfSellingSubtotal > Number((pricingResult as any).cost_subtotal ?? (pricingResult as any).total ?? 0) && (
                            <div className="flex justify-between items-center text-slate-500 text-[12px] gap-2">
                                <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Lợi nhuận định mức:</span>
                                <span className="font-bold text-indigo-700 whitespace-nowrap shrink-0">+{formatCurrency(lfSellingSubtotal - Number((pricingResult as any).cost_subtotal ?? (pricingResult as any).total ?? 0))}</span>
                            </div>
                        )}
                        {lfSelectedAcc.length > 0 && (
                            <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                                <span className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Phụ kiện ({lfSelectedAcc.length}):</span>
                                <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{formatCurrency((pricingResult as any)?.accessories_cost ?? lfSelectedAcc.reduce((sum, a) => sum + a.price * a.qty, 0))}</span>
                            </div>
                        )}
                    </div>

                    <div className="border-t-2 border-dashed border-slate-200 pt-3 mt-4">
                        <div className="flex justify-between items-end mb-1 gap-2">
                            <span className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wide">Thành tiền (trước VAT):</span>
                            <span className="font-black text-xl text-indigo-600 leading-none tracking-tight whitespace-nowrap">
                                {pricingResult && (pricingResult as any).type === 'large_format' ? formatCurrency(lfSellingSubtotal) : '0 ₫'}
                            </span>
                        </div>
                        <div className="text-right text-[11px] text-slate-500 font-medium tracking-wide mt-1">
                            Đơn giá: <span className="text-slate-700 font-bold">{pricingResult && (pricingResult as any).type === 'large_format' && lfQuantity > 0 ? formatCurrency(lfSellingSubtotal / lfQuantity) : '-'}</span> / sản phẩm
                        </div>
                    </div>

                    {(pricingResult as any)?.error && (
                        <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-[11px] font-semibold">
                            <div>⚠️ {(pricingResult as any).error}</div>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                                <a href="/pricing/settings/pricing-large-format" className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-50">→ Mở Định mức Khổ lớn</a>
                                {selectedTemplateCode && <a href="/pricing/products" className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded hover:bg-slate-50">→ Cấu hình Sản phẩm</a>}
                            </div>
                        </div>
                    )}

                    {pricingResult && !(pricingResult as any).error && (
                        <div className="mt-3 flex flex-col gap-1.5">
                            <button
                                type="button"
                                disabled={calculating}
                                onClick={() => {
                                    const mats = (masterData?.materials as any[]) || [];
                                    const mat = mats.find(m => String(m.id) === String(lfMaterialId));
                                    const itemPayload = {
                                        name: fileName.trim() || productName || 'In Khổ Lớn',
                                        type: 'large_format' as const,
                                        quantity: lfQuantity,
                                        total: lfSellingSubtotal,
                                        unitPrice: (pricingResult as any).selling_price_per_item ?? (pricingResult as any).price_per_item,
                                        details: pricingResult,
                                        configParams: {
                                            lfWidth, lfHeight, lfMaterialId, lfPrintType,
                                            lfSelectedProc, lfSelectedAcc,
                                            materialName: mat?.name || mat?.name_vi || '',
                                            accessoryNames: lfSelectedAcc.map(a => a.name || a.id).filter(Boolean),
                                        },
                                        pricingPayload: lastPricingPayload ?? undefined,
                                    };
                                    if (isEditingCartItem && editingItemId && updateItem) {
                                        updateItem(editingItemId, itemPayload);
                                    } else {
                                        addItem(itemPayload);
                                    }
                                    setFileName('');
                                }}
                                className={`w-full shadow-md text-white font-bold py-2.5 px-4 rounded-lg text-[13px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isEditingCartItem
                                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                                }`}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    {isEditingCartItem ? <polyline points="20 6 9 17 4 12" /> : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>}
                                </svg>
                                {calculating ? 'ĐANG TÍNH GIÁ...' : isEditingCartItem ? 'CẬP NHẬT HẠNG MỤC' : 'THÊM VÀO BÁO GIÁ'}
                            </button>
                            {isEditingCartItem && setEditingItemId && (
                                <button
                                    type="button"
                                    onClick={() => setEditingItemId(null)}
                                    className="w-full py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                                >
                                    Huỷ chỉnh sửa
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
