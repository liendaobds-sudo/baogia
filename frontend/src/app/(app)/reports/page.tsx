'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useEffect, useCallback } from 'react';

import { API_URL as API } from '@/lib/api';

interface AgentMetrics {
    agent: { id: string; fullName: string; email: string; role: string; avatarUrl: string | null };
    metrics: { conversationsAssigned: number; messagesSent: number; resolved: number; slaBreached: number; slaCompliance: number };
}

interface Summary {
    conversations: { total: number; resolved: number; breached: number };
    messages: number;
    suggestions: number;
    slaCompliance: number;
}

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#e11d48'];
const getColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

export default function ReportsPage() {
    const { token } = useAuth();
    const [mounted, setMounted] = useState(false);
    const [agents, setAgents] = useState<AgentMetrics[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [period, setPeriod] = useState('7');

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    }), [token]);

    const fetchData = useCallback(async () => {
        try {
            const [agentsRes, summaryRes] = await Promise.all([
                fetch(`${API}/reports/agents?days=${period}`, { headers: headers() }),
                fetch(`${API}/reports/summary`, { headers: headers() }),
            ]);
            if (agentsRes.ok) {
                const data = await agentsRes.json();
                setAgents(data.agents || []);
            }
            if (summaryRes.ok) setSummary(await summaryRes.json());
        } catch (err) { console.error(err); }
    }, [headers, period]);

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { if (mounted && token) fetchData(); }, [mounted, token, fetchData]);

    if (!mounted) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
                Đang tải...
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );

    return (
        <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100vh' }}>
            {/* ── Header ─────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ verticalAlign: -3, marginRight: 8 }}>
                            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        Báo cáo hiệu suất
                    </h1>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Phân tích hoạt động hỗ trợ khách hàng</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button onClick={() => window.open(`${API}/reports/export/csv`, '_blank')}
                        style={{
                            padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                            background: '#fff', border: '1px solid #e2e8f0', color: '#334155',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                            transition: 'all 150ms',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.background = '#eef2ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        Xuất CSV
                    </button>
                    <div style={{
                        display: 'flex', borderRadius: 10, overflow: 'hidden',
                        border: '1px solid #e2e8f0', background: '#fff',
                    }}>
                        {[
                            { v: '7', l: '7 ngày' },
                            { v: '14', l: '14 ngày' },
                            { v: '30', l: '30 ngày' },
                            { v: '90', l: '90 ngày' },
                        ].map(opt => (
                            <button key={opt.v} onClick={() => setPeriod(opt.v)}
                                style={{
                                    padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none',
                                    background: period === opt.v ? '#4f46e5' : 'transparent',
                                    color: period === opt.v ? '#fff' : '#64748b',
                                    cursor: 'pointer', transition: 'all 150ms',
                                }}
                            >{opt.l}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Summary KPI Cards ──────────────────── */}
            {summary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                    <KpiCard
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                        label="Hội thoại" value={summary.conversations.total}
                        sub={`${summary.conversations.resolved} đã đóng`} color="#2563eb"
                    />
                    <KpiCard
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>}
                        label="Tin nhắn" value={summary.messages} color="#7c3aed"
                    />
                    <KpiCard
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M20.66 6.35A10 10 0 0 0 14 2.05V10h7.95" /></svg>}
                        label="AI Gợi ý" value={summary.suggestions} color="#0891b2"
                    />
                    <KpiCard
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={summary.slaCompliance >= 80 ? '#16a34a' : summary.slaCompliance >= 50 ? '#d97706' : '#dc2626'} strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
                        label="SLA" value={summary.slaCompliance} suffix="%"
                        sub={`${summary.conversations.breached} vi phạm`}
                        color={summary.slaCompliance >= 80 ? '#16a34a' : summary.slaCompliance >= 50 ? '#d97706' : '#dc2626'}
                    />
                </div>
            )}

            {/* ── Agent Performance Table ────────────── */}
            <div style={{
                background: '#fff', borderRadius: 16, overflow: 'hidden',
                border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
                <div style={{
                    padding: '18px 24px', borderBottom: '1px solid #f1f5f9',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>Hiệu suất từng Agent</span>
                    </div>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{agents.length} agents</span>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '12px 24px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12 }}>AGENT</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 12 }}>HỘI THOẠI</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 12 }}>TIN NHẮN</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 12 }}>ĐÃ XỬ LÝ</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 12 }}>SLA</th>
                            <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 12 }}>VI PHẠM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {agents.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}>
                                    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                                </svg>
                                Chưa có dữ liệu
                            </td></tr>
                        ) : agents.map((a, idx) => (
                            <tr key={a.agent.id}
                                style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    transition: 'background 150ms',
                                    cursor: 'default',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f8faff'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                                <td style={{ padding: '14px 24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{
                                            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                                            background: `linear-gradient(135deg, ${getColor(a.agent.fullName)}20, ${getColor(a.agent.fullName)}35)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, color: getColor(a.agent.fullName), fontSize: 14,
                                        }}>{a.agent.fullName.charAt(0)}</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{a.agent.fullName}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.agent.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>{a.metrics.conversationsAssigned}</td>
                                <td style={{ padding: '14px 16px', textAlign: 'center', color: '#64748b' }}>{a.metrics.messagesSent}</td>
                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                    <span style={{ color: '#16a34a', fontWeight: 600 }}>{a.metrics.resolved}</span>
                                </td>
                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                    <span style={{
                                        padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                        background: a.metrics.slaCompliance >= 80 ? '#dcfce7' : a.metrics.slaCompliance >= 50 ? '#fef3c7' : '#fef2f2',
                                        color: a.metrics.slaCompliance >= 80 ? '#16a34a' : a.metrics.slaCompliance >= 50 ? '#d97706' : '#dc2626',
                                    }}>{a.metrics.slaCompliance}%</span>
                                </td>
                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                    {a.metrics.slaBreached > 0 ? (
                                        <span style={{
                                            color: '#dc2626', fontWeight: 700,
                                            background: '#fef2f2', padding: '3px 8px', borderRadius: 6,
                                        }}>{a.metrics.slaBreached}</span>
                                    ) : (
                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function KpiCard({ icon, label, value, suffix, sub, color }: {
    icon: React.ReactNode; label: string; value: number; suffix?: string; sub?: string; color: string;
}) {
    return (
        <div style={{
            padding: '22px 20px', background: '#fff', borderRadius: 16,
            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 200ms ease',
        }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
            <div style={{
                width: 40, height: 40, borderRadius: 10, marginBottom: 14,
                background: color + '12', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{icon}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a' }}>
                {value}{suffix || ''}
            </div>
            {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sub}</div>}
        </div>
    );
}
