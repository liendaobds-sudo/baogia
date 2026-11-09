import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useQuoteCart } from '../quotes/_store/useQuoteCart';
import { API_URL } from '@/lib/api';
import { formatVND } from '@/lib/format/currency';
import { calculateHeaderDiscount, type HeaderDiscountType } from '@/lib/quote/header-discount';

/**
 * Props cho Thành_Phần_Thông_Tin_Khách dùng chung.
 * Giữ tương thích với CustomerInfoSidebar trước đây.
 */
export interface CustomerInfoProps {
    token: string | null;
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (v: boolean) => void;
    title?: string;
    subtitle?: string;
    /** Thông báo mỗi khi tên khách hàng đổi, phục vụ mirror nhẹ + disable nút Lưu. */
    onCustomerNameChange?: (name: string) => void;
    /** Lỗi kiểm tra hiển thị inline ngay dưới ô tên khách (Req 5.2). */
    nameError?: string;
    /** Độ rộng sidebar (px) khi mở — để kéo giãn. Không truyền thì dùng độ rộng mặc định. */
    widthPx?: number;
    /** Đang kéo chỉnh độ rộng — tắt transition cho mượt tay. */
    isResizing?: boolean;
}

/**
 * Payload thông tin khách hàng. Giữ nguyên contract của CustomerInfoSidebar
 * để các nơi đang dùng không phải đổi hình dạng dữ liệu.
 */
export interface CustomerInfoPayload {
    customer_name: string;
    customer_code: string;
    customer_type: string;
    customer_phone: string;
    customer_address: string;
    customer_unit: string;
    customer_email: string;
    customer_tax_code: string;
    customer_contact: string;
    notes: string;
    vat_rate: number;
    shipping_fee: number;
}

/**
 * Ref API của CustomerInfo:
 * - getPayload(): trả toàn bộ CustomerInfoPayload (giữ nguyên contract cũ).
 * - setCustomerData(d): nạp dữ liệu khách (chế độ sửa).
 * - getDraftState(): trả trạng thái nháp tối thiểu cho validateQuoteDraft.
 */
export interface CustomerInfoHandle {
    getPayload(): CustomerInfoPayload;
    setCustomerData(d: Partial<CustomerInfoPayload>): void;
    getDraftState(): { customerName: string };
}

