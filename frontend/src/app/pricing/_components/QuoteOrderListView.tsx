'use client';

import { useAuth, usePermissions } from '@/lib/auth-context';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

import { API_URL as API } from '@/lib/api';
import { filterByView, viewToStatuses } from '@/lib/scope/quote-view';
import type { ViewKey } from '@/lib/scope/types';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useToast } from '@/lib/ui/toast';
import { ConfirmModal } from '@/lib/ui/ConfirmModal';
import { formatVND } from '@/lib/format/currency';

interface QuoteItem {
    id: number;
    code: string;
    customerName: string;
    customerPhone: string;
    total: number;
    status: string;
    createdAt: string;
    type?: string;
    validUntil?: string;
    createdBy?: string;
    items?: QuoteItemDetail[];
}

interface QuoteItemDetail {
    productName: string;
    quantity: number;
    unit: string;
    materialName: string | null;
    itemWidth: number;
    itemHeight: number;
    printType: string | null;
    processingDetails: string | null;
    itemTotal: number;
    offsetSpec?: string | null;
    digitalSpec?: string | null;
    productType?: string | null;
    [key: string]: unknown;
}

/**
 * Props cho component dùng chung `QuoteOrderListView`.
 *
 * Component này gom toàn bộ logic list + detail (vốn nằm trong
 * `frontend/src/app/pricing/quotes/page.tsx`) để hai route Báo giá và Đơn hàng
 * tái dùng chung mà không lặp code (Task 11.2 — Requirement 8).
 */
export interface QuoteOrderListViewProps {
    /**
     * Khung nhìn của trang: `'quote'` cho /pricing/quotes, `'order'` cho /pricing/orders.
     * Việc tách Báo giá ↔ Đơn hàng nay do HAI MỤC MENU top-level đảm nhiệm; trang không
     * còn bộ tab chuyển khung nhìn nội bộ (đã bỏ để khỏi trùng với menu). Các trạng thái
     * ngoài nhóm (rejected/cancelled/expired) truy cập qua dropdown lọc trạng thái.
     */
    defaultView: ViewKey;
    /** Ghi đè tiêu đề panel danh sách (mặc định "Danh sách Báo Giá"). */
    title?: string;
}

/** Dựng chuỗi mô tả ngắn cho item offset từ printing_detail (config + result.meta). */
function buildOffsetSpec(pd: any): string {
    const c = pd?.config || {};
    const m = pd?.result?.meta || {};
    const parts: string[] = [];
    let size = c.kichThuoc || '';
    if (!size) {
        if (c.hong != null && c.hong !== '') size = `${c.cao}×${c.rong}×${c.hong}${c.mi != null && c.mi !== '' ? `×${c.mi}` : ''}cm`;
        else if (c.rong && c.cao) size = `${c.rong}×${c.cao}cm`;
    }
    if (size) parts.push(`KT: ${size}`);
    if (m.khoBinh || m.khoGiayLon) parts.push(`Khổ: ${m.khoBinh || m.khoGiayLon}`);
    if (c.materialCode) parts.push(`Giấy: ${c.materialCode}`);
    const soMau = c.soKemIn ?? c.soMau ?? c.soKem;
    if (soMau) parts.push(`${soMau} màu${m.loaiKem ? ` (${m.loaiKem})` : ''}`);
    if (m.soConToLon) parts.push(`${m.soConToLon} con/tờ`);
    if (m.soToLon) parts.push(`${Number(m.soToLon).toLocaleString('vi-VN')} tờ in`);
    return parts.join(' · ');
}

/** Quy cách digital (loose/bound/LF) từ printing_detail + cột denormalized. */
function buildDigitalSpec(it: any, pd: any): string {
    const c = pd?.configParams || {};
    const parts: string[] = [];
    const w = it.item_width ?? c.itemWidth ?? c.lfWidth;
    const h = it.item_height ?? c.itemHeight ?? c.lfHeight;
    if (w && h) parts.push(`${w}×${h} mm`);
    const mat = it.material_name || c.materialName;
    if (mat) parts.push(String(mat));
    const paper = it.paper_size_name || c.paperSizeName;
    if (paper) parts.push(`Khổ: ${paper}`);
    const side = it.print_side || c.printSide || c.bCoverPrintSide;
    if (side) parts.push(side === 'double' || side === '2' ? '2 mặt' : side === 'single' || side === '1' ? '1 mặt' : String(side));
    const pt = it.print_type || c.printType || c.lfPrintType;
    if (pt) parts.push(String(pt));
    if (c.bPageCount || it.page_count) parts.push(`${c.bPageCount || it.page_count} trang`);
    if (c.bBindingType || it.binding_type) parts.push(`Đóng: ${c.bBindingType || it.binding_type}`);
    const procs = c.processingNames;
    if (Array.isArray(procs) && procs.length) parts.push(`GC: ${procs.join(', ')}`);
    const accs = c.accessoryNames;
    if (Array.isArray(accs) && accs.length) parts.push(`PK: ${accs.join(', ')}`);
    return parts.join(' · ');
}

