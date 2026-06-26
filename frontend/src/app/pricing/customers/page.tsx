'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useEffect, useCallback } from 'react';
import CustomerModal from './_components/CustomerModal';

import { API_URL as API } from '@/lib/api';

interface Customer {
    id: number;
    code: string;
    name: string;
    customerType: string;
    phone: string;
    email: string;
    address: string;
    company: string;
    taxCode: string;
    contactPerson: string;
    createdAt: string;
    totalSpent?: number;
    lifecycle_stage?: string;
    lost_reason?: string;
    follow_up_date?: string;
    product_interest?: string;
    source?: string;
}

interface QuoteItem {
    id: number;
    code: string;
    total: number;
    status: string;
    createdAt: string;
    type?: string;
    validUntil?: string;
    createdBy?: string;
}

export default function CustomerCRMPage() {
    const { token } = useAuth();
    const [mounted, setMounted] = useState(false);
    
    // Master View State
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [totalCustomers, setTotalCustomers] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [lifecycleFilter, setLifecycleFilter] = useState('');
    const [interactions, setInteractions] = useState<any[]>([]);
    
    // Detail View State
    const [detail, setDetail] = useState<Customer | null>(null);
    const [quoteHistory, setQuoteHistory] = useState<QuoteItem[]>([]);
    const [activeTab, setActiveTab] = useState<'info' | 'history' | 'timeline'>('info');

    // Form State for editing
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Partial<Customer>>({});
    const [isModalOpen, setIsModalOpen] = useState(false);

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    }), [token]);

    const fetchCustomers = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (search) params.set('q', search);
            if (lifecycleFilter) params.set('lifecycle_stage', lifecycleFilter);
            params.set('page', String(page));
            params.set('limit', '30');

            const res = await fetch(`${API}/erp/customers?${params}`, { headers: headers() });
            const json = await res.json();
            if (json.success && json.data) {
                const items = Array.isArray(json.data) ? json.data : (json.data.data || []);
                setCustomers(items);
                setTotalCustomers(json.data.pagination?.total || items.length);
            } else {
                setCustomers([]); setTotalCustomers(0);
            }
        } catch (err) { console.error(err); setCustomers([]); }
    }, [page, search, lifecycleFilter, headers]);

    const fetchDetail = useCallback(async (id: number) => {
        try {
            const res = await fetch(`${API}/erp/customers/${id}`, { headers: headers() });
            const json = await res.json();
            if (json.success && json.data) {
                setDetail(json.data);
                setFormData(json.data);
                
                // Fetch quote history using phone number or ID
                const phoneParam = json.data.phone ? `&customer_phone=${json.data.phone}` : '';
                try {
                    const historyRes = await fetch(`${API}/erp/orders?page=1&limit=50${phoneParam}`, { headers: headers() });
                    const historyJson = await historyRes.json();
                    if (historyJson.success && historyJson.data) {
                        const items = Array.isArray(historyJson.data) ? historyJson.data : (historyJson.data.data || []);
                        setQuoteHistory(items.map((q: any) => ({
                            id: q.id, code: q.code,
                            total: parseFloat(q.grand_total || q.total || 0), status: q.status, createdAt: q.created_at,
                            type: q.type, validUntil: q.valid_until, createdBy: q.created_by_name || q.created_by,
                        })));
                    } else {
                        setQuoteHistory([]);
                    }
                } catch (_e) { setQuoteHistory([]); }
                // Fetch interactions
                const intRes = await fetch(`${API}/erp/customers/${id}/interactions`, { headers: headers() });
                const intJson = await intRes.json();
                setInteractions(intJson.success ? intJson.data : []);
            }
        } catch (_e) { /* ignore */ }
    }, [headers]);

    useEffect(() => { setMounted(true); }, []);
    
    useEffect(() => { 
        if (mounted && token) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            fetchCustomers();
        }
    }, [mounted, token, fetchCustomers]);

    useEffect(() => { 
        if (selectedId && token) {
            setIsEditing(false);
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            fetchDetail(selectedId); 
        }
    }, [selectedId, token, fetchDetail]);

    if (!mounted) return null;

    const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';
    const formatCurrency = (amount: number) => amount ? amount.toLocaleString('vi-VN') + ' đ' : '0 đ';

    const handleSaveInfo = async () => {
        if (!detail) return;
        try {
            const res = await fetch(`${API}/erp/customers/${detail.id}`, {
                method: 'PUT',
                headers: headers(),
                body: JSON.stringify(formData)
            });
            const json = await res.json();
            if (json.success) {
                alert('Cập nhật thông tin thành công!');
                setIsEditing(false);
                fetchDetail(detail.id);
                fetchCustomers();
            } else {
                alert('Lỗi: ' + json.error);
            }
        } catch (e) {
            alert('Có lỗi xảy ra khi lưu.');
        }
    };

    return (
        <div className="flex h-screen bg-slate-50">
            {/* ── LEFT: Customer List ──────────────────── */}
            <div className="w-[360px] flex flex-col bg-white border-r border-slate-200 shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-10 flex-shrink-0">
                <div className="px-5 pt-5 pb-4">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-black m-0 text-slate-800 flex items-center gap-2">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                            Danh bạ Khách hàng
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                                {totalCustomers} KH
                            </span>
                            <button onClick={() => setIsModalOpen(true)} className="w-8 h-8 rounded-md bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors shadow-sm" title="Tạo khách hàng mới">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                        </div>
                    </div>

                    <div className="relative">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-medium outline-none focus:border-indigo-400 focus:bg-white transition-colors placeholder:font-normal" placeholder="Tìm theo tên, SĐT, mã KH..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
                    </div>

                    {/* Pipeline Filter Tabs */}
                    <div className="flex gap-1 mt-3 flex-wrap">
                        {[{k:'',l:'Tất cả'},{k:'lead',l:'💬 Lead'},{k:'prospect',l:'📋 Prospect'},{k:'customer',l:'✅ Khách'},{k:'vip',l:'👑 VIP'},{k:'lost',l:'💤 Lost'}].map(f => (
                            <button key={f.k} onClick={() => { setLifecycleFilter(f.k); setPage(1); }} className={`px-2.5 py-1 text-[11px] font-bold rounded-md border-none cursor-pointer transition-all ${lifecycleFilter === f.k ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{f.l}</button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar border-t border-slate-100">
                    {customers.length === 0 ? (
                        <div className="p-10 text-center text-slate-400 text-sm">
                            Chưa có khách hàng nào.
                        </div>
                    ) : customers.map(c => {
                        const isCompany = c.customerType === 'company';
                        return (
                            <div key={c.id} onClick={() => setSelectedId(c.id)} className={`px-5 py-3.5 cursor-pointer border-b border-slate-100 transition-all duration-200 relative group ${selectedId === c.id ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                                {selectedId === c.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 rounded-r-md"></div>}
                                
                                <div className="flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 border ${isCompany ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                        {c.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <h4 className="font-bold text-[13px] text-slate-800 truncate pr-2">{c.name}</h4>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {(c as any).lifecycle_stage && <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${({lead:'bg-slate-100 text-slate-500',prospect:'bg-amber-100 text-amber-700',customer:'bg-emerald-100 text-emerald-700',vip:'bg-purple-100 text-purple-700',lost:'bg-red-100 text-red-500'} as Record<string,string>)[(c as any).lifecycle_stage] || 'bg-slate-100 text-slate-500'}`}>{({lead:'LEAD',prospect:'PROSPECT',customer:'KHÁCH',vip:'VIP',lost:'LOST'} as Record<string,string>)[(c as any).lifecycle_stage] || (c as any).lifecycle_stage}</span>}
                                                {c.code && <span className="text-[10px] font-bold text-slate-500">{c.code}</span>}
                                            </div>
                                        </div>
                                        <div className="text-[12px] font-mono text-slate-500 mb-1 flex items-center gap-1.5">
                                            <span>{c.phone || 'Chưa có SĐT'}</span>
                                        </div>
                                        {isCompany && c.company && (
                                            <div className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
                                                {c.company}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── RIGHT: Customer Detail ──────────────── */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6">
                {detail ? (
                    <div className="max-w-[1000px] mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* Profile Header */}
                        <div className="bg-gradient-to-r from-indigo-50 to-white px-8 py-6 border-b border-slate-200">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-5">
                                    <div className={`w-20 h-20 rounded-2xl flex items-center justify-center font-black text-3xl shadow-sm border ${detail.customerType === 'company' ? 'bg-amber-100 text-amber-600 border-amber-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>
                                        {detail.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h1 className="text-2xl font-black text-slate-800 m-0 leading-tight">{detail.name}</h1>
                                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${detail.customerType === 'company' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {detail.customerType === 'company' ? 'DOANH NGHIỆP' : 'CÁ NHÂN'}
                                            </span>
                                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${({lead:'bg-slate-200 text-slate-600',prospect:'bg-amber-100 text-amber-700',customer:'bg-emerald-100 text-emerald-700',vip:'bg-purple-100 text-purple-700',lost:'bg-red-100 text-red-600'} as Record<string,string>)[(detail as any).lifecycle_stage] || 'bg-slate-200 text-slate-600'}`}>
                                                {({lead:'💬 LEAD',prospect:'📋 PROSPECT',customer:'✅ KHÁCH HÀNG',vip:'👑 VIP',lost:'💤 LOST'} as Record<string,string>)[(detail as any).lifecycle_stage] || 'LEAD'}
                                            </span>
                                        </div>
                                        {detail.company && <p className="text-slate-500 font-medium text-sm m-0 mb-2 flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect></svg> {detail.company}</p>}
                                        <div className="flex gap-4 text-sm text-slate-600 font-medium mt-2">
                                            <span className="flex items-center gap-1.5 font-mono"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> {detail.phone || '—'}</span>
                                            <span className="flex items-center gap-1.5"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> {detail.email || '—'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mã Khách Hàng</div>
                                    <div className="text-lg font-black font-mono text-indigo-900 bg-indigo-100/50 px-3 py-1 rounded-lg border border-indigo-100 inline-block">{detail.code || '—'}</div>
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-200 bg-slate-50/80 px-4">
                            <button onClick={() => setActiveTab('info')} className={`px-5 py-3.5 text-[13px] font-bold border-none bg-transparent cursor-pointer transition-all relative ${activeTab === 'info' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                                THÔNG TIN CHUNG
                                {activeTab === 'info' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full"></div>}
                            </button>
                            <button onClick={() => setActiveTab('history')} className={`px-5 py-3.5 text-[13px] font-bold border-none bg-transparent cursor-pointer transition-all relative flex items-center gap-2 ${activeTab === 'history' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                                LỊCH SỬ BÁO GIÁ
                                <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">{quoteHistory.length}</span>
                                {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full"></div>}
                            </button>
                            <button onClick={() => setActiveTab('timeline')} className={`px-5 py-3.5 text-[13px] font-bold border-none bg-transparent cursor-pointer transition-all relative flex items-center gap-2 ${activeTab === 'timeline' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>
                                TIMELINE
                                <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">{interactions.length}</span>
                                {activeTab === 'timeline' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full"></div>}
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="p-8">
                            {activeTab === 'info' && (
                                <div className="max-w-[700px]">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider m-0">Hồ sơ chi tiết</h3>
                                        {!isEditing ? (
                                            <button onClick={() => setIsEditing(true)} className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-md text-[12px] font-bold hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                Chỉnh sửa
                                            </button>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button onClick={() => { setIsEditing(false); setFormData(detail); }} className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-md text-[12px] font-bold border-none hover:bg-slate-200 transition-colors">Huỷ</button>
                                                <button onClick={handleSaveInfo} className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-[12px] font-bold border-none hover:bg-indigo-700 transition-colors shadow-sm">Lưu cập nhật</button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tên Khách hàng</label>
                                            {isEditing ? <input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-md text-sm font-medium" /> : <div className="text-sm font-semibold text-slate-800">{detail.name}</div>}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Phân loại</label>
                                            {isEditing ? (
                                                <select value={formData.customerType || 'individual'} onChange={e => setFormData({...formData, customerType: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-md text-sm font-medium">
                                                    <option value="individual">Cá nhân</option>
                                                    <option value="company">Doanh nghiệp</option>
                                                </select>
                                            ) : <div className="text-sm font-semibold text-slate-800">{detail.customerType === 'company' ? 'Doanh nghiệp / Tổ chức' : 'Cá nhân'}</div>}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Số điện thoại</label>
                                            {isEditing ? <input value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-md text-sm font-medium font-mono" /> : <div className="text-sm font-semibold font-mono text-slate-800">{detail.phone || '—'}</div>}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Email liên hệ</label>
                                            {isEditing ? <input value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-md text-sm font-medium" /> : <div className="text-sm font-semibold text-slate-800">{detail.email || '—'}</div>}
                                        </div>
                                        <div className="col-span-2 flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tên Đơn vị / Công ty</label>
                                            {isEditing ? <input value={formData.company || ''} onChange={e => setFormData({...formData, company: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-md text-sm font-medium" /> : <div className="text-sm font-semibold text-slate-800">{detail.company || '—'}</div>}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mã số thuế</label>
                                            {isEditing ? <input value={formData.taxCode || ''} onChange={e => setFormData({...formData, taxCode: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-md text-sm font-medium font-mono" /> : <div className="text-sm font-semibold font-mono text-slate-800">{detail.taxCode || '—'}</div>}
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Người đại diện</label>
                                            {isEditing ? <input value={formData.contactPerson || ''} onChange={e => setFormData({...formData, contactPerson: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-md text-sm font-medium" /> : <div className="text-sm font-semibold text-slate-800">{detail.contactPerson || '—'}</div>}
                                        </div>
                                        <div className="col-span-2 flex flex-col gap-1.5">
                                            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Địa chỉ giao hàng / hóa đơn</label>
                                            {isEditing ? <textarea value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} rows={2} className="px-3 py-2 border border-slate-200 rounded-md text-sm font-medium resize-none" /> : <div className="text-sm font-semibold text-slate-800 leading-relaxed">{detail.address || '—'}</div>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'history' && (
                                <div>
                                    <div className="flex justify-between items-end mb-4">
                                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider m-0">Lịch sử Giao dịch ({quoteHistory.length})</h3>
                                    </div>
                                    
                                    {quoteHistory.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-xl text-slate-500 font-medium">
                                            Chưa có dữ liệu báo giá / đơn hàng nào cho khách này.
                                        </div>
                                    ) : (
                                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                                            <table className="w-full text-left border-collapse bg-white">
                                                <thead>
                                                    <tr className="bg-slate-50 border-b border-slate-200">
                                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32">Mã BG</th>
                                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32">Ngày tạo</th>
                                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Loại dịch vụ</th>
                                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right">Tổng cộng</th>
                                                        <th className="px-5 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">Trạng thái</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {quoteHistory.map(q => (
                                                        <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-5 py-3.5">
                                                                <a href={`/pricing/quotes?code=${q.code}`} target="_blank" className="font-bold text-indigo-600 hover:text-indigo-800 no-underline text-[13px]">{q.code}</a>
                                                            </td>
                                                            <td className="px-5 py-3.5 text-[12px] text-slate-500">{formatDate(q.createdAt)}</td>
                                                            <td className="px-5 py-3.5 text-[13px] font-medium text-slate-700">{q.type || 'In Nhanh'}</td>
                                                            <td className="px-5 py-3.5 text-[14px] font-black text-slate-900 text-right">{formatCurrency(q.total)}</td>
                                                            <td className="px-5 py-3.5 text-center">
                                                                <span className="text-[11px] font-bold px-2 py-1 rounded-md bg-slate-100 text-slate-600 inline-block min-w-[80px]" style={{ background: { draft: '#f3f4f6', pending_approval: '#fef3c7', approved: '#dbeafe', sent: '#e0e7ff', accepted: '#d1fae5', completed: '#dcfce7', rejected: '#fee2e2', cancelled: '#f1f5f9', expired: '#fef2f2' }[q.status] || '#f3f4f6', color: { draft: '#475569', pending_approval: '#92400e', approved: '#1d4ed8', sent: '#4338ca', accepted: '#047857', completed: '#16a34a', rejected: '#dc2626', cancelled: '#94a3b8', expired: '#ef4444' }[q.status] || '#475569' }}>
                                                                    {{ draft: 'Nháp', pending_approval: 'Chờ duyệt', approved: 'Đã duyệt', sent: 'Đã gửi', accepted: 'Chấp nhận', completed: 'Hoàn thành', rejected: 'Từ chối', cancelled: 'Đã huỷ' }[q.status] || q.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'timeline' && (
                                <div>
                                    <div className="flex justify-between items-center mb-5">
                                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider m-0">Lịch sử tương tác</h3>
                                        <button onClick={async () => {
                                            const content = prompt('Ghi chú về khách hàng:');
                                            if (!content) return;
                                            const lostReason = prompt('Lý do chưa chốt (bỏ trống nếu không có):', '') || undefined;
                                            const followUp = prompt('Ngày hẹn follow-up (YYYY-MM-DD, bỏ trống nếu không):', '') || undefined;
                                            try {
                                                await fetch(`${API}/erp/customers/${detail!.id}/interactions`, {
                                                    method: 'POST', headers: headers(),
                                                    body: JSON.stringify({ type: lostReason ? 'lost_reason' : 'note', content, lost_reason: lostReason, follow_up_date: followUp })
                                                });
                                                fetchDetail(detail!.id);
                                            } catch {}
                                        }} className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-[12px] font-bold border-none hover:bg-indigo-700 transition-colors cursor-pointer flex items-center gap-1.5">
                                            + Thêm ghi chú
                                        </button>
                                    </div>
                                    {interactions.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-xl text-slate-500 font-medium">Chưa có tương tác nào.</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {interactions.map((int: any) => (
                                                <div key={int.id} className="flex gap-3 items-start">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${({note:'bg-blue-100 text-blue-600',lost_reason:'bg-red-100 text-red-600',quote_created:'bg-emerald-100 text-emerald-600',stage_change:'bg-purple-100 text-purple-600',follow_up:'bg-amber-100 text-amber-600'} as Record<string,string>)[int.type] || 'bg-slate-100 text-slate-500'}`}>
                                                        {({note:'📝',lost_reason:'❌',quote_created:'📋',stage_change:'🔄',follow_up:'📅'} as Record<string,string>)[int.type] || '💬'}
                                                    </div>
                                                    <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-100">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span className="text-[11px] font-bold text-slate-500 uppercase">{({note:'Ghi chú',lost_reason:'Lý do chưa chốt',quote_created:'Tạo báo giá',stage_change:'Chuyển giai đoạn',follow_up:'Hẹn follow-up'} as Record<string,string>)[int.type] || int.type}</span>
                                                            <span className="text-[10px] text-slate-400">{new Date(int.created_at).toLocaleDateString('vi-VN')} {new Date(int.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span>
                                                        </div>
                                                        <div className="text-[13px] text-slate-700">{int.content}</div>
                                                        {int.lost_reason && <div className="text-[12px] text-red-600 mt-1 font-semibold">❌ {int.lost_reason}</div>}
                                                        {int.follow_up_date && <div className="text-[12px] text-amber-600 mt-1 font-semibold">📅 Follow-up: {new Date(int.follow_up_date).toLocaleDateString('vi-VN')}</div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center text-slate-400">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1" className="mx-auto mb-4">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            <div className="text-base font-bold text-slate-500 mb-1">Chọn một Khách hàng</div>
                            <div className="text-[13px] font-medium">để xem hồ sơ chi tiết và lịch sử giao dịch</div>
                        </div>
                    </div>
                )}
            </div>
            
            <CustomerModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onSuccess={() => {
                    setIsModalOpen(false);
                    fetchCustomers();
                }} 
            />
        </div>
    );
}
