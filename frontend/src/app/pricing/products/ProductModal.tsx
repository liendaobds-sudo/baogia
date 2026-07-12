"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../_components/apiClient';
import { filterForProductType, validateAllowedList, type ProductType, type ScopedResource, type ScopeFlags, type AllowedValidationResult } from '@/lib/scope/resource-scope';

// ─── Types ────────────────────────────────────
interface Product {
    id?: number; code: string; quote_type: string; name_vi: string; name_en?: string;
    category_id?: string; icon?: string; description_vi?: string;
    is_active?: boolean; has_auto_pricing?: boolean;
    ai_enabled?: boolean; ai_keywords?: string[];
    quote_config?: QuoteConfig;
}
interface QuoteConfig {
    default_quantity?: number; min_quantity?: number; max_quantity?: number;
    default_print_side?: string; default_print_type?: string;
    default_material_id?: string; default_paper_size_id?: string;
    default_width?: number; default_height?: number;
    lock_print_side?: boolean; lock_print_type?: boolean;
    allowed_materials?: string[]; allowed_paper_sizes?: string[]; allowed_processing?: string[]; allowed_accessories?: string[];
}
interface AiField {
    id: number; field_name: string; field_code: string; field_type: string;
    ai_question?: string; default_value?: string; is_enabled: boolean; is_required: boolean;
    source_table?: string;
}
interface MasterItem { id: number; name: string; category_tab?: string; is_active?: number; scope_loose?: number; scope_bound?: number; scope_large_format?: number; scope_offset?: boolean; }
interface Category { id: number; code: string; name_vi: string; }

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    product: Product | null; // null = create mode
}

// ─── Quy_Tắc_Phạm_Vi: lọc Tài_Nguyên_Dùng_Chung theo Loại_Sản_Phẩm ──────────
// Dùng chung MỘT nguồn sự thật `filterForProductType` (mirror frontend), thay cho vá tạm
// `scopedProcessing` rải rác. Bảo đảm thứ tick được ở Màn_Cài_Đặt khớp Màn_Báo_Giá.
//
// Chuẩn hoá shape về ScopedResource vì ba endpoint trả khác nhau:
//  • /erp/processing-options → snake_case scope_* + is_active (smallint).
//  • /erp/materials          → snake_case scope_* (boolean), KHÔNG có cột is_active.
//  • /erp/paper-sizes        → camelCase scopeLoose/... (boolean), KHÔNG có cột is_active.
// Bảng materials/paper_sizes không có is_active ⇒ coi mọi bản ghi là đang hoạt động (= 1).
function toScopedResource(item: MasterItem): ScopedResource {
    const it = item as unknown as Record<string, unknown>;
    const pick = (snake: string, camel: string) =>
        (it[snake] ?? it[camel]) as number | boolean | null | undefined;
    return {
        id: item.id,
        is_active: item.is_active ?? 1,
        scope_loose: pick('scope_loose', 'scopeLoose'),
        scope_bound: pick('scope_bound', 'scopeBound'),
        scope_large_format: pick('scope_large_format', 'scopeLargeFormat'),
        scope_offset: pick('scope_offset', 'scopeOffset'),
    };
}

// Giữ lại các MasterItem gốc thuộc Phạm_Vi của `productType` theo Quy_Tắc_Phạm_Vi.
function scopeResources(items: MasterItem[], productType: ProductType): MasterItem[] {
    const inScopeIds = new Set(
        filterForProductType(items.map(toScopedResource), productType).map((r) => r.id),
    );
    return items.filter((item) => inScopeIds.has(item.id));
}

// Dựng Map<id → ScopeFlags> từ danh sách master (đầy đủ, CHƯA lọc) để dùng cho
// `validateAllowedList`. Cùng một Quy_Tắc_Phạm_Vi xác định phần tử ngoài phạm vi.
function buildScopeMap(items: MasterItem[]): Map<number, ScopeFlags> {
    const map = new Map<number, ScopeFlags>();
    for (const item of items) map.set(item.id, toScopedResource(item));
    return map;
}

// Chuyển Danh_Sách_Được_Phép (mảng id chuỗi) về mảng số, bỏ giá trị không hợp lệ.
function allowedToNumbers(allowed?: string[]): number[] {
    return (allowed || []).map((id) => Number(id)).filter((n) => Number.isFinite(n));
}

