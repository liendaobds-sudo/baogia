// @ts-nocheck
import React from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { PreviewLayoutSVG } from '../PreviewLayoutSVG';
import { useQuoteConfigurator } from '../_hooks/useQuoteConfigurator';
import { formatVND } from '../quote-ui';

type QuoteState = ReturnType<typeof useQuoteConfigurator>;

export function LargeFormatForm({ state }: { state: QuoteState }) {
    const {
        masterData, fileName, setFileName, quantity, setQuantity, materialId, setMaterialId, paperSizeId, setPaperSizeId, printType, setPrintType, printSide, setPrintSide, itemWidth, setItemWidth, itemHeight, setItemHeight, gapH, setGapH, gapV, setGapV, shape, setShape,
        templates, selectedTemplateCode, handleTemplateChange,
        allowedMaterialIds, allowedProcessingIds, allowedPaperSizeIds, allowedAccessoryIds,
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
                    const allProc = (masterData?.processing_options as any[]) || [];
                    
                    // Robust accessory check
                    const isAccessory = (m: any) => {
                        const c = (m.category || '').toLowerCase().trim();
                        const t = (m.type || '').toLowerCase().trim();
                        return ['accessory', 'accessories', 'phụ kiện'].includes(c) || ['accessory', 'accessories', 'phụ kiện'].includes(t) || c.includes('accessory') || t.includes('accessory');
                    };

                    // Scope-filtered materials (exclude accessories) — CHỈ vật liệu sản phẩm cho phép
                    const lfMats = allMats.filter(m => (m.scopeLargeFormat || m.scope_large_format == 1) && !isAccessory(m) && allowedMaterialIds.includes(String(m.id)));
                    // Accessories for large format — CHỈ phụ kiện sản phẩm cho phép
                    const lfAccessories = allMats.filter(m => (m.scopeLargeFormat || m.scope_large_format == 1) && isAccessory(m) && allowedAccessoryIds.includes(String(m.id)));
                    // Processing for large format — CHỈ gia công sản phẩm cho phép
                    const lfProc = allProc.filter(p => (p.scopeLargeFormat || p.scope_large_format == 1) && allowedProcessingIds.includes(String(p.id)));
                    // Selected material info
                    const selectedMat = lfMats.find(m => m.id.toString() === lfMaterialId);
                    
                    return (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 w-full">
                        {/* LEFT AND CENTER PANELS: Form */}
                        <div className="xl:col-span-8 flex flex-col gap-4">
                            <div className="bg-white border text-slate-700 border-slate-200 rounded-xl p-5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)]">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-slate-100 pb-3 mb-4 gap-3">
                                    <h3 className="font-extrabold text-[15px] uppercase tracking-wider flex items-center text-indigo-900">
                                        <span className="text-xl mr-2 text-indigo-600"><i className="fa-solid fa-print"></i></span> IN KHỔ LỚN
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <select 
                                            value={selectedTemplateCode} 
                                            onChange={handleTemplateChange}
                                            className="flex-1 sm:w-[260px] text-[11px] font-bold text-indigo-900 bg-indigo-50/70 border border-indigo-200 rounded-lg h-9 px-3 focus:border-indigo-500 focus:bg-white outline-none transition-colors shadow-inner"
                                        >
                                            <option value="">-- Chọn mẫu sản phẩm có sẵn --</option>
                                            {templates.map((group, idx) => {
                                                const lft = group.templates.filter((t: any) => t.product_type === 'large_format' || t.quoteType === 'large_format');
                                                if (lft.length === 0) return null;
                                                const opts = lft.map((t: any) => <option key={t.code || t.id} value={t.code || t.id}>{t.name || t.nameVi}</option>);
                                                // Nhóm mặc định 'other' (Danh mục chung) → không bọc optgroup cho gọn.
                                                return group.code === 'other'
                                                    ? opts
                                                    : <optgroup key={idx} label={group.name || group.title}>{opts}</optgroup>;
                                            })}
                                        </select>
                                    </div>
                                </div>

                                {/* 1. Thông tin chung */}
                                <h4 className="font-bold text-[12px] mb-3 text-slate-700 flex items-center gap-1.5">
                                    <span className="bg-slate-200 text-slate-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">1</span> Thông tin chung
                                </h4>
                                <div className="grid grid-cols-12 gap-3 mb-5">
                                    <div className="col-span-12 sm:col-span-6">
                                        <label className="block text-[10px] font-bold text-slate-600 mb-1 tracking-wide uppercase">Tên File / Sản Phẩm <span className="text-red-500">*</span></label>
                                        <input type="text" value={fileName} onChange={e => setFileName(e.target.value)} placeholder="Ví dụ: Băng rôn Tết, Standee..." className="w-full text-[13px] font-semibold px-3 h-9 border border-slate-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 focus:bg-white shadow-inner transition-all" />
                                    </div>
                                    <div className="col-span-6 sm:col-span-3">
                                        <label className="block text-[10px] font-bold text-indigo-700 mb-1 uppercase">Số lượng:</label>
                                        <input type="number" min="1" value={lfQuantity} onChange={e => setLfQuantity(Number(e.target.value))} className="w-full text-sm font-bold text-center px-2 h-9 border border-indigo-300 rounded focus:border-indigo-500 outline-none shadow-inner bg-indigo-50/50 text-indigo-900" />
                                    </div>
                                    <div className="col-span-6 sm:col-span-3">
                                        <label className="block text-[10px] font-bold text-indigo-700 mb-1 uppercase">ĐVT:</label>
                                        <select className="w-full px-2 h-9 text-[11px] font-semibold border border-indigo-300 rounded shadow-inner outline-none focus:border-indigo-500 bg-indigo-50/50 text-indigo-900">
                                            <option value="tấm">Tấm / Tờ</option>
                                            <option value="cuộn">Cuộn</option>
                                        </select>
                                    </div>
                                </div>

                                {/* 2x2 Grid Layout */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Vật tư & Kích thước */}
                                    <div className="space-y-4">
                                        {/* 2. Vật tư */}
                                        <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-3.5 shadow-sm">
                                            <h4 className="font-bold text-[11px] mb-3 text-blue-800 uppercase flex items-center gap-1.5">
                                                <span className="bg-blue-200 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">2</span> Vật tư
                                            </h4>
                                            <div className="mb-2">
                                                <select value={lfMaterialId} onChange={e => setLfMaterialId(e.target.value)} className="w-full px-1.5 h-8 text-[11px] font-medium border border-blue-200 rounded shadow-inner outline-none transition-colors focus:border-blue-500 bg-white text-blue-900">
                                                    <option value="">-- Chọn vật liệu (cuộn) --</option>
                                                    {lfMats.map(m => {
                                                        const pArea = m.pricePerSqm || m.price_per_sqm;
                                                        return (<option key={m.id} value={m.id}>{m.name} {pArea ? `- ${formatCurrency(pArea)}/m²` : ''}</option>);
                                                    })}
                                                </select>
                                            </div>
                                            {selectedMat && (
                                                <div className="text-[10px] text-blue-800 bg-white/70 p-2 rounded-lg border border-blue-100 space-y-1 mt-2">
                                                    {(selectedMat.rollWidth || selectedMat.roll_width) && (
                                                        <div className="font-medium">📐 Khổ cuộn: <b>{((selectedMat.rollWidth || selectedMat.roll_width) / 1000).toFixed(2)}m</b> ({selectedMat.chargeFullWidth || selectedMat.charge_full_width == 1 ? 'Tính bù hao' : 'Không bù hao'})</div>
                                                    )}
                                                    <div className={(parseInt(selectedMat.stock) || 0) <= 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>📦 Tồn kho: {(parseInt(selectedMat.stock) || 0).toLocaleString()} {selectedMat.unitName || selectedMat.unit_name || 'đv'}</div>
                                                </div>
                                            )}
                                        </div>

                                        {/* 3. Kích thước */}
                                        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 shadow-sm">
                                            <h4 className="font-bold text-[11px] mb-3 text-slate-700 uppercase flex items-center gap-1.5">
                                                <span className="bg-slate-200 text-slate-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">3</span> Kích thước tính(mm)
                                            </h4>
                                            <div className="mb-3">
                                                <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1.5">Công nghệ in:</label>
                                                <select value={lfPrintType} onChange={e => setLfPrintType(e.target.value)} disabled={lockPrintType} className={`w-full px-1.5 h-8 text-[11px] font-medium border border-slate-300 rounded shadow-inner outline-none transition-colors focus:border-indigo-500 text-slate-800 ${lockPrintType ? 'bg-slate-100 cursor-not-allowed opacity-70' : 'bg-white'}`}>
                                                    {((masterData?.print_types as any[]) || []).map(p => (<option key={p.code} value={p.code}>{p.name}</option>))}
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 mb-2">
                                                <div>
                                                    <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1.5">Chiều Rộng</label>
                                                    <div className="relative">
                                                        <input type="number" min="10" value={lfWidth} onChange={e => setLfWidth(Number(e.target.value))} className="w-full text-center text-[12px] font-bold px-2 h-9 border border-slate-300 rounded focus:border-slate-500 shadow-inner outline-none bg-white text-slate-800" />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">mm</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-semibold text-slate-500 mb-1.5">Chiều Cao</label>
                                                    <div className="relative">
                                                        <input type="number" min="10" value={lfHeight} onChange={e => setLfHeight(Number(e.target.value))} className="w-full text-center text-[12px] font-bold px-2 h-9 border border-slate-300 rounded focus:border-slate-500 shadow-inner outline-none bg-white text-slate-800" />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400">mm</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-2 px-1 flex justify-between border-t border-slate-200 pt-2 font-medium">
                                                <div>Sợi 1 tấm: <b className="text-indigo-600">{(lfWidth * lfHeight / 1000000).toFixed(3)} m²</b></div>
                                                <div>Tổng: <b className="text-indigo-600">{(lfWidth * lfHeight / 1000000 * lfQuantity).toFixed(3)} m²</b></div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gia công & Phụ kiện */}
                                    <div className="space-y-4 flex flex-col">
                                        {/* 4. Gia công */}
                                        <div className="bg-orange-50/40 border border-orange-200 rounded-xl p-3.5 shadow-sm flex-1 flex flex-col min-h-[160px]">
                                            <h4 className="font-bold text-[11px] mb-3 text-orange-800 uppercase flex items-center gap-1.5">
                                                <span className="bg-orange-200 text-orange-700 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">4</span> Gia công sau in
                                            </h4>
                                            <div className="flex gap-2 mb-2">
                                                <select value={lfCurProcId} onChange={e => setLfCurProcId(e.target.value)} className="flex-1 px-1.5 h-8 text-[11px] font-medium border border-orange-300 rounded shadow-inner outline-none transition-colors focus:border-orange-500 bg-white text-orange-900">
                                                    <option value="">-- Chọn gia công --</option>
                                                    {lfProc.map(p => (<option key={p.id} value={p.name}>{p.name}</option>))}
                                                </select>
                                                <button onClick={() => {
                                                    if (!lfCurProcId) return;
                                                    if (!lfSelectedProc.find(p => p.name === lfCurProcId)) {
                                                        setLfSelectedProc(prev => [...prev, {id: lfCurProcId, name: lfCurProcId}]);
                                                    }
                                                    setLfCurProcId('');
                                                }} disabled={!lfCurProcId} className="bg-orange-500 hover:bg-orange-600 text-white w-8 h-8 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center transition-colors shadow-sm">+</button>
                                            </div>
                                            <div className="flex-1 bg-white/70 rounded-lg border border-orange-100 p-2 overflow-y-auto mt-1">
                                                {lfSelectedProc.length === 0 ? <div className="text-center text-[10px] text-orange-400/80 italic mt-3">Chưa có gia công</div> :
                                                <div className="flex flex-col gap-1.5">
                                                    {lfSelectedProc.map(p => (
                                                        <div key={p.id} className="bg-orange-100/80 border border-orange-200 text-orange-800 text-[10px] font-semibold px-2.5 py-1.5 rounded flex items-center justify-between shadow-sm">
                                                            <span className="truncate pr-2">{p.name}</span>
                                                            <button onClick={() => setLfSelectedProc(prev => prev.filter(x => x.name !== p.name))} className="text-red-500 hover:text-red-700 font-bold ml-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-50/50 transition-colors">×</button>
                                                        </div>
                                                    ))}
                                                </div>}
                                            </div>
                                        </div>

                                        {/* 5. Phụ kiện */}
                                        <div className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-3.5 shadow-sm flex-1 flex flex-col min-h-[160px]">
                                            <h4 className="font-bold text-[11px] mb-3 text-emerald-800 uppercase flex items-center gap-1.5">
                                                <span className="bg-emerald-200 text-emerald-700 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">5</span> Phụ kiện
                                            </h4>
                                            <div className="flex gap-2 mb-2">
                                                <select value={lfCurAccId} onChange={e => setLfCurAccId(e.target.value)} className="flex-1 px-1.5 h-8 text-[11px] font-medium border border-emerald-300 rounded shadow-inner outline-none transition-colors focus:border-emerald-500 bg-white text-emerald-900">
                                                    <option value="">-- Chọn phụ kiện --</option>
                                                    {lfAccessories.map(a => (<option key={a.id} value={a.id}>{a.name} - {formatCurrency(a.unitPrice || a.unit_price || a.price || 0)}</option>))}
                                                </select>
                                                <input type="number" min="1" value={lfCurAccQty} onChange={e => setLfCurAccQty(Number(e.target.value))} className="w-12 px-1 text-[11px] h-8 text-center font-bold text-emerald-900 border border-emerald-300 rounded shadow-inner outline-none transition-colors focus:border-emerald-500" />
                                                <button onClick={() => {
                                                    if (!lfCurAccId) return;
                                                    const acc = lfAccessories.find(a => a.id.toString() === lfCurAccId);
                                                    if (acc && !lfSelectedAcc.find(a => a.id === lfCurAccId)) {
                                                        setLfSelectedAcc(prev => [...prev, {id: lfCurAccId, qty: lfCurAccQty, name: acc.name, price: acc.unitPrice || acc.unit_price || acc.price || 0}]);
                                                    }
                                                    setLfCurAccId(''); setLfCurAccQty(1);
                                                }} disabled={!lfCurAccId} className="bg-emerald-600 hover:bg-emerald-700 text-white w-8 h-8 rounded-lg text-sm font-bold disabled:opacity-50 flex items-center justify-center transition-colors shadow-sm">+</button>
                                            </div>
                                            <div className="flex-1 bg-white/70 rounded-lg border border-emerald-100 p-2 overflow-y-auto mt-1">
                                                {lfSelectedAcc.length === 0 ? <div className="text-center text-[10px] text-emerald-500/70 italic mt-3">Không kèm phụ kiện</div> :
                                                <div className="flex flex-col gap-1.5">
                                                    {lfSelectedAcc.map(a => (
                                                        <div key={a.id} className="bg-emerald-100/80 border border-emerald-200 text-emerald-800 text-[10px] font-semibold px-2 py-1.5 rounded flex items-center justify-between shadow-sm">
                                                            <div className="flex-1 truncate pr-1" title={a.name}>{a.name}</div>
                                                            <div className="font-bold text-emerald-900 mx-1 w-8 text-right">×{a.qty}</div>
                                                            <button onClick={() => setLfSelectedAcc(prev => prev.filter(x => x.id !== a.id))} className="text-red-500 hover:text-red-700 font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-50/50 transition-colors">×</button>
                                                        </div>
                                                    ))}
                                                </div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>


                            </div>

                            {/* CENTER PANEL: DETAILED BREAKDOWN */}
                            {pricingResult && (pricingResult as any).type === 'large_format' && (
                                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-2 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full blur-2xl -mt-10 -mr-10"></div>
                                    <h4 className="font-bold text-sm mb-3 text-slate-800 border-b border-slate-100 pb-2 relative z-10 flex items-center gap-2">
                                        <i className="fa-solid fa-calculator text-indigo-500"></i> CHI TIẾT TÍNH TOÁN
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                                                <span className="text-[11px] text-slate-600 font-medium">Diện tích tinh thô (1 bản)</span>
                                                <span className="font-bold text-slate-700">{(pricingResult as any).breakdown?.area_m2} m²</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-slate-50/80 p-2.5 rounded-lg border border-slate-100">
                                                <span className="text-[11px] text-slate-600 font-medium">Hạng mục gia công</span>
                                                <span className="font-bold text-slate-700 text-[11px]">{lfSelectedProc.length} quy trình</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-100 shadow-sm">
                                                <span className="text-[11px] text-indigo-800 font-bold">TỔNG M² TÍNH TIỀN (Quy chuẩn)</span>
                                                <span className="font-black text-indigo-700 text-[14px]">{(pricingResult as any).breakdown?.charge_area_m2} m²</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-100 shadow-sm">
                                                <span className="text-[11px] text-emerald-800 font-bold">Đơn giá Vật liệu In / m²</span>
                                                <span className="font-bold text-emerald-700 text-[12px]">{formatCurrency((pricingResult as any).breakdown?.price_per_sqm || 0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* RIGHT PANEL: Totals */}
                        <div className="xl:col-span-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] h-full relative overflow-hidden flex flex-col">
                                <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-slate-50/80 border border-slate-100 z-0 blur-sm"></div>
                                <h3 className="font-extrabold text-[15px] mb-5 text-slate-800 relative z-10 border-b border-slate-100 pb-3 uppercase tracking-wider flex items-center justify-between">
                                    <span>TỔNG CHI PHÍ KHỔ LỚN</span>
                                    <span className="text-indigo-400"><i className="fa-solid fa-receipt"></i></span>
                                </h3>
                                <div className="flex-1 space-y-4 text-[13px] relative z-10">
                                    <div className="flex flex-col gap-1.5 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                                        <div className="flex justify-between items-center text-slate-600 font-medium">
                                            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> Chi phí in ấn:</span>
                                            <span className="font-bold text-slate-800">{pricingResult && (pricingResult as any).type === 'large_format' ? formatCurrency((pricingResult as any).material_cost) : '-'}</span>
                                        </div>
                                    </div>
                                    {lfSelectedAcc.length > 0 && (
                                        <div className="flex flex-col gap-1.5 bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100">
                                            <div className="flex justify-between items-center text-emerald-700 font-medium">
                                                <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Phụ kiện ({lfSelectedAcc.length}):</span>
                                                <span className="font-bold text-emerald-800">{formatCurrency(lfSelectedAcc.reduce((sum, a) => sum + a.price * a.qty, 0))}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="border-t-2 border-dashed border-slate-200 pt-4 mt-auto">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-slate-800 font-extrabold text-[13px] uppercase tracking-wide">Thành tiền:</span>
                                        <span className="font-black text-[26px] text-indigo-600 leading-none tracking-tight" style={{textShadow: '0 2px 4px rgba(79, 70, 229, 0.15)'}}>
                                            {pricingResult && (pricingResult as any).type === 'large_format' ? formatCurrency(((pricingResult as any).selling_subtotal ?? (pricingResult as any).total) + lfSelectedAcc.reduce((sum, a) => sum + a.price * a.qty, 0)) : '0 ₫'}
                                        </span>
                                    </div>
                                    <div className="text-right text-[11px] text-slate-500 font-medium tracking-wide mt-1">
                                        Đơn giá: <span className="text-slate-700 font-bold">{pricingResult && (pricingResult as any).type === 'large_format' ? formatCurrency((((pricingResult as any).selling_subtotal ?? (pricingResult as any).total) + lfSelectedAcc.reduce((sum, a) => sum + a.price * a.qty, 0)) / lfQuantity) : '-'}</span> / sản phẩm
                                    </div>
                                    <div className="mt-2 text-[10px] text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-md border border-amber-200 font-medium flex items-center gap-1.5">
                                        <span>💡</span> Chưa bao gồm VAT & phí giao hàng — xem tổng cuối tại sidebar trái
                                    </div>
                                </div>
                                {(pricingResult as any)?.error && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-semibold shadow-inner">
                                        ⚠️ {(pricingResult as any).error}
                                    </div>
                                )}

                                {pricingResult && !(pricingResult as any).error && (
                                    <button 
                                        onClick={() => {
                                            addItem({
                                                name: fileName || 'In Khổ Lớn',
                                                type: 'large_format',
                                                quantity: lfQuantity,
                                                total: ((pricingResult as any).selling_subtotal ?? (pricingResult as any).total) + lfSelectedAcc.reduce((sum, a) => sum + a.price * a.qty, 0),
                                                unitPrice: (pricingResult as any).selling_price_per_item ?? (pricingResult as any).price_per_item,
                                                details: pricingResult,
                                                configParams: { lfWidth, lfHeight, lfMaterialId, lfPrintType },
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
