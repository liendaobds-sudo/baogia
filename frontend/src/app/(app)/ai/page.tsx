'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Lazy load existing pages as components
const KBContent = dynamic(() => import('../kb/page'), { ssr: false });
const QuickRepliesContent = dynamic(() => import('../quick-replies/page'), { ssr: false });
const ProductRulesPanel = dynamic(() => import('./ProductRulesPanel'), { ssr: false });
import { API_URL } from '@/lib/api';

const TABS = [
    { key: 'kb' as const, label: '📚 Knowledge Base', desc: 'Tài liệu nội bộ cho AI tham khảo' },
    { key: 'qa' as const, label: '⚡ Trả lời nhanh', desc: 'Mẫu Q&A khớp keyword tự động' },
    { key: 'rules' as const, label: '🤖 Luật Sản Phẩm', desc: 'Ràng buộc AI báo giá' },
    { key: 'providers' as const, label: '⚙️ AI Providers', desc: 'Cấu hình API keys cho AI' },
];

export default function AIPage() {
    const [tab, setTab] = useState<'kb' | 'qa' | 'rules' | 'providers'>('kb');

    return (
        <div style={{ padding: '28px 36px', height: 'calc(100vh - 60px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                    🧠 AI & Kiến thức
                </h1>
                <p style={{ color: '#64748b', fontSize: 14, marginTop: 4, marginBottom: 0 }}>
                    Quản lý tất cả nguồn dữ liệu và cấu hình AI tại một nơi
                </p>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', gap: 0, marginBottom: 24, background: '#f1f5f9',
                borderRadius: 14, padding: 4, flexShrink: 0,
            }}>
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            flex: 1, padding: '12px 16px', borderRadius: 11, border: 'none',
                            background: tab === t.key ? '#fff' : 'transparent',
                            color: tab === t.key ? '#0f172a' : '#64748b',
                            fontWeight: tab === t.key ? 700 : 500,
                            fontSize: 14, cursor: 'pointer', transition: 'all 200ms',
                            boxShadow: tab === t.key ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        }}
                    >
                        <span>{t.label}</span>
                        {tab === t.key && (
                            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{t.desc}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'auto', margin: '-28px -36px', padding: '0' }}>
                {tab === 'kb' && <KBContent />}
                {tab === 'qa' && <QuickRepliesContent />}
                {tab === 'rules' && <ProductRulesPanel />}
                {tab === 'providers' && <ProvidersTab />}
            </div>
        </div>
    );
}

// ─── AI Providers Tab (extracted from settings) ───
import { useAuth } from '@/lib/auth-context';
import { useEffect, useCallback } from 'react';

function ProvidersTab() {
    const { token } = useAuth();
    const API = API_URL;
    const [providers, setProviders] = useState<{ provider: string; apiKey: string; model: string; enabled: boolean; hasKey: boolean }[]>([]);
    const [saving, setSaving] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    }), [token]);

    const fetchProviders = useCallback(async () => {
        try {
            const res = await fetch(`${API}/suggestions/ai-config`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setProviders(Array.isArray(data) ? data : []);
            }
        } catch (err) { console.error(err); }
    }, [API, headers]);

    useEffect(() => { if (token) fetchProviders(); }, [token, fetchProviders]);

    const saveProviders = async () => {
        setSaving(true);
        setTestResult(null);
        try {
            const res = await fetch(`${API}/suggestions/ai-config`, {
                method: 'PUT',
                headers: headers(),
                body: JSON.stringify({ providers }),
            });
            if (res.ok) {
                setTestResult('✅ Đã lưu cấu hình AI!');
                fetchProviders();
            } else {
                setTestResult('❌ Lỗi khi lưu');
            }
        } catch { setTestResult('❌ Lỗi kết nối'); }
        setSaving(false);
        setTimeout(() => setTestResult(null), 3000);
    };

    const updateProvider = (index: number, field: string, value: string | boolean) => {
        setProviders(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const PROVIDER_INFO: Record<string, { name: string; icon: string; color: string; models: string[] }> = {
        openai: { name: 'OpenAI', icon: '🟢', color: '#10a37f', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
        gemini: { name: 'Google Gemini', icon: '🔵', color: '#4285f4', models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'] },
        groq: { name: 'Groq', icon: '🟠', color: '#f55036', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
    };

    return (
        <div style={{ padding: '28px 36px' }}>
            <div style={{ maxWidth: 700 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 20 }}>
                    Cấu hình nhà cung cấp AI
                    <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>
                        Hệ thống sẽ thử từng provider theo thứ tự ưu tiên
                    </span>
                </div>

                {providers.map((p, i) => {
                    const info = PROVIDER_INFO[p.provider] || { name: p.provider, icon: '🔷', color: '#6b7280', models: [] };
                    return (
                        <div key={p.provider} style={{
                            padding: 20, borderRadius: 14, marginBottom: 16,
                            background: '#fff', border: `1px solid ${p.hasKey ? '#e2e8f0' : '#fecaca'}`,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 20 }}>{info.icon}</span>
                                    <span style={{ fontWeight: 700, color: info.color, fontSize: 15 }}>{info.name}</span>
                                    {p.hasKey && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>API Key ✓</span>}
                                    {!p.hasKey && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>Chưa cấu hình</span>}
                                </div>
                                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>#{i + 1}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                                <div style={{ flex: 2 }}>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>API Key</label>
                                    <input
                                        value={p.apiKey}
                                        onChange={e => updateProvider(i, 'apiKey', e.target.value)}
                                        type="password"
                                        placeholder={p.hasKey ? '••••••••••••••••' : 'Nhập API key...'}
                                        style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 10,
                                            border: '1px solid #e2e8f0', fontSize: 13, marginTop: 4,
                                            outline: 'none', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Model</label>
                                    <select
                                        value={p.model}
                                        onChange={e => updateProvider(i, 'model', e.target.value)}
                                        style={{
                                            width: '100%', padding: '8px 12px', borderRadius: 10,
                                            border: '1px solid #e2e8f0', fontSize: 13, marginTop: 4,
                                            outline: 'none', boxSizing: 'border-box', background: '#fff',
                                        }}
                                    >
                                        {info.models.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    );
                })}

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <button
                        onClick={saveProviders}
                        disabled={saving}
                        style={{
                            padding: '10px 24px', borderRadius: 10, border: 'none',
                            background: saving ? '#94a3b8' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                            color: '#fff', fontWeight: 700, fontSize: 14,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            boxShadow: '0 2px 8px rgba(79,70,229,0.2)',
                        }}
                    >
                        {saving ? '⏳ Đang lưu...' : '💾 Lưu cấu hình'}
                    </button>
                    {testResult && (
                        <span style={{ fontSize: 13, fontWeight: 600, color: testResult.includes('✅') ? '#16a34a' : '#dc2626' }}>
                            {testResult}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
