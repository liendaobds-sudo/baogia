'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/api';
import { CustomerInfo, type CustomerInfoHandle } from '@/app/pricing/_components/CustomerInfo';
import { useResizableSidebar } from '../_components/useResizableSidebar';
import { OffsetQuoteConfigurator, type OffsetProductType } from '../_components/OffsetQuoteConfigurator';
import { useQuoteCart, type QuoteCartItem } from '../_store/useQuoteCart';
import { useToast } from '@/lib/ui/toast';
import { validateQuoteDraft, isQuoteDraftValid, type QuoteDraftErrors } from '@/lib/quote/validate';

/**
 * Ánh xạ item offset sang QuoteItemDto. KHÁC in nhanh: cấu hình offset dùng khóa camelCase
 * (materialCode, khoIn, rong, soKemIn...) KHÔNG nằm trong whitelist QuoteItemDto → KHÔNG được
 * spread thẳng (sẽ bị `forbidNonWhitelisted` → HTTP 400). Vì vậy chỉ gửi các field whitelisted,
 * và gói toàn bộ cấu hình + kết quả tính (lines/meta) vào `printing_detail` (JSON tự do, được lưu)
 * để báo giá offset tái dựng được sau này. KHÔNG đổi logic tính giá.
 */
const mapItem = (it: QuoteCartItem): Record<string, unknown> => ({
    product_name: it.name,
    item_type: 'offset',
    product_type: (it.configParams as Record<string, unknown>)?.type as string ?? 'offset',
    quantity: it.quantity,
    item_total: it.total,
    printing_detail: {
        offset: true,
        config: it.configParams,
        result: it.details,
        unitPrice: it.unitPrice,
    },
});

const OFFSET_TABS: { id: OffsetProductType; label: string; icon: string }[] = [
    { id: 'to_roi', label: 'Tờ rơi', icon: '📄' },
    { id: 'bi_thu_folder', label: 'Bì thư / Folder', icon: '✉️' },
    { id: 'sp_khac', label: 'Sản phẩm khác', icon: '🧩' },
    { id: 'hop_giay', label: 'Hộp giấy', icon: '📦' },
    { id: 'tui_giay', label: 'Túi giấy', icon: '🛍️' },
];

