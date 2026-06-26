'use client';

import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { useEffect, useState } from 'react';

import { API_URL as API } from '@/lib/api';
const PRICING_API = process.env.NEXT_PUBLIC_PRICING_URL || 'http://localhost:4000/api/v1';

interface KpiData {
    totalConversations: number;
    totalMessages: number;
    aiSuggestions: number;
    aiAcceptRate: number;
    slaViolations: number;
    kbChunks: number;
    openConversations: number;
    avgResponseTime: string;
}

interface PricingStats {
    totalQuotes: number;
    totalMaterials: number;
    totalCustomers: number;
    recentQuotes: number;
}

// ─── Mini Sparkline (pure CSS) ─────────────────────────
function MiniTrend({ trend }: { trend: 'up' | 'down' | 'flat' }) {
    if (trend === 'up') return <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>▲ Tăng</span>;
    if (trend === 'down') return <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>▼ Giảm</span>;
    return <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>─ Ổn định</span>;
}

// ─── KPI Card Component ────────────────────────────────
function KpiCard({ icon, label, value, trend, color, span }: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    trend?: 'up' | 'down' | 'flat';
    color: string;
    span?: string;
}) {
    return (
        <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
            transition: 'all 200ms ease',
            cursor: 'default',
            gridColumn: span || 'auto',
        }}
            onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)';
                e.currentTarget.style.transform = 'translateY(0)';
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: color + '15',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                }}>
                    {icon}
                </div>
                {trend && <MiniTrend trend={trend} />}
            </div>
            <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{value}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{label}</div>
            </div>
        </div>
    );
}

// ─── Bento Section Card ────────────────────────────────
function BentoCard({ title, children, span, minHeight, headerRight }: {
    title: string;
    children: React.ReactNode;
    span?: string;
    minHeight?: number;
    headerRight?: React.ReactNode;
}) {
    return (
        <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: '24px',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            gridColumn: span || 'auto',
            minHeight: minHeight || 'auto',
            display: 'flex',
            flexDirection: 'column',
        }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 16,
            }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{title}</h3>
                {headerRight}
            </div>
            <div style={{ flex: 1 }}>{children}</div>
        </div>
    );
}

// ─── Activity Bar (API-driven chart) ─────────────────────
function ActivityBars({ data }: { data: { hour: string; count: number }[] }) {
    const hours = data.length > 0 ? data : Array.from({ length: 13 }, (_, i) => ({ hour: String(i + 8).padStart(2, '0'), count: 0 }));
    const maxVal = Math.max(...hours.map(h => h.count), 1);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, width: '100%' }}>
            {hours.map((h, i) => (
                <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                        width: '100%',
                        height: `${(h.count / maxVal) * 100}px`,
                        background: h.count > (maxVal * 0.7)
                            ? 'linear-gradient(180deg, #2563eb , #3b82f6)'
                            : h.count > (maxVal * 0.4)
                                ? 'linear-gradient(180deg, #60a5fa, #93c5fd)'
                                : '#dbeafe',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 500ms ease',
                        minHeight: 4,
                    }} />
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{h.hour}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Status Ring (pure CSS) ────────────────────────────
function StatusRing({ percentage, color, size = 80 }: { percentage: number; color: string; size?: number }) {
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke="#f1f5f9" strokeWidth="6" />
                <circle cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={color} strokeWidth="6"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 800ms ease' }} />
            </svg>
            <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#0f172a',
            }}>
                {percentage}%
            </div>
        </div>
    );
}

// ─── Quick Action Button ───────────────────────────────
function QuickAction({ icon, label, onClick, color }: { icon: string; label: string; onClick?: () => void; color: string }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '16px 12px', borderRadius: 12,
                border: '1px solid #f1f5f9', background: '#fafbfc',
                cursor: 'pointer', transition: 'all 200ms ease',
                flex: 1, minWidth: 0,
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = color + '10';
                e.currentTarget.style.borderColor = color + '40';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = '#fafbfc';
                e.currentTarget.style.borderColor = '#f1f5f9';
                e.currentTarget.style.transform = 'translateY(0)';
            }}
        >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, textAlign: 'center' }}>{label}</span>
        </button>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN DASHBOARD COMPONENT