export const CustomerInfo = forwardRef<CustomerInfoHandle, CustomerInfoProps>(({
    token, isSidebarCollapsed, setIsSidebarCollapsed, title = 'Thông tin Khách', subtitle = 'Đơn hàng',
    onCustomerNameChange, nameError, widthPx, isResizing,
}, ref) => {
    const [customerName, setCustomerName] = useState('');
    const [customerCode, setCustomerCode] = useState('');
    const [customerType, setCustomerType] = useState('individual');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [customerUnit, setCustomerUnit] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerTaxCode, setCustomerTaxCode] = useState('');
    const [customerContact, setCustomerContact] = useState('');
    const [notes, setNotes] = useState('');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    // Tìm nhanh khách hàng từ CRM (/erp/customers) — chỉ mở theo thao tác người dùng
    const [showCustomerLookup, setShowCustomerLookup] = useState(false);
    const [customerSearchQuery, setCustomerSearchQuery] = useState('');
    const [customerResults, setCustomerResults] = useState<any[]>([]);
    const [searchingCustomers, setSearchingCustomers] = useState(false);

    const {
        items,
        editingItemId,
        setEditingItemId,
        addItem,
        removeItem,
        vatRate,
        headerDiscountType,
        headerDiscountValue,
        shippingFee,
        setVatRate,
        setHeaderDiscount,
        setShippingFee,
        seedVatRate,
    } = useQuoteCart();

    // Load default VAT from company settings (chỉ seed khi user chưa chỉnh)
    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/erp/company-info`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(res => { if (res.success && res.data?.vat_rate != null) seedVatRate(res.data.vat_rate); })
            .catch(() => {});
    }, [token, seedVatRate]);

    // Tra cứu khách hàng khi bật hộp tìm kiếm CRM
    useEffect(() => {
        if (!showCustomerLookup || !token) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            setSearchingCustomers(true);
            const q = encodeURIComponent(customerSearchQuery.trim());
            fetch(`${API_URL}/erp/customers?search=${q}&limit=8`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then(r => r.json())
                .then(res => {
                    if (cancelled) return;
                    const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.data?.items) ? res.data.items : []);
                    setCustomerResults(list.slice(0, 8));
                })
                .catch(() => { if (!cancelled) setCustomerResults([]); })
                .finally(() => { if (!cancelled) setSearchingCustomers(false); });
        }, 220);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [showCustomerLookup, customerSearchQuery, token]);

    // Surface customer name changes to parent (name mirror + inline validation)
    useEffect(() => {
        onCustomerNameChange?.(customerName);
    }, [customerName, onCustomerNameChange]);

    // Expose ref API to parent
    useImperativeHandle(ref, () => ({
        getPayload: (): CustomerInfoPayload => ({
            customer_name: customerName,
            customer_code: customerCode,
            customer_type: customerType,
            customer_phone: customerPhone,
            customer_address: customerAddress,
            customer_unit: customerUnit,
            customer_email: customerEmail,
            customer_tax_code: customerTaxCode,
            customer_contact: customerContact,
            notes,
            vat_rate: vatRate,
            shipping_fee: shippingFee,
        }),
        setCustomerData: (d: Partial<CustomerInfoPayload>) => {
            setCustomerName(d.customer_name || '');
            setCustomerCode(d.customer_code || '');
            if (d.customer_type) setCustomerType(d.customer_type);
            setCustomerPhone(d.customer_phone || '');
            setCustomerAddress(d.customer_address || '');
            setCustomerUnit(d.customer_unit || '');
            setCustomerEmail(d.customer_email || '');
            setCustomerTaxCode(d.customer_tax_code || '');
            setCustomerContact(d.customer_contact || '');
            setNotes(d.notes || '');
            if (typeof d.vat_rate === 'number') setVatRate(d.vat_rate);
            if (typeof d.shipping_fee === 'number') setShippingFee(d.shipping_fee);
        },
        getDraftState: () => ({ customerName }),
    }));

    // Tính tổng tiền báo giá theo đúng hợp đồng với handleSaveQuote (new/page.tsx)
    const subtotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const { discountAmount, afterDiscount } = calculateHeaderDiscount(subtotal, headerDiscountType, headerDiscountValue);
    const safeVatRate = Number.isFinite(Number(vatRate)) ? Number(vatRate) : 0;
    const safeShippingFee = Number.isFinite(Number(shippingFee)) ? Number(shippingFee) : 0;
    const vatAmount = Math.round((afterDiscount * safeVatRate) / 100);
    const grandTotal = Math.round(afterDiscount + vatAmount + safeShippingFee);

    const inputCls = "w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all shadow-sm bg-slate-50 focus:bg-white";
    const labelCls = "flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 group-focus-within:text-indigo-600 transition-colors";

    return (
        <div
            style={!isSidebarCollapsed && widthPx ? { width: widthPx, transition: isResizing ? 'none' : undefined } : undefined}
            className={`bg-white border-r border-slate-200 flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-10 flex-shrink-0 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 overflow-hidden opacity-0 invisible' : (widthPx ? 'opacity-100 visible' : 'w-[280px] lg:w-[320px] opacity-100 visible')}`}
        >
            <div className="bg-gradient-to-r from-indigo-50 to-white px-4 py-3 border-b border-indigo-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-200">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    </div>
                    <div>
                        <h2 className="text-[13px] font-bold text-indigo-900 uppercase tracking-wide">{title}</h2>
                        <p className="text-[11px] text-indigo-600/70 font-medium leading-none mt-0.5">{subtitle}</p>
                    </div>
                </div>
                <button onClick={() => setIsSidebarCollapsed(true)} aria-label="Thu gọn thông tin khách" className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors" title="Thu gọn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></svg>
                </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                    <div className="group"><label className={labelCls}>Phân loại</label><select value={customerType} onChange={e => setCustomerType(e.target.value)} className={inputCls}><option value="individual">Cá nhân</option><option value="company">Doanh nghiệp / Tổ chức</option></select></div>
                    <div className="group"><label className={labelCls}>Mã KH</label><input value={customerCode} onChange={e => setCustomerCode(e.target.value)} placeholder="Tự động hoặc nhập..." className={inputCls} /></div>
                </div>

                <div className="group">
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Khách hàng <span className="text-rose-500">*</span>
                        </label>
                        {token && (
                            <button
                                type="button"
                                onClick={() => setShowCustomerLookup(v => !v)}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors"
                            >
                                {showCustomerLookup ? 'Đóng tìm KH' : '🔍 Chọn KH cũ'}
                            </button>
                        )}
                    </div>

                    {showCustomerLookup && (
                        <div className="mb-2 p-2 bg-indigo-50/60 border border-indigo-200 rounded-lg">
                            <input
                                type="text"
                                value={customerSearchQuery}
                                onChange={e => setCustomerSearchQuery(e.target.value)}
                                placeholder="Gõ tên, SĐT hoặc mã KH để tìm..."
                                className="w-full px-2.5 py-1.5 text-[12px] bg-white border border-indigo-200 rounded outline-none focus:border-indigo-500 mb-1.5"
                            />
                            {searchingCustomers ? (
                                <div className="text-[11px] text-slate-400 text-center py-2">Đang tìm khách hàng...</div>
                            ) : customerResults.length === 0 ? (
                                <div className="text-[11px] text-slate-400 text-center py-1.5">Không tìm thấy khách hàng phù hợp</div>
                            ) : (
                                <div className="max-h-36 overflow-y-auto custom-scrollbar divide-y divide-slate-100 bg-white rounded border border-slate-200">
                                    {customerResults.map((c: any) => (
                                        <button
                                            key={c.id || c.code || c.phone}
                                            type="button"
                                            onClick={() => {
                                                setCustomerName(c.name || c.customer_name || '');
                                                setCustomerCode(c.code || c.customer_code || '');
                                                setCustomerPhone(c.phone || c.customer_phone || '');
                                                if (c.company || c.unit || c.tax_code) {
                                                    setCustomerType('company');
                                                    setCustomerUnit(c.company || c.unit || '');
                                                    setCustomerTaxCode(c.tax_code || '');
                                                }
                                                if (c.address) setCustomerAddress(c.address);
                                                if (c.email) setCustomerEmail(c.email);
                                                setShowCustomerLookup(false);
                                            }}
                                            className="w-full text-left px-2.5 py-1.5 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2 text-[11px]"
                                        >
                                            <span className="font-bold text-slate-800 truncate">{c.name || c.customer_name}</span>
                                            <span className="text-slate-500 font-mono shrink-0">{c.phone || c.code || ''}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <input
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        placeholder="VD: Anh Minh"
                        aria-invalid={!!nameError}
                        className={`${inputCls}${nameError ? ' border-rose-400 ring-2 ring-rose-50' : ''}`}
                    />
                    {nameError && <p className="mt-1 text-[11px] font-semibold text-rose-600">{nameError}</p>}
                </div>

                <div className="group"><label className={labelCls}>Số điện thoại / Zalo</label><input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="09xx..." className={`${inputCls} font-mono`} /></div>

                {customerType === 'company' && (<>
                    <div className="group"><label className={labelCls}>Đơn vị / Công ty</label><input value={customerUnit} onChange={e => setCustomerUnit(e.target.value)} placeholder="Công ty TNHH..." className={inputCls} /></div>
                    <div className="group"><label className={labelCls}>Mã số thuế</label><input value={customerTaxCode} onChange={e => setCustomerTaxCode(e.target.value)} placeholder="Mã số thuế..." className={`${inputCls} font-mono`} /></div>
                </>)}

                {/* ADVANCED FIELDS TOGGLE */}
                <div className="pt-1 border-t border-slate-100 border-dashed">
                    <button type="button" onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className="flex items-center gap-2 text-[11px] font-bold text-indigo-600 w-full hover:text-indigo-700 transition-colors">
                        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isAdvancedOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        {isAdvancedOpen ? 'ẨN THÔNG TIN MỞ RỘNG' : 'THÊM THÔNG TIN MỞ RỘNG (Địa chỉ, Email, Ghi chú)'}
                    </button>
                </div>

                {/* ADVANCED FIELDS */}
                {isAdvancedOpen && (
                    <div className="flex flex-col gap-3 pt-1">
                        {customerType !== 'company' && (<>
                            <div className="group"><label className={labelCls}>Đơn vị / Công ty</label><input value={customerUnit} onChange={e => setCustomerUnit(e.target.value)} placeholder="Tên công ty (nếu có)..." className={inputCls} /></div>
                            <div className="group"><label className={labelCls}>Mã số thuế</label><input value={customerTaxCode} onChange={e => setCustomerTaxCode(e.target.value)} placeholder="Mã số thuế..." className={`${inputCls} font-mono`} /></div>
                        </>)}
                        <div className="group"><label className={labelCls}>Địa chỉ giao hàng</label><input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Tòa nhà VTC, số 18 Tam Trinh..." className={inputCls} /></div>
                        <div className="group"><label className={labelCls}>Email</label><input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Email liên hệ..." className={inputCls} /></div>
                        <div className="group"><label className={labelCls}>Người đại diện</label><input value={customerContact} onChange={e => setCustomerContact(e.target.value)} placeholder="Chị Lan..." className={inputCls} /></div>
                        <div className="group"><label className={labelCls}>Ghi chú nội bộ</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ghi chú thêm cho đơn hàng..." className={`${inputCls} resize-none`} /></div>
                    </div>
                )}

                {/* VAT & Shipping Section */}
                <div className="mt-2 border-t border-slate-200 pt-3.5">
                    <h3 className="font-bold text-[11px] text-slate-500 uppercase tracking-widest mb-2.5">Thuế & Phí báo giá</h3>
                    <div className="flex flex-col gap-2.5">
                        <div className="group"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Thuế VAT</label>
                            <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))} className={inputCls}>
                                <option value={0}>Không áp thuế (0%)</option>
                                <option value={5}>5% — Giáo dục, y tế</option>
                                <option value={8}>8% — Thuế suất giảm</option>
                                <option value={10}>10% — Thuế suất thông thường</option>
                            </select>
                        </div>
                        <div className="group"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Chiết khấu báo giá</label>
                            <div className="grid grid-cols-12 gap-2">
                                <select
                                    aria-label="Loại chiết khấu báo giá"
                                    value={headerDiscountType}
                                    onChange={e => setHeaderDiscount(e.target.value as HeaderDiscountType, headerDiscountValue)}
                                    className={`${inputCls} col-span-5 px-2`}
                                >
                                    <option value="percent">Phần trăm</option>
                                    <option value="fixed">Số tiền</option>
                                </select>
                                <div className="relative col-span-7 min-w-0">
                                    <input
                                        aria-label="Giá trị chiết khấu báo giá"
                                        type="number"
                                        min={0}
                                        max={headerDiscountType === 'percent' ? 100 : undefined}
                                        step={headerDiscountType === 'percent' ? 0.5 : 1000}
                                        value={headerDiscountValue || ''}
                                        onChange={e => setHeaderDiscount(headerDiscountType, parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        className={`${inputCls} pr-8 font-mono`}
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">
                                        {headerDiscountType === 'percent' ? '%' : 'đ'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="group"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Phí giao hàng</label>
                            <div className="relative"><input type="number" min={0} step={1000} value={shippingFee || ''} onChange={e => setShippingFee(parseFloat(e.target.value) || 0)} placeholder="0" className={`${inputCls} pr-10 font-mono`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">đ</span></div>
                        </div>
                    </div>
                </div>

                {/* CART LIST PREVIEW */}
                <div className="mt-2 border-t border-slate-200 pt-3.5">
                    <h3 className="font-bold text-[12px] text-indigo-900 uppercase tracking-widest flex justify-between items-center mb-2.5">
                        Hạng mục Báo Giá <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-[10px] font-black">{items.length} món</span>
                    </h3>
                    {items.length === 0 ? (
                        <div className="text-[11px] text-slate-400 text-center py-4 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
                            Chưa có hạng mục nào.<br />Cấu hình bên phải rồi bấm <b>THÊM VÀO BÁO GIÁ</b>.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {items.map((item, idx) => {
                                const isEditing = editingItemId === item.id;
                                const cp = item.configParams || {};
                                const specBadges: string[] = [];
                                if (cp.itemWidth && cp.itemHeight) specBadges.push(`${cp.itemWidth}×${cp.itemHeight}mm`);
                                else if (cp.bWidth && cp.bHeight) specBadges.push(`${cp.bWidth}×${cp.bHeight}mm`);
                                else if (cp.lfWidth && cp.lfHeight) specBadges.push(`${cp.lfWidth}×${cp.lfHeight}mm`);
                                if (cp.bPageCount) specBadges.push(`${cp.bPageCount} trang`);
                                if (cp.materialName) specBadges.push(String(cp.materialName));
                                if (cp.paperSizeName) specBadges.push(`Khổ ${cp.paperSizeName}`);
                                if (Array.isArray(cp.processingNames) && cp.processingNames.length > 0) {
                                    specBadges.push(cp.processingNames.join(', '));
                                }

                                return (
                                    <div
                                        key={item.id}
                                        className={`bg-white border p-2.5 rounded-lg shadow-[0_2px_5px_-2px_rgba(0,0,0,0.05)] relative transition-all ${
                                            isEditing ? 'border-emerald-500 ring-2 ring-emerald-100 bg-emerald-50/20' : 'border-slate-200 hover:border-indigo-200'
                                        }`}
                                    >
                                        <div className={`absolute -left-2 -top-2 text-white w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm ${isEditing ? 'bg-emerald-600' : 'bg-slate-800'}`}>
                                            {idx + 1}
                                        </div>
                                        <div className="flex justify-between items-start pl-1.5 mb-1 gap-2">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-[12px] text-slate-800 line-clamp-1 leading-tight" title={item.name}>
                                                    {item.name}
                                                </h4>
                                                {isEditing && (
                                                    <span className="inline-block text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded mt-0.5">
                                                        Đang chỉnh sửa bên phải
                                                    </span>
                                                )}
                                            </div>
                                            <span className="font-black text-indigo-600 text-[12px] whitespace-nowrap shrink-0">
                                                {formatVND(item.total)}
                                            </span>
                                        </div>

                                        {specBadges.length > 0 && (
                                            <div className="pl-1.5 flex flex-wrap gap-1 my-1">
                                                {specBadges.map((badge, bIdx) => (
                                                    <span key={bIdx} className="text-[9px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-full">
                                                        {badge}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="pl-1.5 flex justify-between items-center mt-1.5 pt-1.5 border-t border-slate-100">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold border border-indigo-100">
                                                    {item.quantity.toLocaleString()} sp
                                                </span>
                                                <span className="text-[10px] text-slate-400 font-medium">
                                                    ({formatVND(item.unitPrice)}/đv)
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {setEditingItemId && item.type !== 'offset' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingItemId(isEditing ? null : item.id)}
                                                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                                            isEditing
                                                                ? 'bg-emerald-600 text-white'
                                                                : 'text-indigo-600 hover:bg-indigo-50 border border-indigo-100'
                                                        }`}
                                                        title="Nạp hạng mục này sang khung cấu hình để sửa"
                                                    >
                                                        {isEditing ? 'Đang sửa' : 'Sửa'}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => addItem({
                                                        name: `${item.name} (bản sao)`,
                                                        type: item.type,
                                                        quantity: item.quantity,
                                                        total: item.total,
                                                        unitPrice: item.unitPrice,
                                                        details: item.details,
                                                        configParams: item.configParams,
                                                        pricingPayload: item.pricingPayload,
                                                    })}
                                                    className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 transition-colors"
                                                    title="Nhân bản hạng mục này"
                                                >
                                                    Nhân bản
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeItem(item.id)}
                                                    aria-label={`Xóa hạng mục ${item.name}`}
                                                    title="Xóa hạng mục"
                                                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded p-1 transition-colors"
                                                >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a4 4 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* KHỐI TỔNG KẾT ĐƠN HÀNG (Subtotal -> Discount -> VAT -> Shipping -> Grand Total) */}
                {items.length > 0 && (
                    <div className="mt-2 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-xl p-3.5 shadow-md space-y-2">
                        <div className="flex justify-between items-center text-[11px] text-slate-300">
                            <span>Tạm tính ({items.length} hạng mục):</span>
                            <span className="font-bold text-white whitespace-nowrap">{formatVND(subtotal)}</span>
                        </div>
                        {discountAmount > 0 && (
                            <div className="flex justify-between items-center text-[11px] text-emerald-300">
                                <span>Chiết khấu ({headerDiscountType === 'percent' ? `${headerDiscountValue}%` : 'Trực tiếp'}):</span>
                                <span className="font-bold whitespace-nowrap">-{formatVND(discountAmount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-[11px] text-slate-300">
                            <span>Thuế VAT ({safeVatRate}%):</span>
                            <span className="font-bold text-white whitespace-nowrap">+{formatVND(vatAmount)}</span>
                        </div>
                        {safeShippingFee > 0 && (
                            <div className="flex justify-between items-center text-[11px] text-slate-300">
                                <span>Phí giao hàng:</span>
                                <span className="font-bold text-white whitespace-nowrap">+{formatVND(safeShippingFee)}</span>
                            </div>
                        )}
                        <div className="border-t border-slate-700/80 pt-2 mt-1 flex justify-between items-baseline gap-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-200">TỔNG THANH TOÁN:</span>
                            <span className="text-[18px] font-black text-amber-400 leading-none whitespace-nowrap">
                                {formatVND(grandTotal)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

CustomerInfo.displayName = 'CustomerInfo';
