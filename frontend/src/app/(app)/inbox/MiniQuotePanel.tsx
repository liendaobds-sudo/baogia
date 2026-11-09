'use client';

import { useState, useRef, useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { useQuoteData } from './components/quote/useQuoteData';
import { useQuoteCalculator } from './components/quote/useQuoteCalculator';
import { QuoteProductSelector } from './components/quote/QuoteProductSelector';
import { QuoteFormFields } from './components/quote/QuoteFormFields';
import { QuoteResultDisplay } from './components/quote/QuoteResultDisplay';
import { formatVND } from '@/lib/format/currency';
import Link from 'next/link';

interface MiniQuotePanelProps {
    token: string;
    messages: Array<{ senderType: string; content: string }>;
    onInsertText: (text: string) => void;
}

export default function MiniQuotePanel({ token, messages, onInsertText }: MiniQuotePanelProps) {
    const accSelectRef = useRef<HTMLSelectElement>(null);
    const [selectedAccessories, setSelectedAccessories] = useState<Array<{ id: number; name: string; qty: number; price: number }>>([]);
    const [pendingAccessoryId, setPendingAccessoryId] = useState('');

    const procSelectRef = useRef<HTMLSelectElement>(null);
    const [selectedProcessing, setSelectedProcessing] = useState<Array<{ id: number; name: string; price: number; qty?: number; unit?: string; section?: 'cover' | 'inner'; side?: 'single' | 'double' }>>([]);
    const [pendingProcessingId, setPendingProcessingId] = useState('');

    const lastTemplateCodeRef = useRef<string | undefined>(undefined);
    const lastExtractedProcIdsRef = useRef<string>('');

    // VAT cấp báo giá mini: NGUỒN DUY NHẤT là ô VAT này (mặc định kéo từ company-info, sửa được).
    // Giá trị % được gửi xuống facade làm vat_rate — KHÔNG lấy VAT từ pricing_config.
    const [vatRate, setVatRate] = useState(0);
    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/erp/company-info`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(res => { if (res?.success && res.data?.vat_rate != null) setVatRate(Number(res.data.vat_rate) || 0); })
            .catch(() => {});
    }, [token]);

    const {
        templates,
        selectedTemplate,
        formData,
        masterData,
        autoDetected,
        autoFilledFields,
        handleTemplateChange,
        handleFieldChange,
        getDropdownItems,
    } = useQuoteData(token, messages);

    const calculator = useQuoteCalculator(
        token,
        selectedTemplate,
        formData,
        masterData,
        selectedAccessories,
        selectedProcessing,
        vatRate
    );

    // [MQ-11] Reset danh sách gia công & phụ kiện khi đổi sản phẩm để không rò cấu hình sang sản phẩm mới
    useEffect(() => {
        if (selectedTemplate?.code !== lastTemplateCodeRef.current) {
            lastTemplateCodeRef.current = selectedTemplate?.code;
            lastExtractedProcIdsRef.current = '';
            setSelectedProcessing([]);
            setSelectedAccessories([]);
            setPendingProcessingId('');
            setPendingAccessoryId('');
            calculator.setQuoteResult(null);
        }
    }, [selectedTemplate?.code]);

    // [MQ-09] Tự động nạp danh sách gia công khi AI/Extractor bóc tách được processing_ids từ hội thoại
    useEffect(() => {
        const procIdsStr = (formData['processing_ids'] || '').trim();
        if (!procIdsStr || procIdsStr === lastExtractedProcIdsRef.current) return;
        if (!masterData.processingOptions || masterData.processingOptions.length === 0) return;

        const ids = procIdsStr.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
        if (ids.length === 0) return;

        const printSide = formData['print_side'] || formData['so_mat_in'] || formData['mat_in'] || 'single';
        const matchedItems: Array<{ id: number; name: string; price: number; unit?: string; section?: 'cover' | 'inner'; side?: 'single' | 'double' }> = [];
        for (const id of ids) {
            const proc = masterData.processingOptions.find(p => Number(p.id) === id);
            if (proc) {
                const isLamination = ((proc as any).category || '').startsWith('lamination') || (proc.code || '').includes('can_');
                matchedItems.push({
                    id: Number(proc.id),
                    name: proc.name,
                    price: Number((proc as any).price) || 0,
                    unit: (proc as any).unit,
                    section: 'cover',
                    side: isLamination && printSide === 'double' ? 'double' : 'single',
                });
            }
        }
        if (matchedItems.length > 0) {
            lastExtractedProcIdsRef.current = procIdsStr;
            setSelectedProcessing(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const additions = matchedItems.filter(m => !existingIds.has(m.id));
                return additions.length > 0 ? [...prev, ...additions] : prev;
            });
        }
    }, [formData['processing_ids'], masterData.processingOptions]);

    const mergedHandleFieldChange = (code: string, val: string) => {
        handleFieldChange(code, val);
        calculator.setQuoteResult(null);
    };

    const productType = selectedTemplate?.product_type || 'loose';
    const isOffsetProduct = !!selectedTemplate && !['loose', 'bound', 'large_format'].includes(productType);

    // [MQ-07] & [MQ-08] Link bàn giao sang Báo giá chi tiết (In nhanh hoặc In Offset),
    // mang đầy đủ cấu hình đã chọn (quy đổi kích thước cm -> mm chính xác).
    const buildDetailedHref = () => {
        if (!selectedTemplate?.code) return '/pricing/quotes/new';
        const qty = (formData['quantity'] || formData['so_luong'] || '').trim();
        const wCm = parseFloat(formData['kich_thuoc_w'] || formData['size_w'] || formData['width'] || '0');
        const hCm = parseFloat(formData['kich_thuoc_h'] || formData['size_h'] || formData['height'] || '0');
        const wMm = wCm > 0 ? Math.round(wCm * 10) : 0;
        const hMm = hCm > 0 ? Math.round(hCm * 10) : 0;

        if (isOffsetProduct) {
            const params = new URLSearchParams();
            params.set('prefill_product', productType);
            params.set('prefill_template', selectedTemplate.code);
            if (qty) params.set('prefill_qty', qty);
            if (wMm > 0) params.set('prefill_w', String(wMm));
            if (hMm > 0) params.set('prefill_h', String(hMm));
            if (selectedTemplate.name) params.set('prefill_name', selectedTemplate.name);
            return `/pricing/quotes/offset?${params.toString()}`;
        }

        const params = new URLSearchParams();
        params.set('prefill_template', selectedTemplate.code);
        params.set('prefill_tab', productType);
        if (qty) params.set('prefill_qty', qty);
        if (selectedTemplate.name) params.set('prefill_name', selectedTemplate.name);
        if (wMm > 0) params.set('prefill_w', String(wMm));
        if (hMm > 0) params.set('prefill_h', String(hMm));

        const matId = formData['material'] || formData['vat_lieu'] || formData['chat_lieu'] || '';
        if (matId) params.set('prefill_mat', matId);
        const psId = formData['paper_size'] || formData['kho_giay'] || formData['kich_thuoc_giay'] || '';
        if (psId) params.set('prefill_ps', psId);
        const printSide = formData['print_side'] || formData['so_mat_in'] || formData['mat_in'] || '';
        if (printSide) params.set('prefill_side', printSide);
        const printType = formData['print_type'] || formData['loai_in'] || formData['may_in'] || '';
        if (printType) params.set('prefill_type', printType);
        const shape = formData['shape'] || formData['hinh_dang'] || '';
        if (shape) params.set('prefill_shape', shape);

        // Bound-specific
        const pages = formData['page_count'] || formData['so_trang'] || '';
        if (pages) params.set('prefill_pages', pages);
        const binding = formData['bindingType'] || formData['kieu_dong'] || formData['binding_type'] || '';
        if (binding) params.set('prefill_binding', binding);
        const coverMat = formData['coverMaterial'] || formData['vat_lieu_bia'] || '';
        if (coverMat) params.set('prefill_cover_mat', coverMat);
        const innerMat = formData['innerMaterial'] || formData['vat_lieu_ruot'] || '';
        if (innerMat) params.set('prefill_inner_mat', innerMat);

        if (selectedProcessing.length > 0) {
            params.set('prefill_proc', selectedProcessing.map(p => `${p.id}:${p.side || 'single'}:${p.section || 'cover'}`).join(','));
        }
        if (selectedAccessories.length > 0) {
            params.set('prefill_acc', selectedAccessories.map(a => `${a.id}:${a.qty || 1}`).join(','));
        }
        return `/pricing/quotes/new?${params.toString()}`;
    };

    // Progress tracking — only count required fields
    const isFieldFilled = (f: import('./components/quote/types').ProductField) => {
        if (['kich_thuoc', 'size', 'kich_co', 'dimensions'].includes(f.field_code)) {
            const w = (formData[`${f.field_code}_w`] || formData['kich_thuoc_w'] || '').trim();
            const h = (formData[`${f.field_code}_h`] || formData['kich_thuoc_h'] || '').trim();
            return Boolean(w && h);
        }
        const val = formData[f.field_code]?.trim();
        if (!val) return false;
        const items = getDropdownItems(f);
        if (items.length > 0) return items.some(item => item.value === val);
        return true;
    };
    const requiredFields = selectedTemplate?.fields?.filter(f => f.is_required) || [];
    const templateFilledCount = requiredFields.filter(isFieldFilled).length;
    const templateTotalRequired = requiredFields.length;

    const requiredCodes = new Set(requiredFields.map(f => f.field_code));
    const hasReq = (...codes: string[]) => codes.some(c => requiredCodes.has(c));
    let extraFilled = 0;
    let extraRequired = 0;
    const configured = selectedTemplate?.mini_quote_fields;

    if (productType === 'loose') {
        if ((configured?.includes('item_width') || configured?.includes('item_height')) &&
            !hasReq('kich_thuoc', 'kich_thuoc_w', 'size_w', 'width', 'kich_thuoc_h', 'size_h', 'height')) {
            extraRequired++;
            const hasW = (formData['kich_thuoc_w'] || formData['size_w'] || formData['width'] || '').trim();
            const hasH = (formData['kich_thuoc_h'] || formData['size_h'] || formData['height'] || '').trim();
            if (hasW && hasH) extraFilled++;
        }
    } else if (productType === 'bound') {
        if (!hasReq('kich_thuoc', 'kich_thuoc_w', 'size_w', 'width', 'kich_thuoc_h', 'size_h', 'height')) {
            extraRequired++;
            const hasW = (formData['kich_thuoc_w'] || formData['size_w'] || formData['width'] || '').trim();
            const hasH = (formData['kich_thuoc_h'] || formData['size_h'] || formData['height'] || '').trim();
            if (hasW && hasH) extraFilled++;
        }
        if (!hasReq('page_count', 'so_trang')) { extraRequired++; if (formData['page_count'] || formData['so_trang']) extraFilled++; }
        if (!hasReq('bindingType', 'kieu_dong', 'binding_type')) { extraRequired++; if (formData['bindingType'] || formData['kieu_dong'] || formData['binding_type']) extraFilled++; }
        if (!hasReq('coverMaterial', 'vat_lieu_bia', 'cover_material')) { extraRequired++; if (formData['coverMaterial'] || formData['vat_lieu_bia']) extraFilled++; }
        if (!hasReq('innerMaterial', 'vat_lieu_ruot', 'inner_material', 'material', 'vat_lieu')) { extraRequired++; if (formData['innerMaterial'] || formData['vat_lieu_ruot'] || formData['material']) extraFilled++; }
    } else if (productType === 'large_format') {
        if (!hasReq('kich_thuoc', 'kich_thuoc_w', 'size_w', 'width', 'kich_thuoc_h', 'size_h', 'height')) {
            extraRequired++;
            const hasW = (formData['kich_thuoc_w'] || formData['size_w'] || formData['width'] || '').trim();
            const hasH = (formData['kich_thuoc_h'] || formData['size_h'] || formData['height'] || '').trim();
            if (hasW && hasH) extraFilled++;
        }
    }
    const filledCount = templateFilledCount + extraFilled;
    const totalRequired = templateTotalRequired + extraRequired;
    const progressPercent = totalRequired > 0 ? Math.min(100, Math.round((filledCount / totalRequired) * 100)) : 0;
    const isComplete = filledCount >= totalRequired && totalRequired > 0;

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                <span className="text-xs font-semibold text-indigo-700">Công cụ báo giá nhanh</span>
                <Link href={selectedTemplate ? buildDetailedHref() : '/pricing/quotes/new'} target="_blank" className="text-[11px] bg-white text-indigo-600 px-3 py-1 rounded-full border border-indigo-200 hover:bg-indigo-600 hover:text-white transition-colors shadow-sm font-bold flex items-center gap-1 z-10 relative">
                    {isOffsetProduct ? 'Mở Báo giá Offset \u2192' : 'Sử dụng bảng báo giá chi tiết \u2192'}
                </Link>
            </div>
            <QuoteProductSelector
                templates={templates}
                selectedTemplateCode={selectedTemplate?.code}
                onTemplateChange={handleTemplateChange}
                autoDetected={autoDetected}
            />

            {selectedTemplate ? (
                <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
                    {/* [MQ-08] Thông báo & điều hướng trực tiếp cho sản phẩm In Offset */}
                    {isOffsetProduct && (
                        <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50/90 shadow-sm">
                            <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1">
                                <span>🖨️</span> Sản phẩm In Offset & Khuôn bế ({selectedTemplate.name})
                            </div>
                            <p className="text-[11px] text-amber-700 leading-relaxed mb-2.5">
                                Sản phẩm này sử dụng bộ máy bình bài & khuôn bế Offset chuyên dụng. Bạn có thể nhập nhanh số lượng/kích thước bên dưới rồi chuyển sang bảng Báo giá Offset.
                            </p>
                            <Link
                                href={buildDetailedHref()}
                                target="_blank"
                                className="w-full py-2 px-3 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-md transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                            >
                                <span>📐</span> Mở cấu hình In Offset với thông số đã nhập &rarr;
                            </Link>
                        </div>
                    )}

                    {/* Progress Bar */}
                    <div className={`mb-5 p-3 rounded-md border transition-colors ${isComplete ? 'bg-emerald-50 border-emerald-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className="flex justify-between items-center mb-2">
                            <span className={`text-xs font-bold flex items-center gap-1.5 ${isComplete ? 'text-emerald-700' : 'text-slate-700'}`}>
                                {isComplete ? <><span className="text-[14px]">✅</span> Đã đủ thông tin báo giá</> : <><span className="text-[14px]">📝</span> Hoàn thiện thông tin</>}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                {filledCount} / {totalRequired}
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className={`h-1.5 rounded-full transition-all duration-500 ease-out ${isComplete ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                style={{ width: `${progressPercent}%` }}
                            ></div>
                        </div>
                    </div>

                    <QuoteFormFields
                        selectedTemplate={selectedTemplate}
                        formData={formData}
                        masterData={masterData}
                        autoFilledFields={autoFilledFields}
                        handleFieldChange={mergedHandleFieldChange}
                        getDropdownItems={getDropdownItems}
                        onInsertText={onInsertText}
                    />

                    {/* Processing */}
                    {(!selectedTemplate?.mini_quote_fields || selectedTemplate.mini_quote_fields.includes('processing') || selectedTemplate.mini_quote_fields.includes('gia_cong')) && masterData.processingOptions?.length > 0 && (
                        <div className="mt-4 p-4 bg-rose-50/30 border border-rose-100 rounded-md shadow-sm">
                            <label className="text-xs font-bold text-rose-800 block mb-2.5 px-1 flex items-center gap-1.5">
                                <span className="text-[14px]">✂️</span> Gia công thành phẩm
                            </label>
                            <div className="flex gap-2 mb-3">
                                <select
                                    ref={procSelectRef}
                                    value={pendingProcessingId}
                                    onChange={e => setPendingProcessingId(e.target.value)}
                                    className="flex-1 min-w-0 px-3 py-2 text-sm border border-rose-200 rounded-md bg-white outline-none focus:ring-4 focus:ring-rose-50 focus:border-rose-400 transition-all shadow-sm"
                                >
                                    <option value="">— Chọn gia công —</option>
                                    {masterData.processingOptions
                                        .filter(p => !selectedProcessing.some(sp => sp.id === Number(p.id)))
                                        .map(p => (
                                            <option key={String(p.id)} value={String(p.id)}>
                                                {p.name}{(p as any).price ? ` (${formatVND(Number((p as any).price))}/${(p as any).unit || 'cái'})` : ''}
                                            </option>
                                        ))
                                    }
                                </select>
                                <button
                                    onClick={() => {
                                        const sel = pendingProcessingId;
                                        if (!sel) return;
                                        const proc = masterData.processingOptions.find(p => String(p.id) === sel);
                                        if (proc) {
                                            const isLamination = ((proc as any).category || '').startsWith('lamination') || (proc.code || '').includes('can_');
                                            const printSide = formData['print_side'] || formData['so_mat_in'] || formData['mat_in'] || 'single';
                                            const defaultSide: 'single' | 'double' = (isLamination && printSide === 'double') ? 'double' : 'single';
                                            setSelectedProcessing(prev => [...prev, {
                                                id: Number(proc.id),
                                                name: proc.name,
                                                price: Number((proc as any).price) || 0,
                                                unit: (proc as any).unit,
                                                section: 'cover' as const,
                                                side: defaultSide,
                                            }]);
                                            setPendingProcessingId('');
                                            calculator.setQuoteResult(null);
                                        }
                                    }}
                                    className="shrink-0 px-3.5 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-md shadow-sm transition-colors active:scale-95"
                                >
                                    Thêm
                                </button>
                            </div>
                            {selectedProcessing.length > 0 && (
                                <div className="space-y-1.5">
                                    {selectedProcessing.map((p, i) => (
                                        <div key={p.id} className="flex items-center gap-1.5 p-2 bg-white rounded-md border border-rose-100 shadow-sm">
                                            <span className="flex-1 min-w-0 text-xs font-medium text-slate-700 truncate">{p.name}</span>
                                            {productType === 'bound' && (
                                                <select
                                                    value={p.section || 'cover'}
                                                    onChange={e => {
                                                        const sec = e.target.value as 'cover' | 'inner';
                                                        setSelectedProcessing(prev => prev.map((x, j) => j === i ? { ...x, section: sec } : x));
                                                        calculator.setQuoteResult(null);
                                                    }}
                                                    className="text-[11px] px-1.5 py-1 border border-slate-200 rounded bg-slate-50 outline-none focus:border-rose-400"
                                                    title="Gia công áp dụng cho bìa hay ruột"
                                                >
                                                    <option value="cover">Bìa</option>
                                                    <option value="inner">Ruột</option>
                                                </select>
                                            )}
                                            {/* [MQ-03] Chọn 1 mặt / 2 mặt cho gia công (Cán màng 2 mặt nhân ×2 chi phí khớp Báo giá chính) */}
                                            <select
                                                value={p.side || 'single'}
                                                onChange={e => {
                                                    const newSide = e.target.value as 'single' | 'double';
                                                    setSelectedProcessing(prev => prev.map((x, j) => j === i ? { ...x, side: newSide } : x));
                                                    calculator.setQuoteResult(null);
                                                }}
                                                className="text-[11px] px-1.5 py-1 border border-slate-200 rounded bg-slate-50 outline-none focus:border-rose-400"
                                                title="Áp dụng gia công 1 mặt hay 2 mặt"
                                            >
                                                <option value="single">1 mặt</option>
                                                <option value="double">2 mặt</option>
                                            </select>
                                            {p.price > 0 && (
                                                <span className="text-[11px] font-semibold text-rose-700 min-w-[68px] text-right">
                                                    {formatVND(p.price)}{p.unit ? `/${p.unit}` : ''}
                                                </span>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setSelectedProcessing(prev => prev.filter((_, j) => j !== i));
                                                    calculator.setQuoteResult(null);
                                                }}
                                                className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1 rounded transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Accessories */}
                    {(!selectedTemplate?.mini_quote_fields || selectedTemplate.mini_quote_fields.includes('accessories') || selectedTemplate.mini_quote_fields.includes('phu_kien')) && masterData.accessories?.length > 0 && (
                        <div className="mt-4 p-4 bg-emerald-50/30 border border-emerald-100 rounded-md shadow-sm">
                            <label className="text-xs font-bold text-emerald-800 block mb-2.5 px-1 flex items-center gap-1.5">
                                <span className="text-[14px]">🎁</span> Phụ kiện bổ sung
                            </label>
                            <div className="flex gap-2 mb-3">
                                <select
                                    ref={accSelectRef}
                                    value={pendingAccessoryId}
                                    onChange={e => setPendingAccessoryId(e.target.value)}
                                    className="flex-1 min-w-0 px-3 py-2 text-sm border border-emerald-200 rounded-md bg-white outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition-all shadow-sm"
                                >
                                    <option value="">— Chọn phụ kiện —</option>
                                    {masterData.accessories
                                        .filter(a => !selectedAccessories.some(sa => sa.id === Number(a.id)))
                                        .map(a => (
                                            <option key={String(a.id)} value={String(a.id)}>
                                                {a.name}{(a as any).price ? ` (${formatVND(Number((a as any).price))}/${(a as any).unit || 'cái'})` : ''}
                                            </option>
                                        ))
                                    }
                                </select>
                                <button
                                    onClick={() => {
                                        const sel = pendingAccessoryId;
                                        if (!sel) return;
                                        const acc = masterData.accessories.find(a => String(a.id) === sel);
                                        if (acc) {
                                            setSelectedAccessories(prev => [...prev, {
                                                id: Number(acc.id), name: acc.name,
                                                qty: 1, price: (acc as any).price || 0,
                                            }]);
                                            setPendingAccessoryId('');
                                            calculator.setQuoteResult(null);
                                        }
                                    }}
                                    className="shrink-0 px-3.5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md shadow-sm transition-colors active:scale-95"
                                >
                                    Thêm
                                </button>
                            </div>
                            {selectedAccessories.length > 0 && (
                                <div className="space-y-1.5">
                                    {selectedAccessories.map((a, i) => (
                                        <div key={a.id} className="flex items-center gap-2 p-2 bg-white rounded-md border border-emerald-100 shadow-sm">
                                            <span className="flex-1 min-w-0 text-xs font-medium text-slate-700 truncate">{a.name}</span>
                                            <input
                                                type="number" min={1} value={a.qty}
                                                onChange={e => {
                                                    const newQty = parseInt(e.target.value) || 1;
                                                    setSelectedAccessories(prev => prev.map((x, j) => j === i ? { ...x, qty: newQty } : x));
                                                    calculator.setQuoteResult(null);
                                                }}
                                                className="w-14 px-1 py-1 text-xs text-center border border-slate-200 rounded bg-slate-50 focus:bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 transition-all"
                                            />
                                            <span className="text-[11px] font-semibold text-emerald-700 w-16 text-right">
                                                {a.price ? formatVND(a.price * a.qty) : ''}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    setSelectedAccessories(prev => prev.filter((_, j) => j !== i));
                                                    calculator.setQuoteResult(null);
                                                }}
                                                className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1 rounded transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* VAT cấp báo giá mini — nguồn duy nhất, mặc định từ company-info, sửa được */}
                    <div className="flex items-center justify-between gap-2 mb-3 px-1 mt-4">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <span>🧾</span> Thuế VAT
                        </label>
                        <select
                            value={vatRate}
                            onChange={e => { setVatRate(parseFloat(e.target.value) || 0); calculator.setQuoteResult(null); }}
                            className="text-[12px] font-semibold border border-slate-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                            <option value={0}>Không VAT (0%)</option>
                            <option value={5}>5%</option>
                            <option value={8}>8%</option>
                            <option value={10}>10%</option>
                        </select>
                    </div>

                    <QuoteResultDisplay
                        quoteResult={calculator.quoteResult}
                        selectedTemplate={selectedTemplate}
                        onInsertText={onInsertText}
                        isCalculating={calculator.isCalculating}
                        handleCalculate={calculator.handleCalculate}
                        filledCount={filledCount}
                        totalRequired={totalRequired}
                        detailedHref={buildDetailedHref()}
                    />
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center p-6 text-center">
                    <div className="max-w-[200px] flex flex-col items-center">
                        <div className="text-4xl mb-4 bg-white w-16 h-16 rounded-md flex items-center justify-center shadow-sm border border-slate-100">💰</div>
                        <h3 className="text-slate-800 font-bold mb-1">Chưa chọn sản phẩm</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Vui lòng chọn sản phẩm ở trên hoặc đợi hệ thống tự động nhận diện từ tin nhắn khách hàng.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
