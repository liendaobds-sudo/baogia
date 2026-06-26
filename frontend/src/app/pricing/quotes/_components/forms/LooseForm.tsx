// @ts-nocheck
import React from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { PreviewLayoutSVG } from '../PreviewLayoutSVG';
import { useQuoteConfigurator } from '../_hooks/useQuoteConfigurator';

type QuoteState = ReturnType<typeof useQuoteConfigurator>;

export function LooseForm({ state }: { state: QuoteState }) {
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
        pricingResult, optimizedSizes,
        addItem, productName
    } = state;

    const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    return (

                    <div className="grid grid-cols-1 lg:grid-cols-8 gap-5 w-full">
                        {/* LEFT PANEL: 3 cols */}
                        <div className="lg:col-span-3 flex flex-col gap-4">
                            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 shadow-sm">
                                <div className="border-b border-indigo-200/60 pb-3 mb-3">
                                    <SearchableSelect 
                                        value={selectedTemplateCode} 
                                        onChange={v => {
                                            const syntheticEvent = { target: { value: v.toString() } } as React.ChangeEvent<HTMLSelectElement>;
                                            handleTemplateChange(syntheticEvent);
                                        }}
                                        options={templates.flatMap((group: any) => {
                                            const looseTemplates = group.templates.filter((t: any) => t.product_type === 'loose' || t.product_type === 'offset');
                                            // Nhóm mặc định 'other' (Danh mục chung) → bỏ tiền tố nhóm cho gọn.
                                            return looseTemplates.map((t: any) => ({ id: t.code, label: group.code === 'other' ? t.name : `${group.name} › ${t.name}` }));
                                        })}
                                        placeholder="-- Chọn mẫu sản phẩm rời --"
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="block text-[10px] font-bold text-indigo-700 mb-1 tracking-wide uppercase">Tên File / Sản Phẩm <span className="text-red-500">*</span></label>
                                    <input type="text" value={fileName} onChange={e => setFileName(e.target.value)} placeholder="Nhập tên gọi để phân biệt (VD: Card visit sếp tổng)" className="w-full text-[13px] font-semibold px-2.5 h-8 border border-indigo-200 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white shadow-sm" />
                                </div>
                                
                                <h4 className="font-bold text-[11px] mb-2.5 text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b-2 border-slate-200 pb-1.5">
                                    <span className="bg-indigo-100 text-indigo-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px]">1</span> Thông tin sản phẩm
                                </h4>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-indigo-700 mb-1 tracking-wide uppercase">Số lượng:</label>
                                        <input type="number" min="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="w-full text-xs font-bold px-2 h-8 border border-slate-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none shadow-inner bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-600 mb-1 tracking-wide uppercase">Hình dạng:</label>
                                        <SearchableSelect 
                                            value={shape} 
                                            onChange={v => setShape(v.toString())} 
                                            options={[
                                                { id: 'rectangle', label: 'Lưới (Grid)' },
                                                { id: 'circle', label: 'Sole (tròn/ellip)' },
                                            ]}
                                            placeholder="Hình dạng"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-4 gap-2 mb-4">
                                    <div><label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase">Rộng SP</label><input type="number" value={itemWidth} onChange={e => setItemWidth(Number(e.target.value))} className="w-full text-[11px] font-semibold text-center px-1 h-7 border border-slate-300 rounded outline-none shadow-inner bg-white" /></div>
                                    <div><label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase">Cao SP</label><input type="number" value={itemHeight} onChange={e => setItemHeight(Number(e.target.value))} className="w-full text-[11px] font-semibold text-center px-1 h-7 border border-slate-300 rounded outline-none shadow-inner bg-white" /></div>
                                    <div><label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase">K/c ngang</label><input type="number" value={gapH} onChange={e => setGapH(Number(e.target.value))} className="w-full text-[11px] font-semibold text-center px-1 h-7 border border-slate-300 rounded outline-none shadow-inner bg-white" /></div>
                                    <div><label className="block text-[9px] font-semibold text-slate-500 mb-1 uppercase">K/c dọc</label><input type="number" value={gapV} onChange={e => setGapV(Number(e.target.value))} className="w-full text-[11px] font-semibold text-center px-1 h-7 border border-slate-300 rounded outline-none shadow-inner bg-white" /></div>
                                </div>

                                <h4 className="font-bold text-[11px] mb-2.5 text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b-2 border-slate-200 pb-1.5">
                                    <span className="bg-indigo-100 text-indigo-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px]">2</span> Vật tư & In ấn
                                </h4>
                                <div className="grid grid-cols-4 gap-2 mb-4">
                                    <div className="col-span-2">
                                        <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Giấy in:</label>
                                        <SearchableSelect 
                                            value={materialId} 
                                            onChange={v => setMaterialId(v.toString())} 
                                            options={((masterData?.materials as Array<{id: string, name: string, scopeLoose: boolean}>) || []).filter(m => m.scopeLoose && allowedMaterialIds.includes(String(m.id))).map(m => ({id: m.id.toString(), label: m.name}))}
                                            placeholder={allowedMaterialIds.length ? '-- Chọn giấy in --' : '⚠ Sản phẩm chưa cấu hình giấy in'}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Mặt in:</label>
                                        <SearchableSelect 
                                            value={printSide} 
                                            onChange={v => setPrintSide(v.toString())} 
                                            disabled={lockPrintSide}
                                            options={[
                                                { id: 'single', label: '1 mặt' },
                                                { id: 'double', label: '2 mặt' },
                                            ]}
                                            placeholder="Mặt in"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-600 mb-1 uppercase">Hệ màu:</label>
                                        <SearchableSelect 
                                            value={printType} 
                                            onChange={v => setPrintType(v.toString())} 
                                            disabled={lockPrintType}
                                            options={[
                                                { id: '4c', label: '4 màu (CMYK)' },
                                                { id: '1c', label: '1 màu (Đen/Trắng)' },
                                            ]}
                                            placeholder="Hệ màu"
                                        />
                                    </div>
                                </div>

                                <h4 className="font-bold text-[11px] mb-2 text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b-2 border-slate-200 pb-1.5">
                                    <span className="bg-indigo-100 text-indigo-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px]">3</span> Gia Công & Phụ Kiện
                                </h4>
                                {/* Gia công */}
                                <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200 mb-3 border-dashed">
                                    <h5 className="text-[10px] uppercase font-bold text-slate-600 mb-2">Gia công:</h5>
                                    <div className="grid grid-cols-7 gap-2 mb-2">
                                        <div className="col-span-3">
                                            <SearchableSelect 
                                                value={curProcId} 
                                                onChange={v => setCurProcId(v.toString())} 
                                                options={((masterData?.processing_options as Array<{id: number, name: string}>) || []).filter(p => allowedProcessingIds.includes(String(p.id))).map(p => ({id: p.id.toString(), label: p.name}))}
                                                placeholder={allowedProcessingIds.length ? '-- Tên gia công --' : '⚠ Chưa cấu hình gia công'}
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <SearchableSelect 
                                                value={curProcSide} 
                                                onChange={v => setCurProcSide(v.toString())} 
                                                options={[
                                                    { id: 'single', label: '1 Mặt' },
                                                    { id: 'double', label: '2 Mặt' },
                                                ]}
                                                placeholder="Mặt"
                                            />
                                        </div>
                                        <div className="col-span-1 flex items-end">
                                            <button 
                                                onClick={() => {
                                                    if (!curProcId) return;
                                                    const opt = (masterData?.processing_options as any[])?.find(p => p.id.toString() === curProcId);
                                                    if (opt && !selectedProcessing.find(p => p.id === curProcId)) {
                                                        setSelectedProcessing(prev => [...prev, { id: curProcId, side: curProcSide, name: opt.name }]);
                                                        setCurProcId('');
                                                    }
                                                }}
                                                className="bg-indigo-600 hover:bg-indigo-700 transition shadow-sm text-white w-full h-7 rounded text-[15px] flex items-center justify-center pb-0.5 disabled:opacity-50"
                                                disabled={!curProcId}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                    {selectedProcessing.length > 0 && (
                                        <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-slate-200">
                                            {selectedProcessing.map(p => (
                                                <div key={p.id} className="flex justify-between items-center bg-white border border-slate-200 px-2 py-1 rounded shadow-sm">
                                                    <span className="text-[10px] font-semibold text-slate-700">{p.name} - {p.side === 'single' ? '1 Mặt' : '2 Mặt'}</span>
                                                    <button onClick={() => setSelectedProcessing(prev => prev.filter(x => x.id !== p.id))} className="text-red-500 hover:text-red-700"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Phụ Kiện */}
                                <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-200 border-dashed">
                                    <h5 className="text-[10px] uppercase font-bold text-slate-600 mb-2">Phụ Kiện:</h5>
                                    <div className="grid grid-cols-7 gap-2 mb-2">
                                        <div className="col-span-3">
                                            <SearchableSelect 
                                                value={curAccId} 
                                                onChange={v => setCurAccId(v.toString())} 
                                                options={((masterData?.accessories as Array<{id: number, name: string}>) || []).filter(a => allowedAccessoryIds.includes(String(a.id))).map(a => ({id: a.id.toString(), label: a.name}))}
                                                placeholder="-- Tên phụ kiện --"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <input type="number" min="1" value={curAccQty} onChange={e => setCurAccQty(Number(e.target.value))} placeholder="SL" className="w-full border border-slate-300 rounded px-1.5 text-[11px] h-8 shadow-inner text-center outline-none transition-colors focus:border-indigo-500 bg-white" />
                                        </div>
                                        <div className="col-span-1 flex items-end">
                                            <button 
                                                onClick={() => {
                                                    if (!curAccId || curAccQty < 1) return;
                                                    const opt = (masterData?.accessories as any[])?.find(a => a.id.toString() === curAccId);
                                                    if (opt && !selectedAccessories.find(a => a.id === curAccId)) {
                                                        setSelectedAccessories(prev => [...prev, { id: curAccId, qty: curAccQty, name: opt.name }]);
                                                        setCurAccId('');
                                                        setCurAccQty(1);
                                                    }
                                                }}
                                                className="bg-indigo-600 hover:bg-indigo-700 transition shadow-sm text-white w-full h-7 rounded text-[15px] flex items-center justify-center pb-0.5 disabled:opacity-50"
                                                disabled={!curAccId}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                    {selectedAccessories.length > 0 && (
                                        <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-slate-200">
                                            {selectedAccessories.map(a => (
                                                <div key={a.id} className="flex justify-between items-center bg-white border border-slate-200 px-2 py-1 rounded shadow-sm">
                                                    <span className="text-[10px] font-semibold text-slate-700">{a.name} (x{a.qty})</span>
                                                    <button onClick={() => setSelectedAccessories(prev => prev.filter(x => x.id !== a.id))} className="text-red-500 hover:text-red-700"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* CENTER PANEL: 3 cols */}
                        <div className="lg:col-span-3 flex flex-col min-h-0 overflow-hidden">

                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col flex-1 mb-4 min-h-0">
                                <div className="py-2.5 px-4 border-b border-slate-100 flex items-center bg-slate-50/50">
                                    <svg className="text-indigo-600 mr-2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    <h3 className="font-bold text-[13px] text-slate-700 m-0 uppercase tracking-wide">Hiển Thị Bản In</h3>
                                </div>
                                <div className="bg-slate-100 flex-1 flex items-center justify-center relative inner-shadow p-4 min-h-0 overflow-hidden">
                                    {(masterData?.paper_sizes && paperSizeId && itemWidth > 0 && itemHeight > 0) ? (
                                        <PreviewLayoutSVG masterData={masterData} paperSizeId={paperSizeId} shape={shape} itemWidth={itemWidth} itemHeight={itemHeight} gapH={gapH} gapV={gapV} />
                                    ) : (
                                        <div className="text-slate-400 text-[11px] font-medium flex flex-col items-center gap-2">
                                            <svg className="w-8 h-8 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                            Chưa đủ dữ liệu (Khổ giấy, Kích thước SP)
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)]">
                                <div className="grid grid-cols-3 gap-2.5 text-center">
                                    <div className="bg-blue-50/80 pt-2 pb-2.5 rounded-lg border border-blue-100/60 shadow-sm">
                                        <div className="text-[9px] font-bold text-blue-900 uppercase tracking-widest mb-0.5">Số con/tờ</div>
                                        <div className="text-xl font-black text-blue-600 tracking-tight">{(pricingResult as any)?.breakdown?.items_per_sheet ? Intl.NumberFormat().format((pricingResult as any).breakdown.items_per_sheet) : '-'}</div>
                                    </div>
                                    <div className="bg-emerald-50/80 pt-2 pb-2.5 rounded-lg border border-emerald-100/60 shadow-sm">
                                        <div className="text-[9px] font-bold text-emerald-900 uppercase tracking-widest mb-0.5">Số trang in</div>
                                        <div className="text-xl font-black text-emerald-600 tracking-tight">{(pricingResult as any)?.breakdown?.sheets_needed ? Intl.NumberFormat().format((pricingResult as any).breakdown.sheets_needed) : '-'}</div>
                                    </div>
                                    <div className="bg-amber-50/80 pt-2 pb-2.5 rounded-lg border border-amber-100/60 shadow-sm">
                                        <div className="text-[9px] font-bold text-amber-900 uppercase tracking-widest mb-0.5">Hiệu suất</div>
                                        <div className="text-xl font-black text-amber-600 tracking-tight">{(pricingResult as any)?.breakdown?.efficiency ? `${(pricingResult as any).breakdown.efficiency}%` : '-'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT PANEL: 2 cols */}
                        <div className="lg:col-span-2 flex flex-col gap-4">
                            {/* Paper Size Suggestions - moved here */}
                            {optimizedSizes.length > 0 && (
                                <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                                    <div className="flex items-center gap-2 mb-2">
                                        <svg className="text-blue-500 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 2v6h6M21.5 22v-6h-6"/><path d="M22 11.5A10 10 0 0 0 3.2 7.2M2 12.5a10 10 0 0 0 18.8 4.2"/></svg>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gợi ý khổ giấy</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {optimizedSizes.slice(0, 4).map((opt, i) => {
                                            const isSelected = paperSizeId === opt.id.toString();
                                            const isBest = i === 0;
                                            return (
                                                <div 
                                                    key={opt.id} 
                                                    onClick={() => setPaperSizeId(opt.id.toString())}
                                                    className={`cursor-pointer rounded-lg border px-3 py-2 transition-all flex items-center justify-between gap-2 ${
                                                        isSelected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 
                                                        isBest ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="font-bold text-[12px] text-slate-800 truncate">{opt.name}</span>
                                                        {isBest && <span className="bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded leading-none flex-shrink-0">🏆</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0 text-[11px]">
                                                        <span className="text-slate-500 font-semibold">{opt.itemsPerSheet} tem/tờ</span>
                                                        <span className={`font-extrabold px-1.5 py-0.5 rounded text-[10px] ${opt.eff >= 80 ? 'text-emerald-700 bg-emerald-100' : opt.eff >= 50 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'}`}>{opt.eff}%</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1)] flex-1 relative overflow-hidden">
                                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-slate-50 border border-slate-100 z-0"></div>
                                
                                <h3 className="font-extrabold text-[15px] mb-5 text-slate-800 relative z-10 border-b border-slate-100 pb-3 uppercase tracking-wider flex items-center justify-between">
                                    TỔNG CHI PHÍ
                                </h3>
                                
                                <div className="space-y-4 text-[13px] relative z-10">
                                    {/* In Cost + Breakdown */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center text-slate-600 font-medium">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div> Chi phí in:</span>
                                            <span className="font-bold text-slate-800">{pricingResult ? formatCurrency((pricingResult as any).material_cost) : '-'}</span>
                                        </div>
                                        {(pricingResult as any)?.breakdown?.price_per_sheet > 0 && (
                                            <div className="pl-3 border-l-2 border-blue-200 text-[11px] text-slate-500 font-medium ml-1.5 flex flex-col">
                                                <span>{formatCurrency((pricingResult as any).breakdown.price_per_sheet)}/tờ × {(pricingResult as any).breakdown.sheets_needed} tờ</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Processing Cost + Breakdown */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center text-slate-600 font-medium">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-400"></div> Chi phí gia công:</span>
                                            <span className="font-bold text-slate-800">{pricingResult ? formatCurrency((pricingResult as any).processing_cost) : '-'}</span>
                                        </div>
                                        {(pricingResult as any)?.processing_details?.length > 0 && (
                                            <div className="pl-3 border-l-2 border-green-200 text-[11px] text-slate-500 font-medium ml-1.5 flex flex-col gap-1">
                                                {(pricingResult as any).processing_details.map((pd: any, i: number) => (
                                                    <span key={i}>{pd.name} {pd.sides === 'double' ? '(2m)' : ''}: {formatCurrency(pd.cost)}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Accessories Cost + Breakdown */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center text-slate-600 font-medium">
                                            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div> Chi phí phụ kiện:</span>
                                            <span className="font-bold text-slate-800">{pricingResult && (pricingResult as any).accessories_cost !== undefined ? formatCurrency((pricingResult as any).accessories_cost) : '0 ₫'}</span>
                                        </div>
                                        {(pricingResult as any)?.accessories_details?.length > 0 && (
                                            <div className="pl-3 border-l-2 border-orange-200 text-[11px] text-slate-500 font-medium ml-1.5 flex flex-col gap-1">
                                                {(pricingResult as any).accessories_details.map((ad: any, i: number) => (
                                                    <span key={i}>{ad.name} (x{ad.qty}): {formatCurrency(ad.cost)}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t-2 border-dashed border-slate-200 pt-4 mt-2">
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="text-slate-800 font-extrabold text-sm uppercase">Thành tiền:</span>
                                            <span className="font-black text-2xl text-indigo-600 leading-none tracking-tight">
                                                {pricingResult ? formatCurrency((pricingResult as any).total) : '0 ₫'}
                                            </span>
                                        </div>
                                        <div className="text-right text-[11px] text-slate-500 font-medium tracking-wide">
                                            Đơn giá: <span className="text-slate-700 font-bold">{pricingResult ? formatCurrency((pricingResult as any).price_per_item) : '-'}</span> / sp
                                        </div>
                                        <div className="mt-2 text-[10px] text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-md border border-amber-200 font-medium flex items-center gap-1.5">
                                        <span>💡</span> Giá trên chưa bao gồm VAT và phí giao hàng (cài đặt ở mục Thuế và Phí bên trái)
                                        </div>
                                    </div>
                                </div>
                                
                                {(pricingResult as any)?.error && (
                                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-semibold shadow-inner flex items-start gap-2">
                                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                        {(pricingResult as any).error}
                                    </div>
                                )}
                                
                                {pricingResult && !(pricingResult as any).error && (
                                    <button 
                                        onClick={() => {
                                            addItem({
                                                name: fileName || productName || 'Báo giá In Nhanh Rời',
                                                type: 'loose',
                                                quantity,
                                                total: (pricingResult as any).total,
                                                unitPrice: (pricingResult as any).price_per_item,
                                                details: pricingResult,
                                                configParams: { materialId, paperSizeId, itemWidth, itemHeight, printType, printSide }
                                            });
                                            setFileName('');
                                        }}
                                        className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 text-white font-bold py-3 px-5 rounded-lg text-[13px] transition-all flex items-center justify-center gap-2"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                        THÊM ITEM NÀY VÀO BÁO GIÁ
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
    );
}
