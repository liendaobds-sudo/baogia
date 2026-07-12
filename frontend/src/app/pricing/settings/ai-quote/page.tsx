"use client";
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../_components/apiClient';

interface AiQuoteConfig {
    enabled: boolean;
    auto_reply: boolean;
    greeting_message: string;
    max_suggestions: number;
    confidence_threshold: number;
    response_template: string;
}

const DEFAULTS: AiQuoteConfig = {
    enabled: true, auto_reply: false,
    greeting_message: 'Xin chào! Tôi có thể giúp bạn báo giá in ấn.',
    max_suggestions: 3, confidence_threshold: 0.7,
    response_template: 'Dựa trên yêu cầu của bạn, giá dự kiến là: {price}'
};

export default function AiQuotePage() {
    const [config, setConfig] = useState<AiQuoteConfig>(DEFAULTS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<AiQuoteConfig>('/erp/ai-quote-config');
            if (res.success && res.data) setConfig({ ...DEFAULTS, ...res.data });
        } catch { /* use defaults */ }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const showToast = (msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.post('/erp/ai-quote-config', config);
            if (res.success) showToast('Đã lưu cấu hình AI Quote', 'success');
            else throw new Error(res.error);
        } catch (e: unknown) { showToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'), 'error'); }
        setSaving(false);
    };

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}
            
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cấu hình AI báo giá</h1>
                    <p className="text-slate-500 text-sm mt-1">Thiết lập AI tự động trả lời khách hàng về giá cả.</p>
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                    {saving ? 'Đang lưu...' : '💾 Lưu cấu hình'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto space-y-6">
                    {/* General */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">⚡ Cài đặt chung</h3>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={config.enabled} onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))} className="w-5 h-5 text-indigo-600 rounded" />
                            <div><span className="font-bold text-slate-800">Bật AI Báo Giá</span><p className="text-xs text-slate-500">AI sẽ tự động gợi ý giá khi khách hỏi.</p></div>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={config.auto_reply} onChange={e => setConfig(c => ({ ...c, auto_reply: e.target.checked }))} className="w-5 h-5 text-indigo-600 rounded" />
                            <div><span className="font-bold text-slate-800">Tự động trả lời</span><p className="text-xs text-slate-500">Chatbot tự gửi kết quả mà không cần nhân viên duyệt.</p></div>
                        </label>
                    </div>

                    {/* Messages */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">💬 Tin nhắn</h3>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tin nhắn chào mừng</label>
                            <textarea className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2} value={config.greeting_message} onChange={e => setConfig(c => ({ ...c, greeting_message: e.target.value }))} />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Template trả lời giá</label>
                            <textarea className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono" rows={3} value={config.response_template} onChange={e => setConfig(c => ({ ...c, response_template: e.target.value }))} />
                            <p className="text-xs text-slate-400 mt-1">Dùng {'{price}'}, {'{product}'}, {'{quantity}'} làm placeholder.</p>
                        </div>
                    </div>

                    {/* Advanced */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                        <h3 className="text-lg font-bold text-slate-800">🔧 Nâng cao</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Số gợi ý tối đa</label>
                                <input type="number" min={1} max={10} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={config.max_suggestions} onChange={e => setConfig(c => ({ ...c, max_suggestions: parseInt(e.target.value) || 3 }))} />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Ngưỡng tin cậy (0-1)</label>
                                <input type="number" min={0} max={1} step={0.1} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={config.confidence_threshold} onChange={e => setConfig(c => ({ ...c, confidence_threshold: parseFloat(e.target.value) || 0.7 }))} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