export default function QuoteOrderListView({ defaultView, title }: QuoteOrderListViewProps) {
    const { token } = useAuth();
    const { hasPermission } = usePermissions();
    const toast = useToast();
    // Quyền cam kết — chỉ ẩn UI (UX); backend mới là ranh giới bảo mật thật (Req 5.6, 5.7).
    const canApproveQuote = hasPermission('quote.approve');
    const canApproveOrder = hasPermission('order.approve');
    // Quyền tạo báo giá — chỉ render lối "Tạo mới" khi có quyền (Req 3.4, 11.1).
    const canCreateQuote = hasPermission('quote.create');
    const [mounted, setMounted] = useState(false);
    const [quotes, setQuotes] = useState<QuoteItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    // Giá trị tìm kiếm trễ — chỉ gọi API sau khi ngừng gõ (Req 8.1, 8.2).
    const debouncedSearch = useDebouncedValue(search, 300);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<QuoteItem | null>(null);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    // Khung nhìn cố định theo trang (quote|order). Không còn bộ tab chuyển khung nhìn
    // nội bộ — việc tách Báo giá ↔ Đơn hàng do hai mục menu top-level đảm nhiệm.
    const view: ViewKey = defaultView;
    const [activeTab, setActiveTab] = useState<'customer' | 'internal'>('customer');
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    // Phân trang từ backend (Req 2.1–2.4).
    const [pagination, setPagination] = useState<{ total: number; total_pages: number; has_prev: boolean; has_next: boolean }>({ total: 0, total_pages: 1, has_prev: false, has_next: false });
    // Action vòng đời đang chạy — disable + chặn double-click (Req 4.4).
    const [pendingAction, setPendingAction] = useState<string | null>(null);
    // Hộp thoại xác nhận dùng chung (thay alert/prompt) (Req 4.1).
    const [confirmState, setConfirmState] = useState<{ title: string; requireReason: boolean; reasonLabel?: string; confirmLabel?: string; onConfirm: (reason: string) => void } | null>(null);
    // Mở chi tiết dạng drawer trên màn hình nhỏ (Req 10.1, 10.3).
    const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

    const PAGE_LIMIT = 30;

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    }), [token]);

    const fetchQuotes = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (debouncedSearch) params.set('keyword', debouncedSearch);
            // Truy vấn trạng thái theo Khung_Nhìn qua server (Req 1.1, 1.3–1.5).
            // Lọc trạng thái rõ ràng ưu tiên hơn ánh xạ khung nhìn.
            const effectiveStatuses = statusFilter ? [statusFilter] : viewToStatuses(view);
            if (effectiveStatuses.length > 0) params.set('status', effectiveStatuses.join(','));
            if (fromDate) params.set('date_from', fromDate);
            if (toDate) params.set('date_to', toDate);
            params.set('page', String(page));
            params.set('limit', String(PAGE_LIMIT));

            const res = await fetch(`${API}/erp/orders?${params}`, { headers: headers() });
            const json = await res.json();
            if (json.success && json.data) {
                const items = Array.isArray(json.data) ? json.data : (json.data.data || []);
                setQuotes(items.map((q: any) => ({
                    id: q.id, code: q.code, customerName: q.customer_name, customerPhone: q.customer_phone,
                    total: parseFloat(q.grand_total || q.total || 0), status: q.status, createdAt: q.created_at,
                    type: q.type, validUntil: q.valid_until, createdBy: q.created_by_name || q.created_by,
                })));
                const pg = json.data.pagination;
                setTotal(pg?.total ?? items.length);
                setPagination({
                    total: pg?.total ?? items.length,
                    total_pages: pg?.total_pages ?? 1,
                    has_prev: pg?.has_prev ?? (page > 1),
                    has_next: pg?.has_next ?? false,
                });
            } else {
                setQuotes([]); setTotal(0);
                setPagination({ total: 0, total_pages: 1, has_prev: false, has_next: false });
            }
        } catch (err) { console.error(err); setQuotes([]); }
    }, [page, debouncedSearch, statusFilter, view, fromDate, toDate, headers]);

    const fetchDetail = useCallback(async (id: number) => {
        try {
            const res = await fetch(`${API}/erp/orders/${id}`, { headers: headers() });
            const json = await res.json();
            if (json.success && json.data) {
                const d = json.data;
                setDetail({
                    id: d.id, code: d.code, customerName: d.customer_name, customerPhone: d.customer_phone,
                    total: parseFloat(d.total || 0), status: d.status, createdAt: d.created_at,
                    type: d.type, createdBy: d.created_by_name,
                    vat_rate: parseFloat(d.vat_rate || 0),
                    vat_amount: parseFloat(d.vat_amount || 0),
                    shipping_fee: parseFloat(d.shipping_fee || 0),
                    grand_total: parseFloat(d.grand_total || 0),
                    validity_days: d.validity_days ?? 7,
                    validUntil: d.valid_until || d.validUntil,
                    customer_address: d.customer_address,
                    customer_unit: d.customer_unit,
                    tax_code: d.tax_code,
                    customer_note: d.customer_note,
                    customer_email: d.customer_email,
                    customer_contact: d.customer_contact,
                    items: (d.items || []).map((it: any) => {
                        let pd: any = {};
                        try { pd = typeof it.printing_detail === 'string' ? JSON.parse(it.printing_detail) : (it.printing_detail || {}); } catch { /* giữ rỗng */ }
                        const isOffset = !!pd?.offset;
                        return {
                            productName: it.product_name, quantity: it.quantity, unit: it.unit || 'cái',
                            materialName: it.material_name || pd?.configParams?.materialName || null,
                            itemWidth: it.item_width, itemHeight: it.item_height,
                            printType: it.print_type, processingDetails: it.processing_details, itemTotal: parseFloat(it.item_total || 0),
                            productType: it.product_type || it.item_type,
                            offsetSpec: isOffset ? buildOffsetSpec(pd) : null,
                            digitalSpec: !isOffset ? buildDigitalSpec(it, pd) : null,
                        };
                    }),
                } as any);
            }
        } catch { /* ignore */ }
    }, [headers]);

    /**
     * Bọc mọi action vòng đời: chặn double-click qua `pendingAction`, toast
     * thành công/lỗi (không nuốt lỗi), refetch chi tiết + danh sách (Req 4.2–4.5).
     */
    const runLifecycle = useCallback(async (key: string, fn: () => Promise<Response>, okMsg: string) => {
        if (pendingAction) return;
        setPendingAction(key);
        try {
            const res = await fn();
            let json: any = {};
            try { json = await res.json(); } catch { /* phản hồi rỗng */ }
            if (!res.ok || json?.success === false) {
                throw new Error(json?.message || json?.error || `Thao tác thất bại (HTTP ${res.status})`);
            }
            toast.show('success', okMsg);
            if (selectedId) await fetchDetail(selectedId);
            await fetchQuotes();
        } catch (err: any) {
            toast.show('error', err?.message || 'Đã xảy ra lỗi, vui lòng thử lại.');
        } finally {
            setPendingAction(null);
        }
    }, [pendingAction, toast, selectedId, fetchDetail, fetchQuotes]);

    useEffect(() => { setMounted(true); }, []);

    // Reset về trang 1 khi đổi tiêu chí lọc/tìm kiếm/khung nhìn (Req 2.4).
    useEffect(() => { setPage(1); }, [debouncedSearch, fromDate, toDate, statusFilter, view]);
    
    useEffect(() => { 
        if (mounted && token) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            fetchQuotes();
            // Fetch company info for print template
            fetch(`${API}/erp/company-info`, { headers: headers() })
                .then(r => r.json())
                .then(res => {
                    if (!res.success || !res.data) return;
                    const d = res.data;
                    const banks = Array.isArray(d.bank_accounts) ? d.bank_accounts : [];
                    const b0 = banks[0] || {};
                    // Chuẩn hoá key để template preview dùng ổn định
                    setCompanyInfo({
                        ...d,
                        name: d.company_name || d.name || '',
                        phone: d.hotline || d.phone || '',
                        address: d.address || '',
                        website: d.website || '',
                        tax_code: d.tax_code || '',
                        email: d.email || '',
                        bank_name: b0.bank_name || d.bank_name || '',
                        bank_account: b0.account_number || d.bank_account || '',
                        bank_holder: b0.account_name || d.bank_holder || d.company_name || '',
                        logo: d.logo || d.company_logo || '',
                    });
                })
                .catch(() => {});
        }
    }, [mounted, token, fetchQuotes]);

    useEffect(() => { 
        if (selectedId && token) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            fetchDetail(selectedId); 
        }
    }, [selectedId, token, fetchDetail]);

    if (!mounted) return (
        <div className="flex items-center justify-center h-screen text-slate-400">
            <div className="text-center">
                <div className="w-9 h-9 border-3 border-slate-200 border-t-blue-600 rounded-full mx-auto mb-3 animate-spin" />
                Đang tải hệ thống báo giá...
            </div>
        </div>
    );

    const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

    // Khung nhìn Báo giá | Đơn hàng | Tất cả — lọc client-side trên dữ liệu đã tải
    // từ GET /erp/orders (Req 8.4, 8.5, 8.6). Không gọi endpoint mới, không thêm bảng/route.
    const visibleQuotes = filterByView(quotes, view, (q) => q.status);

    // Range hiển thị cho thanh phân trang (Req 2.1).
    const rangeStart = pagination.total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
    const rangeEnd = Math.min(page * PAGE_LIMIT, pagination.total);

    return (
        <div className="flex h-screen bg-slate-50">
            <ConfirmModal
                open={confirmState !== null}
                title={confirmState?.title ?? ''}
                requireReason={confirmState?.requireReason ?? false}
                reasonLabel={confirmState?.reasonLabel}
                confirmLabel={confirmState?.confirmLabel}
                pending={pendingAction !== null}
                onConfirm={(reason) => confirmState?.onConfirm(reason)}
                onCancel={() => setConfirmState(null)}
            />
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .print-area, .print-area * { visibility: visible; }
                    .print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
                    .no-print { display: none !important; }
                    @page { margin: 10mm; }
                }
            `}</style>
            {/* ── LEFT: Quote List ──────────────────── */}
            <div className="no-print w-full md:w-[400px] flex flex-col bg-white border-r border-slate-200">
                <div className="px-5 pt-5 pb-4">
                    <div className="flex justify-between items-center mb-3.5">
                        <h2 className="text-lg font-bold m-0 text-slate-900">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" className="align-[-3px] mr-2 inline">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                            </svg>
                            {title ?? 'Danh sách Báo Giá'}
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 font-semibold">
                                {total} báo giá
                            </span>
                            {canCreateQuote && (
                                <Link href="/pricing/quotes/new" className="px-3 py-1.5 bg-blue-600 text-white text-[13px] font-semibold rounded-md no-underline inline-flex items-center gap-1.5 hover:bg-blue-700 transition-colors">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                    Tạo mới
                                </Link>
                            )}
                        </div>
                    </div>

                    <div className="relative mb-2.5">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input className="w-full pl-[38px] pr-3 py-2.5 rounded-[10px] bg-slate-50 border border-slate-200 text-sm outline-none focus:border-blue-400 transition-colors" placeholder="Mã BG, tên khách, SĐT..." aria-label="Tìm kiếm báo giá theo mã, tên khách hoặc số điện thoại" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="flex-1 p-1.5 text-xs rounded-md border border-slate-200 outline-none" title="Từ ngày" />
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="flex-1 p-1.5 text-xs rounded-md border border-slate-200 outline-none" title="Đến ngày" />
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Lọc theo trạng thái" className="flex-1 p-1.5 text-xs rounded-md border border-slate-200 bg-white outline-none">
                            <option value="">Tất cả TT</option>
                            <option value="draft">Nháp</option>
                            <option value="pending_approval">Chờ duyệt</option>
                            <option value="approved">Đã duyệt</option>
                            <option value="sent">Đã gửi</option>
                            <option value="accepted">Đã chấp nhận</option>
                            <option value="completed">Hoàn thành</option>
                            <option value="rejected">Từ chối</option>
                            <option value="cancelled">Đã hủy</option>
                        </select>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {visibleQuotes.length === 0 ? (
                        <div className="p-10 text-center text-slate-400">
                            Chưa có chứng từ nào.
                        </div>
                    ) : visibleQuotes.map(q => {
                        const isExpired = q.validUntil && new Date(q.validUntil) < new Date() && q.status !== 'converted' && q.status !== 'cancelled';
                        const typeColor = q.type === 'In Offset' ? '#16a34a' : '#2563eb';
                        const typeBg = q.type === 'In Offset' ? '#dcfce7' : '#dbeafe';

                        return (
                            <div key={q.id} onClick={() => { setSelectedId(q.id); setMobileDetailOpen(true); }} className={`px-5 py-3.5 cursor-pointer border-b border-slate-100 transition-all duration-150 ${selectedId === q.id ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600' : isExpired ? 'bg-red-50 border-l-[3px] border-l-transparent' : 'border-l-[3px] border-l-transparent hover:bg-slate-50'}`}>
                                <div className="flex justify-between mb-1">
                                    <div className="flex gap-1.5 items-center">
                                        <span className="font-semibold text-slate-900 text-sm">{q.code}</span>
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-xl" style={{ background: typeBg, color: typeColor }}>{q.type}</span>
                                    </div>
                                    <div className="flex gap-1 items-center">
                                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: { draft: '#f3f4f6', pending_approval: '#fef3c7', approved: '#dbeafe', sent: '#e0e7ff', accepted: '#d1fae5', completed: '#dcfce7', rejected: '#fee2e2', cancelled: '#f1f5f9', expired: '#fef2f2' }[q.status] || '#f3f4f6', color: { draft: '#475569', pending_approval: '#92400e', approved: '#1d4ed8', sent: '#4338ca', accepted: '#047857', completed: '#16a34a', rejected: '#dc2626', cancelled: '#94a3b8', expired: '#ef4444' }[q.status] || '#475569' }}>
                                            {{ draft: 'Nháp', pending_approval: 'Chờ duyệt', approved: 'Đã duyệt', sent: 'Đã gửi', accepted: 'Chấp nhận', completed: 'Hoàn thành', rejected: 'Từ chối', cancelled: 'Đã huỷ' }[q.status] || q.status}
                                        </span>
                                        {isExpired && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white">HẾT HẠN</span>}
                                    </div>
                                </div>
                                <div className="text-[13px] text-slate-600 mb-1.5">{q.customerName} {q.customerPhone ? `- ${q.customerPhone}` : ''}</div>
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1">
                                            <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-500">{q.createdBy?.charAt(0) || 'U'}</div>
                                            <span className="text-[11px] text-slate-500">{q.createdBy}</span>
                                        </div>
                                        <span className="text-[11px] text-slate-400">{formatDate(q.createdAt)} {q.validUntil ? `(HH: ${formatDate(q.validUntil)})` : ''}</span>
                                    </div>
                                    <span className="font-bold text-slate-900 text-sm">{formatVND((q as any).grand_total ?? q.total)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* ── Pagination footer (Req 2.1–2.3) ── */}
                <div className="no-print px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2">
                    <span aria-live="polite" className="text-xs text-slate-500">{rangeStart}–{rangeEnd} / {pagination.total} bản ghi</span>
                    <div className="flex gap-1.5">
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={!pagination.has_prev}
                            aria-label="Trang trước"
                            title="Trang trước"
                            className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >‹</button>
                        <button
                            type="button"
                            onClick={() => setPage(p => p + 1)}
                            disabled={!pagination.has_next}
                            aria-label="Trang sau"
                            title="Trang sau"
                            className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >›</button>
                    </div>
                </div>
            </div>

            {/* ── RIGHT: Quote Detail ──────────────── */}
            <div className={`overflow-y-auto bg-slate-200 ${mobileDetailOpen ? 'fixed inset-0 z-40 block p-4' : 'hidden'} md:static md:z-auto md:flex-1 md:block md:p-7`}>
                {detail ? (
                    <div className="max-w-[900px] mx-auto">
                        {/* Nút đóng drawer trên màn hình nhỏ (Req 10.3) */}
                        <button
                            type="button"
                            onClick={() => setMobileDetailOpen(false)}
                            aria-label="Đóng chi tiết"
                            title="Đóng"
                            className="no-print md:hidden mb-3 inline-flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 rounded-lg font-semibold border border-slate-300 hover:bg-slate-50"
                        >✕ Đóng</button>
                        {/* Action Bar */}
                        <div className="no-print flex justify-between items-center mb-5">
                            <div className="flex gap-2 flex-wrap">
                                {detail.status === 'draft' && <button type="button" aria-label="Gửi duyệt báo giá" title="Gửi duyệt" disabled={pendingAction !== null} onClick={() => runLifecycle('submit', () => fetch(`${API}/erp/orders/${detail.id}/submit`, { method: 'POST', headers: headers() }), 'Đã gửi duyệt báo giá')} className="px-4 py-2 bg-amber-500 text-white rounded-lg font-semibold border-none cursor-pointer hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">📤 Gửi duyệt</button>}
                                {(detail.status === 'draft' || detail.status === 'pending_approval') && canApproveQuote && <button type="button" aria-label="Duyệt báo giá" title="Duyệt" disabled={pendingAction !== null} onClick={() => runLifecycle('approve', () => fetch(`${API}/erp/orders/${detail.id}/approve`, { method: 'POST', headers: headers() }), 'Đã duyệt báo giá')} className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-semibold border-none cursor-pointer hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">✅ Duyệt</button>}
                                {(detail.status === 'draft' || detail.status === 'pending_approval') && canApproveQuote && <button type="button" aria-label="Từ chối báo giá" title="Từ chối" disabled={pendingAction !== null} onClick={() => setConfirmState({ title: 'Từ chối báo giá', requireReason: true, reasonLabel: 'Lý do từ chối', confirmLabel: 'Từ chối', onConfirm: (reason) => { setConfirmState(null); runLifecycle('reject', () => fetch(`${API}/erp/orders/${detail.id}/reject`, { method: 'POST', headers: headers(), body: JSON.stringify({ reason }) }), 'Đã từ chối báo giá'); } })} className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold border-none cursor-pointer hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">❌ Từ chối</button>}
                                {(detail.status === 'draft' || detail.status === 'approved') && <button type="button" aria-label="Gửi báo giá cho khách hàng" title="Gửi khách" disabled={pendingAction !== null} onClick={() => runLifecycle('send', () => fetch(`${API}/erp/orders/${detail.id}/send`, { method: 'POST', headers: headers() }), 'Đã gửi báo giá cho khách hàng')} className="px-4 py-2 bg-indigo-500 text-white rounded-lg font-semibold border-none cursor-pointer hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">✈️ Gửi khách</button>}
                                {detail.status === 'sent' && canApproveOrder && <button type="button" aria-label="Khách hàng chấp nhận báo giá" title="Khách hàng chấp nhận" disabled={pendingAction !== null} onClick={() => runLifecycle('accept', () => fetch(`${API}/erp/orders/${detail.id}/accept`, { method: 'POST', headers: headers() }), 'Khách hàng đã chấp nhận báo giá')} className="px-4 py-2 bg-teal-500 text-white rounded-lg font-semibold border-none cursor-pointer hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">🤝 KH chấp nhận</button>}
                                {(detail.status === 'approved' || detail.status === 'accepted') && canApproveOrder && <button type="button" aria-label="Hoàn thành đơn hàng" title="Hoàn thành" disabled={pendingAction !== null} onClick={() => runLifecycle('complete', () => fetch(`${API}/erp/orders/${detail.id}/complete`, { method: 'POST', headers: headers() }), 'Đã hoàn thành đơn hàng')} className="px-4 py-2 bg-violet-500 text-white rounded-lg font-semibold border-none cursor-pointer hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">🛒 Hoàn thành</button>}
                                {detail.status !== 'cancelled' && detail.status !== 'completed' && canApproveOrder && <button type="button" aria-label="Huỷ báo giá" title="Huỷ" disabled={pendingAction !== null} onClick={() => setConfirmState({ title: 'Huỷ báo giá', requireReason: true, reasonLabel: 'Lý do huỷ', confirmLabel: 'Huỷ báo giá', onConfirm: (reason) => { setConfirmState(null); runLifecycle('cancel', () => fetch(`${API}/erp/orders/${detail.id}/cancel`, { method: 'POST', headers: headers(), body: JSON.stringify({ reason: reason || '' }) }), 'Đã huỷ báo giá'); } })} className="px-4 py-2 bg-white text-red-500 rounded-lg font-semibold border border-red-100 cursor-pointer hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">🗑️ Huỷ</button>}
                                <button type="button" aria-label="Sao chép báo giá" title="Sao chép" disabled={pendingAction !== null} onClick={() => runLifecycle('clone', () => fetch(`${API}/erp/orders/${detail.id}/clone`, { method: 'POST', headers: headers() }), 'Đã sao chép báo giá')} className="px-4 py-2 bg-white text-slate-600 rounded-lg font-semibold border border-slate-300 cursor-pointer hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">📋 Sao chép</button>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" aria-label="Xuất PDF / In báo giá" title="Xuất PDF" onClick={async () => {
                                    if (!detail?.id || !token) return;
                                    try {
                                        const res = await fetch(`${API}/erp/order-pdf/${detail.id}`, { headers: headers() });
                                        const json = await res.json();
                                        const html = json?.data?.html || json?.html;
                                        if (!res.ok || !html) {
                                            toast.show('error', json?.error || json?.message || 'Không tải được bản PDF');
                                            return;
                                        }
                                        const w = window.open('', '_blank');
                                        if (!w) { toast.show('error', 'Trình duyệt chặn popup — cho phép popup để in PDF'); return; }
                                        w.document.open();
                                        w.document.write(html);
                                        w.document.close();
                                        // In sau khi render xong
                                        setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 300);
                                    } catch (e: any) {
                                        toast.show('error', e?.message || 'Lỗi xuất PDF');
                                    }
                                }} className="px-4 py-2 bg-white text-slate-700 rounded-lg font-semibold border border-slate-300 cursor-pointer hover:bg-slate-50 transition-colors">🖨️ Xuất PDF</button>
                                <Link href={detail.type === 'In Offset' ? `/pricing/quotes/offset?edit=${detail.id}` : `/pricing/quotes/new?edit=${detail.id}`} aria-label="Chỉnh sửa báo giá" title="Chỉnh sửa" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold border-none cursor-pointer no-underline inline-block hover:bg-blue-700 transition-colors">✏️ Chỉnh sửa</Link>
                            </div>
                        </div>

                        {/* Dual Tabs */}
                        <div className="no-print flex gap-4 mb-4 border-b border-slate-300">
                            <button onClick={() => setActiveTab('customer')} className={`px-4 py-2.5 text-sm font-semibold border-none bg-transparent cursor-pointer transition-colors ${activeTab === 'customer' ? 'text-blue-600 border-b-2 border-b-blue-600' : 'text-slate-500 border-b-2 border-b-transparent hover:text-slate-700'}`}>Bản cho Khách Hàng</button>
                            <button onClick={() => setActiveTab('internal')} className={`px-4 py-2.5 text-sm font-semibold border-none bg-transparent cursor-pointer transition-colors ${activeTab === 'internal' ? 'text-blue-600 border-b-2 border-b-blue-600' : 'text-slate-500 border-b-2 border-b-transparent hover:text-slate-700'}`}>Bản Kỹ Thuật (Nội Bộ)</button>
                        </div>

                        {/* Print Document Wrapper (A4) */}
                        <div className="print-area" style={{ background: '#fff', borderRadius: 8, padding: '40px 48px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', minHeight: 800 }}>
                            {activeTab === 'customer' ? (
                                <>
                                    {/* Document Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, borderBottom: '2px solid #ef4444', paddingBottom: 16 }}>
                                        <div style={{ display: 'flex', gap: 16 }}>
                                            <div style={{ width: 80, height: 80, background: '#f8fafc', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#94a3b8' }}>{companyInfo?.logo ? <img src={companyInfo.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : 'LOGO'}</div>
                                            <div>
                                                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#dc2626', textTransform: 'uppercase' }}>{companyInfo?.name || 'CÔNG TY IN ẤN'}</h2>
                                                <p style={{ fontSize: 12, margin: '4px 0', color: '#334155' }}>Địa chỉ: {companyInfo?.address || '—'}</p>
                                                <p style={{ fontSize: 12, margin: '4px 0', color: '#334155' }}>Điện thoại: {companyInfo?.phone || '—'} {companyInfo?.hotline ? `- Hotline: ${companyInfo.hotline}` : ''}</p>
                                                <p style={{ fontSize: 12, margin: '4px 0', color: '#334155' }}>Website: {companyInfo?.website || '—'}</p>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Số: {detail.code}</h3>
                                            <div style={{ width: 140, height: 40, background: '#f1f5f9', marginTop: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#64748b', border: '1px solid #e2e8f0' }}>|||||||||| Barcode ||||||||||</div>
                                        </div>
                                    </div>
                                    
                                    <h1 style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, margin: '16px 0 32px' }}>BÁO GIÁ DỊCH VỤ IN ẤN</h1>
                                    
                                    {/* Customer Meta */}
                                    <div style={{ margin: '0 0 24px', fontSize: 14, color: '#0f172a' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}><strong>Khách hàng:</strong> <span>{detail.customerName}</span></div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}><strong>Điện thoại:</strong> <span>{detail.customerPhone || '—'}</span></div>
                                        {(detail as any).customer_unit && <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}><strong>Đơn vị:</strong> <span>{(detail as any).customer_unit}</span></div>}
                                        {(detail as any).customer_address && <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}><strong>Địa chỉ:</strong> <span>{(detail as any).customer_address}</span></div>}
                                        {(detail as any).tax_code && <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}><strong>MST:</strong> <span>{(detail as any).tax_code}</span></div>}
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}><strong>Loại BG:</strong> <span>{detail.type || '—'}</span></div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, marginBottom: 6 }}><strong>Ngày lập:</strong> <span>{formatDate(detail.createdAt)}</span></div>
                                    </div>

                                    {/* Overview Table */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: 13, marginBottom: 24, color: '#0f172a' }}>
                                        <thead>
                                            <tr style={{ background: '#e2e8f0' }}>
                                                <th style={{ border: '1px solid #000', padding: 8, textAlign: 'center', width: 40 }}>STT</th>
                                                <th style={{ border: '1px solid #000', padding: 8, textAlign: 'center', width: 80 }}>Loại</th>
                                                <th style={{ border: '1px solid #000', padding: 8, textAlign: 'left' }}>Thông tin sản phẩm</th>
                                                <th style={{ border: '1px solid #000', padding: 8, textAlign: 'center', width: 50 }}>SL</th>
                                                <th style={{ border: '1px solid #000', padding: 8, textAlign: 'center', width: 50 }}>ĐVT</th>
                                                <th style={{ border: '1px solid #000', padding: 8, textAlign: 'right', width: 90 }}>Đơn giá</th>
                                                <th style={{ border: '1px solid #000', padding: 8, textAlign: 'right', width: 100 }}>Thành tiền</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detail.items && detail.items.map((item, idx) => {
                                                const qty = item.quantity || 1;
                                                const unitPrice = qty > 0 ? (item.itemTotal / qty) : 0;
                                                return (
                                                    <tr key={idx}>
                                                        <td style={{ border: '1px solid #000', padding: 8, textAlign: 'center', verticalAlign: 'top' }}>{idx + 1}</td>
                                                        <td style={{ border: '1px solid #000', padding: 8, verticalAlign: 'top' }}>
                                                            <div>{detail.type || 'In KTS'}</div>
                                                            <div style={{ fontSize: 10, fontStyle: 'italic', marginTop: 4 }}>{item.printType}</div>
                                                        </td>
                                                        <td style={{ border: '1px solid #000', padding: 8, verticalAlign: 'top' }}>
                                                            <div style={{ fontWeight: 700, color: '#2563eb' }}>{item.productName}</div>
                                                            <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                                                                {(item as QuoteItemDetail).offsetSpec
                                                                    || (item as QuoteItemDetail).digitalSpec
                                                                    || [
                                                                        item.itemWidth && item.itemHeight ? `${item.itemWidth}×${item.itemHeight} mm` : '',
                                                                        item.materialName || '',
                                                                    ].filter(Boolean).join(' · ')
                                                                    || '—'}
                                                            </div>
                                                        </td>
                                                        <td style={{ border: '1px solid #000', padding: 8, textAlign: 'center', verticalAlign: 'top' }}>{qty}</td>
                                                        <td style={{ border: '1px solid #000', padding: 8, textAlign: 'center', verticalAlign: 'top' }}>{item.unit}</td>
                                                        <td style={{ border: '1px solid #000', padding: 8, textAlign: 'right', verticalAlign: 'top' }}>{formatVND(unitPrice)}</td>
                                                        <td style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 700, verticalAlign: 'top' }}>{formatVND(item.itemTotal)}</td>
                                                    </tr>
                                                );
                                            })}
                                            <tr style={{ background: '#f8fafc' }}>
                                                <td colSpan={6} style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 600 }}>Cộng tiền hàng (chưa VAT):</td>
                                                <td style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 600 }}>{formatVND(detail.items?.reduce((s: number, i: QuoteItemDetail) => s + (i.itemTotal || 0), 0) || detail.total)}</td>
                                            </tr>
                                            {(detail as any).vat_rate > 0 && (
                                                <tr style={{ background: '#f0fdf4' }}>
                                                    <td colSpan={6} style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{`Thuế GTGT (${(detail as any).vat_rate}%):`}</td>
                                                    <td style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>+{formatVND((detail as any).vat_amount || 0)}</td>
                                                </tr>
                                            )}
                                            {(detail as any).shipping_fee > 0 && (
                                                <tr style={{ background: '#fffbeb' }}>
                                                    <td colSpan={6} style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 600, color: '#d97706' }}>Phí giao hàng:</td>
                                                    <td style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 600, color: '#d97706' }}>+{formatVND((detail as any).shipping_fee || 0)}</td>
                                                </tr>
                                            )}
                                            <tr style={{ background: '#fef2f2' }}>
                                                <td colSpan={6} style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 700 }}>TỔNG CỘNG:</td>
                                                <td style={{ border: '1px solid #000', padding: 8, textAlign: 'right', fontWeight: 700, color: '#dc2626', fontSize: 15 }}>{formatVND((detail as any).grand_total || detail.total)}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Document Notes */}
                                    <div style={{ border: '1px solid #000', padding: '8px 12px', fontSize: 12, minHeight: 60, marginBottom: 28, color: '#0f172a' }}>
                                        <strong>*GHI CHÚ:</strong><br />
                                        - Đơn giá dòng là thành tiền trước thuế{(detail as any).vat_rate > 0 ? `; VAT ${(detail as any).vat_rate}% tính trên tổng.` : ' (không áp VAT trên báo giá này).'}<br/>
                                        - Báo giá có hiệu lực {(detail as any).validity_days || 7} ngày kể từ ngày lập{detail.validUntil ? ` (đến ${formatDate(detail.validUntil)})` : ''}.<br/>
                                        - File in tự thiết kế vui lòng xuất chuẩn CMYK / theo yêu cầu xưởng.
                                    </div>

                                    {/* Document Footer */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 40 }}>
                                        <div style={{ width: '60%' }}>
                                            <p style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 12, marginBottom: 8 }}>THÔNG TIN CHUYỂN KHOẢN (ĐẶT CỌC)</p>
                                            <p style={{ fontSize: 12, color: '#0f172a' }}>{companyInfo?.bank_name || 'Ngân hàng'}<br/>STK: {companyInfo?.bank_account || '—'}<br/>CTK: {companyInfo?.bank_holder || companyInfo?.name || '—'}</p>
                                        </div>
                                        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div style={{ width: 100, height: 100, border: '1px solid #cbd5e1', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>VietQR Code</div>
                                            <p style={{ fontSize: 10, fontWeight: 700, marginTop: 4 }}>QUÉT MÃ ĐỂ THANH TOÁN</p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', fontSize: 13, color: '#0f172a' }}>
                                        <div style={{ width: '33%' }}>
                                            <strong>KHÁCH HÀNG</strong><br/>
                                            <span style={{ fontSize: 11, fontStyle: 'italic' }}>(Ký, ghi rõ họ tên)</span>
                                        </div>
                                        <div style={{ width: '33%' }}>
                                            <strong>QUẢN LÝ CÔNG TY</strong><br/>
                                            <span style={{ fontSize: 11, fontStyle: 'italic' }}>(Ký, ghi rõ họ tên)</span>
                                        </div>
                                        <div style={{ width: '33%' }}>
                                            <p style={{ fontSize: 11, marginBottom: 4 }}>Ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}</p>
                                            <strong>NGƯỜI LẬP</strong><br/>
                                            <span style={{ fontSize: 11, fontStyle: 'italic' }}>(Ký, ghi rõ họ tên)</span>
                                            <div style={{ marginTop: 60, fontWeight: 700 }}>{detail.createdBy || 'Admin'}</div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}>Chi Tiết Kỹ Thuật & Giá Thành (Nội Bộ)</h3>
                                    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, color: '#0f172a' }}>
                                            <thead style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                                <tr>
                                                    <th style={{ padding: '10px 12px', fontWeight: 600, borderRight: '1px solid #cbd5e1', width: 40, textAlign: 'center' }}>STT</th>
                                                    <th style={{ padding: '10px 12px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>Sản Phẩm & Quy Cách</th>
                                                    <th style={{ padding: '10px 12px', fontWeight: 600, borderRight: '1px solid #cbd5e1' }}>Chất Liệu</th>
                                                    <th style={{ padding: '10px 12px', fontWeight: 600, borderRight: '1px solid #cbd5e1', textAlign: 'center' }}>SL</th>
                                                    <th style={{ padding: '10px 12px', fontWeight: 600, borderRight: '1px solid #cbd5e1', textAlign: 'right' }}>Đơn Giá</th>
                                                    <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Thành Tiền</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.items && detail.items.map((item, idx) => {
                                                    const qty = item.quantity || 1;
                                                    const unitPrice = qty > 0 ? (item.itemTotal / qty) : 0;
                                                    return (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>
                                                                <div style={{ fontWeight: 700, marginBottom: 2 }}>{item.productName}</div>
                                                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                                                    {(item as QuoteItemDetail).offsetSpec
                                                                        || (item as QuoteItemDetail).digitalSpec
                                                                        || (item.itemWidth && item.itemHeight ? `KT: ${item.itemWidth}×${item.itemHeight} mm` : '—')}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0' }}>{item.materialName || '—'}</td>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', textAlign: 'center' }}>{qty} {item.unit}</td>
                                                            <td style={{ padding: '10px 12px', borderRight: '1px solid #e2e8f0', textAlign: 'right' }}>{formatVND(unitPrice)}</td>
                                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{formatVND(item.itemTotal)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center text-slate-400">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1" className="mx-auto mb-4">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                            </svg>
                            <div className="text-base font-medium mb-1">Chọn một Báo Giá</div>
                            <div className="text-[13px]">để xem chi tiết cấu hình sản phẩm</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
