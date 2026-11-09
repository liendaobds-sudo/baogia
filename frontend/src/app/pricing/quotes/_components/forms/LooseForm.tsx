// @ts-nocheck
import React from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { PreviewLayoutSVG } from '../PreviewLayoutSVG';
import { useQuoteConfigurator } from '../_hooks/useQuoteConfigurator';
import { formatVND, StatCard, STAT_TONE } from '../quote-ui';
import { ResizableColumns } from '../ResizableColumns';
import { useTrialMode } from '@/lib/scope/use-trial-mode';
import { useCustomPresets, PresetSaveControls } from '@/lib/quote/use-custom-presets';

type QuoteState = ReturnType<typeof useQuoteConfigurator>;

export function LooseForm({ state }: { state: QuoteState }) {
    const {
        masterData, fileName, setFileName, quantity, setQuantity, materialId, setMaterialId, paperSizeId, setPaperSizeId, printType, setPrintType, printSide, setPrintSide, itemWidth, setItemWidth, itemHeight, setItemHeight, gapH, setGapH, gapV, setGapV, shape, setShape,
        templates, selectedTemplateCode, handleTemplateChange,
        allowedMaterialIds, allowedProcessingIds, allowedPaperSizeIds, allowedAccessoryIds,
        lockPrintSide, lockPrintType, minQuantity = 1, maxQuantity,
        selectedProcessing, setSelectedProcessing, curProcId, setCurProcId, curProcSide, setCurProcSide,
        selectedAccessories, setSelectedAccessories, curAccId, setCurAccId, curAccQty, setCurAccQty,
        pricingResult, lastPricingPayload, calculating, optimizedSizes,
        addItem, updateItem, editingItemId, setEditingItemId, productName
    } = state;

    const { isTrialMode } = useTrialMode();
    const { presets: userPresets, savePreset, deletePreset, resetDefaultPresets } = useCustomPresets('loose');
    const [activeUserPresetId, setActiveUserPresetId] = React.useState<string | null>(null);
    const activeUserPreset = userPresets.find((p) => p.id === activeUserPresetId);
    const formatCurrency = formatVND;
    const isEditingCartItem = Boolean(editingItemId);
    const currentPaper = ((masterData?.paper_sizes as any[]) || []).find(p => String(p.id) === String(paperSizeId));

    const labelCls = "block text-[11px] font-semibold text-slate-600 mb-1.5";
    const inputCls = "w-full text-[13px] font-semibold text-slate-800 px-2.5 h-8 border border-slate-300 rounded-md focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white transition-colors";

    return (
        <ResizableColumns storageKey="zp.quote.cols.loose" defaultRatios={[0.35, 0.39, 0.26]} className="w-full h-full">
            {/* LEFT PANEL: Cấu hình — đồng bộ nền trắng phẳng sạch như cột Tổng chi phí */}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3.5 shrink-0">
                        <h3 className="font-extrabold text-[14px] text-slate-800 uppercase tracking-wider m-0">
                            CẤU HÌNH SẢN PHẨM
                        </h3>
                        {selectedTemplateCode && (
                            <button
                                type="button"
                                onClick={() => {
                                    const syntheticEvent = { target: { value: '' } } as React.ChangeEvent<HTMLSelectElement>;
                                    handleTemplateChange(syntheticEvent);
                                }}
                                className="text-[11px] font-semibold text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                                Đặt lại mẫu
                            </button>
                        )}
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 -mr-1 space-y-4">
                        {/* Chọn mẫu & Tên sản phẩm (đã tích hợp sẵn nhóm Mẫu gợi ý nhanh vào đầu dropdown) */}
                        <div className="space-y-3">
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-[11px] font-semibold text-slate-600 m-0">Mẫu sản phẩm</label>
                                    <PresetSaveControls
                                        defaultLabel={fileName || (itemWidth && itemHeight ? `SP rời ${itemWidth}×${itemHeight}mm (${quantity}c)` : '')}
                                        activeCustomPresetId={activeUserPresetId}
                                        activeCustomPresetLabel={activeUserPreset?.label}
                                        hasAnyPreset={userPresets.length > 0}
                                        onResetDefaults={resetDefaultPresets}
                                        onSave={(lbl, updateId) => {
                                            const saved = savePreset(lbl, fileName || lbl, {
                                                w: itemWidth,
                                                h: itemHeight,
                                                qty: quantity,
                                                side: printSide,
                                                shape,
                                                printType,
                                                materialId,
                                                paperSizeId,
                                                gapH,
                                                gapV,
                                                selectedProcessing,
                                                selectedAccessories,
                                            }, updateId);
                                            setActiveUserPresetId(saved.id);
                                        }}
                                        onDelete={(id) => {
                                            deletePreset(id);
                                            setActiveUserPresetId(null);
                                        }}
                                    />
                                </div>
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
                                            if (d.w) setItemWidth(d.w);
                                            if (d.h) setItemHeight(d.h);
                                            if (d.qty) setQuantity(d.qty);
                                            if (d.side) setPrintSide(d.side);
                                            if (d.shape) setShape(d.shape);
                                            if (d.printType) setPrintType(d.printType);
                                            if (d.materialId) setMaterialId(d.materialId);
                                            if (d.paperSizeId) setPaperSizeId(d.paperSizeId);
                                            if (d.gapH != null) setGapH(d.gapH);
                                            if (d.gapV != null) setGapV(d.gapV);
                                            if (Array.isArray(d.selectedProcessing)) setSelectedProcessing(d.selectedProcessing);
                                            if (Array.isArray(d.selectedAccessories)) setSelectedAccessories(d.selectedAccessories);
                                            return;
                                        }
                                        setActiveUserPresetId(null);
                                        const syntheticEvent = { target: { value: val } } as React.ChangeEvent<HTMLSelectElement>;
                                        handleTemplateChange(syntheticEvent);
                                    }}
                                    options={[
                                        ...userPresets.map((up) => ({ id: up.id, label: up.label, group: 'Mẫu gợi ý nhanh (Sửa / Xoá được)' })),
                                        ...templates.flatMap((group: any) => {
                                            const looseTemplates = group.templates.filter((t: any) => t.product_type === 'loose' || t.product_type === 'offset');
                                            return looseTemplates.map((t: any) => ({ id: t.code, label: t.name, group: group.code === 'other' ? undefined : group.name }));
                                        }),
                                    ]}
                                    placeholder="-- Chọn mẫu sản phẩm rời --"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>
                                    Tên sản phẩm / Hạng mục <span className="text-slate-400 font-normal text-[10px]">(hiển thị trên báo giá)</span>
                                </label>
                                <input
                                    type="text"
                                    value={fileName}
                                    onChange={e => setFileName(e.target.value)}
                                    placeholder="VD: Card visit hộp 100c, Tờ rơi A5..."
                                    className={inputCls}
                                />
                            </div>
                        </div>

                        {/* 1. Thông tin sản phẩm */}
                        <div className="border-t border-slate-100 pt-3.5 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">1. Quy cách & Kích thước</span>
                                <div className="flex items-center gap-1">
                                    {[
                                        { label: '90×54', w: 90, h: 54, title: 'Card visit (90×54 mm)' },
                                        { label: 'A6', w: 105, h: 148, title: 'Khổ A6 (105×148 mm)' },
                                        { label: 'A5', w: 148, h: 210, title: 'Khổ A5 (148×210 mm)' },
                                        { label: 'A4', w: 210, h: 297, title: 'Khổ A4 (210×297 mm)' },
                                    ].map(preset => {
                                        const active = itemWidth === preset.w && itemHeight === preset.h;
                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                title={preset.title}
                                                onClick={() => { setItemWidth(preset.w); setItemHeight(preset.h); }}
                                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                                    active
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>
                                        Số lượng thành phẩm {minQuantity > 1 && <span className="text-[10px] font-normal text-indigo-600">(Tối thiểu: {minQuantity.toLocaleString()})</span>}
                                    </label>
                                    <input
                                        type="number"
                                        min={minQuantity || 1}
                                        max={maxQuantity}
                                        value={quantity}
                                        onChange={e => setQuantity(Number(e.target.value))}
                                        onBlur={() => {
                                            if (minQuantity > 1 && quantity < minQuantity) setQuantity(minQuantity);
                                            else if (maxQuantity && quantity > maxQuantity) setQuantity(maxQuantity);
                                        }}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Kiểu bình bài</label>
                                    <SearchableSelect
                                        value={shape}
                                        onChange={v => setShape(v.toString())}
                                        options={[
                                            { id: 'rectangle', label: 'Lưới thẳng (Grid)' },
                                            { id: 'circle', label: 'Sole (Tròn / Ellip)' },
                                        ]}
                                        placeholder="Kiểu xếp"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Rộng (mm)</label>
                                    <input type="number" value={itemWidth} onChange={e => setItemWidth(Number(e.target.value))} className="w-full text-[12px] font-semibold text-center px-1.5 h-8 border border-slate-300 rounded-md focus:border-indigo-500 outline-none bg-white" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Cao (mm)</label>
                                    <input type="number" value={itemHeight} onChange={e => setItemHeight(Number(e.target.value))} className="w-full text-[12px] font-semibold text-center px-1.5 h-8 border border-slate-300 rounded-md focus:border-indigo-500 outline-none bg-white" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">K/c ngang</label>
                                    <input type="number" value={gapH} onChange={e => setGapH(Number(e.target.value))} className="w-full text-[12px] font-semibold text-center px-1.5 h-8 border border-slate-300 rounded-md focus:border-indigo-500 outline-none bg-white" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">K/c dọc</label>
                                    <input type="number" value={gapV} onChange={e => setGapV(Number(e.target.value))} className="w-full text-[12px] font-semibold text-center px-1.5 h-8 border border-slate-300 rounded-md focus:border-indigo-500 outline-none bg-white" />
                                </div>
                            </div>
                        </div>

                        {/* 2. Vật tư & In ấn */}
                        <div className="border-t border-slate-100 pt-3.5 space-y-3">
                            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">2. Vật tư & In ấn</span>
                            <div>
                                <label className={labelCls}>Chất liệu giấy</label>
                                <SearchableSelect
                                    value={materialId}
                                    onChange={v => setMaterialId(v.toString())}
                                    options={((masterData?.materials as Array<{ id: string; name: string; scopeLoose: boolean; has_pricing_tier?: boolean }>) || [])
                                        .filter(m => m.scopeLoose && (!selectedTemplateCode || allowedMaterialIds.length === 0 || allowedMaterialIds.includes(String(m.id))))
                                        .map(m => ({ id: m.id.toString(), label: m.has_pricing_tier === false ? `${m.name} ⚠ (chưa có định mức)` : m.name }))}
                                    placeholder={(!selectedTemplateCode || allowedMaterialIds.length) ? '-- Chọn giấy in --' : '⚠ Sản phẩm chưa cấu hình giấy in'}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Số mặt in</label>
                                    <SearchableSelect
                                        value={printSide}
                                        onChange={v => setPrintSide(v.toString())}
                                        disabled={lockPrintSide}
                                        options={[
                                            { id: 'single', label: 'In 1 mặt' },
                                            { id: 'double', label: 'In 2 mặt' },
                                        ]}
                                        placeholder="Mặt in"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Hệ màu</label>
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
                        </div>

                        {/* 3. Gia công & Phụ kiện — phẳng, không đóng khung lồng nhau */}
                        <div className="border-t border-slate-100 pt-3.5 space-y-3">
                            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">3. Gia công & Phụ kiện</span>

                            {/* Gia công */}
                            <div>
                                <label className={labelCls}>Gia công sau in</label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <SearchableSelect
                                            value={curProcId}
                                            onChange={v => setCurProcId(v.toString())}
                                            options={((masterData?.processing_options as Array<{ id: number; name: string; scope_loose?: number }>) || [])
                                                .filter(p => (!selectedTemplateCode || allowedProcessingIds.length === 0) ? (p.scope_loose !== 0) : allowedProcessingIds.includes(String(p.id)))
                                                .map(p => ({ id: p.id.toString(), label: p.name }))}
                                            placeholder={(!selectedTemplateCode || allowedProcessingIds.length) ? '-- Chọn gia công --' : '⚠ Chưa cấu hình gia công'}
                                        />
                                    </div>
                                    <div className="w-[88px] shrink-0">
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
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!curProcId) return;
                                            const opt = (masterData?.processing_options as any[])?.find(p => p.id.toString() === curProcId);
                                            if (opt && !selectedProcessing.find(p => p.id === curProcId)) {
                                                setSelectedProcessing(prev => [...prev, { id: curProcId, side: curProcSide, name: opt.name }]);
                                                setCurProcId('');
                                            }
                                        }}
                                        className="bg-indigo-600 hover:bg-indigo-700 transition text-white w-8 h-8 shrink-0 rounded-md text-[15px] font-bold flex items-center justify-center disabled:opacity-40"
                                        disabled={!curProcId}
                                        title="Thêm gia công"
                                    >
                                        +
                                    </button>
                                </div>
                                {selectedProcessing.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {selectedProcessing.map(p => (
                                            <span key={p.id} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-700">
                                                <span>{p.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedProcessing(prev => prev.map(x => x.id === p.id ? { ...x, side: x.side === 'single' ? 'double' : 'single' } : x))}
                                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                                                    title="Bấm để đổi 1 Mặt / 2 Mặt"
                                                >
                                                    {p.side === 'single' ? '1m' : '2m'}
                                                </button>
                                                <button type="button" onClick={() => setSelectedProcessing(prev => prev.filter(x => x.id !== p.id))} className="text-slate-400 hover:text-red-600 font-bold leading-none" title="Xóa gia công">
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Phụ kiện */}
                            <div>
                                <label className={labelCls}>Phụ kiện kèm theo</label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        <SearchableSelect
                                            value={curAccId}
                                            onChange={v => setCurAccId(v.toString())}
                                            options={((masterData?.accessories as Array<{ id: number; name: string }>) || [])
                                                .filter(a => !selectedTemplateCode || allowedAccessoryIds.length === 0 || allowedAccessoryIds.includes(String(a.id)))
                                                .map(a => ({ id: a.id.toString(), label: a.name }))}
                                            placeholder="-- Chọn phụ kiện --"
                                        />
                                    </div>
                                    <input
                                        type="number"
                                        min="1"
                                        value={curAccQty}
                                        onChange={e => setCurAccQty(Number(e.target.value))}
                                        placeholder="SL"
                                        title="Số lượng phụ kiện"
                                        className="w-[72px] shrink-0 border border-slate-300 rounded-md px-2 text-[12px] font-semibold h-8 text-center outline-none focus:border-indigo-500 bg-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!curAccId || curAccQty < 1) return;
                                            const opt = (masterData?.accessories as any[])?.find(a => a.id.toString() === curAccId);
                                            if (opt && !selectedAccessories.find(a => a.id === curAccId)) {
                                                setSelectedAccessories(prev => [...prev, { id: curAccId, qty: curAccQty, name: opt.name }]);
                                                setCurAccId('');
                                                setCurAccQty(1);
                                            }
                                        }}
                                        className="bg-indigo-600 hover:bg-indigo-700 transition text-white w-8 h-8 shrink-0 rounded-md text-[15px] font-bold flex items-center justify-center disabled:opacity-40"
                                        disabled={!curAccId}
                                        title="Thêm phụ kiện"
                                    >
                                        +
                                    </button>
                                </div>
                                {selectedAccessories.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {selectedAccessories.map(a => (
                                            <span key={a.id} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md text-[11px] font-semibold text-slate-700">
                                                <span>{a.name}</span>
                                                <span className="text-[10px] font-bold text-slate-600 bg-slate-200/70 px-1.5 py-0.5 rounded">×{a.qty}</span>
                                                <button type="button" onClick={() => setSelectedAccessories(prev => prev.filter(x => x.id !== a.id))} className="text-slate-400 hover:text-red-600 font-bold leading-none" title="Xóa phụ kiện">
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CENTER PANEL: Hiển thị Bản In + Chỉ số + Gợi ý khổ giấy */}
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] flex flex-col flex-1 min-h-[260px]">
                    <div className="py-2.5 px-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                        <div className="flex items-center">
                            <svg className="text-indigo-600 mr-2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <h3 className="font-extrabold text-[14px] text-slate-800 m-0 uppercase tracking-wider">Hiển Thị Bản In</h3>
                        </div>
                        {currentPaper && (
                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                                {currentPaper.name}
                            </span>
                        )}
                    </div>
                    <div className="bg-slate-100 flex-1 flex items-center justify-center relative inner-shadow p-3 min-h-0 overflow-hidden">
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

                {/* 3 Thẻ chỉ số bình bài */}
                <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] shrink-0">
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <StatCard label="Số con/tờ" tone={STAT_TONE.blue} value={(pricingResult as any)?.breakdown?.items_per_sheet ? Intl.NumberFormat().format((pricingResult as any).breakdown.items_per_sheet) : '-'} />
                        <StatCard label="Số trang in" tone={STAT_TONE.emerald} value={(pricingResult as any)?.breakdown?.sheets_needed ? Intl.NumberFormat().format((pricingResult as any).breakdown.sheets_needed) : '-'} />
                        <StatCard label="Hiệu suất" tone={STAT_TONE.amber} value={(pricingResult as any)?.breakdown?.efficiency ? `${(pricingResult as any).breakdown.efficiency}%` : '-'} />
                    </div>
                </div>

                {/* GỢI Ý KHỔ GIẤY — đặt ngay dưới Hiển thị bản in & Chỉ số bình bài */}
                {optimizedSizes.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm shrink-0">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                                <svg className="text-indigo-500 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M2.5 2v6h6M21.5 22v-6h-6" /><path d="M22 11.5A10 10 0 0 0 3.2 7.2M2 12.5a10 10 0 0 0 18.8 4.2" /></svg>
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Gợi ý khổ giấy tối ưu</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">Bấm để đổi khổ in</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {optimizedSizes.slice(0, 4).map((opt, i) => {
                                const isSelected = paperSizeId === opt.id.toString();
                                const isBest = i === 0;
                                return (
                                    <button
                                        type="button"
                                        key={opt.id}
                                        onClick={() => setPaperSizeId(opt.id.toString())}
                                        className={`cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-all flex flex-col gap-1 ${
                                            isSelected
                                                ? 'border-indigo-500 bg-indigo-50/90 ring-2 ring-indigo-200'
                                                : isBest
                                                    ? 'border-emerald-400 bg-emerald-50/60 hover:bg-emerald-50'
                                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-1 w-full">
                                            <span className="font-bold text-[11px] text-slate-800 truncate" title={opt.name}>{opt.name}</span>
                                            {isBest && (
                                                <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded leading-none shrink-0">
                                                    🏆 Tối ưu
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between gap-1 w-full text-[10px]">
                                            <span className="text-slate-600 font-semibold">{opt.itemsPerSheet} con/tờ · {opt.sheets} tờ</span>
                                            <span className={`font-extrabold px-1.5 py-0.5 rounded text-[10px] shrink-0 ${
                                                opt.eff >= 80 ? 'text-emerald-700 bg-emerald-100' : opt.eff >= 50 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'
                                            }`}>
                                                {opt.eff}%
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT PANEL: Tổng chi phí (luôn ghim đáy nút THÊM VÀO BÁO GIÁ) */}
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] flex-1 min-h-0 flex flex-col relative">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3.5 shrink-0">
                        <h3 className="font-extrabold text-[14px] text-slate-800 uppercase tracking-wider m-0">
                            TỔNG CHI PHÍ
                        </h3>
                        {calculating && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Đang tính...
                            </span>
                        )}
                    </div>

                    {/* Vùng cuộn các dòng chi phí */}
                    <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 -mr-1 space-y-3 text-[13px] transition-opacity ${calculating ? 'opacity-60' : 'opacity-100'}`}>
                        {/* Chi phí in + Bậc định mức */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Chi phí in:</span>
                                <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{pricingResult ? formatCurrency((pricingResult as any).material_cost) : '-'}</span>
                            </div>
                            {!isTrialMode && (pricingResult as any)?.breakdown?.price_per_sheet > 0 && (
                                <div className="pl-3 border-l-2 border-blue-200 text-[11px] text-slate-500 font-medium ml-1.5 flex flex-col gap-0.5">
                                    <span>
                                        {formatCurrency((pricingResult as any).breakdown.price_per_sheet)}/tờ × {(pricingResult as any).breakdown.total_sheets ?? (pricingResult as any).breakdown.sheets_needed} tờ (in {(pricingResult as any).breakdown.sheets_needed} + bù hao {(pricingResult as any).breakdown.waste_sheets ?? 0})
                                    </span>
                                    {(pricingResult as any).breakdown.tier_from != null && (
                                        <span className="text-[10px] text-indigo-600 font-semibold">
                                            🏷️ Bậc định mức: {(pricingResult as any).breakdown.tier_from} → {(pricingResult as any).breakdown.tier_to && (pricingResult as any).breakdown.tier_to < 999999 ? (pricingResult as any).breakdown.tier_to : 'Trở lên'} tờ
                                        </span>
                                    )}
                                    {(pricingResult as any).breakdown.next_tier && (
                                        <button
                                            type="button"
                                            onClick={() => setQuantity((pricingResult as any).breakdown.next_tier.min_product_qty)}
                                            className="mt-1 text-left text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md px-2 py-1.5 font-semibold transition-colors leading-snug"
                                        >
                                            💡 Tăng lên <b>{(pricingResult as any).breakdown.next_tier.min_product_qty.toLocaleString()} SP</b> ({(pricingResult as any).breakdown.next_tier.sheets_from} tờ) → giá vốn giảm còn <b>{formatCurrency((pricingResult as any).breakdown.next_tier.price_per_sheet)}/tờ</b> <span className="underline ml-1 font-bold">[Áp dụng]</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Chi phí gia công */}
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Chi phí gia công:</span>
                                <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{pricingResult ? formatCurrency((pricingResult as any).processing_cost) : '-'}</span>
                            </div>
                            {(pricingResult as any)?.processing_details?.length > 0 && (
                                <div className="pl-3 border-l-2 border-emerald-200 text-[11px] text-slate-500 font-medium ml-1.5 flex flex-col gap-0.5">
                                    {(pricingResult as any).processing_details.map((pd: any, i: number) => (
                                        <span key={i} className="flex justify-between gap-2">
                                            <span className="truncate">{pd.name} {pd.sides === 'double' ? '(2m)' : ''}</span>
                                            <span className="whitespace-nowrap shrink-0">{formatCurrency(pd.cost)}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Chi phí phụ kiện */}
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center text-slate-600 font-medium gap-2">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span> Chi phí phụ kiện:</span>
                                <span className="font-bold text-slate-800 whitespace-nowrap shrink-0">{pricingResult && (pricingResult as any).accessories_cost !== undefined ? formatCurrency((pricingResult as any).accessories_cost) : '0 ₫'}</span>
                            </div>
                            {(pricingResult as any)?.accessories_details?.length > 0 && (
                                <div className="pl-3 border-l-2 border-orange-200 text-[11px] text-slate-500 font-medium ml-1.5 flex flex-col gap-0.5">
                                    {(pricingResult as any).accessories_details.map((ad: any, i: number) => (
                                        <span key={i} className="flex justify-between gap-2">
                                            <span className="truncate">{ad.name} (×{ad.qty})</span>
                                            <span className="whitespace-nowrap shrink-0">{formatCurrency(ad.cost)}</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Lợi nhuận định mức (Markup) */}
                        {!isTrialMode && pricingResult && Number((pricingResult as any).selling_subtotal ?? 0) > Number((pricingResult as any).cost_subtotal ?? (pricingResult as any).total ?? 0) && (
                            <div className="flex justify-between items-center text-slate-600 text-[12px] pt-1 gap-2">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Lợi nhuận định mức:</span>
                                <span className="font-bold text-indigo-700 whitespace-nowrap shrink-0">
                                    +{formatCurrency(Number((pricingResult as any).selling_subtotal ?? 0) - Number((pricingResult as any).cost_subtotal ?? (pricingResult as any).total ?? 0))}
                                </span>
                            </div>
                        )}

                        {(pricingResult as any)?.error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-semibold shadow-inner flex items-start gap-2">
                                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                <div className="flex-1">
                                    <div>{(pricingResult as any).error}</div>
                                    <div className="mt-1.5 flex flex-wrap gap-2">
                                        <a href="/pricing/settings/pricing-tiers" className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded hover:bg-indigo-50">→ Mở Định mức In Nhanh</a>
                                        {selectedTemplateCode && <a href="/pricing/products" className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded hover:bg-slate-50">→ Cấu hình Sản phẩm</a>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Khối cố định đáy: Thành tiền + Nút Thêm vào báo giá */}
                    <div className="border-t-2 border-dashed border-slate-200 pt-3 mt-3 shrink-0 bg-white">
                        <div className="flex justify-between items-end mb-1 gap-2">
                            <span className="text-slate-800 font-extrabold text-xs uppercase">Thành tiền (trước VAT):</span>
                            <span className="font-black text-2xl text-indigo-600 leading-none tracking-tight whitespace-nowrap">
                                {pricingResult && !(pricingResult as any).error ? formatCurrency((pricingResult as any).selling_subtotal ?? (pricingResult as any).total) : '0 ₫'}
                            </span>
                        </div>
                        <div className="text-right text-[11px] text-slate-500 font-medium tracking-wide">
                            Đơn giá: <span className="text-slate-700 font-bold">{pricingResult && !(pricingResult as any).error ? formatCurrency((pricingResult as any).selling_price_per_item ?? (pricingResult as any).price_per_item) : '-'}</span> / sp
                        </div>

                        {pricingResult && !(pricingResult as any).error && (
                            <div className="mt-3 flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    disabled={calculating}
                                    onClick={() => {
                                        const mats = (masterData?.materials as any[]) || [];
                                        const papers = (masterData?.paper_sizes as any[]) || [];
                                        const mat = mats.find(m => String(m.id) === String(materialId));
                                        const paper = papers.find(p => String(p.id) === String(paperSizeId));
                                        const procNames = selectedProcessing.map(p => p.name || p.id).filter(Boolean);
                                        const itemPayload = {
                                            name: fileName.trim() || productName || 'Báo giá In Nhanh Rời',
                                            type: 'loose' as const,
                                            quantity,
                                            total: (pricingResult as any).selling_subtotal ?? (pricingResult as any).total,
                                            unitPrice: (pricingResult as any).selling_price_per_item ?? (pricingResult as any).price_per_item,
                                            details: pricingResult,
                                            configParams: {
                                                materialId, paperSizeId, itemWidth, itemHeight, gapH, gapV, shape, printType, printSide,
                                                materialName: mat?.name || mat?.name_vi || '',
                                                paperSizeName: paper?.name || paper?.name_vi || '',
                                                processingNames: procNames,
                                                selectedProcessing,
                                                selectedAccessories,
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
        </ResizableColumns>
    );
}
