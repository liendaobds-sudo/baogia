'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/api';
import { QuoteConfigurator } from '../_components/QuoteConfigurator';
import { useQuoteCart, type QuoteCartItem } from '../_store/useQuoteCart';
import { CustomerInfo, type CustomerInfoHandle } from '@/app/pricing/_components/CustomerInfo';
import { useResizableSidebar } from '../_components/useResizableSidebar';
import { useToast } from '@/lib/ui/toast';
import { validateQuoteDraft, isQuoteDraftValid, type QuoteDraftErrors } from '@/lib/quote/validate';
import { mapCartItemToQuoteItem } from '@/lib/quote/map-cart-item';
import { calculateHeaderDiscount } from '@/lib/quote/header-discount';
import { TrialModeSwitch } from '@/lib/scope/use-trial-mode';

type QuoteTab = 'loose' | 'bound' | 'large_format';

/** Ánh xạ tab loại báo giá sang nhãn `type` cho CreateQuoteDto. */
const mapTabToType = (tab: QuoteTab): string => {
    switch (tab) {
        case 'loose': return 'Sản phẩm rời';
        case 'bound': return 'Sản phẩm cuốn';
        case 'large_format': return 'In khổ lớn';
    }
};

/** Số hữu hạn, hoặc undefined để @IsOptional bỏ qua (tránh gửi NaN/'' làm fail @IsNumber). */
const numOrUndef = (v: unknown): number | undefined => {
    const n = Number(v);
    return Number.isFinite(n) && v !== '' && v != null ? n : undefined;
};

/**
 * Ánh xạ item giỏ hàng → QuoteItemDto — dùng helper chung `@/lib/quote/map-cart-item`
 * (audit 2026-08-29 gom 3 bản trùng ở /quotes/new, /quotes/offset, /quotes/start về một nguồn;
 * bản ở trang Cổng bị lỗi spread camelCase làm hỏng hẳn đường lưu báo giá digital).
 *
 * Bất biến: chỉ gửi khoá snake_case whitelisted của QuoteItemDto; cấu hình camelCase + payload
 * replay giá nằm trong `printing_detail`.
 */
const mapItem = (it: QuoteCartItem): Record<string, unknown> => mapCartItemToQuoteItem(it);

