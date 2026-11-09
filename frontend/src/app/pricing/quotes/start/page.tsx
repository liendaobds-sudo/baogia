'use client';

/**
 * Cổng_Tạo_Báo_Giá hợp nhất (Quote Entry Point) — Task 7.3.
 *
 * Điểm vào DUY NHẤT để bắt đầu một báo giá (Req 4.1). Luồng:
 *  1. Chọn Sản_Phẩm trước (method-agnostic) — Req 4.2.
 *  2. Gọi `GET /quote/methods?productCode=` để lấy `applicableMethods`
 *     (= Phương_Pháp_Khả_Dụng ∩ áp dụng được cho sản phẩm) — Req 4.7.
 *  3. Định tuyến theo số phương pháp áp dụng được:
 *      - 0  ⇒ thông báo không có phương pháp khả dụng.
 *      - 1  ⇒ vào THẲNG Configurator của phương pháp đó (bỏ bước chọn) — Req 4.4.
 *      - ≥2 ⇒ bắt NV chọn rõ một phương pháp HOẶC chế độ so sánh trước khi vào
 *             Configurator (không tự bỏ qua) — Req 4.5. Trạng thái CHƯA chọn được
 *             phép tồn tại (Req 4.3).
 *  4. Hiển thị đúng Configurator tương ứng phương pháp đã chọn — Req 4.6.
 *
 * Tái sử dụng Configurator hiện hữu: `QuoteConfigurator` (digital: loose/bound/
 * large_format) và `OffsetQuoteConfigurator` (offset: 5 loại). Lưu báo giá theo
 * đúng mẫu của `/pricing/quotes/new` và `/pricing/quotes/offset` — VAT áp một lần
 * cấp báo giá (Req 8).
 *
 * Đây là đích redirect của MethodRouteGuard khi chặn route phương pháp không khả
 * dụng (Req 2.4).
 *
 * _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
 */

import { useAuth } from '@/lib/auth-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL, apiGet } from '@/lib/api';
import type { MethodId } from '@/lib/scope/types';
import { QuoteConfigurator } from '../_components/QuoteConfigurator';
import { OffsetQuoteConfigurator, type OffsetProductType } from '../_components/OffsetQuoteConfigurator';
import { PriceComparator } from '../_components/PriceComparator';
import { useQuoteCart, type QuoteCartItem } from '../_store/useQuoteCart';
import { CustomerInfo, type CustomerInfoHandle } from '@/app/pricing/_components/CustomerInfo';
import { useToast } from '@/lib/ui/toast';
import { validateQuoteDraft, isQuoteDraftValid, type QuoteDraftErrors } from '@/lib/quote/validate';
import { decideEntryRouting } from '@/lib/quote/entry-routing';
import { mapCartItemToQuoteItem } from '@/lib/quote/map-cart-item';
import { calculateHeaderDiscount } from '@/lib/quote/header-discount';
import { TrialModeSwitch } from '@/lib/scope/use-trial-mode';

/* -------------------------------------------------------------------------- */
/* Kiểu dữ liệu                                                                */
/* -------------------------------------------------------------------------- */

/** Sản phẩm trong catalog hợp nhất (từ `GET /erp/products`). */
interface CatalogProduct {
    code: string;
    name_vi: string;
    quote_type: string;
    icon?: string;
    is_active?: boolean;
}

/** Hình trả về của `GET /quote/methods?productCode=` (khớp QuoteController, Task 7.1). */
interface MethodsResponse {
    unitId: string;
    product: { code: string; quoteType: string };
    enabledMethods: MethodId[];
    applicableMethods: MethodId[];
}

/* -------------------------------------------------------------------------- */
/* Ánh xạ quoteType ↔ Phương_Pháp_In ↔ tab Configurator                        */
/* -------------------------------------------------------------------------- */

/** quoteType phục vụ bởi engine digital (`QuoteConfigurator`). */
const DIGITAL_TABS = ['loose', 'bound', 'large_format'] as const;
type DigitalTab = (typeof DIGITAL_TABS)[number];

