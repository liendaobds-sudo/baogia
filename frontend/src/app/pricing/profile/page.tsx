"use client";
import { useState, useEffect, useCallback } from 'react';
import { api } from '../_components/apiClient';

interface ProfileData {
    username: string;
    email: string;
    fullName: string;
    phone: string;
    role: string;
    avatar?: string;
}

export default function ProfilePage() {
    const [data, setData] = useState<ProfileData>({ username: '', email: '', fullName: '', phone: '', role: '' });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<ProfileData>('/erp/profile');
            if (res.success && res.data) setData(res.data);
        } catch { /* empty */ }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.put('/erp/profile', data);
            if (res.success) showToast('Đã cập nhật thông tin', 'success');
            else throw new Error(res.error);
        } catch (e: unknown) { showToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'), 'error'); }
        setSaving(false);
    };

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6 overflow-y-auto">
            {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}

            <div className="max-w-xl mx-auto w-full space-y-6 mt-4">
                <div className="text-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-lg">
                        {(data.fullName || data.username || '?')[0]?.toUpperCase()}
                    </div>
                    <h1 className="text-2xl font-black text-slate-800">{data.fullName || data.username}</h1>
                    <p className="text-slate-500 text-sm mt-1"><span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold text-xs">{data.role || 'Staff'}</span></p>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <h3 className="font-bold text-slate-800">Thông tin cá nhân</h3>
                    {[
                        { key: 'fullName' as const, label: 'Họ tên', placeholder: 'Nguyen Van A' },
                        { key: 'email' as const, label: 'Email', placeholder: 'admin@kprint.vn' },
                        { key: 'phone' as const, label: 'Số điện thoại', placeholder: '09...' },
                    ].map(f => (
                        <div key={f.key}>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">{f.label}</label>
                            <input type="text" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={data[f.key] || ''} onChange={e => setData(d => ({ ...d, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                        </div>
                    ))}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Username</label>
                        <input type="text" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 cursor-not-allowed" value={data.username} readOnly />
                    </div>
                </div>

                <button onClick={handleSave} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-sm transition-colors disabled:opacity-50">
                    {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                </button>
            </div>
        </div>
    );
}
