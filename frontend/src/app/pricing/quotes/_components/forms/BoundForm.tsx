// @ts-nocheck
import React from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { PreviewLayoutSVG } from '../PreviewLayoutSVG';
import { useQuoteConfigurator } from '../_hooks/useQuoteConfigurator';
import { formatVND } from '../quote-ui';

type QuoteState = ReturnType<typeof useQuoteConfigurator>;

export function BoundForm({ state }: { state: QuoteState }) {
    const {
        masterData, fileName, setFileName, quantity, setQuantity, materialId, setMaterialId, paperSizeId, setPaperSizeId, printType, setPrintType, printSide, setPrintSide, itemWidth, setItemWidth, itemHeight, setItemHeight, gapH, setGapH, gapV, setGapV, shape, setShape,
        templates, selectedTemplateCode, handleTemplateChange,
        allowedMaterialIds, allowedProcessingIds, allowedPaperSizeIds,
        lockPrintSide, lockPrintType,
        selectedProcessing, setSelectedProcessing, curProcId, setCurProcId, curProcSide, setCurProcSide,
        selectedAccessories, setSelectedAccessories, curAccId, setCurAccId, curAccQty, setCurAccQty,
        lfQuantity, setLfQuantity, lfMaterialId, setLfMaterialId, lfWidth, setLfWidth, lfHeight, setLfHeight, lfPrintType, setLfPrintType, lfSelectedProc, setLfSelectedProc, lfCurProcId, setLfCurProcId, lfSelectedAcc, setLfSelectedAcc, lfCurAccId, setLfCurAccId, lfCurAccQty, setLfCurAccQty,
        bQuantity, setBQuantity, bPageCount, setBPageCount, bBindingType, setBBindingType,
        bCoverMaterialName, setBCoverMaterialName, bCoverMaterialId, setBCoverMaterialId, bCoverPaperSizeId, setBCoverPaperSizeId, bCoverPrintType, setBCoverPrintType, bCoverPrintSide, setBCoverPrintSide, bCoverProc, setBCoverProc,
        bInnerMaterialName, setBInnerMaterialName, bInnerMaterialId, setBInnerMaterialId, bInnerPaperSizeId, setBInnerPaperSizeId, bInnerPrintType, setBInnerPrintType, bInnerPrintSide, setBInnerPrintSide, bInnerProc, setBInnerProc,
        pricingResult, lastPricingPayload, optimizedSizes,
        addItem, productName
    } = state;

    const formatCurrency = formatVND;

                    const allMats = (masterData?.materials as any[]) || [];
                    // Khổ giấy: CHỈ khổ sản phẩm cho phép (rỗng = không có — đúng theo cài đặt)
                    const allPaperSizes = ((masterData?.paper_sizes as any[]) || []).filter(ps => allowedPaperSizeIds.includes(String(ps.id)));
                    const allProc = (masterData?.processing_options as any[]) || [];
                    
                    // Scope-filtered materials (scope_bound=1) — CHỈ vật liệu sản phẩm cho phép
                    const boundMats = allMats.filter(m => (m.scopeBound || m.scope_bound == 1) && allowedMaterialIds.includes(String(m.id)));
                    const distinctNames = [...new Set(boundMats.map(m => m.name))];
                    // Tên giấy "chưa có định mức": KHÔNG vật tư nào cùng tên có has_pricing_tier.
                    // Gắn hậu tố cảnh báo vào option; backend vẫn chặn tính giá (hasAnyTier).
                    const noTierNames = new Set(
                        distinctNames.filter(name => !boundMats.some(m => m.name === name && m.has_pricing_tier)),
                    );
                    const nameOption = (name: string) => ({ id: name, label: noTierNames.has(name) ? `${name} ⚠ (chưa có định mức)` : name });
                    
                    // Paper sizes for selected cover material
                    const coverMatsForName = boundMats.filter(m => m.name === bCoverMaterialName);
                    const coverPaperSizeIds = new Set(coverMatsForName.filter(m => m.paperSizeId || m.paper_size_id).map(m => m.paperSizeId || m.paper_size_id));
                    const coverPaperSizes = coverPaperSizeIds.size > 0 
                        ? allPaperSizes.filter(ps => coverPaperSizeIds.has(ps.id))
                        : allPaperSizes.filter(ps => ps.scopeBound || ps.scope_bound == 1);
                    
                    // Paper sizes for selected inner material
                    const innerMatsForName = boundMats.filter(m => m.name === bInnerMaterialName);
                    const innerPaperSizeIds = new Set(innerMatsForName.filter(m => m.paperSizeId || m.paper_size_id).map(m => m.paperSizeId || m.paper_size_id));
                    const innerPaperSizes = innerPaperSizeIds.size > 0
                        ? allPaperSizes.filter(ps => innerPaperSizeIds.has(ps.id))
                        : allPaperSizes.filter(ps => ps.scopeBound || ps.scope_bound == 1);
                    
                    // Bound processing options — CHỈ gia công sản phẩm cho phép
                    const boundProc = allProc.filter(p => (p.scopeBound || p.scope_bound == 1) && allowedProcessingIds.includes(String(p.id)));
                    const bindingProc = boundProc.filter(p => p.category === 'binding');
                    const finishingProcRaw = boundProc.filter(p => p.category !== 'binding');
                    const finishingProc = [...new Map(finishingProcRaw.map(p => [p.name, p])).values()];
                    
                    // Stock info helpers
                    const findMaterial = (name: string, psId: string) => {
                        let mat = boundMats.find(m => m.name === name && (m.paperSizeId || m.paper_size_id) == psId);
                        if (!mat) mat = boundMats.find(m => m.name === name);
                        return mat;
                    };
                    const coverMat = bCoverMaterialName ? findMaterial(bCoverMaterialName, bCoverPaperSizeId) : null;
                    const innerMat = bInnerMaterialName ? findMaterial(bInnerMaterialName, bInnerPaperSizeId) : null;
                    
                    // Sheet calculation
                    const isSaddle = bBindingType.includes('saddle') || bBindingType.includes('ghim');
                    const pagesPerSheet = isSaddle ? 4 : 2;
                    const innerPages = Math.max(0, bPageCount - 4);
                    const sheetsPerBook = Math.ceil(innerPages / pagesPerSheet);
                    
                    // Material name change handler
                    const onCoverNameChange = (name: string) => {
                        setBCoverMaterialName(name);
                        // Auto-resolve material ID for first matching material
                        const mat = boundMats.find(m => m.name === name);
                        if (mat) setBCoverMaterialId(mat.id.toString());
                        setBCoverPaperSizeId(''); // Reset paper size
                    };
                    const onInnerNameChange = (name: string) => {
                        setBInnerMaterialName(name);
                        const mat = boundMats.find(m => m.name === name);
                        if (mat) setBInnerMaterialId(mat.id.toString());
                        setBInnerPaperSizeId('');
                    };
                    const onCoverPaperChange = (psId: string) => {
                        setBCoverPaperSizeId(psId);
                        // Resolve exact material by name+paperSize
                        const mat = boundMats.find(m => m.name === bCoverMaterialName && (m.paperSizeId || m.paper_size_id) == psId);
                        if (mat) setBCoverMaterialId(mat.id.toString());
                    };
                    const onInnerPaperChange = (psId: string) => {
                        setBInnerPaperSizeId(psId);
                        const mat = boundMats.find(m => m.name === bInnerMaterialName && (m.paperSizeId || m.paper_size_id) == psId);
                        if (mat) setBInnerMaterialId(mat.id.toString());
                    };
                    
                    return (
                    <div className="grid grid-cols-1 lg:grid-cols-8 gap-5 w-full">
                        {/* LEFT PANEL: Form */}
                        <div className="lg:col-span-4 flex flex-col gap-4">
                            {/* General */}
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 shadow-sm">
                                <div className="border-b border-indigo-200/60 pb-3 mb-3">
                                    <select 
                                        value={selectedTemplateCode} 
                                        onChange={handleTemplateChange}
                                        className="w-full text-xs font-bold text-indigo-900 bg-white border border-indigo-200 rounded-md h-8 px-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-all outline-none"
                                    >
                                        <option value="">-- Chọn mẫu sản phẩm cuốn --</option>
                                        {templates.map((group, idx) => {
                                            const boundTemplates = group.templates.filter((t: any) => t.product_type === 'bound');
                                            if (boundTemplates.length === 0) return null;
                                            const opts = boundTemplates.map((t: any) => (
                                                <option key={t.code} value={t.code}>{t.name}</option>
                                            ));
                                            // Nhóm mặc định 'other' (Danh mục chung) → không bọc optgroup cho gọn.
                                            return group.code === 'other'
                                                ? opts
                                                : <optgroup key={idx} label={group.name}>{opts}</optgroup>;
                                        })}
                                    </select>
                                </div>
                                <div className="mb-3">
                                    <label className="block text-[10px] font-bold text-indigo-700 mb-1 tracking-wide uppercase">Tên File / Quyển <span className="text-red-500">*</span></label>
                                    <input type="text" value={fileName} onChange={e => setFileName(e.target.value)} placeholder="Nhập tên tài liệu (VD: Sổ tay nhân viên)" className="w-full text-[13px] font-semibold px-2.5 h-8 border border-indigo-200 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white shadow-sm" />
                                </div>
                                <h4 className="font-bold text-[11px] mb-2.5 text-slate-700 uppercase tracking-wider">Thông số chung</h4>
                                <div className="grid grid-cols-3 gap-3 mb-3">
                                    <div><label className="block text-[10px] font-bold text-indigo-700 mb-1">Số lượng cuốn:</label><input type="number" min="1" value={bQuantity} onChange={e => setBQuantity(Number(e.target.value))} className="w-full text-xs font-bold px-2 h-8 border border-slate-300 rounded outline-none focus:border-indigo-500 bg-white" /></div>
                                    <div><label className="block text-[10px] font-bold text-indigo-700 mb-1">Tổng Số trang:</label><input type="number" min="4" step="4" value={bPageCount} onChange={e => setBPageCount(Number(e.target.value))} className="w-full text-xs font-bold px-2 h-8 border border-slate-300 rounded outline-none focus:border-indigo-500 bg-white" /></div>
                                    <div><label className="block text-[10px] uppercase font-semibold text-slate-600 mb-1">Quy cách Đóng:</label>
                                        <select value={bBindingType} onChange={e => setBBindingType(e.target.value)} className="w-full px-2 h-8 text-[11px] border border-slate-300 rounded outline-none focus:border-indigo-500 bg-white">
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
                                <div className="flex gap-4 text-[10px] text-slate-500 font-medium bg-white/60 rounded px-3 py-1.5 border border-slate-200">
                                    <span>📄 Trang ruột: <b className="text-slate-700">{innerPages}</b></span>
                                    <span>📋 Tờ/cuốn: <b className="text-slate-700">{sheetsPerBook}</b></span>
                                    <span>🗄️ Tổng tờ ruột: <b className="text-indigo-600">{(sheetsPerBook * bQuantity).toLocaleString()}</b></span>
                                </div>
                            </div>
                            
                            {/* Bìa */}
                            <div className="bg-blue-50/30 border border-blue-100 rounded-xl p-4 shadow-sm">
                                <h4 className="font-bold text-[11px] mb-2.5 text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="bg-blue-200 text-blue-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px]">B</span> Chất liệu Bìa
                                </h4>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1">Giấy in bìa</label>
                                        <SearchableSelect 
                                            value={bCoverMaterialName} 
                                            onChange={val => onCoverNameChange(val.toString())}
                                            options={distinctNames.map(nameOption)}
                                            placeholder="-- Chọn giấy bìa --"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1">Khổ in bìa</label>
                                        <SearchableSelect 
                                            value={bCoverPaperSizeId} 
                                            onChange={val => onCoverPaperChange(val.toString())} 
                                            options={coverPaperSizes.map(p => ({ id: p.id.toString(), label: p.name }))}
                                            placeholder="-- Chọn khổ in --"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1">Mặt in</label>
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
                                        <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1">Hệ màu</label>
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
                                {/* Cover stock info */}
                                {coverMat && (
                                    <div className="flex items-center gap-3 text-[10px] bg-white/60 rounded px-3 py-1.5 border border-blue-200">
                                        <span className="text-slate-500">📦 Tồn kho:</span>
                                        <span className={`font-bold ${(parseInt(coverMat.stock) || 0) <= 0 ? 'text-red-600' : (parseInt(coverMat.stock) || 0) < 100 ? 'text-orange-600' : 'text-green-600'}`}>
                                            {(parseInt(coverMat.stock) || 0).toLocaleString()} tờ
                                        </span>
                                        <span className="text-slate-500">💰 Tờ cần: <b className="text-blue-600">{bQuantity}</b></span>
                                    </div>
                                )}
                                {/* Cover processing */}
                                <div className="mt-3 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200 border-dashed">
                                    <h5 className="text-[9px] uppercase font-bold text-slate-500 mb-1.5">Gia công bìa:</h5>
                                    <div className="flex gap-2">
                                        <SearchableSelect 
                                            value="" 
                                            onChange={v => {
                                                const idStr = v.toString(); if (!idStr) return;
                                                const pItem = finishingProc.find(p => p.id.toString() === idStr);
                                                if (pItem && !bCoverProc.find(p => p.id === idStr)) setBCoverProc(prev => [...prev, {id: idStr, name: pItem.name, side: '1', code: pItem.code}]);
                                            }} 
                                            options={finishingProc.map(p => ({ id: p.id.toString(), label: p.name }))}
                                            placeholder="-- Thêm --"
                                        />
                                    </div>
                                    {bCoverProc.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {bCoverProc.map(p => (
                                                <span key={p.id} className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1">
                                                    {p.name} <button onClick={() => setBCoverProc(prev => prev.filter(x => x.name !== p.name))} className="text-red-400 hover:text-red-600 font-bold">×</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Ruột */}
                            <div className="bg-emerald-50/30 border border-emerald-100 rounded-xl p-4 shadow-sm">
                                <h4 className="font-bold text-[11px] mb-2.5 text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="bg-emerald-200 text-emerald-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px]">R</span> Chất liệu Ruột
                                </h4>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1">Giấy in ruột</label>
                                        <SearchableSelect 
                                            value={bInnerMaterialName} 
                                            onChange={val => onInnerNameChange(val.toString())}
                                            options={distinctNames.map(nameOption)}
                                            placeholder="-- Chọn giấy ruột --"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1">Khổ in ruột</label>
                                        <SearchableSelect 
                                            value={bInnerPaperSizeId} 
                                            onChange={val => onInnerPaperChange(val.toString())} 
                                            options={innerPaperSizes.map(p => ({ id: p.id.toString(), label: p.name }))}
                                            placeholder="-- Chọn khổ in --"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1">Mặt in</label>
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
                                        <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1">Hệ màu</label>
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
                                {/* Inner stock + sheet info */}
                                {innerMat && (
                                    <div className="flex items-center gap-3 text-[10px] bg-white/60 rounded px-3 py-1.5 border border-emerald-200">
                                        <span className="text-slate-500">📦 Tồn kho:</span>
                                        <span className={`font-bold ${(parseInt(innerMat.stock) || 0) <= 0 ? 'text-red-600' : (parseInt(innerMat.stock) || 0) < 100 ? 'text-orange-600' : 'text-green-600'}`}>
                                            {(parseInt(innerMat.stock) || 0).toLocaleString()} tờ
                                        </span>
                                        <span className="text-slate-500">💰 Tờ cần: <b className="text-emerald-600">{(sheetsPerBook * bQuantity).toLocaleString()}</b></span>
                                    </div>
                                )}
                                {/* Inner processing */}
                                <div className="mt-3 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200 border-dashed">
                                    <h5 className="text-[9px] uppercase font-bold text-slate-500 mb-1.5">Gia công ruột:</h5>
                                    <div className="flex gap-2">
                                        <select className="flex-1 border border-slate-300 rounded px-1.5 text-[10px] h-6" onChange={e => {
                                            const idStr = e.target.value; if (!idStr) return;
                                            const pItem = finishingProc.find(p => p.id.toString() === idStr);
                                            if (pItem && !bInnerProc.find(p => p.id === idStr)) setBInnerProc(prev => [...prev, {id: idStr, name: pItem.name, side: '1', code: pItem.code}]); 
                                            e.target.value = '';
                                        }}>
                                            <option value="">-- Thêm --</option>
                                            {finishingProc.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                                        </select>
                                    </div>
                                    {bInnerProc.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {bInnerProc.map(p => (
                                                <span key={p.id} className="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1">
                                                    {p.name} <button onClick={() => setBInnerProc(prev => prev.filter(x => x.name !== p.name))} className="text-red-400 hover:text-red-600 font-bold">×</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT PANEL: Totals */}
                        <div className="lg:col-span-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1)] h-full relative overflow-hidden flex flex-col">
                                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-slate-50 border border-slate-100 z-0"></div>
                                <h3 className="font-extrabold text-[15px] mb-5 text-slate-800 relative z-10 border-b border-slate-100 pb-3 uppercase tracking-wider flex items-center justify-between">
                                    TỔNG CHI PHÍ CUỐN
                                </h3>
                                <div className="flex-1 space-y-4 text-[13px] relative z-10">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center text-slate-600 font-medium">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Chi phí Bìa:</span>
                                            <span className="font-bold text-slate-800">{pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).cover_cost) : '-'}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center text-slate-600 font-medium">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Chi phí Ruột:</span>
                                            <span className="font-bold text-slate-800">{pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).inner_cost) : '-'}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center text-slate-600 font-medium">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div> Chi phí Gia công & Đóng quyển:</span>
                                            <span className="font-bold text-slate-800">{pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).binding_cost) : '-'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="border-t-2 border-dashed border-slate-200 pt-4 mt-auto">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-slate-800 font-extrabold text-sm uppercase">Thành tiền:</span>
                                        <span className="font-black text-2xl text-indigo-600 leading-none tracking-tight">
                                            {pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).selling_subtotal ?? (pricingResult as any).total) : '0 ₫'}
                                        </span>
                                    </div>
                                    <div className="text-right text-[11px] text-slate-500 font-medium tracking-wide">
                                        Đơn giá: <span className="text-slate-700 font-bold">{pricingResult && (pricingResult as any).type === 'bound' ? formatCurrency((pricingResult as any).selling_price_per_item ?? (pricingResult as any).price_per_item) : '-'}</span> / cuốn
                                    </div>
                                    <div className="mt-2 text-[10px] text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-md border border-amber-200 font-medium flex items-center gap-1.5">
                                        <span>💡</span> Chưa bao gồm VAT & phí giao hàng — xem tổng cuối tại sidebar trái
                                    </div>
                                </div>
                                {(pricingResult as any)?.error && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-semibold shadow-inner flex items-start gap-2">
                                        ⚠️ {(pricingResult as any).error}
                                    </div>
                                )}

                                {pricingResult && !(pricingResult as any).error && (
                                    <button 
                                        onClick={() => {
                                            addItem({
                                                name: fileName || 'Sản phẩm Cuốn',
                                                type: 'bound',
                                                quantity: bQuantity,
                                                total: (pricingResult as any).selling_subtotal ?? (pricingResult as any).total,
                                                unitPrice: (pricingResult as any).selling_price_per_item ?? (pricingResult as any).price_per_item,
                                                details: pricingResult,
                                                configParams: { bQuantity, bPageCount, bBindingType },
                                                pricingPayload: lastPricingPayload ?? undefined,
                                            });
                                            setFileName('');
                                        }}
                                        className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 text-white font-bold py-3 px-5 rounded-lg text-[13px] transition-all flex items-center justify-center gap-2"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                        THÊM VÀO BÁO GIÁ
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    );
}