/** quoteType phục vụ bởi engine offset (`OffsetQuoteConfigurator`). */
const OFFSET_TYPES: OffsetProductType[] = ['to_roi', 'bi_thu_folder', 'sp_khac', 'hop_giay', 'tui_giay'];

const isDigitalTab = (qt: string): qt is DigitalTab => (DIGITAL_TABS as readonly string[]).includes(qt);
const isOffsetType = (qt: string): qt is OffsetProductType => OFFSET_TYPES.includes(qt as OffsetProductType);

/** Nhãn người đọc cho một Phương_Pháp_In. */
const METHOD_META: Record<string, { label: string; icon: string; desc: string }> = {
    digital: { label: 'In nhanh (Digital)', icon: '🖨️', desc: 'Tốc độ cao, phù hợp số lượng ít–vừa' },
    offset: { label: 'In Offset', icon: '⚙️', desc: 'Chất lượng cao, tối ưu cho số lượng lớn' },
};
const methodMeta = (m: MethodId) => METHOD_META[m] ?? { label: String(m), icon: '🧾', desc: '' };

const mapDigitalType = (tab: DigitalTab): string => {
    switch (tab) {
        case 'loose': return 'Sản phẩm rời';
        case 'bound': return 'Sản phẩm cuốn';
        case 'large_format': return 'In khổ lớn';
    }
};

/* -------------------------------------------------------------------------- */
/* Ánh xạ item giỏ hàng → QuoteItemDto (hợp nhất digital + offset)             */
/* -------------------------------------------------------------------------- */

/**
 * Audit 2026-08-29: trang này từng có bản `mapItem` RIÊNG, nhánh digital spread
 * `configParams` camelCase và thiếu `printing_detail` ⇒ `POST /erp/orders` trả 400
 * (whitelist DTO) hoặc 500 ("Thiếu pricingPayload") ⇒ KHÔNG lưu được báo giá digital
 * từ Cổng. Nay dùng chung helper với `/quotes/new` và `/quotes/offset`.
 */
const mapItem = (it: QuoteCartItem): Record<string, unknown> => mapCartItemToQuoteItem(it);

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

type Mode = 'method' | 'compare';

