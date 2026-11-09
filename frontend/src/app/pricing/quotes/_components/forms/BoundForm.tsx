// @ts-nocheck
import React from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { useQuoteConfigurator } from '../_hooks/useQuoteConfigurator';
import { formatVND } from '../quote-ui';
import { useTrialMode } from '@/lib/scope/use-trial-mode';
import { useCustomPresets, PresetSaveControls } from '@/lib/quote/use-custom-presets';

type QuoteState = ReturnType<typeof useQuoteConfigurator>;

export function BoundForm({ state }: { state: QuoteState }) {
    const {
        masterData, fileName, setFileName,
        templates, selectedTemplateCode, handleTemplateChange,
        allowedMaterialIds, allowedProcessingIds, allowedPaperSizeIds, allowedAccessoryIds,
        lockPrintSide, lockPrintType, minQuantity = 1, maxQuantity,
        bQuantity, setBQuantity, bPageCount, setBPageCount, bBindingType, setBBindingType, bWidth, setBWidth, bHeight, setBHeight, bSpineWidth = 0, setBSpineWidth,
        bCoverMaterialName, setBCoverMaterialName, bCoverMaterialId, setBCoverMaterialId, bCoverPaperSizeId, setBCoverPaperSizeId, bCoverPrintType, setBCoverPrintType, bCoverPrintSide, setBCoverPrintSide, bCoverProc, setBCoverProc,
        bInnerMaterialName, setBInnerMaterialName, bInnerMaterialId, setBInnerMaterialId, bInnerPaperSizeId, setBInnerPaperSizeId, bInnerPrintType, setBInnerPrintType, bInnerPrintSide, setBInnerPrintSide, bInnerProc, setBInnerProc, bSelectedAcc, setBSelectedAcc, bCurAccId, setBCurAccId, bCurAccQty, setBCurAccQty,
        pricingResult, lastPricingPayload, calculating,
        addItem, updateItem, editingItemId, setEditingItemId, productName
    } = state;

    const { isTrialMode } = useTrialMode();
    const { presets: userPresets, savePreset, deletePreset, resetDefaultPresets } = useCustomPresets('bound');
    const [activeUserPresetId, setActiveUserPresetId] = React.useState<string | null>(null);
    const activeUserPreset = userPresets.find((p) => p.id === activeUserPresetId);
    const formatCurrency = formatVND;
    const isEditingCartItem = Boolean(editingItemId);

    const allMats = (masterData?.materials as any[]) || [];
    const allPaperSizes = ((masterData?.paper_sizes as any[]) || []).filter(ps => !selectedTemplateCode || allowedPaperSizeIds.length === 0 || allowedPaperSizeIds.includes(String(ps.id)));
    const allProc = (masterData?.processing_options as any[]) || [];

    const boundMats = allMats.filter(m => (m.scopeBound || m.scope_bound == 1) && (!selectedTemplateCode || allowedMaterialIds.length === 0 || allowedMaterialIds.includes(String(m.id))));
    const distinctNames = [...new Set(boundMats.map(m => m.name))];
    const noTierNames = new Set(
        distinctNames.filter(name => !boundMats.some(m => m.name === name && m.has_pricing_tier)),
    );
    const nameOption = (name: string) => ({ id: name, label: noTierNames.has(name) ? `${name} ⚠ (chưa có định mức)` : name });

    const coverMatsForName = boundMats.filter(m => m.name === bCoverMaterialName);
    const coverPaperSizeIds = new Set(coverMatsForName.filter(m => m.paperSizeId || m.paper_size_id).map(m => m.paperSizeId || m.paper_size_id));
    const coverPaperSizes = coverPaperSizeIds.size > 0
        ? allPaperSizes.filter(ps => coverPaperSizeIds.has(ps.id))
        : allPaperSizes.filter(ps => ps.scopeBound || ps.scope_bound == 1);

    const innerMatsForName = boundMats.filter(m => m.name === bInnerMaterialName);
    const innerPaperSizeIds = new Set(innerMatsForName.filter(m => m.paperSizeId || m.paper_size_id).map(m => m.paperSizeId || m.paper_size_id));
    const innerPaperSizes = innerPaperSizeIds.size > 0
        ? allPaperSizes.filter(ps => innerPaperSizeIds.has(ps.id))
        : allPaperSizes.filter(ps => ps.scopeBound || ps.scope_bound == 1);

    const boundProc = allProc.filter(p => (p.scopeBound || p.scope_bound == 1) && (!selectedTemplateCode || allowedProcessingIds.length === 0 || allowedProcessingIds.includes(String(p.id))));
    const boundAccessories = ((masterData?.accessories as any[]) || []).filter(a => !selectedTemplateCode || allowedAccessoryIds.length === 0 || allowedAccessoryIds.includes(String(a.id)));
    const bindingProc = boundProc.filter(p => p.category === 'binding');
    const finishingProcRaw = boundProc.filter(p => p.category !== 'binding');
    const finishingProc = [...new Map(finishingProcRaw.map(p => [p.name, p])).values()];

    const findMaterial = (name: string, psId: string) => {
        let mat = boundMats.find(m => m.name === name && (m.paperSizeId || m.paper_size_id) == psId);
        if (!mat) mat = boundMats.find(m => m.name === name);
        return mat;
    };
    const coverMat = bCoverMaterialName ? findMaterial(bCoverMaterialName, bCoverPaperSizeId) : null;
    const innerMat = bInnerMaterialName ? findMaterial(bInnerMaterialName, bInnerPaperSizeId) : null;

    const isSaddle = bBindingType.includes('saddle') || bBindingType.includes('ghim');
    const pagesPerSheet = isSaddle ? 4 : 2;
    const innerPages = Math.max(0, bPageCount - 4);
    const estSpineMm = isSaddle ? 0 : Math.max(1, Math.round((innerPages / 2) * 0.1 * 10) / 10);
    const coverSpreadW = bWidth * 2 + (Number(bSpineWidth) || 0);
    const sheetsPerBook = Number((pricingResult as any)?.inner_details?.[0]?.sheets_per_book ?? Math.ceil(innerPages / pagesPerSheet));

    const onCoverNameChange = (name: string) => {
        setBCoverMaterialName(name);
        const matsForName = boundMats.filter(m => m.name === name);
        const keepCur = matsForName.find(m => String(m.paperSizeId || m.paper_size_id) === String(bCoverPaperSizeId));
        if (keepCur) {
            setBCoverMaterialId(String(keepCur.id));
        } else if (matsForName.length > 0) {
            const firstMat = matsForName[0];
            setBCoverMaterialId(String(firstMat.id));
            const nextPs = firstMat.paperSizeId || firstMat.paper_size_id || allPaperSizes.find(ps => ps.scopeBound || ps.scope_bound == 1)?.id || allPaperSizes[0]?.id;
            if (nextPs) setBCoverPaperSizeId(String(nextPs));
        }
    };
    const onInnerNameChange = (name: string) => {
        setBInnerMaterialName(name);
        const matsForName = boundMats.filter(m => m.name === name);
        const keepCur = matsForName.find(m => String(m.paperSizeId || m.paper_size_id) === String(bInnerPaperSizeId));
        if (keepCur) {
            setBInnerMaterialId(String(keepCur.id));
        } else if (matsForName.length > 0) {
            const firstMat = matsForName[0];
            setBInnerMaterialId(String(firstMat.id));
            const nextPs = firstMat.paperSizeId || firstMat.paper_size_id || allPaperSizes.find(ps => ps.scopeBound || ps.scope_bound == 1)?.id || allPaperSizes[0]?.id;
            if (nextPs) setBInnerPaperSizeId(String(nextPs));
        }
    };
    const onCoverPaperChange = (psId: string) => {
        setBCoverPaperSizeId(psId);
        const mat = boundMats.find(m => m.name === bCoverMaterialName && (m.paperSizeId || m.paper_size_id) == psId);
        if (mat) setBCoverMaterialId(mat.id.toString());
    };
    const onInnerPaperChange = (psId: string) => {
        setBInnerPaperSizeId(psId);
        const mat = boundMats.find(m => m.name === bInnerMaterialName && (m.paperSizeId || m.paper_size_id) == psId);
        if (mat) setBInnerMaterialId(mat.id.toString());
    };

    const labelClass = 'block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1';
    const inputClass = 'w-full text-[12px] font-bold px-2.5 h-8 border border-slate-200 rounded-md focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-slate-800 transition-colors';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-8 gap-4 w-full">
            {/* LEFT PANEL: Form */}
            <div className="lg:col-span-5">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <h3 className="font-extrabold text-[13px] text-slate-800 uppercase tracking-wider m-0">
                            CẤU HÌNH SẢN PHẨM CUỐN
                        </h3>
                        <PresetSaveControls
                            defaultLabel={fileName || (bWidth && bHeight ? `Cuốn ${bWidth}×${bHeight}mm ${bPageCount}tr` : '')}
                            activeCustomPresetId={activeUserPresetId}
                            activeCustomPresetLabel={activeUserPreset?.label}
                            hasAnyPreset={userPresets.length > 0}
                            onResetDefaults={resetDefaultPresets}
                            onSave={(lbl, updateId) => {
                                const saved = savePreset(lbl, fileName || lbl, {
                                    w: bWidth,
                                    h: bHeight,
                                    pages: bPageCount,
                                    qty: bQuantity,
                                    bind: bBindingType,
                                    spine: bSpineWidth,
                                    bCoverMaterialName,
                                    bCoverMaterialId,
                                    bCoverPaperSizeId,
                                    bCoverPrintType,
                                    bCoverPrintSide,
                                    bCoverProc,
                                    bInnerMaterialName,
                                    bInnerMaterialId,
                                    bInnerPaperSizeId,
                                    bInnerPrintType,
                                    bInnerPrintSide,
                                    bInnerProc,
                                    bSelectedAcc,
                                }, updateId);
                                setActiveUserPresetId(saved.id);
                            }}
                            onDelete={(id) => {
                                deletePreset(id);
                                setActiveUserPresetId(null);
                            }}
                        />
                    </div>

                    {/* General (đã tích hợp sẵn nhóm Mẫu gợi ý nhanh vào đầu dropdown) */}
                    <div className="space-y-3">
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
                                    if (d.w) setBWidth(d.w);
                                    if (d.h) setBHeight(d.h);
                                    if (d.pages) setBPageCount(d.pages);
                                    if (d.qty) setBQuantity(d.qty);
                                    if (d.bind) setBBindingType(d.bind);
                                    if (d.spine != null && setBSpineWidth) setBSpineWidth(d.spine);
                                    if (d.bCoverMaterialName) setBCoverMaterialName(d.bCoverMaterialName);
                                    if (d.bCoverMaterialId) setBCoverMaterialId(d.bCoverMaterialId);
                                    if (d.bCoverPaperSizeId) setBCoverPaperSizeId(d.bCoverPaperSizeId);
                                    if (d.bCoverPrintType) setBCoverPrintType(d.bCoverPrintType);
                                    if (d.bCoverPrintSide) setBCoverPrintSide(d.bCoverPrintSide);
                                    if (Array.isArray(d.bCoverProc)) setBCoverProc(d.bCoverProc);
                                    if (d.bInnerMaterialName) setBInnerMaterialName(d.bInnerMaterialName);
                                    if (d.bInnerMaterialId) setBInnerMaterialId(d.bInnerMaterialId);
                                    if (d.bInnerPaperSizeId) setBInnerPaperSizeId(d.bInnerPaperSizeId);
                                    if (d.bInnerPrintType) setBInnerPrintType(d.bInnerPrintType);
                                    if (d.bInnerPrintSide) setBInnerPrintSide(d.bInnerPrintSide);
                                    if (Array.isArray(d.bInnerProc)) setBInnerProc(d.bInnerProc);
                                    if (Array.isArray(d.bSelectedAcc)) setBSelectedAcc(d.bSelectedAcc);
                                    return;
                                }
                                setActiveUserPresetId(null);
                                const syntheticEvent = { target: { value: val } } as React.ChangeEvent<HTMLSelectElement>;
                                handleTemplateChange(syntheticEvent);
                            }}
                            options={[
                                ...userPresets.map((up) => ({ id: up.id, label: up.label, group: 'Mẫu gợi ý nhanh (Sửa / Xoá được)' })),
                                ...templates.flatMap((group: any) => {
                                    const boundTemplates = group.templates.filter((t: any) => t.product_type === 'bound');
                                    return boundTemplates.map((t: any) => ({ id: t.code, label: t.name, group: group.code === 'other' ? undefined : group.name }));
                                }),
                            ]}
                            placeholder="-- Chọn mẫu sản phẩm cuốn --"
                        />

                        <div>
                            <label className={labelClass}>
                                Tên File / Quyển <span className="text-slate-400 font-normal normal-case">(mặc định theo mẫu)</span>
                            </label>
                            <input
                                type="text"
                                value={fileName}
                                onChange={e => setFileName(e.target.value)}
                                placeholder="Nhập tên tài liệu (VD: Sổ tay nhân viên)"
                                className={inputClass}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-2.5">
                            <div>
                                <label className={labelClass}>
                                    Số lượng cuốn {minQuantity > 1 && <span className="text-indigo-600 normal-case font-normal">(≥{minQuantity})</span>}
                                </label>
                                <input
                                    type="number"
                                    min={minQuantity || 1}
                                    max={maxQuantity}
                                    value={bQuantity}
                                    onChange={e => setBQuantity(Number(e.target.value))}
                                    onBlur={() => {
                                        if (minQuantity > 1 && bQuantity < minQuantity) setBQuantity(minQuantity);
                                        else if (maxQuantity && bQuantity > maxQuantity) setBQuantity(maxQuantity);
                                    }}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Tổng số trang</label>
                                <input type="number" min="4" step="4" value={bPageCount} onChange={e => setBPageCount(Number(e.target.value))} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Quy cách đóng</label>
                                <select value={bBindingType} onChange={e => setBBindingType(e.target.value)} className={inputClass}>
                                    {bindingProc.length > 0 ? bindingProc.map(b => (
                                        <option key={b.code || b.name} value={b.code || b.name}>{b.name}</option>
                                    )) : (
                                        <>
                                            <option value="saddle_stitch">Ghim giữa</option>
                                            <option value="perfect_bind">Keo nhiệt</option>
                                            <option value="wire_o">Lò xo</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2.5">
                            <div>
                                <label className={labelClass}>Khổ thành phẩm</label>
                                <select value={`${bWidth}x${bHeight}`} onChange={e => { const [w, h] = e.target.value.split('x').map(Number); if (w && h) { setBWidth(w); setBHeight(h); } }} className={inputClass}>
                                    <option value="210x297">A4 đứng (210×297)</option>
                                    <option value="297x210">A4 ngang (297×210)</option>
                                    <option value="148x210">A5 đứng (148×210)</option>
                                    <option value="210x148">A5 ngang (210×148)</option>
                                    <option value="105x148">A6 đứng (105×148)</option>
                                    <option value="200x200">Vuông (200×200)</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Rộng (mm)</label>
                                <input type="number" min="50" value={bWidth} onChange={e => setBWidth(Number(e.target.value))} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Cao (mm)</label>
                                <input type="number" min="50" value={bHeight} onChange={e => setBHeight(Number(e.target.value))} className={inputClass} />
                            </div>
                            <div className="col-span-3 sm:col-span-3 flex items-center gap-2 pt-0.5">
                                <div className="w-36 shrink-0">
                                    <label className={labelClass}>Độ dày gáy (mm)</label>
                                    <input type="number" min="0" step="0.5" value={bSpineWidth} onChange={e => setBSpineWidth?.(Math.max(0, Number(e.target.value)))} className={inputClass} />
                                </div>
                                {!isSaddle && estSpineMm > 0 && Number(bSpineWidth) !== estSpineMm && (
                                    <button type="button" onClick={() => setBSpineWidth?.(estSpineMm)} className="mt-4 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer">
                                        Gợi ý ~{estSpineMm}mm ({innerPages / 2} tờ ruột)
                                    </button>
                                )}
                                {isSaddle && Number(bSpineWidth) > 0 && (
                                    <button type="button" onClick={() => setBSpineWidth?.(0)} className="mt-4 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer">
                                        Đặt về 0mm (ghim giữa)
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-[10px] text-slate-600 font-medium bg-slate-50 rounded-md px-3 py-1.5 border border-slate-100">
                            <span>Trang ruột: <b className="text-slate-800">{innerPages}</b></span>
                            <span>Tờ/cuốn: <b className="text-slate-800">{sheetsPerBook}</b></span>
                            <span>Tổng tờ ruột: <b className="text-indigo-600">{(sheetsPerBook * bQuantity).toLocaleString()}</b></span>
                            <span>Khổ bìa trải: <b className="text-slate-800">{coverSpreadW}×{bHeight} mm</b></span>
                        </div>
                        {isSaddle && innerPages > 0 && innerPages % 4 !== 0 && (
                            <div className="flex items-center justify-between gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                <span>⚠️ <b>Đóng ghim giữa</b> yêu cầu số trang chia hết cho 4 (mỗi tờ đôi gấp = 4 trang). Hiện tại: <b>{bPageCount}</b> trang ({innerPages} trang ruột).</span>
                                <button
                                    type="button"
                                    onClick={() => setBPageCount(Math.ceil(bPageCount / 4) * 4)}
                                    className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-1 rounded text-[10px] transition-colors cursor-pointer"
                                >
                                    Làm tròn {Math.ceil(bPageCount / 4) * 4} trang
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Bìa */}
                    <div className="border-t border-slate-100 pt-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-[11px] text-slate-700 uppercase tracking-wider flex items-center gap-1.5 m-0">
                                <span className="bg-blue-100 text-blue-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black">B</span>
                                Chất liệu & Gia công Bìa
                            </h4>
                            {coverMat && (
                                <span className="text-[10px] text-slate-500">
                                    Tồn: <b className={(parseInt(coverMat.stock) || 0) <= 0 ? 'text-red-600' : 'text-emerald-600'}>{(parseInt(coverMat.stock) || 0).toLocaleString()}</b> • Cần: <b className="text-blue-600">{bQuantity}</b> tờ
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <label className={labelClass}>Giấy in bìa</label>
                                <SearchableSelect
                                    value={bCoverMaterialName}
                                    onChange={val => onCoverNameChange(val.toString())}
                                    options={distinctNames.map(nameOption)}
                                    placeholder="-- Chọn giấy bìa --"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Khổ in bìa</label>
                                <SearchableSelect
                                    value={bCoverPaperSizeId}
                                    onChange={val => onCoverPaperChange(val.toString())}
                                    options={coverPaperSizes.map(p => ({ id: p.id.toString(), label: p.name }))}
                                    placeholder="-- Chọn khổ in --"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <label className={labelClass}>Mặt in</label>
                                <SearchableSelect
                                    value={bCoverPrintSide}
                                    onChange={v => setBCoverPrintSide(v.toString())}
                                    disabled={lockPrintSide}
                                    options={[
                                        { id: 'single', label: '1 mặt' },
                                        { id: 'double', label: '2 mặt' },
                                    ]}
                                    placeholder="Mặt in"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Hệ màu</label>
                                <SearchableSelect
                                    value={bCoverPrintType}
                                    onChange={v => setBCoverPrintType(v.toString())}
                                    disabled={lockPrintType}
                                    options={[
                                        { id: '4c', label: '4 màu (CMYK)' },
                                        { id: '1c', label: '1 màu (Đen/Trắng)' },
                                    ]}
                                    placeholder="Hệ màu"
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Gia công bìa</label>
                            <SearchableSelect
                                value=""
                                onChange={v => {
                                    const idStr = v.toString(); if (!idStr) return;
                                    const pItem = finishingProc.find(p => p.id.toString() === idStr);
                                    if (pItem && !bCoverProc.find(p => p.id === idStr)) setBCoverProc(prev => [...prev, { id: idStr, name: pItem.name, side: '1', code: pItem.code }]);
                                }}
                                options={finishingProc.map(p => ({ id: p.id.toString(), label: p.name }))}
                                placeholder="-- Chọn thêm gia công bìa --"
                            />
                            {bCoverProc.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {bCoverProc.map(p => (
                                        <span key={p.id} className="bg-blue-50 border border-blue-100 text-blue-800 text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1.5">
                                            {p.name}
                                            <button type="button" onClick={() => setBCoverProc(prev => prev.map(x => x.id === p.id ? { ...x, side: x.side === '2' || x.side === 'double' ? '1' : '2' } : x))} className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-[9px]" title="Đổi 1 mặt / 2 mặt">{p.side === '2' || p.side === 'double' ? '2 Mặt' : '1 Mặt'}</button>
                                            <button type="button" onClick={() => setBCoverProc(prev => prev.filter(x => x.id !== p.id))} className="text-slate-400 hover:text-red-500 font-bold">×</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Ruột */}
                    <div className="border-t border-slate-100 pt-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-[11px] text-slate-700 uppercase tracking-wider flex items-center gap-1.5 m-0">
                                <span className="bg-emerald-100 text-emerald-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black">R</span>
                                Chất liệu & Gia công Ruột
                            </h4>
                            {innerMat && (
                                <span className="text-[10px] text-slate-500">
                                    Tồn: <b className={(parseInt(innerMat.stock) || 0) <= 0 ? 'text-red-600' : 'text-emerald-600'}>{(parseInt(innerMat.stock) || 0).toLocaleString()}</b> • Cần: <b className="text-emerald-600">{(sheetsPerBook * bQuantity).toLocaleString()}</b> tờ
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <label className={labelClass}>Giấy in ruột</label>
                                <SearchableSelect
                                    value={bInnerMaterialName}
                                    onChange={val => onInnerNameChange(val.toString())}
                                    options={distinctNames.map(nameOption)}
                                    placeholder="-- Chọn giấy ruột --"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Khổ in ruột</label>
                                <SearchableSelect
                                    value={bInnerPaperSizeId}
                                    onChange={val => onInnerPaperChange(val.toString())}
                                    options={innerPaperSizes.map(p => ({ id: p.id.toString(), label: p.name }))}
                                    placeholder="-- Chọn khổ in --"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <div>
                                <label className={labelClass}>Mặt in</label>
                                <SearchableSelect
                                    value={bInnerPrintSide}
                                    onChange={v => setBInnerPrintSide(v.toString())}
                                    disabled={lockPrintSide}
                                    options={[
                                        { id: 'single', label: '1 mặt' },
                                        { id: 'double', label: '2 mặt' },
                                    ]}
                                    placeholder="Mặt in"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Hệ màu</label>
                                <SearchableSelect
                                    value={bInnerPrintType}
                                    onChange={v => setBInnerPrintType(v.toString())}
                                    disabled={lockPrintType}
                                    options={[
                                        { id: '4c', label: '4 màu (CMYK)' },
                                        { id: '1c', label: '1 màu (Đen/Trắng)' },
                                    ]}
                                    placeholder="Hệ màu"
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Gia công ruột</label>
                            <SearchableSelect
                                value=""
                                onChange={v => {
                                    const idStr = v.toString(); if (!idStr) return;
                                    const pItem = finishingProc.find(p => p.id.toString() === idStr);
                                    if (pItem && !bInnerProc.find(p => p.id === idStr)) setBInnerProc(prev => [...prev, { id: idStr, name: pItem.name, side: '1', code: pItem.code }]);
                                }}
                                options={finishingProc.map(p => ({ id: p.id.toString(), label: p.name }))}
                                placeholder="-- Chọn thêm gia công ruột --"
                            />
                            {bInnerProc.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {bInnerProc.map(p => (
                                        <span key={p.id} className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1.5">
                                            {p.name}
                                            <button type="button" onClick={() => setBInnerProc(prev => prev.map(x => x.id === p.id ? { ...x, side: x.side === '2' || x.side === 'double' ? '1' : '2' } : x))} className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[9px]" title="Đổi 1 mặt / 2 mặt">{p.side === '2' || p.side === 'double' ? '2 Mặt' : '1 Mặt'}</button>
                                            <button type="button" onClick={() => setBInnerProc(prev => prev.filter(x => x.id !== p.id))} className="text-slate-400 hover:text-red-500 font-bold">×</button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Phụ kiện đóng cuốn */}
                    <div className="border-t border-slate-100 pt-3.5 space-y-2">
                        <label className={labelClass}>Phụ kiện đóng cuốn (Dây phân trang, góc kim loại...)</label>
                        <div className="flex items-center gap-1.5">
                            <div className="flex-1 min-w-0">
                                <SearchableSelect
                                    value={bCurAccId}
                                    onChange={v => setBCurAccId(v.toString())}
                                    options={boundAccessories.map((a: any) => ({ id: String(a.id), label: `${a.name} (${formatCurrency(a.price || a.unit_price || 0)})` }))}
                                    placeholder="-- Chọn phụ kiện --"
                                />
                            </div>
                            <input type="number" min="1" value={bCurAccQty} onChange={e => setBCurAccQty(Number(e.target.value))} className="w-16 shrink-0 border border-slate-200 rounded-md px-1.5 text-[11px] h-8 text-center font-bold bg-white" />
                            <button type="button" disabled={!bCurAccId} onClick={() => {
                                const acc = boundAccessories.find((a: any) => String(a.id) === String(bCurAccId));
                                if (acc && !bSelectedAcc.find((a: any) => String(a.id) === String(bCurAccId))) {
                                    setBSelectedAcc((prev: any) => [...prev, { id: String(acc.id), qty: bCurAccQty || 1, name: acc.name }]);
                                }
                                setBCurAccId(''); setBCurAccQty(1);
                            }} className="bg-indigo-600 hover:bg-indigo-700 text-white w-8 h-8 shrink-0 rounded-md text-sm font-bold disabled:opacity-50 flex items-center justify-center">+</button>
                        </div>
                        {bSelectedAcc?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {bSelectedAcc.map((a: any) => (
                                    <span key={a.id} className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1.5 font-semibold">
                                        {a.name} (×{a.qty}) <button type="button" onClick={() => setBSelectedAcc((prev: any) => prev.filter((x: any) => String(x.id) !== String(a.id)))} className="text-slate-400 hover:text-red-500 font-bold">×</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL: Totals */}
            <div className="lg:col-span-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col sticky top-0">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3">
                        <h3 className="font-extrabold text-[13px] text-slate-800 uppercase tracking-wider m-0">
                            TỔNG CHI PHÍ CUỐN
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
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Chi phí Bìa:</span>
                            <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).cover_cost) : '-'}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Chi phí Ruột:</span>
                            <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).inner_cost) : '-'}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Chi phí Gia công & Đóng quyển:</span>
                            <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).binding_cost) : '-'}</span>
                        </div>
                        {Number((pricingResult as any)?.accessories_cost ?? 0) > 0 && (
                            <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Chi phí Phụ kiện:</span>
                                <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{formatCurrency((pricingResult as any).accessories_cost)}</span>
                            </div>
                        )}
                        {!isTrialMode && pricingResult && (pricingResult as any).type === 'bound' && Number((pricingResult as any).selling_subtotal ?? 0) > Number((pricingResult as any).cost_subtotal ?? (pricingResult as any).total ?? 0) && (
                            <div className="flex justify-between items-center text-slate-500 text-[12px] pt-1 gap-2">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Lợi nhuận định mức:</span>
                                <span className="font-bold text-indigo-700 whitespace-nowrap shrink-0">+{formatCurrency(Number((pricingResult as any).selling_subtotal ?? 0) - Number((pricingResult as any).cost_subtotal ?? (pricingResult as any).total ?? 0))}</span>
                            </div>
                        )}
                    </div>

                    <div className="border-t-2 border-dashed border-slate-200 pt-3 mt-4">
                        <div className="flex justify-between items-end mb-1 gap-2">
                            <span className="text-slate-800 font-extrabold text-[11px] uppercase">Thành tiền (trước VAT):</span>
                            <span className="font-black text-xl text-indigo-600 leading-none tracking-tight whitespace-nowrap">
                                {pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).selling_subtotal ?? (pricingResult as any).total) : '0 ₫'}
                            </span>
                        </div>
                        <div className="text-right text-[11px] text-slate-500 font-medium tracking-wide">
                            Đơn giá: <span className="text-slate-700 font-bold">{pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).selling_price_per_item ?? (pricingResult as any).price_per_item) : '-'}</span> / cuốn
                        </div>
                    </div>

                    {(pricingResult as any)?.error && (
                        <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-[11px] font-semibold">
                            <div>⚠️ {(pricingResult as any).error}</div>
                            <div className="mt-1.5 flex flex-wrap gap-2">
                                <a href="/pricing/settings/pricing-tiers" className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-50">→ Mở Định mức In Nhanh</a>
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
                                    const itemPayload = {
                                        name: fileName.trim() || productName || 'Sản phẩm Cuốn',
                                        type: 'bound' as const,
                                        quantity: bQuantity,
                                        total: (pricingResult as any).selling_subtotal ?? (pricingResult as any).total,
                                        unitPrice: (pricingResult as any).selling_price_per_item ?? (pricingResult as any).price_per_item,
                                        details: pricingResult,
                                        configParams: {
                                            bQuantity, bPageCount, bBindingType, bWidth, bHeight, bSpineWidth,
                                            bCoverMaterialId, bCoverMaterialName, bCoverPaperSizeId,
                                            bInnerMaterialId, bInnerMaterialName, bInnerPaperSizeId,
                                            bCoverPrintType, bCoverPrintSide, bInnerPrintType, bInnerPrintSide,
                                            bCoverProc, bInnerProc, bSelectedAcc,
                                            materialName: [bCoverMaterialName, bInnerMaterialName].filter(Boolean).join(' / ') || '',
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
