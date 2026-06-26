"use client";
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../_components/apiClient';

interface CompanyData {
    company_name: string;
    company_description: string;
    hotline: string;
    email: string;
    address: string;
    tax_code: string;
    working_hours: string;
    website: string;
    zalo: string;
    facebook: string;
    bank_accounts: BankAccount[];
    payment_terms: string;
    delivery_terms: string;
    vat_rate: number;
}

interface BankAccount {
    bank_name: string;
    account_number: string;
    account_name: string;
}

export default function CompanyInfoPage() {
    const [data, setData] = useState<CompanyData>({
        company_name: '', company_description: '', hotline: '', email: '', address: '',
        tax_code: '', working_hours: '', website: '', zalo: '', facebook: '', bank_accounts: [],
        payment_terms: '', delivery_terms: '', vat_rate: 0,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<CompanyData>('/erp/company-info');
            if (res.success && res.data) setData(res.data);
        } catch { /* empty */ }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleSave = async () => {
        if (!data.company_name.trim()) { showToast('Vui lòng nhập tên công ty', 'error'); return; }
        setSaving(true);
        try {
            const res = await api.post('/erp/company-info', data);
            if (res.success) showToast('Đã lưu thông tin công ty', 'success');
            else throw new Error(res.error);
        } catch (e: unknown) {
            showToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'), 'error');
        }
        setSaving(false);
    };

    const addBankAccount = () => setData(d => ({ ...d, bank_accounts: [...d.bank_accounts, { bank_name: '', account_number: '', account_name: '' }] }));
    const removeBankAccount = (idx: number) => setData(d => ({ ...d, bank_accounts: d.bank_accounts.filter((_, i) => i !== idx) }));
    const updateBankAccount = (idx: number, field: keyof BankAccount, value: string) => {
        setData(d => ({ ...d, bank_accounts: d.bank_accounts.map((a, i) => i === idx ? { ...a, [field]: value } : a) }));
    };

    if (loading) return (
        <div className="flex items-center justify-center h-full">
            <svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white animate-in slide-in-from-right ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.msg}
                </div>
            )}

            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Thông Tin Công Ty</h1>
                    <p className="text-slate-500 text-sm mt-1">Cấu hình thông tin công ty sử dụng trong AI Chat và báo giá.</p>
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50">
                    {saving ? <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    Lưu thay đổi
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-6">
                    {/* Basic Info Card */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm">🏢</span>
                            Thông tin cơ bản
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { key: 'company_name' as const, label: 'Tên công ty', placeholder: 'K-Print', required: true },
                                { key: 'hotline' as const, label: 'Hotline', placeholder: '0901234567' },
                                { key: 'email' as const, label: 'Email', placeholder: 'info@kprint.vn' },
                                { key: 'tax_code' as const, label: 'Mã số thuế (MST)', placeholder: '0123456789' },
                            ].map(f => (
                                <div key={f.key}>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{f.label}{f.required && <span className="text-red-500">*</span>}</label>
                                    <input type="text" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={data[f.key]} onChange={e => setData(d => ({ ...d, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                                </div>
                            ))}
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mô tả công ty</label>
                                <textarea className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2} value={data.company_description} onChange={e => setData(d => ({ ...d, company_description: e.target.value }))} placeholder="Dịch vụ in ấn chất lượng cao" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Địa chỉ</label>
                                <input type="text" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={data.address} onChange={e => setData(d => ({ ...d, address: e.target.value }))} placeholder="123 Đường ABC, TP. HCM" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Giờ làm việc</label>
                                <input type="text" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={data.working_hours} onChange={e => setData(d => ({ ...d, working_hours: e.target.value }))} placeholder="8:00 - 18:00 (Thứ 2 - Thứ 7)" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Website</label>
                                <input type="text" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={data.website} onChange={e => setData(d => ({ ...d, website: e.target.value }))} placeholder="https://kprint.vn" />
                            </div>
                        </div>
                    </div>

                    {/* Social Media Card */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600 text-sm">🌐</span>
                            Mạng xã hội
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Zalo</label>
                                <input type="text" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={data.zalo} onChange={e => setData(d => ({ ...d, zalo: e.target.value }))} placeholder="Số Zalo hoặc ID OA" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Facebook</label>
                                <input type="text" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={data.facebook} onChange={e => setData(d => ({ ...d, facebook: e.target.value }))} placeholder="Link Facebook Page" />
                            </div>
                        </div>
                    </div>

                    {/* Bank Accounts Card */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <span className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 text-sm">🏦</span>
                                Tài khoản ngân hàng
                            </h3>
                            <button onClick={addBankAccount} className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                Thêm TK
                            </button>
                        </div>
                        {data.bank_accounts.length === 0 ? (
                            <div className="text-center py-6 text-slate-400">
                                <p className="text-3xl mb-2">🏦</p>
                                <p className="text-sm">Chưa có tài khoản nào</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {data.bank_accounts.map((acc, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                                        <div className="flex-1 grid grid-cols-3 gap-2">
                                            <input type="text" className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg" placeholder="Tên ngân hàng" value={acc.bank_name} onChange={e => updateBankAccount(idx, 'bank_name', e.target.value)} />
                                            <input type="text" className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg" placeholder="Số tài khoản" value={acc.account_number} onChange={e => updateBankAccount(idx, 'account_number', e.target.value)} />
                                            <input type="text" className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg" placeholder="Tên chủ TK" value={acc.account_name} onChange={e => updateBankAccount(idx, 'account_name', e.target.value)} />
                                        </div>
                                        <button onClick={() => removeBankAccount(idx)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* VAT & Terms Card */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <span className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600 text-sm">📋</span>
                            Thuế & Điều khoản
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Thuế GTGT (VAT)</label>
                                <div className="flex items-center gap-3">
                                    <select
                                        className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                        value={data.vat_rate}
                                        onChange={e => setData(d => ({ ...d, vat_rate: parseFloat(e.target.value) }))}
                                    >
                                        <option value={0}>Không áp thuế (0%)</option>
                                        <option value={5}>5% — Giáo dục, y tế</option>
                                        <option value={8}>8% — Thuế suất giảm (2022-2025)</option>
                                        <option value={10}>10% — Thuế suất thông thường</option>
                                    </select>
                                    <div className={`px-3 py-2 rounded-lg text-sm font-bold ${data.vat_rate > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {data.vat_rate}%
                                    </div>
                                </div>
                                {data.vat_rate > 0 && (
                                    <p className="text-xs text-green-600 mt-1.5">✅ Thuế GTGT {data.vat_rate}% sẽ được tự động tính trên báo giá và PDF.</p>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Điều khoản thanh toán</label>
                                <textarea className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2} value={data.payment_terms} onChange={e => setData(d => ({ ...d, payment_terms: e.target.value }))} placeholder="Thanh toán 50% khi đặt hàng, 50% khi nhận hàng." />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Điều khoản giao hàng</label>
                                <textarea className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2} value={data.delivery_terms} onChange={e => setData(d => ({ ...d, delivery_terms: e.target.value }))} placeholder="Giao hàng trong vòng 3-5 ngày làm việc kể từ ngày duyệt báo giá." />
                            </div>
                        </div>
                    </div>

                    {/* Note */}
                    <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 border border-blue-200">
                        ℹ️ Thông tin này sẽ được AI sử dụng khi trả lời khách hàng, và hiển thị trên báo giá PDF (MST, ngân hàng, điều khoản, VAT).
                    </div>
                </div>
            </div>
        </div>
    );
}