export default function QuoteEntryPointPage() {
    const { token } = useAuth();
    const router = useRouter();
    const toast = useToast();

    // ── Bước 1: chọn sản phẩm ──
    const [products, setProducts] = useState<CatalogProduct[]>([]);
    const [productsLoading, setProductsLoading] = useState(false);
    const [productsError, setProductsError] = useState<string | null>(null);
    const [productSearch, setProductSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

    // ── Bước 2: định tuyến phương pháp ──
    const [methods, setMethods] = useState<MethodsResponse | null>(null);
    const [methodsLoading, setMethodsLoading] = useState(false);
    const [methodsError, setMethodsError] = useState<string | null>(null);
    // Phương pháp đã chọn — `null` là trạng thái CHƯA chọn hợp lệ (Req 4.3).
    const [selectedMethod, setSelectedMethod] = useState<MethodId | null>(null);
    const [mode, setMode] = useState<Mode>('method');

    // ── Lưu báo giá ──
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [errors, setErrors] = useState<QuoteDraftErrors>({});
    const customerInfoRef = useRef<CustomerInfoHandle>(null);
    const { items, getTotalAmount, clearCart, headerDiscountType, headerDiscountValue } = useQuoteCart();

    /** Nạp danh sách sản phẩm khi mở cổng. */
    const loadProducts = useCallback(async () => {
        setProductsLoading(true);
        setProductsError(null);
        try {
            const res = await apiGet<{ success?: boolean; data?: CatalogProduct[] } | CatalogProduct[]>('/erp/products', token ?? undefined);
            const list = Array.isArray(res) ? res : (res.data ?? []);
            setProducts(list.filter((p) => p.is_active !== false));
        } catch {
            setProductsError('Không tải được danh sách sản phẩm. Vui lòng thử lại.');
        } finally {
            setProductsLoading(false);
        }
    }, [token]);

    // Nạp 1 lần khi mount (token có thể chưa sẵn ⇒ apiGet tự đọc localStorage).
    useEffect(() => { loadProducts(); }, [loadProducts]);

    /**
     * Chọn một sản phẩm → gọi `/quote/methods` và áp logic định tuyến.
     * 1 phương pháp ⇒ auto-chọn (vào thẳng Configurator, Req 4.4); ≥2 ⇒ để
     * `selectedMethod = null` (bắt chọn, Req 4.5); 0 ⇒ thông báo.
     */
    const handleSelectProduct = useCallback(async (product: CatalogProduct) => {
        setSelectedProduct(product);
        setMethods(null);
        setSelectedMethod(null);
        setMode('method');
        setMethodsError(null);
        setMethodsLoading(true);
        try {
            const data = await apiGet<MethodsResponse>(
                `/quote-tool/methods?productCode=${encodeURIComponent(product.code)}`,
                token ?? undefined,
            );
            setMethods(data);
            // Định tuyến thuần theo số phương pháp áp dụng được (Property 6, Req 4.4/4.5).
            const routing = decideEntryRouting(data.applicableMethods);
            // Req 4.4: đúng một phương pháp áp dụng được ⇒ auto-chọn (vào thẳng Configurator).
            // ≥2 (mode='choose') ⇒ giữ selectedMethod = null (chưa chọn, Req 4.3/4.5).
            // 0 (mode='none') ⇒ giữ null, hiển thị thông báo.
            if (routing.mode === 'auto') {
                setSelectedMethod(routing.selectedMethod);
            }
        } catch {
            setMethodsError('Không xác định được phương pháp in cho sản phẩm này.');
        } finally {
            setMethodsLoading(false);
        }
    }, [token]);

    /** Quay lại bước chọn sản phẩm / chọn phương pháp. */
    const resetToProductSelection = useCallback(() => {
        setSelectedProduct(null);
        setMethods(null);
        setSelectedMethod(null);
        setMode('method');
    }, []);

    const handleCustomerNameChange = useCallback((name: string) => {
        setCustomerName(name);
        setErrors((prev) => (prev.customerName ? { ...prev, customerName: undefined } : prev));
    }, []);

    /** quoteType hiệu lực để chọn tab Configurator. */
    const quoteType = methods?.product.quoteType ?? selectedProduct?.quote_type ?? '';

    /** Lưu báo giá — gộp logic của new/offset; VAT áp một lần (Req 8). */
    const handleSaveQuote = useCallback(async () => {
        if (!token) return;
        const payload = customerInfoRef.current?.getPayload();
        const draftName = customerInfoRef.current?.getDraftState().customerName ?? '';
        const draftNow = { customerName: draftName, itemsCount: items.length };
        const errs = validateQuoteDraft(draftNow);
        setErrors(errs);
        if (!isQuoteDraftValid(draftNow)) {
            toast.show('error', errs.customerName || errs.items || 'Vui lòng kiểm tra lại thông tin báo giá');
            return;
        }
        if (!payload) return;

        setIsSaving(true);
        const subtotal = getTotalAmount();
        const headerDiscount = calculateHeaderDiscount(subtotal, headerDiscountType, headerDiscountValue);
        const { discountAmount, afterDiscount } = headerDiscount;
        const vatRate = Number(payload.vat_rate) || 0;
        const shippingFee = Number(payload.shipping_fee) || 0;
        const vatAmount = afterDiscount * vatRate / 100;
        const grandTotal = afterDiscount + vatAmount + shippingFee;

        // Loại đơn: offset ⇒ "In Offset"; digital ⇒ theo tab.
        const orderType = selectedMethod === 'offset'
            ? 'In Offset'
            : isDigitalTab(quoteType) ? mapDigitalType(quoteType) : 'Sản phẩm rời';

        try {
            const res = await fetch(`${API_URL}/erp/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    type: orderType,
                    customer_name: payload.customer_name,
                    customer_phone: payload.customer_phone,
                    customer_unit: payload.customer_unit,
                    tax_code: payload.customer_tax_code,
                    customer_address: payload.customer_address,
                    customer_note: payload.notes,
                    total: subtotal,
                    discount_type: discountAmount > 0 ? headerDiscount.discountType : undefined,
                    discount_value: headerDiscount.discountValue,
                    discount_amount: discountAmount,
                    vat_rate: payload.vat_rate,
                    vat_amount: vatAmount,
                    shipping_fee: shippingFee,
                    grand_total: grandTotal,
                    items: items.map(mapItem),
                }),
            });

            if (!res.ok) {
                let message = `Lưu báo giá thất bại (mã ${res.status})`;
                try {
                    const err = await res.json();
                    const m = Array.isArray(err?.message) ? err.message.join(', ') : err?.message;
                    message = m || err?.error || message;
                } catch { /* giữ message theo status */ }
                toast.show('error', message);
                return;
            }
            const data = await res.json();
            if (data?.success === false) {
                toast.show('error', data.message || data.error || 'Lưu báo giá thất bại');
                return;
            }
            toast.show('success', 'Lưu báo giá thành công!');
            clearCart();
            router.push('/pricing/quotes');
        } catch (e) {
            console.error(e);
            toast.show('error', 'Có lỗi xảy ra khi lưu báo giá');
        } finally {
            setIsSaving(false);
        }
    }, [token, items, getTotalAmount, clearCart, router, toast, selectedMethod, quoteType, headerDiscountType, headerDiscountValue]);

    const draft = { customerName, itemsCount: items.length };
    const canSave = !isSaving && isQuoteDraftValid(draft);

    /* ---------------------------------------------------------------------- */
    /* Render — Configurator (đã chọn 1 phương pháp)                          */
    /* ---------------------------------------------------------------------- */

    const renderConfigurator = () => {
        if (selectedMethod === 'digital' && isDigitalTab(quoteType)) {
            return (
                <div className="absolute inset-0 overflow-hidden">
                    <QuoteConfigurator token={token} activeTab={quoteType} />
                </div>
            );
        }
        if (selectedMethod === 'offset' && isOffsetType(quoteType)) {
            return (
                <div className="absolute inset-0 overflow-hidden">
                    <OffsetQuoteConfigurator activeType={quoteType} />
                </div>
            );
        }
        // Phương pháp đã chọn nhưng quoteType không khớp Configurator nào.
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                    <p className="text-4xl mb-3">⚠️</p>
                    <p className="text-slate-700 font-semibold">
                        Không có Configurator phù hợp cho phương pháp “{methodMeta(selectedMethod ?? '').label}”
                        với loại “{quoteType}”.
                    </p>
                    <button onClick={resetToProductSelection} className="mt-4 text-sm font-bold text-indigo-600 hover:text-indigo-800">
                        ← Chọn sản phẩm khác
                    </button>
                </div>
            </div>
        );
    };

    const inConfigurator = selectedMethod !== null && mode === 'method';

    const renderExpandSidebarButton = () => (
        <div className={`transition-all duration-300 absolute z-20 top-3 ${isSidebarCollapsed ? 'left-0 opacity-100 visible' : '-left-10 opacity-0 invisible'}`}>
            <button
                onClick={() => setIsSidebarCollapsed(false)}
                aria-label="Mở rộng thông tin khách hàng"
                className="bg-white border border-l-0 border-slate-200 shadow-[2px_0_10px_rgba(0,0,0,0.08)] py-2.5 px-1.5 rounded-r-lg text-indigo-600 hover:bg-indigo-50 transition-colors group"
                title="Mở rộng thông tin khách hàng"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-0.5 transition-transform">
                    <polyline points="13 17 18 12 13 7"></polyline>
                    <polyline points="6 17 11 12 6 7"></polyline>
                </svg>
            </button>
        </div>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-20 relative">
                <div className="flex items-center gap-4">
                    <Link href="/pricing/quotes" aria-label="Quay lại danh sách báo giá" className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors shadow-sm">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
                    </Link>
                    <div>
                        <h1 className="text-[16px] font-black text-slate-800 m-0 leading-none">Cổng Tạo Báo Giá</h1>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-wider m-0">
                            {selectedProduct ? `Sản phẩm: ${selectedProduct.name_vi}` : 'Chọn sản phẩm để bắt đầu'}
                        </p>
                    </div>
                </div>

                {/* Breadcrumb chọn lại sản phẩm / phương pháp */}
                <div className="flex items-center gap-3">
                    <TrialModeSwitch />
                    {selectedProduct && (
                        <button onClick={resetToProductSelection} className="h-9 px-4 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md text-[13px] font-bold shadow-sm transition-colors">
                            ↺ Đổi sản phẩm
                        </button>
                    )}
                    {inConfigurator && (
                        <button onClick={handleSaveQuote} disabled={!canSave} aria-label="Lưu báo giá" className={`h-9 px-5 text-white rounded-md text-[13px] font-bold shadow transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isSaving ? 'bg-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>
                            {isSaving
                                ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>}
                            LƯU BÁO GIÁ
                        </button>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden relative">
                {/* (A) Chưa chọn sản phẩm → lưới chọn sản phẩm (Req 4.2) */}
                {!selectedProduct && (
                    <ProductPicker
                        products={products}
                        loading={productsLoading}
                        error={productsError}
                        search={productSearch}
                        onSearch={setProductSearch}
                        onRetry={loadProducts}
                        onSelect={handleSelectProduct}
                    />
                )}

                {/* (B) Đã chọn sản phẩm, đang nạp phương pháp */}
                {selectedProduct && methodsLoading && (
                    <CenterNotice icon="⏳" text="Đang xác định phương pháp in khả dụng..." />
                )}

                {/* (C) Lỗi nạp phương pháp */}
                {selectedProduct && !methodsLoading && methodsError && (
                    <CenterNotice icon="🚫" text={methodsError} actionLabel="← Chọn sản phẩm khác" onAction={resetToProductSelection} />
                )}

                {/* (D) 0 phương pháp áp dụng được (Req 4.3 — thông báo) */}
                {selectedProduct && methods && !methodsLoading && methods.applicableMethods.length === 0 && (
                    <CenterNotice
                        icon="📭"
                        text={`Không có phương pháp in khả dụng cho “${selectedProduct.name_vi}” ở đơn vị hiện tại.`}
                        hint="Liên hệ quản trị để bật Năng lực sản xuất phù hợp, hoặc chọn sản phẩm khác."
                        actionLabel="← Chọn sản phẩm khác"
                        onAction={resetToProductSelection}
                    />
                )}

                {/* (E) ≥2 phương pháp & chưa chọn → bắt chọn method / so sánh (Req 4.5) */}
                {selectedProduct && methods && !methodsLoading && methods.applicableMethods.length >= 2 && selectedMethod === null && mode === 'method' && (
                    <MethodPicker
                        methods={methods.applicableMethods}
                        onChoose={setSelectedMethod}
                        onCompare={() => setMode('compare')}
                    />
                )}

                {/* (F) Chế độ so sánh giá đa phương pháp (Task 11.2, Req 5).
                     VAT cấp báo giá nằm ở mục khách hàng (CustomerInfo) — Req 8.1. */}
                {selectedProduct && methods && mode === 'compare' && selectedMethod === null && (
                    <div className="flex h-full">
                        <CustomerInfo
                            ref={customerInfoRef}
                            token={token}
                            isSidebarCollapsed={isSidebarCollapsed}
                            setIsSidebarCollapsed={setIsSidebarCollapsed}
                            onCustomerNameChange={handleCustomerNameChange}
                            nameError={errors.customerName}
                        />
                        <div className="flex-1 min-w-0 overflow-hidden relative bg-slate-100">
                            {renderExpandSidebarButton()}
                            <PriceComparator
                                token={token}
                                productCode={selectedProduct.code}
                                quoteType={quoteType}
                                productName={selectedProduct.name_vi}
                                methods={methods.applicableMethods}
                                onBack={() => setMode('method')}
                            />
                        </div>
                    </div>
                )}

                {/* (G) Đã chọn 1 phương pháp → Configurator + thông tin khách (Req 4.6) */}
                {inConfigurator && (
                    <div className="flex h-full">
                        <CustomerInfo
                            ref={customerInfoRef}
                            token={token}
                            isSidebarCollapsed={isSidebarCollapsed}
                            setIsSidebarCollapsed={setIsSidebarCollapsed}
                            onCustomerNameChange={handleCustomerNameChange}
                            nameError={errors.customerName}
                        />
                        <div className="flex-1 min-w-0 overflow-hidden relative bg-slate-100">
                            {renderExpandSidebarButton()}
                            {renderConfigurator()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function ProductPicker({ products, loading, error, search, onSearch, onRetry, onSelect }: {
    products: CatalogProduct[];
    loading: boolean;
    error: string | null;
    search: string;
    onSearch: (v: string) => void;
    onRetry: () => void;
    onSelect: (p: CatalogProduct) => void;
}) {
    const q = search.trim().toLowerCase();
    const filtered = q
        ? products.filter((p) => p.name_vi.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
        : products;

    return (
        <div className="absolute inset-0 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto">
                <div className="mb-5">
                    <h2 className="text-lg font-black text-slate-800">Chọn sản phẩm</h2>
                    <p className="text-sm text-slate-500 mt-1">Chọn sản phẩm trước, hệ thống sẽ gợi ý phương pháp in phù hợp.</p>
                </div>

                <div className="relative mb-5 max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input type="text" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Tìm theo tên, mã sản phẩm..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white" />
                </div>

                {loading && <CenterNotice icon="⏳" text="Đang tải danh sách sản phẩm..." />}
                {!loading && error && <CenterNotice icon="🚫" text={error} actionLabel="Thử lại" onAction={onRetry} />}
                {!loading && !error && filtered.length === 0 && (
                    <div className="text-center py-12 text-slate-400 text-sm">Không tìm thấy sản phẩm phù hợp.</div>
                )}

                {!loading && !error && filtered.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {filtered.map((p) => (
                            <button
                                key={p.code}
                                onClick={() => onSelect(p)}
                                className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-md transition-all group"
                            >
                                <div className="w-10 h-10 bg-indigo-100 group-hover:bg-indigo-600 group-hover:text-white text-indigo-600 rounded-lg flex items-center justify-center text-lg font-bold mb-3 transition-colors">
                                    {p.icon ? <i className={`fas ${p.icon}`} /> : (p.name_vi[0] ?? '?')}
                                </div>
                                <p className="font-semibold text-slate-800 text-sm leading-tight line-clamp-2">{p.name_vi}</p>
                                <p className="text-[11px] text-slate-400 mt-1 font-mono">{p.code}</p>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function MethodPicker({ methods, onChoose, onCompare }: {
    methods: MethodId[];
    onChoose: (m: MethodId) => void;
    onCompare: () => void;
}) {
    return (
        <div className="absolute inset-0 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
                <div className="mb-6 text-center">
                    <h2 className="text-lg font-black text-slate-800">Chọn phương pháp in</h2>
                    <p className="text-sm text-slate-500 mt-1">Sản phẩm này hỗ trợ nhiều phương pháp. Chọn một phương pháp hoặc so sánh giá.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {methods.map((m) => {
                        const meta = methodMeta(m);
                        return (
                            <button
                                key={m}
                                onClick={() => onChoose(m)}
                                className="text-left bg-white border-2 border-slate-200 rounded-2xl p-5 hover:border-indigo-500 hover:shadow-lg transition-all"
                            >
                                <span className="text-3xl">{meta.icon}</span>
                                <p className="font-black text-slate-800 mt-2">{meta.label}</p>
                                <p className="text-[12px] text-slate-500 mt-1">{meta.desc}</p>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-5 flex justify-center">
                    <button onClick={onCompare} className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-xl text-sm font-bold shadow hover:shadow-lg transition-all flex items-center gap-2">
                        ⚖️ So sánh giá đa phương pháp
                    </button>
                </div>
            </div>
        </div>
    );
}

function CenterNotice({ icon, text, hint, actionLabel, onAction }: {
    icon: string;
    text: string;
    hint?: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    return (
        <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-md">
                <p className="text-4xl mb-3">{icon}</p>
                <p className="text-slate-700 font-semibold">{text}</p>
                {hint && <p className="text-[13px] text-slate-400 mt-1">{hint}</p>}
                {actionLabel && onAction && (
                    <button onClick={onAction} className="mt-4 text-sm font-bold text-indigo-600 hover:text-indigo-800">
                        {actionLabel}
                    </button>
                )}
            </div>
        </div>
    );
}
