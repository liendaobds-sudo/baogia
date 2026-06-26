"use client";
import { useEffect, useState, useCallback } from 'react';
import { api } from '../../_components/apiClient';

interface ApiDoc {
    name: string;
    description: string;
    version: string;
    base_url: string;
    authentication: { header: string; format: string; description: string };
    rate_limiting: { limit: string; headers: Record<string, string> };
    endpoints: { method: string; path: string; description: string; auth_required: boolean; params?: { name: string; type: string; required: boolean; description: string }[] }[];
}

export default function ApiDocsPage() {
    const [docs, setDocs] = useState<ApiDoc | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<ApiDoc>('/erp/api-docs');
            if (res.success && res.data) setDocs(res.data);
        } catch { /* empty */ }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Tài Liệu API</h1>
                <p className="text-slate-500 text-sm mt-1">API Documentation cho hệ thống bên ngoài kết nối.</p>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Hero */}
                    <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl p-6">
                        <h2 className="text-2xl font-bold">{docs?.name || 'Pricing API'}</h2>
                        <p className="text-indigo-200 mt-1">{docs?.description || 'REST API for pricing system'}</p>
                        <div className="flex items-center gap-4 mt-3">
                            <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-medium">v{docs?.version || '1.0'}</span>
                            <code className="text-indigo-100 text-sm">{docs?.base_url || '/api/v1/erp'}</code>
                        </div>
                    </div>

                    {/* Auth */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="font-bold text-lg text-slate-800 mb-3">🔐 Authentication</h3>
                        <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm">
                            <span className="text-slate-400">// Header</span><br />
                            <span className="text-emerald-400">Authorization: Bearer &lt;token&gt;</span>
                        </div>
                    </div>

                    {/* Endpoints */}
                    <h2 className="text-xl font-bold text-slate-800">🔌 Endpoints</h2>
                    {(docs?.endpoints || [
                        { method: 'GET', path: '/erp/materials', description: 'Lấy danh sách vật tư', auth_required: true },
                        { method: 'POST', path: '/erp/materials', description: 'Tạo vật tư mới', auth_required: true },
                        { method: 'GET', path: '/erp/products', description: 'Lấy danh sách sản phẩm', auth_required: true },
                        { method: 'GET', path: '/erp/paper-sizes', description: 'Lấy danh sách khổ giấy', auth_required: true },
                        { method: 'GET', path: '/erp/pricing-tiers', description: 'Lấy bảng giá', auth_required: true },
                        { method: 'POST', path: '/erp/quotes/calculate', description: 'Tính giá báo giá', auth_required: true },
                    ]).map((ep, idx) => {
                        const methodColor = ep.method === 'GET' ? 'bg-emerald-100 text-emerald-700' : ep.method === 'POST' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
                        return (
                            <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                <div className="flex items-center gap-3 mb-2">
                                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${methodColor}`}>{ep.method}</span>
                                    <code className="text-sm font-bold text-slate-800">{ep.path}</code>
                                    {ep.auth_required && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs">🔒 Auth</span>}
                                </div>
                                <p className="text-sm text-slate-600">{ep.description}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