// ═══════════════════════════════════════════════════════
export default function DashboardPage() {
    const { token } = useAuth();
    const { connected, socket } = useSocket();
    const [kpi, setKpi] = useState<KpiData | null>(null);
    const [pricing, setPricing] = useState<PricingStats | null>(null);
    const [pricingOnline, setPricingOnline] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [activityData, setActivityData] = useState<{ hour: string; count: number }[]>([]);
    const [trends, setTrends] = useState<Record<string, { trend: 'up' | 'down' | 'flat' }>>({});

    useEffect(() => {
        async function fetchKpi() {
            try {
                const res = await fetch(`${API}/dashboard/kpi`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(5000),
                });
                if (res.ok) setKpi(await res.json());
            } catch { /* backend offline */ }
        }

        async function fetchErp() {
            try {
                // Try NestJS Pricing service health endpoint
                const r = await fetch(`${PRICING_API}/pricing/health`, {
                    signal: AbortSignal.timeout(4000),
                });
                if (r.ok) {
                    const data = await r.json();
                    setPricingOnline(data.success === true || data.healthy === true);
                    // Try to get stats from Pricing service
                    // Temporarily skipped to avoid 404 console errors until Pricing backend stats endpoint is implemented.
                    // try {
                    //     const statsRes = await fetch(`${PRICING_API}/dashboard/stats`, {
                    //         headers: { Authorization: `Bearer ${token}` },
                    //         signal: AbortSignal.timeout(4000),
                    //     });
                    //     if (statsRes.ok) {
                    //         const data = await statsRes.json();
                    //         setPricing(data);
                    //     }
                    // } catch { /* stats endpoint optional */ }
                }
            } catch {
                setPricingOnline(false);
            }
        }

        Promise.all([fetchKpi(), fetchErp()]).finally(() => setLoading(false));

        // Fetch real activity + trends data
        fetch(`${API}/dashboard/activity-hourly`).then(r => r.ok ? r.json() : []).then(setActivityData).catch(() => {});
        fetch(`${API}/dashboard/trends`).then(r => r.ok ? r.json() : {}).then(setTrends).catch(() => {});

        // Feature 7: Real-time dashboard updates via WebSocket
        if (socket) {
            const handleDashboardUpdate = () => {
                fetchKpi(); // Re-fetch KPI when any message/conversation event happens
            };
            socket.on('dashboard_update', handleDashboardUpdate);
            socket.on('conversation_updated', handleDashboardUpdate);
            return () => {
                socket.off('dashboard_update', handleDashboardUpdate);
                socket.off('conversation_updated', handleDashboardUpdate);
            };
        }
    }, [token, socket]);

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', color: '#94a3b8',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 40, height: 40, border: '3px solid #e2e8f0',
                        borderTopColor: '#2563eb', borderRadius: '50%',
                        margin: '0 auto 12px',
                        animation: 'spin 0.8s linear infinite',
                    }} />
                    Đang tải dữ liệu...
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    return (
        <div className="page" style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100vh' }}>
            {/* ── Header ──────────────────────────────── */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 24,
            }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                        📊 Dashboard
                    </h1>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
                        Tổng quan hiệu suất hoạt động
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 20,
                        background: connected ? '#dcfce7' : '#fee2e2',
                        color: connected ? '#16a34a' : '#dc2626',
                        fontSize: 12, fontWeight: 600,
                    }}>
                        <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: connected ? '#22c55e' : '#ef4444',
                            boxShadow: connected ? '0 0 6px #22c55e' : 'none',
                        }} />
                        {connected ? 'Realtime' : 'Offline'}
                    </span>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 20,
                        background: pricingOnline ? '#dbeafe' : '#f1f5f9',
                        color: pricingOnline ? '#2563eb' : '#94a3b8',
                        fontSize: 12, fontWeight: 600,
                    }}>
                        🖨️ Pricing {pricingOnline ? 'Online' : pricingOnline === false ? 'Offline' : '...'}
                    </span>
                </div>
            </div>

            {/* ── KPI Row (Bento Grid) ────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 16,
                marginBottom: 24,
            }}>
                <KpiCard
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                    label="Hội thoại"
                    value={kpi?.totalConversations ?? 0}
                    trend={trends.conversations?.trend || 'flat'}
                    color="#2563eb"
                />
                <KpiCard
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>}
                    label="Tin nhắn"
                    value={kpi?.totalMessages ?? 0}
                    trend={trends.messages?.trend || 'flat'}
                    color="#7c3aed"
                />
                <KpiCard
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M20.66 6.35A10 10 0 0 0 14 2.05V10h7.95a10 10 0 0 0-1.29-3.65z" /></svg>}
                    label="AI Gợi ý"
                    value={kpi?.aiSuggestions ?? 0}
                    trend={trends.suggestions?.trend || 'up'}
                    color="#0891b2"
                />
                <KpiCard
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>}
                    label="SLA"
                    value={kpi ? `${100 - (kpi.slaViolations || 0)}%` : '100%'}
                    trend="up"
                    color="#16a34a"
                />
                <KpiCard
                    icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
                    label="Knowledge Base"
                    value={`${kpi?.kbChunks ?? 0} chunks`}
                    trend="flat"
                    color="#f59e0b"
                />
            </div>

            {/* ── Middle Row (Bento: 3 columns) ───────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                gap: 16,
                marginBottom: 24,
            }}>
                {/* Activity Chart */}
                <BentoCard title="Hoạt động theo giờ" headerRight={
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Hôm nay</span>
                }>
                    <ActivityBars data={activityData} />
                </BentoCard>

                {/* AI Performance Ring */}
                <BentoCard title="AI Chấp nhận">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <StatusRing
                            percentage={kpi?.aiAcceptRate ? Math.round(kpi.aiAcceptRate * 100) : 0}
                            color="#7c3aed"
                            size={100}
                        />
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Tỷ lệ gợi ý AI được sử dụng</div>
                        </div>
                    </div>
                </BentoCard>

                {/* Quick Actions */}
                <BentoCard title="Truy cập nhanh">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <QuickAction icon="📥" label="Inbox" onClick={() => window.location.href = '/inbox'} color="#2563eb" />
                        <QuickAction icon="🖨️" label="Báo giá" onClick={() => window.open('http://localhost/Pricing/PricingPrint/#cost-calculator', '_blank')} color="#7c3aed" />
                        <QuickAction icon="👥" label="Danh bạ liên hệ" onClick={() => window.location.href = '/contacts'} color="#0891b2" />
                    </div>
                </BentoCard>
            </div>

            {/* ── Bottom Row (Bento: 2 columns) ────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
            }}>
                {/* Pricing Stats */}
                <BentoCard
                    title="🖨️ Hệ thống Báo giá"
                    headerRight={
                        <span style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 12,
                            background: pricingOnline ? '#dcfce7' : '#f1f5f9',
                            color: pricingOnline ? '#16a34a' : '#94a3b8',
                            fontWeight: 600,
                        }}>
                            {pricingOnline ? '● Online' : '○ Offline'}
                        </span>
                    }
                >
                    {pricing ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            {[
                                { label: 'Tổng báo giá', value: pricing.totalQuotes, icon: '📄' },
                                { label: 'Báo giá gần đây', value: pricing.recentQuotes, icon: '🆕' },
                                { label: 'Vật liệu', value: pricing.totalMaterials, icon: '📦' },
                                { label: 'Khách hàng', value: pricing.totalCustomers, icon: '👤' },
                            ].map((item, i) => (
                                <div key={i} style={{
                                    padding: '14px 12px', borderRadius: 10,
                                    background: '#f8fafc', border: '1px solid #f1f5f9',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                }}>
                                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                                    <div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{item.value}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.label}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            height: 100, color: '#94a3b8', fontSize: 13,
                        }}>
                            {pricingOnline === false ? (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 28, marginBottom: 8 }}>🔌</div>
                                    <div>Pricing đang offline</div>
                                    <a href="http://localhost/Pricing/PricingPrint/" target="_blank" rel="noopener"
                                        style={{ color: '#2563eb', fontSize: 12, marginTop: 4, display: 'inline-block' }}>
                                        Mở Pricing →
                                    </a>
                                </div>
                            ) : 'Đang kết nối...'}
                        </div>
                    )}
                </BentoCard>

                {/* System Status */}
                <BentoCard title="⚡ Trạng thái hệ thống">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                            { label: 'ZeplaoPrint API', status: true, detail: 'Port 4000' },
                            { label: 'WebSocket', status: connected, detail: connected ? 'Connected' : 'Disconnected' },
                            { label: 'Pricing Backend', status: pricingOnline, detail: pricingOnline ? 'Port 80' : 'Unreachable' },
                            { label: 'Zalo OA', status: null, detail: 'Chưa kết nối' },
                        ].map((item, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 12px', borderRadius: 8,
                                background: '#fafbfc',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: item.status === true ? '#22c55e' : item.status === false ? '#ef4444' : '#94a3b8',
                                        boxShadow: item.status === true ? '0 0 6px #22c55e40' : 'none',
                                    }} />
                                    <span style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>{item.label}</span>
                                </div>
                                <span style={{
                                    fontSize: 11, color: '#94a3b8',
                                    padding: '2px 8px', borderRadius: 6,
                                    background: '#f1f5f9',
                                }}>{item.detail}</span>
                            </div>
                        ))}
                    </div>
                </BentoCard>
            </div>
        </div>
    );
}
