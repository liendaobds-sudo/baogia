import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useQuoteCart } from '../quotes/_store/useQuoteCart';
import { API_URL } from '@/lib/api';
import { formatVND } from '@/lib/format/currency';

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

    const { items, removeItem, vatRate, chietKhauRate, shippingFee, setVatRate, setChietKhauRate, setShippingFee, seedVatRate } = useQuoteCart();

    // Load default VAT from company settings (chỉ seed khi user chưa chỉnh)
    useEffect(() => {
        if (!token) return;
        fetch(`${API_URL}/erp/company-info`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(res => { if (res.success && res.data?.vat_rate != null) seedVatRate(res.data.vat_rate); })
            .catch(() => {});
    }, [token, seedVatRate]);

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

    const inputCls = "w-full px-3 py-2.5 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 transition-all shadow-sm bg-slate-50 focus:bg-white";
    const labelCls = "flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 group-focus-within:text-indigo-600 transition-colors";

    return (
        <div
            style={!isSidebarCollapsed && widthPx ? { width: widthPx, transition: isResizing ? 'none' : undefined } : undefined}
            className={`bg-white border-r border-slate-200 flex flex-col shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-10 flex-shrink-0 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-0 overflow-hidden opacity-0 invisible' : (widthPx ? 'opacity-100 visible' : 'w-[280px] lg:w-[320px] opacity-100 visible')}`}
        >
            <div className="bg-gradient-to-r from-indigo-50 to-white px-5 py-3 border-b border-indigo-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
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

            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="group"><label className={labelCls}>Phân loại</label><select value={customerType} onChange={e => setCustomerType(e.target.value)} className={inputCls}><option value="individual">Cá nhân</option><option value="company">Doanh nghiệp / Tổ chức</option></select></div>
                    <div className="group"><label className={labelCls}>Mã KH</label><input value={customerCode} onChange={e => setCustomerCode(e.target.value)} placeholder="Tự động hoặc nhập..." className={inputCls} /></div>
                </div>
                <div className="group"><label className={labelCls}>Khách hàng <span className="text-rose-500">*</span></label><input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="VD: Anh Minh" aria-invalid={!!nameError} className={`${inputCls}${nameError ? ' border-rose-400 ring-2 ring-rose-50' : ''}`} />{nameError && <p className="mt-1.5 text-[11px] font-semibold text-rose-600">{nameError}</p>}</div>
                <div className="group"><label className={labelCls}>Số điện thoại / Zalo</label><input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="09xx..." className={`${inputCls} font-mono`} /></div>

                {customerType === 'company' && (<>
                    <div className="group"><label className={labelCls}>Đơn vị / Công ty</label><input value={customerUnit} onChange={e => setCustomerUnit(e.target.value)} placeholder="Công ty TNHH..." className={inputCls} /></div>
                    <div className="group"><label className={labelCls}>Mã số thuế</label><input value={customerTaxCode} onChange={e => setCustomerTaxCode(e.target.value)} placeholder="Mã số thuế..." className={`${inputCls} font-mono`} /></div>
                </>)}

                {/* ADVANCED FIELDS TOGGLE */}
                <div className="pt-2 pb-1 border-t border-slate-100 border-dashed">
                    <button type="button" onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className="flex items-center gap-2 text-[11px] font-bold text-indigo-600 w-full hover:text-indigo-700 transition-colors">
                        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isAdvancedOpen ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        {isAdvancedOpen ? 'ẨN THÔNG TIN MỞ RỘNG' : 'THÊM THÔNG TIN MỞ RỘNG'}
                    </button>
                </div>

                {/* ADVANCED FIELDS */}
                {isAdvancedOpen && (
                    <div className="flex flex-col gap-4 pt-1">
                        {customerType !== 'company' && (<>
                            <div className="group"><label className={labelCls}>Đơn vị / Công ty</label><input value={customerUnit} onChange={e => setCustomerUnit(e.target.value)} placeholder="Tên công ty (nếu có)..." className={inputCls} /></div>
                            <div className="group"><label className={labelCls}>Mã số thuế</label><input value={customerTaxCode} onChange={e => setCustomerTaxCode(e.target.value)} placeholder="Mã số thuế..." className={`${inputCls} font-mono`} /></div>
                        </>)}
                        <div className="group"><label className={labelCls}>Địa chỉ giao hàng</label><input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Tòa nhà VTC, số 18 Tam Trinh..." className={inputCls} /></div>
                        <div className="group"><label className={labelCls}>Email</label><input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Email liên hệ..." className={inputCls} /></div>
                        <div className="group"><label className={labelCls}>Người đại diện</label><input value={customerContact} onChange={e => setCustomerContact(e.target.value)} placeholder="Chị Lan..." className={inputCls} /></div>
                    </div>
                )}

                <div className="group"><label className={labelCls}>Ghi chú nội bộ</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Ghi chú thêm cho đơn hàng..." className={`${inputCls} resize-none`} /></div>

                {/* VAT & Shipping Section */}
                <div className="mt-4 border-t border-slate-200 pt-4">
                    <h3 className="font-bold text-[11px] text-slate-500 uppercase tracking-widest mb-3">Thuế & Phí</h3>
                    <div className="flex flex-col gap-3">
                        <div className="group"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Thuế VAT</label>
                            <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))} className={inputCls}>
                                <option value={0}>Không áp thuế (0%)</option>
                                <option value={5}>5% — Giáo dục, y tế</option>
                                <option value={8}>8% — Thuế suất giảm</option>
                                <option value={10}>10% — Thuế suất thông thường</option>
                            </select>
                        </div>
                        <div className="group"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Chiết khấu (%)</label>
                            <div className="relative"><input type="number" min={0} max={100} step={0.5} value={chietKhauRate || ''} onChange={e => setChietKhauRate(parseFloat(e.target.value) || 0)} placeholder="0" className={`${inputCls} pr-8 font-mono`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">%</span></div>
                        </div>
                        <div className="group"><label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Phí giao hàng</label>
                            <div className="relative"><input type="number" min={0} step={1000} value={shippingFee || ''} onChange={e => setShippingFee(parseFloat(e.target.value) || 0)} placeholder="0" className={`${inputCls} pr-10 font-mono`} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">đ</span></div>
                        </div>
                    </div>
                </div>

                {/* CART LIST PREVIEW */}
                <div className="mt-4 border-t border-slate-200 pt-5">
                    <h3 className="font-bold text-[12px] text-indigo-900 uppercase tracking-widest flex justify-between items-center mb-3">
                        Hạng mục Báo Giá <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-[10px] font-black">{items.length} món</span>
                    </h3>
                    {items.length === 0 ? (
                        <div className="text-[11px] text-slate-400 text-center py-5 bg-slate-50 rounded-lg border border-slate-200 border-dashed">Chưa có hạng mục nào.<br/>Cấu hình bên phải rồi THÊM VÀO BÁO GIÁ.</div>
                    ) : (
                        <div className="flex flex-col gap-2.5">
                            {items.map((item, idx) => (
                                <div key={item.id} className="bg-white border border-slate-200 p-3 rounded-lg shadow-[0_2px_5px_-2px_rgba(0,0,0,0.05)] relative group">
                                    <div className="absolute -left-2.5 -top-2.5 bg-slate-800 text-white w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm">{idx + 1}</div>
                                    <div className="flex justify-between items-start pr-5 pl-1.5 mb-1.5 gap-2">
                                        <h4 className="font-bold text-[12px] text-slate-800 line-clamp-2 leading-tight flex-1" title={item.name}>{item.name}</h4>
                                        <span className="font-black text-indigo-600 text-[12px] flex-shrink-0 ml-2">{formatVND(item.total)}</span>
                                    </div>
                                    <div className="pl-1.5 flex justify-between items-center mt-1">
                                        <div className="text-[10px] bg-slate-50 text-slate-600 px-2 py-0.5 rounded font-bold border border-slate-100">{item.quantity} sp</div>
                                        <div className="text-[10px] text-slate-400 font-medium">({formatVND(item.unitPrice)}/đv)</div>
                                    </div>
                                    <button onClick={() => removeItem(item.id)} aria-label={`Xóa hạng mục ${item.name}`} title="Xóa hạng mục" className="absolute top-2.5 right-2 text-slate-300 hover:text-rose-500 bg-white hover:bg-rose-50 rounded p-1 transition-colors opacity-0 group-hover:opacity-100"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

CustomerInfo.displayName = 'CustomerInfo';
