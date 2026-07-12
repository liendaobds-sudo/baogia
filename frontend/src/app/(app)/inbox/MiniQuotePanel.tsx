'use client';

import { useState, useRef, useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { useQuoteData } from './components/quote/useQuoteData';
import { useQuoteCalculator } from './components/quote/useQuoteCalculator';
import { QuoteProductSelector } from './components/quote/QuoteProductSelector';
import { QuoteFormFields } from './components/quote/QuoteFormFields';
import { QuoteResultDisplay } from './components/quote/QuoteResultDisplay';
import { FIELD_CATEGORY_FILTER } from './components/quote/types';
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
    const [selectedProcessing, setSelectedProcessing] = useState<Array<{ id: number; name: string; price: number; qty?: number; unit?: string; section?: 'cover' | 'inner' }>>([]);
    const [pendingProcessingId, setPendingProcessingId] = useState('');

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

    const mergedHandleFieldChange = (code: string, val: string) => {
        handleFieldChange(code, val);
        calculator.setQuoteResult(null);
    };

    // Link bàn giao sang Báo giá chi tiết, mang theo template + tab + số lượng + tên.
    // KHÔNG mang kích thước (mini dùng cm, thủ công dùng mm — tránh sai đơn vị);
    // KHÔNG mang vật liệu/gia công (để nhân viên chọn theo whitelist).
    const buildDetailedHref = () => {
        if (!selectedTemplate?.code) return '/pricing/quotes/new';
        const qty = (formData['quantity'] || formData['so_luong'] || '').trim();
        const params = new URLSearchParams();
        params.set('prefill_template', selectedTemplate.code);
        params.set('prefill_tab', selectedTemplate.product_type || 'loose');
        if (qty) params.set('prefill_qty', qty);
        if (selectedTemplate.name) params.set('prefill_name', selectedTemplate.name);
        return `/pricing/quotes/new?${params.toString()}`;
    };

    // Progress tracking — only count required fields
    const isFieldFilled = (f: import('./components/quote/types').ProductField) => {
        const val = formData[f.field_code]?.trim();
        if (!val) return false;
        const items = getDropdownItems(f);
        if (items.length > 0) return items.some(item => item.value === val);
        return true;
    };
    const requiredFields = selectedTemplate?.fields?.filter(f => f.is_required) || [];
    const templateFilledCount = requiredFields.filter(isFieldFilled).length;
    const templateTotalRequired = requiredFields.length;

    // Cờ is_required của template là nguồn chính. Các trường "cấu trúc" theo
    // product_type (kích thước, page_count, đóng cuốn, vật liệu bìa/ruột) thường
    // được bơm ngoài mảng fields; chỉ tính bổ sung khi template CHƯA khai báo
    // is_required cho chúng (tránh đếm trùng, và tôn trọng metadata template).
    const productType = selectedTemplate?.product_type || 'loose';
    const requiredCodes = new Set(requiredFields.map(f => f.field_code));
    const hasReq = (...codes: string[]) => codes.some(c => requiredCodes.has(c));
    let extraFilled = 0;
    let extraRequired = 0;
    const configured = selectedTemplate?.mini_quote_fields;

    if (productType === 'loose') {
        // Kích thước (item_width + item_height) nếu được cấu hình và chưa là field bắt buộc của template
        if ((configured?.includes('item_width') || configured?.includes('item_height')) &&
            !hasReq('kich_thuoc_w', 'size_w', 'width', 'kich_thuoc_h', 'size_h', 'height')) {
            extraRequired++;
            const hasW = (formData['kich_thuoc_w'] || formData['size_w'] || formData['width'] || '').trim();
            const hasH = (formData['kich_thuoc_h'] || formData['size_h'] || formData['height'] || '').trim();
            if (hasW && hasH) extraFilled++;
        }
    } else if (productType === 'bound') {
        if (!hasReq('page_count', 'so_trang')) { extraRequired++; if (formData['page_count'] || formData['so_trang']) extraFilled++; }
        if (!hasReq('bindingType', 'kieu_dong', 'binding_type')) { extraRequired++; if (formData['bindingType'] || formData['kieu_dong'] || formData['binding_type']) extraFilled++; }
        if (!hasReq('coverMaterial', 'vat_lieu_bia', 'cover_material')) { extraRequired++; if (formData['coverMaterial'] || formData['vat_lieu_bia']) extraFilled++; }
        if (!hasReq('innerMaterial', 'vat_lieu_ruot', 'inner_material', 'material', 'vat_lieu')) { extraRequired++; if (formData['innerMaterial'] || formData['vat_lieu_ruot'] || formData['material']) extraFilled++; }
    } else if (productType === 'large_format') {
        if (!hasReq('kich_thuoc_w', 'size_w', 'width', 'kich_thuoc_h', 'size_h', 'height')) {
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
                    Sử dụng bảng báo giá chi tiết &rarr;
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
                                    className="flex-1 px-3 py-2 text-sm border border-rose-200 rounded-md bg-white outline-none focus:ring-4 focus:ring-rose-50 focus:border-rose-400 transition-all shadow-sm"
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
                                            setSelectedProcessing(prev => [...prev, {
                                                id: Number(proc.id), name: proc.name, price: (proc as any).price || 0, unit: (proc as any).unit, section: 'cover' as const
                                            }]);
                                            setPendingProcessingId('');
                                        }
                                    }}
                                    className="px-3.5 py-2 text-sm bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-md shadow-sm transition-colors active:scale-95"
                                >
                                    Thêm
                                </button>
                            </div>
                            {selectedProcessing.length > 0 && (
                                <div className="space-y-1.5">
                                    {selectedProcessing.map((p, i) => (
                                        <div key={p.id} className="flex items-center gap-2 p-2 bg-white rounded-md border border-rose-100 shadow-sm">
                                            <span className="flex-1 text-xs font-medium text-slate-700 truncate">{p.name}</span>
                                            {productType === 'bound' && (
                                                <select
                                                    value={p.section || 'cover'}
                                                    onChange={e => {
                                                        const sec = e.target.value as 'cover' | 'inner';
                                                        setSelectedProcessing(prev => prev.map((x, j) => j === i ? { ...x, section: sec } : x));
                                                    }}
                                                    className="text-[11px] px-1.5 py-1 border border-slate-200 rounded bg-slate-50 outline-none focus:border-rose-400"
                                                    title="Gia công áp dụng cho bìa hay ruột"
                                                >
                                                    <option value="cover">Bìa</option>
                                                    <option value="inner">Ruột</option>
                                                </select>
                                            )}
                                            {p.price > 0 && (
                                                <span className="text-[11px] font-semibold text-rose-700 w-20 text-right">
                                                    {formatVND(p.price)}{p.unit ? `/${p.unit}` : ''}
                                                </span>
                                            )}
                                            <button
                                                onClick={() => setSelectedProcessing(prev => prev.filter((_, j) => j !== i))}
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
                                    className="flex-1 px-3 py-2 text-sm border border-emerald-200 rounded-md bg-white outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition-all shadow-sm"
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
                                        }
                                    }}
                                    className="px-3.5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-md shadow-sm transition-colors active:scale-95"
                                >
                                    Thêm
                                </button>
                            </div>
                            {selectedAccessories.length > 0 && (
                                <div className="space-y-1.5">
                                    {selectedAccessories.map((a, i) => (
                                        <div key={a.id} className="flex items-center gap-2 p-2 bg-white rounded-md border border-emerald-100 shadow-sm">
                                            <span className="flex-1 text-xs font-medium text-slate-700 truncate">{a.name}</span>
                                            <input
                                                type="number" min={1} value={a.qty}
                                                onChange={e => {
                                                    const newQty = parseInt(e.target.value) || 1;
                                                    setSelectedAccessories(prev => prev.map((x, j) => j === i ? { ...x, qty: newQty } : x));
                                                }}
                                                className="w-14 px-1 py-1 text-xs text-center border border-slate-200 rounded bg-slate-50 focus:bg-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 transition-all"
                                            />
                                            <span className="text-[11px] font-semibold text-emerald-700 w-16 text-right">
                                                {a.price ? formatVND(a.price * a.qty) : ''}
                                            </span>
                                            <button
                                                onClick={() => setSelectedAccessories(prev => prev.filter((_, j) => j !== i))}
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
                    <div className="flex items-center justify-between gap-2 mb-3 px-1">
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