export default function OffsetQuotePage() {
    const { token } = useAuth();
    const router = useRouter();
    const toast = useToast();

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const { width: sidebarWidth, isResizing: isResizingSidebar, startResize } = useResizableSidebar('zp.quote.sidebarWidth');
    const [isSaving, setIsSaving] = useState(false);
    const [productType, setProductType] = useState<OffsetProductType>('to_roi');

    // Mirror nhẹ tên khách (disable nút Lưu + lỗi inline) — nguồn thật là CustomerInfo
    const [customerName, setCustomerName] = useState('');
    const [errors, setErrors] = useState<QuoteDraftErrors>({});

    const sidebarRef = useRef<CustomerInfoHandle>(null);
    const { items, getTotalAmount, clearCart, addItem } = useQuoteCart();
    const [editId, setEditId] = useState<string | null>(null);

    // Hydrate khi sửa (?edit=ID): nạp khách + giỏ hàng từ printing_detail của báo giá offset đã lưu.
    useEffect(() => {
        if (!token || typeof window === 'undefined') return;
        const id = new URLSearchParams(window.location.search).get('edit');
        if (!id) return;
        setEditId(id);
        let alive = true;
        (async () => {
            try {
                const res = await fetch(`${API_URL}/erp/orders/${id}`, { headers: { Authorization: `Bearer ${token}` } });
                const json = await res.json();
                if (!alive || !json?.success || !json.data) return;
                const d = json.data;
                sidebarRef.current?.setCustomerData({
                    customer_name: d.customer_name || '', customer_phone: d.customer_phone || '',
                    customer_address: d.customer_address || '', customer_unit: d.customer_unit || '',
                    customer_email: d.customer_email || '', customer_contact: d.customer_contact || '',
                    customer_tax_code: d.tax_code || '', notes: d.customer_note || '',
                });
                setCustomerName(d.customer_name || '');
                clearCart();
                let tabSet = false;
                for (const it of (d.items || [])) {
                    let pd: any = {};
                    try { pd = typeof it.printing_detail === 'string' ? JSON.parse(it.printing_detail) : (it.printing_detail || {}); } catch { /* bỏ qua */ }
                    if (!pd?.offset || !pd.config) continue;
                    // Nạp lại tab loại sản phẩm theo item đầu tiên (để form hiển thị đúng khi Sửa).
                    if (!tabSet) {
                        const t = pd.config?.type as OffsetProductType | undefined;
                        if (t && OFFSET_TABS.some(x => x.id === t)) { setProductType(t); tabSet = true; }
                    }
                    const qty = Number(it.quantity) || 1;
                    const total = parseFloat(it.item_total) || 0;
                    addItem({
                        name: it.product_name || 'Offset',
                        type: 'offset',
                        quantity: qty,
                        total,
                        unitPrice: pd.unitPrice ?? (qty > 0 ? total / qty : 0),
                        details: pd.result,
                        configParams: pd.config,
                    });
                }
            } catch (e) { console.error('Hydrate offset edit lỗi', e); }
        })();
        return () => { alive = false; };
    }, [token, clearCart, addItem]);

    const handleCustomerNameChange = useCallback((name: string) => {
        setCustomerName(name);
        setErrors(prev => (prev.customerName ? { ...prev, customerName: undefined } : prev));
    }, []);

    const draft = { customerName, itemsCount: items.length };
    const canSave = !isSaving && isQuoteDraftValid(draft);

    const handleSaveQuote = async () => {
        if (!token) return;

        const payload = sidebarRef.current?.getPayload();
        const draftName = sidebarRef.current?.getDraftState().customerName ?? '';
        const draftNow = { customerName: draftName, itemsCount: items.length };
        const errs = validateQuoteDraft(draftNow);
        setErrors(errs);
        if (!isQuoteDraftValid(draftNow)) {
            toast.show('error', errs.customerName || errs.items || 'Vui lòng kiểm tra lại thông tin báo giá');
            return;
        }
        if (!payload) return;

        setIsSaving(true);

        // ── QUY ƯỚC THỐNG NHẤT ──
        // item.total = giá TRƯỚC VAT (đã trừ chiết khấu nội bộ engine). VAT áp 1 lần ở đây theo % chung mục khách,
        // trên giá sau chiết khấu → khớp công thức server (orders.service) tính lại khi lưu.
        const subtotal = getTotalAmount(); // Σ item.total (trước VAT)
        const vatRate = Number(payload.vat_rate) || 0;
        const vatAmount = subtotal * vatRate / 100;
        const grandTotal = subtotal + vatAmount + payload.shipping_fee;

        try {
            const res = await fetch(editId ? `${API_URL}/erp/orders/${editId}` : `${API_URL}/erp/orders`, {
                method: editId ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    type: 'In Offset',
                    customer_name: payload.customer_name,
                    customer_phone: payload.customer_phone,
                    customer_unit: payload.customer_unit,
                    tax_code: payload.customer_tax_code,
                    customer_address: payload.customer_address,
                    customer_note: payload.notes,
                    customer_email: payload.customer_email,
                    customer_contact: payload.customer_contact,
                    total: subtotal,
                    vat_rate: payload.vat_rate,
                    vat_amount: vatAmount,
                    shipping_fee: payload.shipping_fee,
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
                return; // KHÔNG clear cart khi lỗi
            }

            const data = await res.json();
            if (data?.success === false) {
                toast.show('error', data.message || data.error || 'Lưu báo giá thất bại');
                return;
            }

            toast.show('success', editId ? 'Cập nhật báo giá Offset thành công!' : 'Lưu báo giá Offset thành công!');
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
            {/* Top Bar */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm z-20 relative">
                <div className="flex items-center gap-4">
                    <Link href="/pricing/quotes" aria-label="Quay lại danh sách báo giá" className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors shadow-sm">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
                    </Link>
                    <div>
                        <h1 className="text-[16px] font-black text-slate-800 m-0 leading-none">Báo Giá In Offset</h1>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-wider m-0">Hệ thống tính giá Offset</p>
                    </div>
                </div>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                    {OFFSET_TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setProductType(t.id)}
                            className={`px-3 py-1.5 font-semibold text-[12px] rounded-md flex items-center gap-1.5 transition-all duration-200 ${
                                productType === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-indigo-600'
                            }`}
                        >
                            <span className="text-[13px]">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={() => router.back()} className="h-9 px-4 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md text-[13px] font-bold shadow-sm transition-colors">HUỶ</button>
                    <button onClick={handleSaveQuote} disabled={!canSave} aria-label="Lưu báo giá" className={`h-9 px-5 text-white rounded-md text-[13px] font-bold shadow transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${isSaving ? 'bg-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>
                        {isSaving ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>}
                        LƯU BÁO GIÁ
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden flex relative">
                {isSidebarCollapsed && (
                    <button
                        onClick={() => setIsSidebarCollapsed(false)}
                        aria-label="Mở rộng thông tin khách hàng"
                        className="absolute left-0 top-6 z-30 bg-indigo-600 text-white p-2 rounded-r-md shadow-md hover:bg-indigo-700 transition-colors"
                        title="Mở rộng thông tin"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></svg>
                    </button>
                )}

                <CustomerInfo
                    ref={sidebarRef}
                    token={token}
                    isSidebarCollapsed={isSidebarCollapsed}
                    setIsSidebarCollapsed={setIsSidebarCollapsed}
                    onCustomerNameChange={handleCustomerNameChange}
                    nameError={errors.customerName}
                    widthPx={sidebarWidth}
                    isResizing={isResizingSidebar}
                />

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

                <div className="flex-1 min-w-0 overflow-hidden">
                    <OffsetQuoteConfigurator activeType={productType} />
                </div>
            </div>
        </div>
    );
}