export default function NewQuotePage() {
    const { token } = useAuth();
    const router = useRouter();
    const toast = useToast();

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const { width: sidebarWidth, isResizing: isResizingSidebar, startResize } = useResizableSidebar('zp.quote.sidebarWidth');
    const [quoteTab, setQuoteTab] = useState<QuoteTab>('loose');
    const [isSaving, setIsSaving] = useState(false);

    // Mirror nhẹ tên khách (để disable nút Lưu + lỗi inline) — nguồn thật là CustomerInfo
    const [customerName, setCustomerName] = useState('');
    const [errors, setErrors] = useState<QuoteDraftErrors>({});

    const customerInfoRef = useRef<CustomerInfoHandle>(null);

    // Cart Context
    const {
        items,
        getTotalAmount,
        clearCart,
        addItem,
        headerDiscountType,
        headerDiscountValue,
        setHeaderDiscount,
    } = useQuoteCart();
    const [editId, setEditId] = useState<string | null>(null);

    const handleCustomerNameChange = useCallback((name: string) => {
        setCustomerName(name);
        // Xóa lỗi tên khi người dùng bắt đầu nhập
        setErrors(prev => (prev.customerName ? { ...prev, customerName: undefined } : prev));
    }, []);

    // Hydration Effect for Edit Mode
    useEffect(() => {
        if (!token || typeof window === 'undefined') return;
        const searchParams = new URLSearchParams(window.location.search);
        const id = searchParams.get('edit');
        if (!id) return;
        setEditId(id);

        let isMounted = true;
        const hydrateQuote = async () => {
            try {
                const res = await fetch(`${API_URL}/erp/orders/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();

                if (!isMounted) return;

                if (json.success && json.data) {
                    const d = json.data;
                    customerInfoRef.current?.setCustomerData({
                        customer_name: d.customer_name || '',
                        customer_phone: d.customer_phone || '',
                        customer_address: d.customer_address || '',
                        customer_unit: d.customer_unit || '',
                        customer_email: d.customer_email || '',
                        // Cột thật là `tax_code` / `customer_note` (không phải customer_tax_code / notes).
                        customer_tax_code: d.tax_code || '',
                        customer_contact: d.customer_contact || '',
                        notes: d.customer_note || '',
                    });
                    setCustomerName(d.customer_name || '');

                    clearCart();
                    setHeaderDiscount(
                        d.discount_type === 'fixed' ? 'fixed' : 'percent',
                        Number(d.discount_value) || 0,
                    );
                    if (d.items && Array.isArray(d.items)) {
                        d.items.forEach((item: any) => {
                            // Cấu hình + kết quả tính được gói trong printing_detail (xem mapItem).
                            let pd: any = {};
                            try { pd = typeof item.printing_detail === 'string' ? JSON.parse(item.printing_detail) : (item.printing_detail || {}); } catch {}
                            const parsedConfig = pd.configParams || {};
                            const parsedDetails = pd.details || {};
                            const t = (item.product_type || item.item_type || 'loose') as QuoteTab;
                            if (t === 'loose' || t === 'bound' || t === 'large_format') setQuoteTab(t);

                            addItem({
                                name: item.product_name || 'Sản phẩm',
                                type: item.product_type || item.item_type || 'loose',
                                quantity: item.quantity || 1,
                                unitPrice: item.quantity > 0 ? (parseFloat(item.item_total) / item.quantity) : 0,
                                total: parseFloat(item.item_total) || 0,
                                configParams: parsedConfig,
                                details: parsedDetails,
                                // Giữ payload gốc để lần Lưu sau vẫn được backend replay xác thực giá.
                                pricingPayload: pd.pricingPayload,
                            });
                        });
                    }
                } else {
                    console.warn('Không tìm thấy báo giá ID:', id);
                }
            } catch (error) {
                console.error("Lỗi khi load dữ liệu Edit Quote", error);
            }
        };

        hydrateQuote();
        return () => { isMounted = false; };

    }, [token, clearCart, addItem, setHeaderDiscount]);

    // [MQ-07] Prefill từ Báo giá mini (inbox): chỉ chạy khi KHÔNG ở chế độ edit.
    // Chuyển đúng tab và làm sạch giỏ tạm; việc nạp cấu hình + whitelist sản phẩm + tính giá live
    // do useQuoteConfigurator xử lý trực tiếp từ URL query (không đẩy item 0đ giả vào giỏ hàng).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('edit')) return; // edit-mode tự lo
        const tpl = sp.get('prefill_template');
        if (!tpl) return;

        const tab = (sp.get('prefill_tab') as QuoteTab) || 'loose';
        setQuoteTab(tab);
        clearCart();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const draft = { customerName, itemsCount: items.length };
    const canSave = !isSaving && isQuoteDraftValid(draft);

    const handleSaveQuote = async () => {
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
        // Chiết khấu đầu báo giá (percent/fixed) áp trước VAT; backend sẽ tính lại cùng contract.
        const headerDiscount = calculateHeaderDiscount(subtotal, headerDiscountType, headerDiscountValue);
        const { discountAmount, afterDiscount } = headerDiscount;
        const vatRate = Number(payload.vat_rate);
        const ship = Number(payload.shipping_fee);
        const vatAmount = afterDiscount * (Number.isFinite(vatRate) ? vatRate : 0) / 100;
        const shippingFee = Number.isFinite(ship) ? ship : 0;
        const grandTotal = afterDiscount + vatAmount + shippingFee;

        try {
            // Gửi code từ FE (fallback nếu BE cũ chưa auto-sinh). BE vẫn tự sinh nếu thiếu.
            const dateCode = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const clientCode = `BG-${dateCode}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
            const body = {
                code: clientCode,
                type: mapTabToType(quoteTab),
                customer_name: payload.customer_name,
                customer_phone: payload.customer_phone,
                customer_unit: payload.customer_unit,
                tax_code: payload.customer_tax_code,
                customer_address: payload.customer_address,
                customer_note: payload.notes,
                customer_email: payload.customer_email,
                customer_contact: payload.customer_contact,
                total: subtotal,
                discount_type: discountAmount > 0 ? headerDiscount.discountType : undefined,
                discount_value: headerDiscount.discountValue,
                discount_amount: discountAmount,
                vat_rate: Number.isFinite(vatRate) ? vatRate : 0,
                vat_amount: vatAmount,
                shipping_fee: shippingFee,
                grand_total: grandTotal,
                items: items.map(mapItem),
            };
            const res = await fetch(editId ? `${API_URL}/erp/orders/${editId}` : `${API_URL}/erp/orders`, {
                method: editId ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                let message = `Lưu báo giá thất bại (mã ${res.status})`;
                try {
                    const err = await res.json();
                    const m = Array.isArray(err?.message) ? err.message.join(', ') : err?.message;
                    message = m || err?.error || message;
                } catch { /* giữ message mặc định theo status */ }
                toast.show('error', message);
                return; // KHÔNG clear cart khi lỗi
            }

            const data = await res.json();
            if (data?.success === false) {
                toast.show('error', data.message || data.error || 'Lưu báo giá thất bại');
                return; // KHÔNG clear cart khi lỗi
            }

            toast.show('success', editId ? 'Cập nhật báo giá thành công!' : 'Lưu báo giá thành công!');
            clearCart();
            router.push('/pricing/quotes');
        } catch (e) {
            console.error(e);
            toast.show('error', 'Có lỗi xảy ra khi lưu báo giá');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
            {/* Top Bar - Header Only */}
            <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap shadow-sm z-20 relative">
                <div className="flex items-center gap-3 shrink-0">
                    <Link href="/pricing/quotes" aria-label="Quay lại danh sách báo giá" className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors shadow-sm shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
                    </Link>
                    <div>
                        <h1 className="text-[16px] font-black text-slate-800 m-0 leading-none">Báo Giá Mới</h1>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-wider m-0">Hệ thống In Nhanh Kỹ Thuật Số</p>
                    </div>
                </div>

                {/* Product Type Tabs (in normal flex flow to prevent overlap on 1280px–1440px screens) */}
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
                    {[
                        { id: 'loose', label: 'Sản phẩm Rời', icon: '📝' },
                        { id: 'bound', label: 'Sản phẩm Cuốn', icon: '📖' },
                        { id: 'large_format', label: 'In Khổ Lớn', icon: '🖨️' }
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setQuoteTab(t.id as QuoteTab)}
                            className={`px-3.5 py-1.5 font-semibold text-[12px] rounded-md flex items-center gap-1.5 transition-all duration-200 whitespace-nowrap ${
                                quoteTab === t.id
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-slate-500 hover:text-indigo-600'
                            }`}
                        >
                            <span className="text-[13px]">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                    <TrialModeSwitch />
                    {!canSave && !isSaving && (
                        <span className="hidden 2xl:inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                            <span>💡</span>
                            {!customerName.trim() && items.length === 0
                                ? 'Nhập tên KH & thêm hạng mục để lưu'
                                : !customerName.trim()
                                    ? 'Nhập tên Khách hàng ở cột trái để lưu'
                                    : 'Bấm "+ Thêm vào báo giá" ở cột phải để lưu'}
                        </span>
                    )}
                    <button onClick={() => router.back()} className="h-9 px-4 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md text-[13px] font-bold shadow-sm transition-colors">
                        HUỶ
                    </button>
                    <button onClick={handleSaveQuote} disabled={!canSave} aria-label="Lưu báo giá" title={!canSave ? (!customerName.trim() ? 'Vui lòng nhập tên khách hàng ở cột trái' : 'Vui lòng thêm ít nhất 1 hạng mục vào báo giá') : 'Lưu báo giá'} className={`h-9 px-5 text-white rounded-md text-[13px] font-bold shadow transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isSaving ? 'bg-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>
                        {isSaving ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        )}
                        LƯU BÁO GIÁ
                    </button>
                </div>
            </div>

            {/* Main Content Area: Sidebar + Configurator */}
            <div className="flex-1 overflow-hidden flex relative">

                {/* Shared Customer Info Sidebar (renders its own cart preview) */}
                <CustomerInfo
                    ref={customerInfoRef}
                    token={token}
                    isSidebarCollapsed={isSidebarCollapsed}
                    setIsSidebarCollapsed={setIsSidebarCollapsed}
                    onCustomerNameChange={handleCustomerNameChange}
                    nameError={errors.customerName}
                    widthPx={sidebarWidth}
                    isResizing={isResizingSidebar}
                />

                {/* Thanh kéo chỉnh độ rộng cột khách hàng */}
                {!isSidebarCollapsed && (
                    <div
                        onPointerDown={startResize}
                        role="separator"
                        aria-orientation="vertical"
                        title="Kéo để chỉnh độ rộng cột thông tin khách"
                        className="group flex-shrink-0 w-2 cursor-col-resize flex items-center justify-center bg-slate-100 hover:bg-indigo-50 transition-colors z-10"
                    >
                        <div className="w-1 h-10 rounded-full bg-slate-300 group-hover:bg-indigo-400 transition-colors" />
                    </div>
                )}

                {/* Right: Configurator Area */}
                <div className="flex-1 overflow-hidden relative bg-slate-100">
                    {/* Expand Toggle Button (Visible only when collapsed) */}
                    <div className={`transition-all duration-300 absolute z-20 top-3 ${isSidebarCollapsed ? 'left-0 opacity-100 visible' : '-left-10 opacity-0 invisible'}`}>
                        <button
                            onClick={() => setIsSidebarCollapsed(false)}
                            aria-label="Mở rộng thông tin khách hàng"
                            className="bg-white border border-l-0 border-slate-200 shadow-[2px_0_10px_rgba(0,0,0,0.08)] py-2.5 px-1.5 rounded-r-lg text-indigo-600 hover:bg-indigo-50 transition-colors group"
                            title="Mở rộng thông tin khách hàng"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-0.5 transition-transform"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
                        </button>
                    </div>

                    <div className="absolute inset-0 overflow-hidden">
                        <QuoteConfigurator token={token} activeTab={quoteTab} onTabChange={setQuoteTab} />
                    </div>
                </div>
            </div>
        </div>
    );
}