// ─── Component ────────────────────────────────
export default function ProductModal({ isOpen, onClose, onSaved, product }: Props) {
    const isEdit = !!product?.id;
    const [tab, setTab] = useState<'basic' | 'quote' | 'mini'>('basic');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    // Form state
    const [form, setForm] = useState<Product>({ code: '', quote_type: 'loose', name_vi: '' });
    const [quoteConfig, setQuoteConfig] = useState<QuoteConfig>({});
    const [keywords, setKeywords] = useState<string[]>([]);
    const [kwInput, setKwInput] = useState('');

    // Master data
    const [materials, setMaterials] = useState<MasterItem[]>([]);
    const [paperSizes, setPaperSizes] = useState<MasterItem[]>([]);
    const [processing, setProcessing] = useState<MasterItem[]>([]);
    const [accessories, setAccessories] = useState<MasterItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);

    // AI fields
    const [aiFields, setAiFields] = useState<AiField[]>([]);
    const [expandedField, setExpandedField] = useState<number | null>(null);

    // Tài_Nguyên_Dùng_Chung hợp lệ theo Loại_Sản_Phẩm đang cấu hình — đi qua cùng một
    // Quy_Tắc_Phạm_Vi (`filterForProductType`) mà Màn_Báo_Giá dùng, áp dụng nhất quán cho cả
    // Gia_Công, Vật_Tư và Khổ_Giấy. Danh sách tự cập nhật ngay khi đổi `quote_type`.
    //  • Tài_Nguyên_Chỉ-Offset (scope_offset, không có scope in nhanh nào) bị loại tự nhiên.
    //  • bound → chỉ scope_bound; large_format → chỉ scope_large_format; loose → chỉ scope_loose.
    const productType = (form.quote_type || 'loose') as ProductType;
    const scopedProcessing = useMemo(
        () => scopeResources(processing, productType),
        [processing, productType],
    );
    const scopedMaterials = useMemo(
        () => scopeResources(materials, productType),
        [materials, productType],
    );
    const scopedPaperSizes = useMemo(
        () => scopeResources(paperSizes, productType),
        [paperSizes, productType],
    );

    // Validate Danh_Sách_Được_Phép theo Loại_Sản_Phẩm đang cấu hình (Req 4.3, 4.5).
    // Dùng `validateAllowedList` (cùng Quy_Tắc_Phạm_Vi) để xác định ĐÚNG tập phần tử ngoài
    // phạm vi cho từng nhóm. resourcesById dựng từ danh sách master ĐẦY ĐỦ (chưa lọc) để
    // còn nhận diện được những id đã tick nhưng nay ngoài phạm vi.
    const allowedValidation = useMemo(() => {
        const processingResult = validateAllowedList(
            allowedToNumbers(quoteConfig.allowed_processing),
            buildScopeMap(processing),
            productType,
        );
        const materialsResult = validateAllowedList(
            allowedToNumbers(quoteConfig.allowed_materials),
            buildScopeMap(materials),
            productType,
        );
        const paperSizesResult = validateAllowedList(
            allowedToNumbers(quoteConfig.allowed_paper_sizes),
            buildScopeMap(paperSizes),
            productType,
        );
        return { processing: processingResult, materials: materialsResult, paperSizes: paperSizesResult };
    }, [quoteConfig.allowed_processing, quoteConfig.allowed_materials, quoteConfig.allowed_paper_sizes, processing, materials, paperSizes, productType]);

    // Các MasterItem ngoài phạm vi (đã tick nhưng vi phạm) để hiển thị badge + tên cụ thể.
    const outOfScopeProcessing = useMemo(
        () => processing.filter((it) => allowedValidation.processing.outOfScope.includes(it.id)),
        [processing, allowedValidation],
    );
    const outOfScopeMaterials = useMemo(
        () => materials.filter((it) => allowedValidation.materials.outOfScope.includes(it.id)),
        [materials, allowedValidation],
    );
    const outOfScopePaperSizes = useMemo(
        () => paperSizes.filter((it) => allowedValidation.paperSizes.outOfScope.includes(it.id)),
        [paperSizes, allowedValidation],
    );
    const allOutOfScope = useMemo(
        () => [...outOfScopeMaterials, ...outOfScopePaperSizes, ...outOfScopeProcessing],
        [outOfScopeMaterials, outOfScopePaperSizes, outOfScopeProcessing],
    );
    const hasScopeViolation = allOutOfScope.length > 0;

    // Images
    // Mini Quote fields
    const [miniFields, setMiniFields] = useState<{code: string; name: string; type: string; group: string; defaultOn: boolean; description?: string; enabled: boolean}[]>([]);
    const [miniFieldsDirty, setMiniFieldsDirty] = useState(false);

    // Load master data
    const loadMaster = useCallback(async () => {
        const [mRes, pRes, prRes, cRes, aRes] = await Promise.all([
            api.get<MasterItem[]>('/erp/materials'),
            api.get<MasterItem[]>('/erp/paper-sizes'),
            api.get<MasterItem[]>('/erp/processing-options'),
            api.get<Category[]>('/erp/product-categories'),
            api.get<any>('/pricing/master-data?type=accessories'),
        ]);
        if (mRes.success && mRes.data) setMaterials(mRes.data);
        if (pRes.success && pRes.data) setPaperSizes(pRes.data);
        if (prRes.success && prRes.data) setProcessing(prRes.data);
        if (cRes.success && cRes.data) setCategories(cRes.data);
        if (aRes.success && aRes.data?.accessories) setAccessories(aRes.data.accessories);
    }, []);

    // Init form when modal opens
    useEffect(() => {
        if (!isOpen) return;
        loadMaster();
        setTab('basic');
        if (product) {
            // Product list doesn't include quote_config — fetch full detail
            const initProduct = async () => {
                setForm({ ...product });
                setKeywords(product.ai_keywords || []);
                if (product.code) loadAiFields(product.code);
                if (product.id) loadMiniQuoteFields(product.id);

                // Fetch full product to get quote_config (allowed_materials, etc.)
                if (product.id) {
                    try {
                        const res = await api.get<any>(`/erp/products/${product.id}`);
                        if (res.success && res.data) {
                            setQuoteConfig(res.data.quote_config || {});
                            // Update form with any extra fields from detail
                            setForm(prev => ({ ...prev, ...res.data, quote_config: undefined }));
                        } else {
                            setQuoteConfig(product.quote_config || {});
                        }
                    } catch {
                        setQuoteConfig(product.quote_config || {});
                    }
                } else {
                    setQuoteConfig(product.quote_config || {});
                }
            };
            initProduct();
        } else {
            setForm({ code: '', quote_type: 'loose', name_vi: '', is_active: true, has_auto_pricing: true, ai_enabled: true });
            setQuoteConfig({ default_quantity: 500, min_quantity: 1, max_quantity: 999999, default_print_side: 'double' });
            setKeywords([]);
            setAiFields([]);
            setMiniFields([]);
            setMiniFieldsDirty(false);
        }
    }, [isOpen, product, loadMaster]);

    const loadAiFields = async (code: string) => {
        try {
            const res = await api.get<{ fields: AiField[] }>(`/erp/ai-config?code=${code}`);
            if (res.success && res.data?.fields) setAiFields(res.data.fields);
            else setAiFields([]);
        } catch { setAiFields([]); }
    };

    const loadMiniQuoteFields = async (productId: number) => {
        try {
            const res = await api.get<any>(`/erp/products/${productId}/mini-quote-fields`);
            if (res.success && res.data?.master_fields) {
                setMiniFields(res.data.master_fields);
                setMiniFieldsDirty(false);
            }
        } catch { /* ignore */ }
    };

    const saveMiniQuoteFields = async () => {
        if (!product?.id || !miniFieldsDirty) return;
        const enabledCodes = miniFields.filter(f => f.enabled).map(f => f.code);
        try {
            await api.put(`/erp/products/${product.id}/mini-quote-fields`, { fields: enabledCodes });
            setMiniFieldsDirty(false);
            setToast(null);
        } catch { /* ignore */ }
    };

    // ---- SAVE ----
    const handleSave = async () => {
        if (!form.code || !form.name_vi) {
            setToast('Vui lòng nhập mã SP và tên SP');
            setTimeout(() => setToast(null), 3000);
            return;
        }
        // Chặn lưu khi Danh_Sách_Được_Phép còn tài nguyên ngoài Phạm_Vi của Loại_Sản_Phẩm
        // hiện tại (Req 4.5). Nêu đích danh tên tài nguyên vi phạm, KHÔNG ghi, giữ nguyên dữ liệu.
        if (hasScopeViolation) {
            const typeLabel = form.quote_type === 'bound' ? 'Sách/Cuốn' : form.quote_type === 'large_format' ? 'Khổ lớn' : 'Tờ rời';
            const names = allOutOfScope.map((it) => it.name).join(', ');
            setToast(`Không thể lưu: tài nguyên ngoài phạm vi "${typeLabel}": ${names}. Vui lòng bỏ chọn trước khi lưu.`);
            setTab('quote');
            setTimeout(() => setToast(null), 6000);
            return;
        }
        // Cảnh báo strict-mode: chưa whitelist vật liệu → báo giá sẽ KHÔNG có lựa chọn nào.
        // (Tránh tạo sản phẩm "không báo giá được" mà không hay biết.)
        const noMaterials = !(quoteConfig.allowed_materials && quoteConfig.allowed_materials.length > 0);
        const noPaper = !(quoteConfig.allowed_paper_sizes && quoteConfig.allowed_paper_sizes.length > 0);
        if (noMaterials || noPaper) {
            const missing = [noMaterials && 'vật liệu', noPaper && 'khổ giấy'].filter(Boolean).join(' và ');
            const ok = window.confirm(
                `⚠️ Sản phẩm chưa chọn ${missing} được phép.\n\n` +
                `Do hệ thống đi đúng theo cài đặt (không hiện mặc định), khi báo giá các ô này sẽ TRỐNG và nhân viên không chọn được.\n\n` +
                `Vẫn lưu?`
            );
            if (!ok) { setTab('quote'); return; }
        }
        setSaving(true);
        try {
            const payload = { ...form, ai_keywords: keywords, quote_config: quoteConfig };
            const res = isEdit
                ? await api.put(`/erp/products/${product!.id}`, payload)
                : await api.post('/erp/products', payload);
            if (!res.success) throw new Error(res.error || 'Lỗi');
            // Also save mini quote fields if changed
            if (miniFieldsDirty && product?.id) await saveMiniQuoteFields();
            onSaved();
            onClose();
        } catch (e: unknown) {
            setToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'));
            setTimeout(() => setToast(null), 3000);
        }
        setSaving(false);
    };

    // ---- KEYWORDS ----
    const addKeyword = () => {
        const kw = kwInput.trim().toLowerCase();
        if (kw && !keywords.includes(kw)) setKeywords([...keywords, kw]);
        setKwInput('');
    };

    // ---- QUOTE CONFIG helpers ----
    const toggleAllowed = (key: 'allowed_materials' | 'allowed_paper_sizes' | 'allowed_processing' | 'allowed_accessories', id: string) => {
        setQuoteConfig(prev => {
            const arr = [...(prev[key] || [])];
            const idx = arr.indexOf(id);
            idx >= 0 ? arr.splice(idx, 1) : arr.push(id);
            return { ...prev, [key]: arr };
        });
    };
    const selectAll = (key: 'allowed_materials' | 'allowed_paper_sizes' | 'allowed_processing' | 'allowed_accessories', items: MasterItem[]) => {
        setQuoteConfig(prev => ({ ...prev, [key]: items.map(i => String(i.id)) }));
    };

    if (!isOpen) return null;

    const TABS = [
        { id: 'basic' as const, label: '📋 Thông tin cơ bản', color: 'blue' },
        { id: 'quote' as const, label: '⚙️ Cấu hình & Ràng buộc', color: 'purple' },
        { id: 'mini' as const, label: '📱 Mini Báo Giá & AI', color: 'orange' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
                {toast && <div className="absolute top-4 right-4 z-50 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex justify-between items-center shrink-0">
                    <h2 className="text-lg font-bold text-slate-800">{isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 shrink-0 px-6">
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-3 text-sm font-semibold transition-colors ${tab === t.id ? `text-${t.color}-600 border-b-2 border-${t.color}-500` : 'text-slate-500 hover:text-slate-700'}`}>{t.label}</button>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* TAB 1: BASIC */}
                    {tab === 'basic' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Mã sản phẩm *" value={form.code} onChange={v => setForm(f => ({ ...f, code: v }))} placeholder="VD: namecard" />
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Loại báo giá *</label>
                                    <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={form.quote_type} onChange={e => setForm(f => ({ ...f, quote_type: e.target.value }))}>
                                        <option value="loose">Sản phẩm rời</option>
                                        <option value="bound">Sách / Cuốn</option>
                                        <option value="large_format">In Khổ Lớn</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Tên sản phẩm (VN) *" value={form.name_vi} onChange={v => setForm(f => ({ ...f, name_vi: v }))} placeholder="Danh thiếp" />
                                <Field label="Tên sản phẩm (EN)" value={form.name_en || ''} onChange={v => setForm(f => ({ ...f, name_en: v }))} placeholder="Business Card" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Danh mục</label>
                                    <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={form.category_id || ''} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                                        <option value="">-- Không chọn --</option>
                                        {categories.map(c => <option key={c.id} value={c.code}>{c.name_vi}</option>)}
                                    </select>
                                </div>
                                <Field label="Icon" value={form.icon || ''} onChange={v => setForm(f => ({ ...f, icon: v }))} placeholder="fa-box" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Mô tả</label>
                                <textarea className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" rows={3} value={form.description_vi || ''} onChange={e => setForm(f => ({ ...f, description_vi: e.target.value }))} />
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                                <Toggle label="Hoạt động" checked={!!form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} />
                                <Toggle label="Auto Pricing" checked={!!form.has_auto_pricing} onChange={v => setForm(f => ({ ...f, has_auto_pricing: v }))} />
                            </div>

                            {/* AI Settings (moved from separate tab) */}
                            <div className="border-t border-slate-100 pt-3 space-y-3">
                                <div className="flex items-center gap-4">
                                    <Toggle label="🤖 Bật AI" checked={!!form.ai_enabled} onChange={v => setForm(f => ({ ...f, ai_enabled: v }))} />
                                </div>
                                {form.ai_enabled && (
                                    <div>
                                        <h4 className="font-bold text-slate-700 text-sm mb-2">🏷️ Từ khóa AI nhận dạng</h4>
                                        <div className="flex gap-2 mb-2">
                                            <input type="text" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={kwInput} onChange={e => setKwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())} placeholder="Nhập từ khóa, Enter để thêm" />
                                            <button onClick={addKeyword} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">+ Thêm</button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {keywords.length === 0 && <span className="text-slate-400 text-sm">Chưa có từ khóa</span>}
                                            {keywords.map((kw, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-sm">
                                                    {kw}
                                                    <button onClick={() => setKeywords(keywords.filter((_, j) => j !== i))} className="hover:text-red-500 ml-1">×</button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TAB 2: QUOTE CONFIG */}
                    {tab === 'quote' && (
                        <div className="space-y-5">

                            {/* Cảnh báo ngoài phạm vi (Req 4.3): nêu rõ tài nguyên nào vi phạm */}
                            {hasScopeViolation && (
                                <div className="bg-red-50 border border-red-300 rounded-xl p-4">
                                    <h4 className="font-bold text-red-700 text-sm flex items-center gap-2">
                                        ⚠️ Tài nguyên ngoài phạm vi của loại sản phẩm
                                        <span className="uppercase">{form.quote_type === 'bound' ? 'Sách/Cuốn' : form.quote_type === 'large_format' ? 'Khổ lớn' : 'Tờ rời'}</span>
                                    </h4>
                                    <p className="text-xs text-red-600 mt-1">
                                        Các tài nguyên sau đã được chọn nhưng không áp dụng cho loại sản phẩm hiện tại. Hãy bỏ chọn (đánh dấu <span className="font-semibold">ngoài phạm vi</span> bên dưới) trước khi lưu:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {allOutOfScope.map((it) => (
                                            <span key={it.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                                                {it.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Defaults */}
                            <div className="bg-purple-50/50 rounded-xl p-4 border border-purple-200">
                                <h4 className="font-bold text-purple-700 mb-3 text-sm">🎯 Giá trị mặc định</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">Mặt in</label>
                                        <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={quoteConfig.default_print_side || 'double'} onChange={e => setQuoteConfig(q => ({ ...q, default_print_side: e.target.value }))}>
                                            <option value="single">1 mặt</option><option value="double">2 mặt</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">Hệ màu</label>
                                        <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={quoteConfig.default_print_type || '4c'} onChange={e => setQuoteConfig(q => ({ ...q, default_print_type: e.target.value }))}>
                                            <option value="4c">4 màu (CMYK)</option><option value="1c">1 màu (Đen/Trắng)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">Vật tư mặc định</label>
                                        <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={quoteConfig.default_material_id || ''} onChange={e => setQuoteConfig(q => ({ ...q, default_material_id: e.target.value }))}>
                                            <option value="">-- Không chọn --</option>
                                            {materials.filter((m: any) => m.category_tab?.startsWith('substrate')).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1">Khổ giấy mặc định</label>
                                        <select className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" value={quoteConfig.default_paper_size_id || ''} onChange={e => setQuoteConfig(q => ({ ...q, default_paper_size_id: e.target.value }))}>
                                            <option value="">-- Không chọn --</option>
                                            {paperSizes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-3">
                                    <NumField label="Số lượng mặc định" value={quoteConfig.default_quantity || 0} onChange={v => setQuoteConfig(q => ({ ...q, default_quantity: v }))} />
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-3">
                                    <NumField label="Rộng (mm)" value={quoteConfig.default_width || 0} onChange={v => setQuoteConfig(q => ({ ...q, default_width: v }))} />
                                    <NumField label="Cao (mm)" value={quoteConfig.default_height || 0} onChange={v => setQuoteConfig(q => ({ ...q, default_height: v }))} />
                                </div>
                                <div className="flex gap-6 mt-3">
                                    <Toggle label="Khóa mặt in" checked={!!quoteConfig.lock_print_side} onChange={v => setQuoteConfig(q => ({ ...q, lock_print_side: v }))} />
                                    <Toggle label="Khóa hệ màu" checked={!!quoteConfig.lock_print_type} onChange={v => setQuoteConfig(q => ({ ...q, lock_print_type: v }))} />
                                </div>
                            </div>

                            {/* Allowed Materials — ONLY substrates (giấy in, bạt/PP) */}
                            {(() => {
                                const substrateTabs = ['substrate_sheet', 'substrate_roll'];
                                const substrateMaterials = scopedMaterials.filter((m: any) => substrateTabs.includes(m.category_tab));
                                return <GroupedCheckboxGrid title="📄 Giấy in / Vật liệu in được phép" items={substrateMaterials} outOfScopeItems={outOfScopeMaterials} selected={quoteConfig.allowed_materials || []} onToggle={id => toggleAllowed('allowed_materials', id)} onSelectAll={() => selectAll('allowed_materials', substrateMaterials)} />;
                            })()}
                            <CheckboxGrid title="📐 Khổ giấy được phép" items={scopedPaperSizes} outOfScopeItems={outOfScopePaperSizes} selected={quoteConfig.allowed_paper_sizes || []} onToggle={id => toggleAllowed('allowed_paper_sizes', id)} onSelectAll={() => selectAll('allowed_paper_sizes', scopedPaperSizes)} />
                            <CheckboxGrid title="✂️ Gia công được phép" items={scopedProcessing} outOfScopeItems={outOfScopeProcessing} selected={quoteConfig.allowed_processing || []} onToggle={id => toggleAllowed('allowed_processing', id)} onSelectAll={() => selectAll('allowed_processing', scopedProcessing)} />
                            <CheckboxGrid title="🎁 Phụ kiện được phép" items={accessories} selected={quoteConfig.allowed_accessories || []} onToggle={id => toggleAllowed('allowed_accessories', id)} onSelectAll={() => selectAll('allowed_accessories', accessories)} />
                        </div>
                    )}

                    {/* TAB 3: MINI QUOTE FIELDS & AI (merged) */}
                    {tab === 'mini' && (
                        <div className="space-y-4">
                            {!isEdit ? (
                                <div className="text-center py-8 text-slate-400">
                                    <p className="text-3xl mb-2">📱</p>
                                    <p className="text-sm">Lưu sản phẩm trước để cấu hình Mini Báo Giá.</p>
                                </div>
                            ) : miniFields.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    <p className="text-3xl mb-2">⏳</p>
                                    <p className="text-sm">Đang tải cấu hình...</p>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="font-bold text-orange-800 text-sm">📱 Cấu hình trường hiển thị trong Mini Báo Giá</h4>
                                                <p className="text-xs text-orange-600 mt-1">Chọn trường nào sẽ hiện khi nhân viên báo giá nhanh trong Inbox. Loại SP: <strong className="uppercase">{form.quote_type === 'bound' ? 'Sách/Cuốn' : form.quote_type === 'large_format' ? 'Khổ lớn' : 'Tờ rời'}</strong></p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${miniFieldsDirty ? 'bg-amber-200 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                                                    {miniFieldsDirty ? '⚠ Chưa lưu' : '✓ Đã lưu'}
                                                </span>
                                                <span className="text-xs text-orange-500 font-medium">{miniFields.filter(f => f.enabled).length}/{miniFields.length} bật</span>
                                            </div>
                                        </div>
                                    </div>

                                    {(['info', 'basic', 'material', 'print', 'binding', 'cover', 'inner', 'processing', 'accessory'] as const).map(group => {
                                        const groupFields = miniFields.filter(f => f.group === group);
                                        if (groupFields.length === 0) return null;
                                        const groupMeta: Record<string, {icon: string; label: string; bg: string; border: string}> = {
                                            info: { icon: '📝', label: 'Thông tin', bg: 'bg-slate-50/50', border: 'border-slate-200' },
                                            basic: { icon: '📦', label: 'Thông số SP', bg: 'bg-blue-50/50', border: 'border-blue-200' },
                                            material: { icon: '📄', label: 'Vật tư', bg: 'bg-amber-50/50', border: 'border-amber-200' },
                                            print: { icon: '🖨️', label: 'In ấn', bg: 'bg-indigo-50/50', border: 'border-indigo-200' },
                                            binding: { icon: '📕', label: 'Đóng cuốn', bg: 'bg-purple-50/50', border: 'border-purple-200' },
                                            cover: { icon: '🔵', label: 'Bìa ngoài', bg: 'bg-blue-50/50', border: 'border-blue-300' },
                                            inner: { icon: '⚪', label: 'Ruột bên trong', bg: 'bg-gray-50/50', border: 'border-gray-200' },
                                            processing: { icon: '✂️', label: 'Gia công', bg: 'bg-rose-50/50', border: 'border-rose-200' },
                                            accessory: { icon: '🧩', label: 'Phụ kiện', bg: 'bg-emerald-50/50', border: 'border-emerald-200' },
                                        };
                                        const g = groupMeta[group];
                                        return (
                                            <div key={group} className={`${g.bg} rounded-xl p-4 border ${g.border}`}>
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1.5">{g.icon} {g.label}</h4>
                                                    <button 
                                                        onClick={() => {
                                                            const allOn = groupFields.every(f => f.enabled);
                                                            setMiniFields(prev => prev.map(f => f.group === group ? { ...f, enabled: !allOn } : f));
                                                            setMiniFieldsDirty(true);
                                                        }}
                                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                                                    >
                                                        {groupFields.every(f => f.enabled) ? 'Bỏ tất cả' : 'Chọn tất cả'}
                                                    </button>
                                                </div>
                                                <div className="space-y-1.5">
                                                    {groupFields.map(field => (
                                                        <label key={field.code} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors border ${field.enabled ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50/50 border-transparent'} hover:bg-white hover:shadow-sm`}>
                                                            <input 
                                                                type="checkbox" 
                                                                className="w-4 h-4 text-indigo-600 rounded" 
                                                                checked={field.enabled}
                                                                onChange={() => {
                                                                    setMiniFields(prev => prev.map(f => f.code === field.code ? { ...f, enabled: !f.enabled } : f));
                                                                    setMiniFieldsDirty(true);
                                                                }}
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-sm font-semibold ${field.enabled ? 'text-slate-800' : 'text-slate-400'}`}>{field.name}</span>
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{field.type}</span>
                                                                    {field.defaultOn && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">Mặc định</span>}
                                                                </div>
                                                                {field.description && <p className={`text-xs mt-0.5 ${field.enabled ? 'text-slate-500' : 'text-slate-300'}`}>{field.description}</p>}
                                                                {/* Show matching AI field question if exists */}
                                                                {(() => { const ai = aiFields.find(a => a.field_code === field.code); return ai?.ai_question ? <p className="text-[10px] text-emerald-600 mt-0.5">🤖 {ai.ai_question}</p> : null; })()}
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Hủy</button>
                    <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                        {saving ? <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Đang lưu...</> : '💾 Lưu sản phẩm'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Small Helper Components ──────────────────
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
    return (
        <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
            <input type="text" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        </div>
    );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    return (
        <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
            <input type="number" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={value} onChange={e => onChange(parseInt(e.target.value) || 0)} />
        </div>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={checked} onChange={e => onChange(e.target.checked)} />
            <span className="text-slate-700">{label}</span>
        </label>
    );
}

function CheckboxGrid({ title, items, selected, onToggle, onSelectAll, outOfScopeItems = [] }: { title: string; items: MasterItem[]; selected: string[]; onToggle: (id: string) => void; onSelectAll: () => void; outOfScopeItems?: MasterItem[] }) {
    return (
        <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-slate-700 text-sm">{title}</h4>
                <button onClick={onSelectAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">Chọn tất cả</button>
            </div>
            {items.length === 0 && outOfScopeItems.length === 0 ? (
                <p className="text-slate-400 text-sm">Không có dữ liệu</p>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                    {items.map(item => (
                        <label key={item.id} className="flex items-center gap-2 py-1 px-1.5 rounded cursor-pointer hover:bg-slate-50 text-sm">
                            <input type="checkbox" className="w-3.5 h-3.5 text-indigo-600 rounded" checked={selected.includes(String(item.id))} onChange={() => onToggle(String(item.id))} />
                            <span className="text-slate-700 truncate">{item.name}</span>
                        </label>
                    ))}
                    {outOfScopeItems.map(item => (
                        <label key={`oos-${item.id}`} className="flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer hover:bg-red-50 text-sm bg-red-50/60 border border-red-200">
                            <input type="checkbox" className="w-3.5 h-3.5 text-red-600 rounded" checked={selected.includes(String(item.id))} onChange={() => onToggle(String(item.id))} />
                            <span className="text-red-700 truncate" title={item.name}>{item.name}</span>
                            <span className="ml-auto shrink-0 text-[9px] font-bold uppercase px-1 py-0.5 bg-red-200 text-red-800 rounded">ngoài phạm vi</span>
                        </label>
                    ))}
                </div>
            )}
            <div className="text-xs text-slate-400 mt-1.5">{selected.length}/{items.length} đã chọn</div>
        </div>
    );
}

const CATEGORY_TAB_LABELS: Record<string, string> = {
    substrate_sheet: 'Giấy tờ',
    substrate_roll: 'Bạt / PP cuộn',
    ink: 'Mực in',
    prepress: 'Chế bản (CTP)',
    surface: 'Cán màng',
    finishing: 'Gia công sau in',
    tooling: 'Phụ kiện / Bao bì',
};

function GroupedCheckboxGrid({ title, items, selected, onToggle, onSelectAll, outOfScopeItems = [] }: { title: string; items: MasterItem[]; selected: string[]; onToggle: (id: string) => void; onSelectAll: () => void; outOfScopeItems?: MasterItem[] }) {
    // Group items by category_tab
    const groups = new Map<string, MasterItem[]>();
    for (const item of items) {
        const tab = item.category_tab || 'other';
        if (!groups.has(tab)) groups.set(tab, []);
        groups.get(tab)!.push(item);
    }
    // Sort groups by the predefined order
    const tabOrder = Object.keys(CATEGORY_TAB_LABELS);
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
        const ia = tabOrder.indexOf(a[0]); const ib = tabOrder.indexOf(b[0]);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    const toggleGroup = (groupItems: MasterItem[]) => {
        const allSelected = groupItems.every(i => selected.includes(String(i.id)));
        groupItems.forEach(i => {
            const id = String(i.id);
            if (allSelected) { if (selected.includes(id)) onToggle(id); }
            else { if (!selected.includes(id)) onToggle(id); }
        });
    };

    return (
        <div className="bg-white rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-700 text-sm">{title}</h4>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{selected.length}/{items.length} đã chọn</span>
                    <button onClick={onSelectAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">Chọn tất cả</button>
                </div>
            </div>
            {items.length === 0 && outOfScopeItems.length === 0 ? (
                <p className="text-slate-400 text-sm">Không có dữ liệu</p>
            ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {sortedGroups.map(([tab, groupItems]) => {
                        const groupSelected = groupItems.filter(i => selected.includes(String(i.id))).length;
                        const label = CATEGORY_TAB_LABELS[tab] || tab;
                        return (
                            <div key={tab} className="border border-slate-100 rounded-lg">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-t-lg">
                                    <span className="text-xs font-semibold text-slate-600">{label}</span>
                                    <button
                                        onClick={() => toggleGroup(groupItems)}
                                        className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium"
                                    >
                                        {groupSelected === groupItems.length ? 'Bỏ chọn nhóm' : `Chọn nhóm (${groupSelected}/${groupItems.length})`}
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-0.5 px-2 py-1.5">
                                    {groupItems.map(item => (
                                        <label key={item.id} className="flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer hover:bg-slate-50 text-sm">
                                            <input type="checkbox" className="w-3.5 h-3.5 text-indigo-600 rounded" checked={selected.includes(String(item.id))} onChange={() => onToggle(String(item.id))} />
                                            <span className="text-slate-700 truncate text-xs">{item.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {outOfScopeItems.length > 0 && (
                        <div className="border border-red-200 rounded-lg">
                            <div className="flex items-center justify-between px-3 py-1.5 bg-red-50 rounded-t-lg">
                                <span className="text-xs font-semibold text-red-700">⚠️ Ngoài phạm vi (đã tick nhưng không áp dụng)</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-0.5 px-2 py-1.5">
                                {outOfScopeItems.map(item => (
                                    <label key={`oos-${item.id}`} className="flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer hover:bg-red-50 text-sm bg-red-50/60">
                                        <input type="checkbox" className="w-3.5 h-3.5 text-red-600 rounded" checked={selected.includes(String(item.id))} onChange={() => onToggle(String(item.id))} />
                                        <span className="text-red-700 truncate text-xs" title={item.name}>{item.name}</span>
                                        <span className="ml-auto shrink-0 text-[8px] font-bold uppercase px-1 py-0.5 bg-red-200 text-red-800 rounded">ngoài phạm vi</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
